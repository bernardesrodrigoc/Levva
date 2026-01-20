"""Trip management routes."""
from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime, timezone
from typing import List, Optional
from bson import ObjectId

from database import users_collection, trips_collection
from models import (
    TripCreate, TripResponse, TripStatus,
    UserRole, VerificationStatus
)
from auth import get_current_user_id
from route_service import get_route_polyline, haversine_distance

router = APIRouter()


@router.post("", response_model=TripResponse)
async def create_trip(trip_data: TripCreate, user_id: str = Depends(get_current_user_id)):
    """Create a new trip."""
    user = await users_collection.find_one({"_id": ObjectId(user_id)})
    if user["role"] not in [UserRole.CARRIER, UserRole.BOTH]:
        raise HTTPException(status_code=403, detail="Apenas transportadores podem criar viagens")
    
    if user.get("verification_status") != VerificationStatus.VERIFIED:
        raise HTTPException(
            status_code=403, 
            detail="Você precisa verificar sua identidade antes de criar viagens"
        )
    
    # Generate route polyline
    route_polyline = await get_route_polyline(
        trip_data.origin.lat, trip_data.origin.lng,
        trip_data.destination.lat, trip_data.destination.lng
    )
    
    # Calculate suggested price if not provided
    suggested_price = trip_data.price_per_kg
    if not suggested_price:
        distance_km = haversine_distance(
            trip_data.origin.lat, trip_data.origin.lng,
            trip_data.destination.lat, trip_data.destination.lng
        )
        suggested_price = min(8.0, max(3.0, 3.0 + (distance_km * 0.01)))
    
    trip_doc = {
        "carrier_id": user_id,
        "carrier_name": user["name"],
        "carrier_rating": user.get("rating", 0.0),
        **trip_data.model_dump(),
        "route_polyline": route_polyline,
        "available_capacity_kg": trip_data.cargo_space.max_weight_kg,
        "price_per_kg": suggested_price,
        "corridor_radius_km": trip_data.corridor_radius_km if hasattr(trip_data, 'corridor_radius_km') and trip_data.corridor_radius_km else 30.0,  # Default 30km corridor
        "is_recurring": trip_data.recurrence.is_recurring if trip_data.recurrence else False,
        "status": TripStatus.PUBLISHED,
        "created_at": datetime.now(timezone.utc)
    }
    
    result = await trips_collection.insert_one(trip_doc)
    trip_doc["id"] = str(result.inserted_id)
    
    return trip_doc


@router.post("/calculate-price")
async def calculate_suggested_price(
    origin_lat: float,
    origin_lng: float,
    dest_lat: float,
    dest_lng: float
):
    """Calculate suggested price per kg based on distance."""
    distance_km = haversine_distance(origin_lat, origin_lng, dest_lat, dest_lng)
    
    # Price tiers based on distance
    if distance_km <= 50:
        base_price = 3.0
        per_km = 0.02
    elif distance_km <= 200:
        base_price = 3.5
        per_km = 0.015
    elif distance_km <= 500:
        base_price = 4.0
        per_km = 0.01
    else:
        base_price = 5.0
        per_km = 0.008
    
    suggested_price = min(12.0, base_price + (distance_km * per_km))
    
    return {
        "distance_km": round(distance_km, 1),
        "suggested_price_per_kg": round(suggested_price, 2),
        "examples": {
            "1kg": round(suggested_price * 1, 2),
            "5kg": round(suggested_price * 5, 2),
            "10kg": round(suggested_price * 10, 2),
            "20kg": round(suggested_price * 20, 2)
        },
        "platform_fee_percent": 15,
        "carrier_receives_percent": 85
    }


