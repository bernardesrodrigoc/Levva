"""Shipment management routes."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from datetime import datetime, timezone
from typing import List, Optional
from bson import ObjectId

from database import users_collection, shipments_collection, matches_collection
from models import (
    ShipmentCreate, ShipmentResponse, ShipmentStatus,
    UserRole, VerificationStatus, TrustLevel
)
from auth import get_current_user_id
from trust_service import check_shipment_allowed
from services.unified_pricing_service import calculate_final_price

router = APIRouter()


@router.post("", response_model=ShipmentResponse)
async def create_shipment(shipment_data: ShipmentCreate, user_id: str = Depends(get_current_user_id)):
    """
    Create a new shipment with IMMUTABLE pricing.
    
    PRICING ARCHITECTURE:
    - Price is calculated ONLY here at creation
    - Result is stored as shipment.price
    - All subsequent screens use this persisted value
    - Price is NEVER recalculated
    """
    user = await users_collection.find_one({"_id": ObjectId(user_id)})
    if user["role"] not in [UserRole.SENDER, UserRole.BOTH]:
        raise HTTPException(status_code=403, detail="Apenas remetentes podem criar envios")
    
    if user.get("verification_status") != VerificationStatus.VERIFIED:
        raise HTTPException(
            status_code=403, 
            detail="Você precisa verificar sua identidade antes de criar envios"
        )
    
    # Check trust level limits
    trust_level = user.get("trust_level", TrustLevel.LEVEL_1)
    allowed, reason = check_shipment_allowed(
        trust_level,
        shipment_data.declared_value,
        shipment_data.package.weight_kg
    )
    
    if not allowed:
        raise HTTPException(status_code=403, detail=reason)
    
    # ============================================================
    # CALCULATE FINAL PRICE - Single Source of Truth
    # ============================================================
    # This is the ONLY place where price is calculated for shipments.
    # The result is stored and NEVER recalculated.
    # ============================================================
    
    price_breakdown = await calculate_final_price(
        origin_lat=shipment_data.origin.lat,
        origin_lng=shipment_data.origin.lng,
        dest_lat=shipment_data.destination.lat,
        dest_lng=shipment_data.destination.lng,
        weight_kg=shipment_data.package.weight_kg,
        category=shipment_data.package.category
    )
    
    shipment_doc = {
        "sender_id": user_id,
        "sender_name": user["name"],
        "sender_rating": user.get("rating", 0.0),
        **shipment_data.model_dump(),
        "status": ShipmentStatus.PUBLISHED,
        "price": price_breakdown,  # IMMUTABLE price breakdown
        "created_at": datetime.now(timezone.utc)
    }
    
    result = await shipments_collection.insert_one(shipment_doc)
    shipment_doc["id"] = str(result.inserted_id)
    
    return shipment_doc


# IMPORTANT: my-shipments must come BEFORE {shipment_id} to avoid route conflicts
@router.get("/my-shipments")
async def get_my_shipments(
    user_id: str = Depends(get_current_user_id),
    include_history: bool = False
):
    """
    Get shipments created by current user.
    
    Args:
        include_history: If False, returns only active shipments.
                        If True, returns only history (completed/cancelled/expired).
    """
    from services.expiration_service import get_active_statuses, get_history_statuses
    
    if include_history:
        # Return only history items
        statuses = get_history_statuses("shipment")
    else:
        # Return only active items
        statuses = get_active_statuses("shipment")
    
    shipments = await shipments_collection.find({
        "sender_id": user_id,
        "status": {"$in": statuses}
    }).sort("created_at", -1).to_list(100)
    
    for shipment in shipments:
        shipment["id"] = str(shipment.pop("_id"))
    
    return shipments


@router.get("/my-shipments/history")
async def get_my_shipments_history(user_id: str = Depends(get_current_user_id)):
    """Get shipments history (completed, cancelled, expired)."""
    from services.expiration_service import get_history_statuses
    
    statuses = get_history_statuses("shipment")
    
    shipments = await shipments_collection.find({
        "sender_id": user_id,
        "status": {"$in": statuses}
    }).sort("created_at", -1).to_list(100)
    
    for shipment in shipments:
        shipment["id"] = str(shipment.pop("_id"))
    
    return shipments


@router.get("", response_model=List[ShipmentResponse])
async def list_shipments(
    origin_city: Optional[str] = None,
    destination_city: Optional[str] = None,
    status: Optional[ShipmentStatus] = ShipmentStatus.PUBLISHED
):
    """List available shipments with optional filters."""
    query = {"status": status}
    if origin_city:
        query["origin.city"] = {"$regex": origin_city, "$options": "i"}
    if destination_city:
        query["destination.city"] = {"$regex": destination_city, "$options": "i"}
    
    shipments = await shipments_collection.find(query).to_list(100)
    
    for shipment in shipments:
        shipment["id"] = str(shipment.pop("_id"))
    
    return shipments


@router.get("/{shipment_id}", response_model=ShipmentResponse)
async def get_shipment_details(shipment_id: str, user_id: str = Depends(get_current_user_id)):
    """Get shipment details by ID."""
    try:
        shipment = await shipments_collection.find_one({"_id": ObjectId(shipment_id)})
        if not shipment:
            raise HTTPException(status_code=404, detail="Envio não encontrado")
        
        shipment["id"] = str(shipment.pop("_id"))
        
        # Add allowed actions based on status
        from services.cancellation_rules_service import get_allowed_actions
        shipment["allowed_actions"] = get_allowed_actions("shipment", shipment.get("status", ""))
        
        return shipment
    except Exception:
        raise HTTPException(status_code=404, detail="ID de envio inválido")


@router.get("/{shipment_id}/can-cancel")
async def check_can_cancel_shipment(shipment_id: str, user_id: str = Depends(get_current_user_id)):
    """
    Check if a shipment can be cancelled and what rules apply.
    """
    from services.cancellation_rules_service import can_cancel_shipment, get_cancellation_impact
    
    shipment = await shipments_collection.find_one({"_id": ObjectId(shipment_id)})
    if not shipment:
        raise HTTPException(status_code=404, detail="Envio não encontrado")
    
    if shipment["sender_id"] != user_id:
        raise HTTPException(status_code=403, detail="Acesso negado")
    
    # Check if has match
    match = await matches_collection.find_one({"shipment_id": shipment_id})
    has_match = match is not None
    match_status = match.get("status") if match else None
    has_payment = match_status in ["paid", "in_transit", "delivered"] if match else False
    
    can_cancel, requires_reason, message = can_cancel_shipment(
        shipment["status"], has_match, match_status
    )
    
    impact = get_cancellation_impact("shipment", shipment["status"], has_payment)
    
    return {
        "can_cancel": can_cancel,
        "requires_reason": requires_reason,
        "message": message,
        "impact": impact,
        "current_status": shipment["status"],
        "has_match": has_match,
        "match_status": match_status
    }


class CancelRequest(BaseModel):
    reason: Optional[str] = None


@router.post("/{shipment_id}/cancel")
async def cancel_shipment(
    shipment_id: str, 
    cancel_data: CancelRequest,
    user_id: str = Depends(get_current_user_id)
):
    """
    Cancel a shipment following business rules.
    
    Rules:
    - PUBLISHED without match: free cancellation
    - MATCHED without payment: requires reason
    - With payment: cannot cancel (use dispute)
    """
    from services.cancellation_rules_service import can_cancel_shipment
    from services.reputation_service import record_cancellation
    
    shipment = await shipments_collection.find_one({"_id": ObjectId(shipment_id)})
    if not shipment:
        raise HTTPException(status_code=404, detail="Envio não encontrado")
    
    if shipment["sender_id"] != user_id:
        raise HTTPException(status_code=403, detail="Acesso negado")
    
    # Check if has match
    match = await matches_collection.find_one({"shipment_id": shipment_id})
    has_match = match is not None
    match_status = match.get("status") if match else None
    
    can_cancel, requires_reason, message = can_cancel_shipment(
        shipment["status"], has_match, match_status
    )
    
    if not can_cancel:
        raise HTTPException(status_code=400, detail=message)
    
    if requires_reason and not cancel_data.reason:
        raise HTTPException(
            status_code=400, 
            detail="Motivo obrigatório para cancelar este envio"
        )
    
    # Update shipment status
    await shipments_collection.update_one(
        {"_id": ObjectId(shipment_id)},
        {
            "$set": {
                "status": ShipmentStatus.CANCELLED_BY_SENDER.value,
                "cancelled_at": datetime.now(timezone.utc),
                "cancellation_reason": cancel_data.reason
            }
        }
    )
    
    # If has match, cancel it too
    if has_match and match:
        await matches_collection.update_one(
            {"_id": match["_id"]},
            {
                "$set": {
                    "status": "cancelled_by_sender",
                    "cancelled_at": datetime.now(timezone.utc),
                    "cancellation_reason": cancel_data.reason
                }
            }
        )
    
    # Record reputation event
    has_payment = match_status in ["paid", "in_transit"] if match else False
    await record_cancellation(
        user_id, "shipment", shipment_id, has_payment, cancel_data.reason or "Sem motivo"
    )
    
    return {
        "message": "Envio cancelado com sucesso",
        "new_status": ShipmentStatus.CANCELLED_BY_SENDER.value
    }


@router.delete("/{shipment_id}")
async def delete_shipment(shipment_id: str, user_id: str = Depends(get_current_user_id)):
    """
    Delete a shipment (only DRAFT status).
    
    Note: For PUBLISHED or later, use /cancel instead.
    """
    shipment = await shipments_collection.find_one({"_id": ObjectId(shipment_id)})
    if not shipment:
        raise HTTPException(status_code=404, detail="Envio não encontrado")
    
    if shipment["sender_id"] != user_id:
        raise HTTPException(status_code=403, detail="Acesso negado")
    
    # Business rule: Can only delete if DRAFT
    if shipment["status"] != ShipmentStatus.DRAFT.value:
        raise HTTPException(
            status_code=400, 
            detail="Não é possível excluir. Use cancelamento para envios publicados."
        )
    
    await shipments_collection.delete_one({"_id": ObjectId(shipment_id)})
    return {"message": "Envio excluído com sucesso"}
