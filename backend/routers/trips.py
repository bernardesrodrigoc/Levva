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
async def get_my_trips(user_id: str = Depends(get_current_user_id)):
    """Get trips created by current user."""
    trips = await trips_collection.find({"carrier_id": user_id}).to_list(100)
    
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