# IMPORTANT: my-trips must come BEFORE {trip_id} to avoid route conflicts
@router.get("/my-trips")
async def get_my_trips(
    user_id: str = Depends(get_current_user_id),
    include_history: bool = False
):
    """
    Get trips created by current user.
    
    Args:
        include_history: If False, returns only active trips.
                        If True, returns only history (completed/cancelled/expired).
    """
    from services.expiration_service import get_active_statuses, get_history_statuses
    
    if include_history:
        statuses = get_history_statuses("trip")
    else:
        statuses = get_active_statuses("trip")
    
    trips = await trips_collection.find({
        "carrier_id": user_id,
        "status": {"$in": statuses}
    }).sort("created_at", -1).to_list(100)
    
    for trip in trips:
        trip["id"] = str(trip.pop("_id"))
        if "corridor_radius_km" not in trip:
            trip["corridor_radius_km"] = trip.get("max_deviation_km", 10.0)
    
    return trips


@router.get("/my-trips/history")
async def get_my_trips_history(user_id: str = Depends(get_current_user_id)):
    """Get trips history (completed, cancelled, expired)."""
    from services.expiration_service import get_history_statuses
    
    statuses = get_history_statuses("trip")
    
    trips = await trips_collection.find({
        "carrier_id": user_id,
        "status": {"$in": statuses}
    }).sort("created_at", -1).to_list(100)
    
    for trip in trips:
        trip["id"] = str(trip.pop("_id"))
        if "corridor_radius_km" not in trip:
            trip["corridor_radius_km"] = trip.get("max_deviation_km", 10.0)
    
    return trips


@router.get("", response_model=List[TripResponse])
async def list_trips(
    origin_city: Optional[str] = None,
    destination_city: Optional[str] = None,
    status: Optional[TripStatus] = TripStatus.PUBLISHED
):
    """List available trips with optional filters."""
    query = {"status": status}
    if origin_city:
        query["origin.city"] = {"$regex": origin_city, "$options": "i"}
    if destination_city:
        query["destination.city"] = {"$regex": destination_city, "$options": "i"}
    
    trips = await trips_collection.find(query).to_list(100)
    
    for trip in trips:
        trip["id"] = str(trip.pop("_id"))
        if "corridor_radius_km" not in trip:
            trip["corridor_radius_km"] = trip.get("max_deviation_km", 10.0)
    
    return trips


@router.get("/{trip_id}", response_model=TripResponse)
async def get_trip_details(trip_id: str, user_id: str = Depends(get_current_user_id)):
    """Get trip details by ID."""
    try:
        trip = await trips_collection.find_one({"_id": ObjectId(trip_id)})
        if not trip:
            raise HTTPException(status_code=404, detail="Viagem não encontrada")
        
        trip["id"] = str(trip.pop("_id"))
        return trip
    except Exception:
        raise HTTPException(status_code=404, detail="ID de viagem inválido")


@router.delete("/{trip_id}")
async def delete_trip(trip_id: str, user_id: str = Depends(get_current_user_id)):
    """Delete a trip (only if not matched)."""
    trip = await trips_collection.find_one({"_id": ObjectId(trip_id)})
    if not trip:
        raise HTTPException(status_code=404, detail="Viagem não encontrada")
    
    if trip["carrier_id"] != user_id:
        raise HTTPException(status_code=403, detail="Acesso negado")
    
    # Business rule: Can only delete if not matched
    if trip["status"] != TripStatus.PUBLISHED:
        raise HTTPException(
            status_code=400, 
            detail="Não é possível excluir uma viagem que já possui combinações ou foi concluída."
        )
    
    await trips_collection.delete_one({"_id": ObjectId(trip_id)})
    return {"message": "Viagem excluída com sucesso"}


# ============ Trip Management Endpoints ============

from pydantic import BaseModel

class TripCancellationRequest(BaseModel):
    reason: str
    

@router.get("/{trip_id}/management")
async def get_trip_management_info(trip_id: str, user_id: str = Depends(get_current_user_id)):
    """
    Get trip management info including status, matches, and available actions.
    """
    from database import matches_collection
    
    trip = await trips_collection.find_one({"_id": ObjectId(trip_id)})
    if not trip:
        raise HTTPException(status_code=404, detail="Viagem não encontrada")
    
    if trip["carrier_id"] != user_id:
        raise HTTPException(status_code=403, detail="Acesso negado")
    
    # Get associated matches
    matches = await matches_collection.find({"trip_id": trip_id}).to_list(50)
    
    # Determine available actions based on status
    status = trip.get("status", TripStatus.PUBLISHED)
    available_actions = []
    
    if status == TripStatus.PUBLISHED:
        if len(matches) == 0:
            available_actions = ["cancel", "edit"]
        else:
            available_actions = ["view_matches"]
    elif status == TripStatus.MATCHED:
        available_actions = ["start_trip", "cancel_with_penalty"]
    elif status == TripStatus.IN_PROGRESS:
        available_actions = ["complete", "report_issue"]
    elif status in [TripStatus.COMPLETED, TripStatus.CANCELLED, TripStatus.CANCELLED_BY_CARRIER]:
        available_actions = []
    
    return {
        "trip_id": trip_id,
        "status": status,
        "matches_count": len(matches),
        "has_paid_matches": any(m.get("payment_status") in ["paid_escrow", "escrowed", "paid"] for m in matches),
        "available_actions": available_actions,
        "cancellation_allowed": status in [TripStatus.PUBLISHED, TripStatus.MATCHED],
        "cancellation_has_penalty": status == TripStatus.MATCHED or any(m.get("payment_status") in ["paid_escrow", "escrowed", "paid"] for m in matches)
    }


@router.post("/{trip_id}/cancel")
async def cancel_trip(
    trip_id: str, 
    cancellation: TripCancellationRequest,
    user_id: str = Depends(get_current_user_id)
):
    """
    Cancel a trip. Rules:
    - If no matches: soft delete (status change)
    - If matched/paid: status change + cancellation record
    - Never hard delete if there's any user interaction
    """
    from database import matches_collection
    
    trip = await trips_collection.find_one({"_id": ObjectId(trip_id)})
    if not trip:
        raise HTTPException(status_code=404, detail="Viagem não encontrada")
    
    if trip["carrier_id"] != user_id:
        raise HTTPException(status_code=403, detail="Acesso negado")
    
    status = trip.get("status", TripStatus.PUBLISHED)
    
    # Check if cancellation is allowed
    if status in [TripStatus.COMPLETED, TripStatus.CANCELLED, TripStatus.CANCELLED_BY_CARRIER, TripStatus.CANCELLED_BY_SENDER]:
        raise HTTPException(status_code=400, detail="Esta viagem não pode ser cancelada")
    
    if status == TripStatus.IN_PROGRESS:
        raise HTTPException(status_code=400, detail="Viagem em andamento não pode ser cancelada. Use 'Reportar Problema'.")
    
    # Get matches to determine if there's user interaction
    matches = await matches_collection.find({"trip_id": trip_id}).to_list(50)
    has_interaction = len(matches) > 0
    has_payment = any(m.get("payment_status") in ["paid_escrow", "escrowed", "paid"] for m in matches)
    
    # Prepare cancellation record
    cancellation_record = {
        "cancelled_by": user_id,
        "cancelled_at": datetime.now(timezone.utc),
        "reason": cancellation.reason,
        "had_matches": has_interaction,
        "had_payment": has_payment,
        "previous_status": status
    }
    
    # Update trip status
    new_status = TripStatus.CANCELLED_BY_CARRIER
    
    await trips_collection.update_one(
        {"_id": ObjectId(trip_id)},
        {
            "$set": {
                "status": new_status,
                "cancellation": cancellation_record,
                "updated_at": datetime.now(timezone.utc)
            }
        }
    )
    
    # If there were matches, update them too
    if has_interaction:
        await matches_collection.update_many(
            {"trip_id": trip_id},
            {
                "$set": {
                    "status": "cancelled_by_carrier",
                    "cancellation_reason": cancellation.reason,
                    "cancelled_at": datetime.now(timezone.utc)
                }
            }
        )
    
    # TODO: If has_payment, trigger refund process
    
    return {
        "message": "Viagem cancelada com sucesso",
        "new_status": new_status,
        "had_matches": has_interaction,
        "refund_pending": has_payment
    }
