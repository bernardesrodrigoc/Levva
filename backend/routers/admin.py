"""Admin routes."""
from fastapi import APIRouter, Depends, HTTPException, Query
from datetime import datetime, timezone
from typing import Optional
from bson import ObjectId

from database import (
    users_collection, trips_collection, shipments_collection,
    matches_collection, verifications_collection, flag_collection,
    disputes_collection, messages_collection, payments_collection, db
)
from models import (
    TripStatus, ShipmentStatus, UserRole, VerificationStatus,
    FlagCreate
)
from auth import get_current_user_id
from core.dependencies import get_current_admin_user

router = APIRouter()


class DisputeStatus:
    OPEN = "open"
    UNDER_REVIEW = "under_review"
    RESOLVED_SENDER = "resolved_sender"
    RESOLVED_CARRIER = "resolved_carrier"
    RESOLVED_SPLIT = "resolved_split"
    CLOSED = "closed"


@router.get("/stats")
async def get_admin_stats(user: dict = Depends(get_current_admin_user)):
    """Get platform statistics."""
    from services.expiration_service import get_active_statuses, get_history_statuses
    
    total_users = await users_collection.count_documents({})
    
    # Count only ACTIVE items (not in history)
    active_trip_statuses = get_active_statuses("trip")
    active_shipment_statuses = get_active_statuses("shipment")
    active_match_statuses = get_active_statuses("match")
    
    active_trips = await trips_collection.count_documents({"status": {"$in": active_trip_statuses}})
    active_shipments = await shipments_collection.count_documents({"status": {"$in": active_shipment_statuses}})
    active_matches = await matches_collection.count_documents({"status": {"$in": active_match_statuses}})
    
    # Total counts (for reference)
    total_matches = await matches_collection.count_documents({})
    
    # History counts
    history_trip_statuses = get_history_statuses("trip")
    history_shipment_statuses = get_history_statuses("shipment")
    
    completed_trips = await trips_collection.count_documents({"status": {"$in": history_trip_statuses}})
    completed_shipments = await shipments_collection.count_documents({"status": {"$in": history_shipment_statuses}})
    
    pending_verifications = await verifications_collection.count_documents({"status": "pending"})
    flagged_items = await flag_collection.count_documents({"status": "pending"})
    
    return {
        "total_users": total_users,
        "active_trips": active_trips,
        "active_shipments": active_shipments,
        "active_matches": active_matches,
        "total_matches": total_matches,
        "completed_trips": completed_trips,
        "completed_shipments": completed_shipments,
        "pending_verifications": pending_verifications,
        "flagged_items": flagged_items
    }


@router.get("/verifications/pending")
async def get_pending_verifications(user: dict = Depends(get_current_admin_user)):
    """Get pending verification requests."""
    verifications = await verifications_collection.find({"status": "pending"}).to_list(100)
    
    result = []
    for verification in verifications:
        user_data = await users_collection.find_one({"_id": ObjectId(verification["user_id"])})
        if user_data:
            verification["id"] = str(verification.pop("_id"))
            verification["user_name"] = user_data["name"]
            verification["user_email"] = user_data["email"]
            verification["user_role"] = user_data["role"]
            result.append(verification)
    
    return result


@router.get("/verifications/approved")
async def get_approved_verifications(user: dict = Depends(get_current_admin_user)):
    """Get approved verification requests."""
    verifications = await verifications_collection.find({"status": "approved"}).sort("reviewed_at", -1).to_list(200)
    
    result = []
    for verification in verifications:
        user_data = await users_collection.find_one({"_id": ObjectId(verification["user_id"])})
        if user_data:
            verification["id"] = str(verification.pop("_id"))
            verification["user_name"] = user_data["name"]
            verification["user_email"] = user_data["email"]
            verification["user_role"] = user_data["role"]
            verification["user_phone"] = user_data.get("phone", "")
            verification["trust_level"] = user_data.get("trust_level", "level_1")
            verification["total_deliveries"] = user_data.get("total_deliveries", 0)
            verification["rating"] = user_data.get("rating", 0)
            result.append(verification)
    
    return result


@router.get("/users")
async def get_all_users(
    status: str = None,
    role: str = None,
    user: dict = Depends(get_current_admin_user)
):
    """Get all users with optional filters."""
    query = {}
    if status:
        query["verification_status"] = status
    if role:
        query["role"] = role
    
    users = await users_collection.find(query).sort("created_at", -1).to_list(500)
    
    result = []
    for u in users:
        result.append({
            "id": str(u["_id"]),
            "name": u["name"],
            "email": u["email"],
            "phone": u.get("phone", ""),
            "role": u["role"],
            "verification_status": u.get("verification_status", "pending"),
            "trust_level": u.get("trust_level", "level_1"),
            "total_deliveries": u.get("total_deliveries", 0),
            "rating": u.get("rating", 0),
            "created_at": u.get("created_at").isoformat() if u.get("created_at") else None
        })
    
    return result


@router.post("/users/{user_id}/revoke-verification")
async def revoke_user_verification(user_id: str, data: dict, user: dict = Depends(get_current_admin_user)):
    """Revoke a user's verification status."""
    target_user = await users_collection.find_one({"_id": ObjectId(user_id)})
    if not target_user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    
    reason = data.get("reason", "Verificação revogada pelo administrador")
    
    # Update user verification status
    await users_collection.update_one(
        {"_id": ObjectId(user_id)},
        {"$set": {"verification_status": VerificationStatus.REJECTED}}
    )
    
    # Update verification record
    await verifications_collection.update_one(
        {"user_id": user_id, "status": "approved"},
        {
            "$set": {
                "status": "revoked",
                "revoked_at": datetime.now(timezone.utc),
                "revoked_by": str(user["_id"]),
                "revoke_reason": reason
            }
        }
    )
    
    return {"message": "Verificação revogada", "user_id": user_id}


@router.get("/users/{user_id}")
async def get_user_details(user_id: str, user: dict = Depends(get_current_admin_user)):
    """Get detailed user information."""
    target_user = await users_collection.find_one({"_id": ObjectId(user_id)})
    if not target_user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    
    # Get verification info
    verification = await verifications_collection.find_one({"user_id": user_id})
    
    # Get user's trips count
    trips_count = await trips_collection.count_documents({"carrier_id": user_id})
    
    # Get user's shipments count
    shipments_count = await shipments_collection.count_documents({"sender_id": user_id})
    
    # Get user's matches count
    matches_count = await matches_collection.count_documents({
        "$or": [{"carrier_id": user_id}, {"sender_id": user_id}]
    })
    
    return {
        "id": str(target_user["_id"]),
        "name": target_user["name"],
        "email": target_user["email"],
        "phone": target_user.get("phone", ""),
        "role": target_user["role"],
        "verification_status": target_user.get("verification_status", "pending"),
        "trust_level": target_user.get("trust_level", "level_1"),
        "total_deliveries": target_user.get("total_deliveries", 0),
        "rating": target_user.get("rating", 0),
        "created_at": target_user.get("created_at").isoformat() if target_user.get("created_at") else None,
        "verification": {
            "cpf": verification.get("cpf") if verification else None,
            "birth_date": verification.get("birth_date") if verification else None,
            "address": verification.get("address") if verification else None,
            "documents": verification.get("documents") if verification else None,
            "status": verification.get("status") if verification else None,
            "submitted_at": verification.get("submitted_at").isoformat() if verification and verification.get("submitted_at") else None,
            "reviewed_at": verification.get("reviewed_at").isoformat() if verification and verification.get("reviewed_at") else None
        } if verification else None,
        "stats": {
            "trips_created": trips_count,
            "shipments_created": shipments_count,
            "total_matches": matches_count
        }
    }


@router.delete("/users/{user_id}")
async def delete_user(user_id: str, user: dict = Depends(get_current_admin_user)):
    """Delete a user and all their data."""
    target_user = await users_collection.find_one({"_id": ObjectId(user_id)})
    if not target_user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    
    # Prevent deleting admin users
    if target_user.get("role") == "admin":
        raise HTTPException(status_code=403, detail="Não é possível excluir usuários admin")
    
    # Check for active matches
    active_matches = await matches_collection.count_documents({
        "$or": [{"carrier_id": user_id}, {"sender_id": user_id}],
        "status": {"$in": ["pending", "accepted", "paid", "in_transit"]}
    })
    
    if active_matches > 0:
        raise HTTPException(
            status_code=400, 
            detail=f"Usuário possui {active_matches} entrega(s) em andamento. Conclua ou cancele antes de excluir."
        )
    
    # Delete user's data
    await verifications_collection.delete_many({"user_id": user_id})
    await trips_collection.delete_many({"carrier_id": user_id})
    await shipments_collection.delete_many({"sender_id": user_id})
    await messages_collection.delete_many({"sender_id": user_id})
    
    # Delete the user
    await users_collection.delete_one({"_id": ObjectId(user_id)})
    
    return {"message": "Usuário excluído com sucesso", "user_id": user_id}


@router.post("/verifications/{verification_id}/review")
async def review_verification(
    verification_id: str,
    review_data: dict,
    user: dict = Depends(get_current_admin_user)
):
    """Review and approve/reject verification."""
    verification = await verifications_collection.find_one({"_id": ObjectId(verification_id)})
    if not verification:
        raise HTTPException(status_code=404, detail="Verificação não encontrada")
    
    user_id = str(user["_id"])
    action = review_data.get("action")
    notes = review_data.get("notes", "")
    
    if action == "approve":
        await verifications_collection.update_one(
            {"_id": ObjectId(verification_id)},
            {
                "$set": {
                    "status": "approved",
                    "reviewed_at": datetime.now(timezone.utc),
                    "reviewed_by": user_id,
                    "notes": notes
                }
            }
        )
        
        await users_collection.update_one(
            {"_id": ObjectId(verification["user_id"])},
            {"$set": {"verification_status": VerificationStatus.VERIFIED}}
        )
        
        return {"message": "Verificação aprovada"}
    
    elif action == "reject":
        await verifications_collection.update_one(
            {"_id": ObjectId(verification_id)},
            {
                "$set": {
                    "status": "rejected",
                    "reviewed_at": datetime.now(timezone.utc),
                    "reviewed_by": user_id,
                    "notes": notes
                }
            }
        )
        
        await users_collection.update_one(
            {"_id": ObjectId(verification["user_id"])},
            {"$set": {"verification_status": VerificationStatus.REJECTED}}
        )
        
        return {"message": "Verificação rejeitada"}
    
    raise HTTPException(status_code=400, detail="Ação inválida")


@router.post("/flags")
async def create_flag(flag_data: FlagCreate, user_id: str = Depends(get_current_user_id)):
    """Create a flag/report."""
    flag_doc = {
        **flag_data.model_dump(),
        "reporter_id": user_id,
        "status": "pending",
        "created_at": datetime.now(timezone.utc)
    }
    
    await flag_collection.insert_one(flag_doc)
    
    return {"message": "Denúncia criada com sucesso"}


@router.get("/disputes")
async def get_all_disputes(user: dict = Depends(get_current_admin_user)):
    """Admin: Get all disputes."""
    disputes = await disputes_collection.find().sort("created_at", -1).to_list(100)
    
    result = []
    for dispute in disputes:
        match = await matches_collection.find_one({"_id": ObjectId(dispute["match_id"])})
        sender = await users_collection.find_one({"_id": ObjectId(match["sender_id"])}) if match else None
        carrier = await users_collection.find_one({"_id": ObjectId(match["carrier_id"])}) if match else None
        
        result.append({
            "id": str(dispute["_id"]),
            "match_id": dispute["match_id"],
            "opened_by_name": dispute.get("opened_by_name", "N/A"),
            "opened_by_role": dispute.get("opened_by_role", "N/A"),
            "reason": dispute.get("reason", ""),
            "description": dispute.get("description", ""),
            "status": dispute.get("status", "open"),
            "sender_name": sender["name"] if sender else "N/A",
            "carrier_name": carrier["name"] if carrier else "N/A",
            "match_value": match.get("estimated_price", 0) if match else 0,
            "created_at": dispute["created_at"].isoformat() if dispute.get("created_at") else None,
            "admin_notes": dispute.get("admin_notes", []),
            "resolution": dispute.get("resolution")
        })
    
    return result


@router.get("/disputes/{dispute_id}")
async def get_dispute_details(dispute_id: str, user: dict = Depends(get_current_admin_user)):
    """Admin: Get detailed dispute info."""
    dispute = await disputes_collection.find_one({"_id": ObjectId(dispute_id)})
    if not dispute:
        raise HTTPException(status_code=404, detail="Disputa não encontrada")
    
    match = await matches_collection.find_one({"_id": ObjectId(dispute["match_id"])})
    sender = await users_collection.find_one({"_id": ObjectId(match["sender_id"])}) if match else None
    carrier = await users_collection.find_one({"_id": ObjectId(match["carrier_id"])}) if match else None
    
    messages = await messages_collection.find({"match_id": dispute["match_id"]}).sort("timestamp", 1).to_list(100)
    
    return {
        "id": str(dispute["_id"]),
        "match_id": dispute["match_id"],
        "opened_by": dispute.get("opened_by"),
        "opened_by_name": dispute.get("opened_by_name", "N/A"),
        "opened_by_role": dispute.get("opened_by_role", "N/A"),
        "reason": dispute.get("reason", ""),
        "description": dispute.get("description", ""),
        "evidence_urls": dispute.get("evidence_urls", []),
        "status": dispute.get("status", "open"),
        "admin_notes": dispute.get("admin_notes", []),
        "resolution": dispute.get("resolution"),
        "created_at": dispute["created_at"].isoformat() if dispute.get("created_at") else None,
        "match": {
            "id": str(match["_id"]) if match else None,
            "estimated_price": match.get("estimated_price") if match else 0,
            "status": match.get("status") if match else None,
            "origin": match.get("trip", {}).get("origin", {}).get("city") if match else None,
            "destination": match.get("trip", {}).get("destination", {}).get("city") if match else None
        },
        "sender": {
            "id": str(sender["_id"]) if sender else None,
            "name": sender["name"] if sender else "N/A",
            "email": sender["email"] if sender else "N/A",
            "rating": sender.get("rating", 0) if sender else 0,
            "total_deliveries": sender.get("total_deliveries", 0) if sender else 0
        },
        "carrier": {
            "id": str(carrier["_id"]) if carrier else None,
            "name": carrier["name"] if carrier else "N/A",
            "email": carrier["email"] if carrier else "N/A",
            "rating": carrier.get("rating", 0) if carrier else 0,
            "total_deliveries": carrier.get("total_deliveries", 0) if carrier else 0
        },
        "chat_messages": [
            {
                "sender_name": m.get("sender_name", "Unknown"),
                "content": m["content"],
                "timestamp": m["timestamp"].isoformat() if m.get("timestamp") else None
            }
            for m in messages
        ]
    }


@router.post("/disputes/{dispute_id}/add-note")
async def add_dispute_note(dispute_id: str, note_data: dict, user: dict = Depends(get_current_admin_user)):
    """Admin: Add a note to dispute."""
    user_id = str(user["_id"])
    
    note = {
        "admin_id": user_id,
        "admin_name": user["name"],
        "content": note_data.get("content", ""),
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
    
    await disputes_collection.update_one(
        {"_id": ObjectId(dispute_id)},
        {
            "$push": {"admin_notes": note},
            "$set": {"updated_at": datetime.now(timezone.utc)}
        }
    )
    
    return {"message": "Nota adicionada", "note": note}


@router.post("/disputes/{dispute_id}/resolve")
async def resolve_dispute(dispute_id: str, resolution_data: dict, user: dict = Depends(get_current_admin_user)):
    """Admin: Resolve a dispute."""
    user_id = str(user["_id"])
    
    dispute = await disputes_collection.find_one({"_id": ObjectId(dispute_id)})
    if not dispute:
        raise HTTPException(status_code=404, detail="Disputa não encontrada")
    
    resolution_type = resolution_data.get("resolution_type")
    resolution_notes = resolution_data.get("notes", "")
    refund_amount = resolution_data.get("refund_amount", 0)
    
    resolution = {
        "type": resolution_type,
        "notes": resolution_notes,
        "refund_amount": refund_amount,
        "resolved_by": user_id,
        "resolved_by_name": user["name"],
        "resolved_at": datetime.now(timezone.utc).isoformat()
    }
    
    status_map = {
        "sender": DisputeStatus.RESOLVED_SENDER,
        "carrier": DisputeStatus.RESOLVED_CARRIER,
        "split": DisputeStatus.RESOLVED_SPLIT,
        "dismissed": DisputeStatus.CLOSED
    }
    
    new_status = status_map.get(resolution_type, DisputeStatus.CLOSED)
    
    await disputes_collection.update_one(
        {"_id": ObjectId(dispute_id)},
        {
            "$set": {
                "status": new_status,
                "resolution": resolution,
                "updated_at": datetime.now(timezone.utc)
            }
        }
    )
    
    match_status = "cancelled" if resolution_type == "dismissed" else "dispute_resolved"
    await matches_collection.update_one(
        {"_id": ObjectId(dispute["match_id"])},
        {"$set": {"status": match_status}}
    )
    
    return {
        "message": "Disputa resolvida",
        "resolution": resolution,
        "new_status": new_status
    }



# ============ Vehicle Intelligence Admin ============

@router.get("/vehicles/flagged")
async def get_flagged_vehicles(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    vehicle_type: Optional[str] = None,
    user: dict = Depends(get_current_admin_user)
):
    """
    Get vehicles with flagged capacity deviations.
    
    Useful for:
    - Reviewing unusual capacity claims
    - Trust scoring
    - Manual verification
    """
    query = {"capacity_deviation_flagged": True}
    
    if vehicle_type:
        query["type"] = vehicle_type
    
    skip = (page - 1) * limit
    
    vehicles = await db.vehicles.find(query).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    total = await db.vehicles.count_documents(query)
    
    # Enrich with owner info
    results = []
    for v in vehicles:
        owner = await users_collection.find_one({"_id": ObjectId(v["owner_id"])}) if v.get("owner_id") else None
        results.append({
            "id": str(v["_id"]),
            "name": v.get("name"),
            "type": v.get("type"),
            "brand": v.get("brand"),
            "model": v.get("model"),
            "year": v.get("year"),
            "license_plate": v.get("license_plate"),
            "capacity_weight_kg": v.get("capacity_weight_kg"),
            "capacity_volume_liters": v.get("capacity_volume_liters"),
            "deviation_details": v.get("capacity_deviation_details"),
            "is_verified": v.get("is_verified", False),
            "created_at": v.get("created_at"),
            "owner": {
                "id": str(owner["_id"]) if owner else None,
                "name": owner.get("name") if owner else "Desconhecido",
                "email": owner.get("email") if owner else None
            } if owner else None
        })
    
    return {
        "vehicles": results,
        "total": total,
        "page": page,
        "limit": limit,
        "total_pages": (total + limit - 1) // limit
    }


@router.get("/vehicles/statistics")
async def get_vehicle_statistics(user: dict = Depends(get_current_admin_user)):
    """
    Get vehicle statistics for admin dashboard.
    """
    total_vehicles = await db.vehicles.count_documents({})
    flagged_vehicles = await db.vehicles.count_documents({"capacity_deviation_flagged": True})
    verified_vehicles = await db.vehicles.count_documents({"is_verified": True})
    
    # Count by type
    type_pipeline = [
        {"$group": {"_id": "$type", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}}
    ]
    by_type = await db.vehicles.aggregate(type_pipeline).to_list(20)
    
    # Top brands
    brand_pipeline = [
        {"$match": {"brand": {"$exists": True, "$ne": None}}},
        {"$group": {"_id": "$brand", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 10}
    ]
    top_brands = await db.vehicles.aggregate(brand_pipeline).to_list(10)
    
    return {
        "total_vehicles": total_vehicles,
        "flagged_vehicles": flagged_vehicles,
        "verified_vehicles": verified_vehicles,
        "flagged_percentage": round(flagged_vehicles / total_vehicles * 100, 1) if total_vehicles > 0 else 0,
        "by_type": [{"type": t["_id"], "count": t["count"]} for t in by_type],
        "top_brands": [{"brand": b["_id"], "count": b["count"]} for b in top_brands]
    }


@router.post("/vehicles/{vehicle_id}/clear-flag")
async def clear_vehicle_flag(
    vehicle_id: str,
    user: dict = Depends(get_current_admin_user)
):
    """
    Clear the deviation flag for a vehicle after manual review.
    """
    result = await db.vehicles.update_one(
        {"_id": ObjectId(vehicle_id)},
        {
            "$set": {
                "capacity_deviation_flagged": False,
                "flag_cleared_by": str(user["_id"]),
                "flag_cleared_at": datetime.now(timezone.utc)
            }
        }
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Veículo não encontrado")
    
    return {"message": "Flag removido com sucesso"}


@router.post("/vehicles/{vehicle_id}/verify")
async def verify_vehicle(
    vehicle_id: str,
    user: dict = Depends(get_current_admin_user)
):
    """
    Manually verify a vehicle.
    """
    result = await db.vehicles.update_one(
        {"_id": ObjectId(vehicle_id)},
        {
            "$set": {
                "is_verified": True,
                "verified_by": str(user["_id"]),
                "verified_at": datetime.now(timezone.utc)
            }
        }
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Veículo não encontrado")
    
    return {"message": "Veículo verificado com sucesso"}



# ============ Payout Admin Control ============

@router.get("/payouts/ready")
async def get_ready_payouts(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    user: dict = Depends(get_current_admin_user)
):
    """
    List all PAYOUT_READY shipments for admin payout processing.
    """
    from models import PaymentStatus
    from database import payments_collection
    
    query = {"status": {"$in": [
        PaymentStatus.PAYOUT_READY.value,
        "payout_ready"
    ]}}
    
    skip = (page - 1) * limit
    
    payments = await payments_collection.find(query).sort("confirmed_at", 1).skip(skip).limit(limit).to_list(limit)
    total = await payments_collection.count_documents(query)
    
    results = []
    for p in payments:
        # Get match info
        match = await matches_collection.find_one({"_id": ObjectId(p["match_id"])}) if p.get("match_id") else None
        
        # Get carrier info
        carrier = None
        if match and match.get("carrier_id"):
            carrier = await users_collection.find_one({"_id": ObjectId(match["carrier_id"])})
        
        results.append({
            "payment_id": str(p["_id"]),
            "match_id": p.get("match_id"),
            "trip_id": match.get("trip_id") if match else None,
            "shipment_id": match.get("shipment_id") if match else None,
            "total_paid": p.get("amount"),
            "platform_fee": p.get("platform_fee"),
            "carrier_amount": p.get("carrier_amount"),
            "carrier": {
                "id": str(carrier["_id"]) if carrier else None,
                "name": carrier.get("name") if carrier else "Desconhecido",
                "email": carrier.get("email") if carrier else None,
                "pix_key": carrier.get("pix_key") if carrier else None,
                "pix_type": carrier.get("pix_type") if carrier else None
            } if carrier else None,
            "delivered_at": p.get("delivered_at").isoformat() if p.get("delivered_at") else None,
            "confirmed_at": p.get("confirmed_at").isoformat() if p.get("confirmed_at") else None,
            "confirmation_type": p.get("confirmation_type"),
            "status": p.get("status")
        })
    
    return {
        "payouts": results,
        "total": total,
        "page": page,
        "limit": limit,
        "total_pages": (total + limit - 1) // limit
    }


@router.get("/payouts/blocked")
async def get_blocked_payouts(user: dict = Depends(get_current_admin_user)):
    """
    List payouts blocked due to missing payout method.
    """
    from models import PaymentStatus
    from database import payments_collection
    
    query = {"status": {"$in": [
        PaymentStatus.PAYOUT_BLOCKED_NO_PAYOUT_METHOD.value,
        "payout_blocked_no_payout_method"
    ]}}
    
    payments = await payments_collection.find(query).to_list(100)
    
    results = []
    for p in payments:
        match = await matches_collection.find_one({"_id": ObjectId(p["match_id"])}) if p.get("match_id") else None
        carrier = None
        if match and match.get("carrier_id"):
            carrier = await users_collection.find_one({"_id": ObjectId(match["carrier_id"])})
        
        results.append({
            "payment_id": str(p["_id"]),
            "match_id": p.get("match_id"),
            "carrier_amount": p.get("carrier_amount"),
            "carrier": {
                "id": str(carrier["_id"]) if carrier else None,
                "name": carrier.get("name") if carrier else "Desconhecido",
                "email": carrier.get("email") if carrier else None,
            } if carrier else None,
            "confirmed_at": p.get("confirmed_at").isoformat() if p.get("confirmed_at") else None,
            "reason": "Transportador não cadastrou método de pagamento (Pix)"
        })
    
    return {
        "blocked_payouts": results,
        "total": len(results)
    }


@router.post("/payouts/{payment_id}/complete")
async def mark_payout_completed(
    payment_id: str,
    user: dict = Depends(get_current_admin_user)
):
    """
    Admin marks a payout as completed after manual transfer.
    """
    from models import PaymentStatus
    from database import payments_collection
    
    payment = await payments_collection.find_one({"_id": ObjectId(payment_id)})
    if not payment:
        raise HTTPException(status_code=404, detail="Pagamento não encontrado")
    
    current_status = str(payment.get("status", ""))
    if current_status not in [PaymentStatus.PAYOUT_READY.value, "payout_ready"]:
        raise HTTPException(status_code=400, detail=f"Pagamento não está pronto para payout. Status: {current_status}")
    
    now = datetime.now(timezone.utc)
    
    await payments_collection.update_one(
        {"_id": ObjectId(payment_id)},
        {
            "$set": {
                "status": PaymentStatus.PAYOUT_COMPLETED.value,
                "payout_completed_at": now,
                "payout_completed_by": str(user["_id"])
            }
        }
    )
    
    return {
        "message": "Payout marcado como concluído",
        "payment_id": payment_id,
        "completed_at": now.isoformat()
    }


@router.get("/payouts/statistics")
async def get_payout_statistics(user: dict = Depends(get_current_admin_user)):
    """
    Get payout statistics for admin dashboard.
    """
    from models import PaymentStatus
    from database import payments_collection
    
    total_payments = await payments_collection.count_documents({})
    pending_delivery = await payments_collection.count_documents({"status": {"$in": ["paid_escrow", "escrowed", "paid"]}})
    delivered_pending_confirm = await payments_collection.count_documents({"status": PaymentStatus.DELIVERED_BY_TRANSPORTER.value})
    ready_for_payout = await payments_collection.count_documents({"status": {"$in": [PaymentStatus.PAYOUT_READY.value, "payout_ready"]}})
    payout_blocked = await payments_collection.count_documents({"status": PaymentStatus.PAYOUT_BLOCKED_NO_PAYOUT_METHOD.value})
    payouts_completed = await payments_collection.count_documents({"status": PaymentStatus.PAYOUT_COMPLETED.value})
    disputes_open = await payments_collection.count_documents({"status": PaymentStatus.DISPUTE_OPENED.value})
    
    # Calculate totals
    pipeline = [
        {"$match": {"status": {"$in": [PaymentStatus.PAYOUT_READY.value, "payout_ready"]}}},
        {"$group": {
            "_id": None,
            "total_carrier_amount": {"$sum": "$carrier_amount"},
            "total_platform_fee": {"$sum": "$platform_fee"}
        }}
    ]
    
    totals = await payments_collection.aggregate(pipeline).to_list(1)
    totals = totals[0] if totals else {"total_carrier_amount": 0, "total_platform_fee": 0}
    
    return {
        "total_payments": total_payments,
        "pending_delivery": pending_delivery,
        "delivered_pending_confirm": delivered_pending_confirm,
        "ready_for_payout": ready_for_payout,
        "payout_blocked": payout_blocked,
        "payouts_completed": payouts_completed,
        "disputes_open": disputes_open,
        "pending_payout_total": totals.get("total_carrier_amount", 0),
        "pending_platform_fee": totals.get("total_platform_fee", 0)
    }


@router.post("/payouts/run-auto-confirm")
async def trigger_auto_confirmation(user: dict = Depends(get_current_admin_user)):
    """
    Manually trigger the auto-confirmation job.
    This processes all deliveries past their 7-day confirmation window.
    """
    from services.auto_confirmation_service import process_auto_confirmations
    
    result = await process_auto_confirmations()
    
    return {
        "message": "Auto-confirmação executada",
        **result
    }


@router.post("/run-expirations")
async def trigger_expirations(user: dict = Depends(get_current_admin_user)):
    """
    Manually trigger the expiration job.
    This expires:
    - Matches pending payment > 48h
    - Trips past departure date > 24h
    - Shipments published > 30 days
    """
    from services.expiration_service import run_all_expirations
    
    result = await run_all_expirations()
    
    return {
        "message": "Verificação de expiração executada",
        **result
    }



# ============ Global History Admin ============

def serialize_doc(doc: dict) -> dict:
    """Convert all ObjectId fields to strings in a document."""
    result = {}
    for key, value in doc.items():
        if key == "_id":
            result["id"] = str(value)
        elif isinstance(value, ObjectId):
            result[key] = str(value)
        elif isinstance(value, dict):
            result[key] = serialize_doc(value)
        elif isinstance(value, list):
            result[key] = [serialize_doc(v) if isinstance(v, dict) else (str(v) if isinstance(v, ObjectId) else v) for v in value]
        elif isinstance(value, datetime):
            result[key] = value.isoformat()
        else:
            result[key] = value
    return result


@router.get("/history/global")
async def get_global_history(
    entity_type: Optional[str] = None,  # trip, shipment, match
    status: Optional[str] = None,
    user_id: Optional[str] = None,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=100),
    user: dict = Depends(get_current_admin_user)
):
    """
    Get global history of all completed, cancelled, and expired items.
    
    This provides admin access to the full audit trail of all entities.
    """
    from services.expiration_service import get_history_statuses
    
    results = {
        "trips": [],
        "shipments": [],
        "matches": [],
        "total": 0
    }
    
    skip = (page - 1) * limit
    
    # Build query filters
    trip_query = {}
    shipment_query = {}
    match_query = {}
    
    # Filter by status if provided
    if status:
        trip_query["status"] = status
        shipment_query["status"] = status
        match_query["status"] = status
    else:
        # Only history statuses
        trip_query["status"] = {"$in": get_history_statuses("trip")}
        shipment_query["status"] = {"$in": get_history_statuses("shipment")}
        match_query["status"] = {"$in": get_history_statuses("match")}
    
    # Filter by user
    if user_id:
        trip_query["carrier_id"] = user_id
        shipment_query["sender_id"] = user_id
        match_query["$or"] = [{"sender_id": user_id}, {"carrier_id": user_id}]
    
    # Fetch data based on entity_type filter
    if entity_type is None or entity_type == "trip":
        trips = await trips_collection.find(trip_query).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
        for trip in trips:
            trip = serialize_doc(trip)
            trip["entity_type"] = "trip"
            # Get carrier info
            if trip.get("carrier_id"):
                carrier = await users_collection.find_one({"_id": ObjectId(trip["carrier_id"])})
                trip["user_name"] = carrier.get("name") if carrier else "Desconhecido"
                trip["user_email"] = carrier.get("email") if carrier else ""
            results["trips"].append(trip)
    
    if entity_type is None or entity_type == "shipment":
        shipments = await shipments_collection.find(shipment_query).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
        for shipment in shipments:
            shipment = serialize_doc(shipment)
            shipment["entity_type"] = "shipment"
            # Get sender info
            if shipment.get("sender_id"):
                sender = await users_collection.find_one({"_id": ObjectId(shipment["sender_id"])})
                shipment["user_name"] = sender.get("name") if sender else "Desconhecido"
                shipment["user_email"] = sender.get("email") if sender else ""
            results["shipments"].append(shipment)
    
    if entity_type is None or entity_type == "match":
        # For matches with $or query, we need to handle it differently
        if user_id:
            match_query = {
                "status": {"$in": get_history_statuses("match")},
                "$or": [{"sender_id": user_id}, {"carrier_id": user_id}]
            }
        
        matches = await matches_collection.find(match_query).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
        for match in matches:
            match = serialize_doc(match)
            match["entity_type"] = "match"
            # Get user info
            if match.get("sender_id"):
                sender = await users_collection.find_one({"_id": ObjectId(match["sender_id"])})
                match["sender_name"] = sender.get("name") if sender else "Desconhecido"
            if match.get("carrier_id"):
                carrier = await users_collection.find_one({"_id": ObjectId(match["carrier_id"])})
                match["carrier_name"] = carrier.get("name") if carrier else "Desconhecido"
            results["matches"].append(match)
    
    # Calculate totals
    results["total"] = len(results["trips"]) + len(results["shipments"]) + len(results["matches"])
    results["page"] = page
    results["limit"] = limit
    
    return results


@router.get("/history/summary")
async def get_history_summary(user: dict = Depends(get_current_admin_user)):
    """
    Get summary counts for history section.
    """
    from services.expiration_service import get_history_statuses
    
    trip_statuses = get_history_statuses("trip")
    shipment_statuses = get_history_statuses("shipment")
    match_statuses = get_history_statuses("match")
    
    # Count by status for each entity type
    trip_counts = {}
    for status in trip_statuses:
        count = await trips_collection.count_documents({"status": status})
        if count > 0:
            trip_counts[status] = count
    
    shipment_counts = {}
    for status in shipment_statuses:
        count = await shipments_collection.count_documents({"status": status})
        if count > 0:
            shipment_counts[status] = count
    
    match_counts = {}
    for status in match_statuses:
        count = await matches_collection.count_documents({"status": status})
        if count > 0:
            match_counts[status] = count
    
    return {
        "trips": {
            "total": sum(trip_counts.values()),
            "by_status": trip_counts
        },
        "shipments": {
            "total": sum(shipment_counts.values()),
            "by_status": shipment_counts
        },
        "matches": {
            "total": sum(match_counts.values()),
            "by_status": match_counts
        }
    }


# ============ Financial History Admin ============

@router.get("/finance/history")
async def get_financial_history(
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=100),
    status: Optional[str] = None,
    user: dict = Depends(get_current_admin_user)
):
    """
    Get complete financial history for admin.
    Shows all payments with their full lifecycle.
    """
    skip = (page - 1) * limit
    
    query = {}
    if status:
        query["status"] = status
    
    payments = await payments_collection.find(query).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    
    results = []
    for payment in payments:
        # Get match info
        match = await matches_collection.find_one({"_id": ObjectId(payment["match_id"])}) if payment.get("match_id") else None
        
        # Get user info
        sender = None
        carrier = None
        if match:
            sender = await users_collection.find_one({"_id": ObjectId(match["sender_id"])})
            carrier = await users_collection.find_one({"_id": ObjectId(match["carrier_id"])})
        
        results.append({
            "id": str(payment["_id"]),
            "match_id": payment.get("match_id"),
            "status": str(payment.get("status")),
            "amount": payment.get("amount", 0),
            "platform_fee": payment.get("platform_fee", 0),
            "carrier_amount": payment.get("carrier_amount", 0),
            "sender_name": sender.get("name") if sender else "N/A",
            "sender_email": sender.get("email") if sender else "N/A",
            "carrier_name": carrier.get("name") if carrier else "N/A",
            "carrier_email": carrier.get("email") if carrier else "N/A",
            "carrier_pix": carrier.get("pix_key") if carrier else None,
            "created_at": payment.get("created_at").isoformat() if payment.get("created_at") else None,
            "paid_at": payment.get("paid_at").isoformat() if payment.get("paid_at") else None,
            "delivered_at": payment.get("delivered_at").isoformat() if payment.get("delivered_at") else None,
            "confirmed_at": payment.get("confirmed_at").isoformat() if payment.get("confirmed_at") else None,
            "confirmation_type": payment.get("confirmation_type"),
            "payout_completed_at": payment.get("payout_completed_at").isoformat() if payment.get("payout_completed_at") else None,
            "auto_confirm_deadline": payment.get("auto_confirm_deadline").isoformat() if payment.get("auto_confirm_deadline") else None,
            "dispute_reason": payment.get("dispute_reason")
        })
    
    total = await payments_collection.count_documents(query)
    
    return {
        "payments": results,
        "total": total,
        "page": page,
        "limit": limit,
        "pages": (total + limit - 1) // limit
    }


@router.get("/finance/summary")
async def get_financial_summary(user: dict = Depends(get_current_admin_user)):
    """
    Get financial summary for admin dashboard.
    """
    from models import PaymentStatus
    
    # Count by status
    status_counts = {}
    for status in PaymentStatus:
        count = await payments_collection.count_documents({"status": status.value})
        if count > 0:
            status_counts[status.value] = count
    
    # Calculate totals
    pipeline = [
        {"$group": {
            "_id": "$status",
            "total_amount": {"$sum": "$amount"},
            "total_platform_fee": {"$sum": "$platform_fee"},
            "total_carrier_amount": {"$sum": "$carrier_amount"},
            "count": {"$sum": 1}
        }}
    ]
    
    aggregation = await payments_collection.aggregate(pipeline).to_list(100)
    
    totals_by_status = {}
    grand_total = 0
    grand_platform_fee = 0
    grand_carrier_amount = 0
    
    for item in aggregation:
        status = item["_id"]
        totals_by_status[str(status)] = {
            "count": item["count"],
            "total_amount": item["total_amount"] or 0,
            "platform_fee": item["total_platform_fee"] or 0,
            "carrier_amount": item["total_carrier_amount"] or 0
        }
        grand_total += item["total_amount"] or 0
        grand_platform_fee += item["total_platform_fee"] or 0
        grand_carrier_amount += item["total_carrier_amount"] or 0
    
    # Pending payouts (money held)
    pending_statuses = [
        PaymentStatus.PAID_ESCROW.value,
        PaymentStatus.DELIVERED_BY_TRANSPORTER.value,
        PaymentStatus.PAYOUT_READY.value,
        PaymentStatus.PAYOUT_BLOCKED_NO_PAYOUT_METHOD.value
    ]
    
    pending_pipeline = [
        {"$match": {"status": {"$in": pending_statuses}}},
        {"$group": {
            "_id": None,
            "total_held": {"$sum": "$amount"},
            "total_pending_payout": {"$sum": "$carrier_amount"}
        }}
    ]
    
    pending_result = await payments_collection.aggregate(pending_pipeline).to_list(1)
    pending_data = pending_result[0] if pending_result else {"total_held": 0, "total_pending_payout": 0}
    
    return {
        "by_status": totals_by_status,
        "status_counts": status_counts,
        "grand_totals": {
            "total_transactions": grand_total,
            "total_platform_revenue": grand_platform_fee,
            "total_carrier_earnings": grand_carrier_amount
        },
        "escrow": {
            "money_held": pending_data.get("total_held", 0),
            "pending_payout_to_carriers": pending_data.get("total_pending_payout", 0)
        }
    }


@router.get("/finance/escrow")
async def get_escrow_details(user: dict = Depends(get_current_admin_user)):
    """
    Get detailed escrow status - money being held.
    """
    from models import PaymentStatus
    
    escrow_statuses = [
        PaymentStatus.PAID_ESCROW.value,
        PaymentStatus.DELIVERED_BY_TRANSPORTER.value
    ]
    
    payments = await payments_collection.find({"status": {"$in": escrow_statuses}}).to_list(100)
    
    results = []
    for payment in payments:
        match = await matches_collection.find_one({"_id": ObjectId(payment["match_id"])}) if payment.get("match_id") else None
        carrier = await users_collection.find_one({"_id": ObjectId(match["carrier_id"])}) if match else None
        
        time_remaining = None
        if payment.get("auto_confirm_deadline"):
            deadline = payment["auto_confirm_deadline"]
            if deadline.tzinfo is None:
                deadline = deadline.replace(tzinfo=timezone.utc)
            remaining = deadline - datetime.now(timezone.utc)
            if remaining.total_seconds() > 0:
                time_remaining = {
                    "days": remaining.days,
                    "hours": remaining.seconds // 3600
                }
        
        results.append({
            "payment_id": str(payment["_id"]),
            "match_id": payment.get("match_id"),
            "status": str(payment.get("status")),
            "amount": payment.get("amount", 0),
            "carrier_amount": payment.get("carrier_amount", 0),
            "carrier_name": carrier.get("name") if carrier else "N/A",
            "carrier_pix": carrier.get("pix_key") if carrier else None,
            "delivered_at": payment.get("delivered_at").isoformat() if payment.get("delivered_at") else None,
            "auto_confirm_deadline": payment.get("auto_confirm_deadline").isoformat() if payment.get("auto_confirm_deadline") else None,
            "time_remaining": time_remaining,
            "will_auto_confirm": time_remaining is not None and time_remaining["days"] <= 0
        })
    
    total_held = sum(p["amount"] for p in results)
    total_pending_carrier = sum(p["carrier_amount"] for p in results)
    
    return {
        "escrow_items": results,
        "total_held": total_held,
        "total_pending_carrier": total_pending_carrier,
        "count": len(results)
    }



# ============ Payout Management (Hybrid System) ============

@router.get("/payouts/pending")
async def get_pending_payouts(user: dict = Depends(get_current_admin_user)):
    """
    Lista todos os payouts pendentes de execução.
    
    Retorna payouts com status ELIGIBLE ou READY_FOR_PAYOUT.
    """
    from services.payout_service import get_payout_service
    
    service = get_payout_service()
    payouts = await service.get_ready_for_payout()
    
    # Enrich with trip info
    for payout in payouts:
        match = await matches_collection.find_one({"_id": ObjectId(payout["match_id"])})
        if match:
            trip = await trips_collection.find_one({"_id": ObjectId(match["trip_id"])})
            if trip:
                payout["trip_origin"] = trip.get("origin", {}).get("city", "N/A")
                payout["trip_destination"] = trip.get("destination", {}).get("city", "N/A")
    
    return {
        "payouts": payouts,
        "total": len(payouts),
        "total_amount": sum(p["net_amount"] for p in payouts)
    }


@router.get("/payouts/stats")
async def get_payout_stats(user: dict = Depends(get_current_admin_user)):
    """
    Retorna estatísticas gerais do sistema de payouts.
    """
    from services.payout_service import get_payout_service
    
    service = get_payout_service()
    stats = await service.get_payout_stats()
    
    return stats


@router.post("/payouts/execute-daily")
async def execute_daily_payouts(user: dict = Depends(get_current_admin_user)):
    """
    Executa todos os payouts elegíveis do dia.
    
    Este endpoint é o principal mecanismo de payout do sistema híbrido.
    Deve ser chamado manualmente pelo admin (diariamente ou conforme necessário).
    
    O sistema processa cada payout individualmente, logando todas as ações.
    """
    from services.payout_service import get_payout_service
    
    service = get_payout_service()
    admin_id = user.get("id", "unknown")
    
    report = await service.execute_daily_payouts(admin_id)
    
    return {
        "message": "Execução de payouts concluída",
        "execution_date": report.execution_date.isoformat(),
        "executed_by": admin_id,
        "summary": {
            "total_processed": report.total_processed,
            "successful": report.successful,
            "failed": report.failed,
            "blocked": report.blocked
        },
        "amounts": {
            "total_paid": report.total_amount_paid,
            "platform_fees": report.total_platform_fees
        },
        "results": [
            {
                "payout_id": r.payout_id,
                "success": r.success,
                "status": r.status.value,
                "gateway_reference": r.gateway_reference,
                "error": r.error_message
            }
            for r in report.results
        ],
        "errors": report.errors
    }


@router.post("/payouts/{payout_id}/execute")
async def execute_single_payout(
    payout_id: str,
    user: dict = Depends(get_current_admin_user)
):
    """
    Executa um payout específico.
    
    Útil para reprocessar payouts que falharam ou executar um payout urgente.
    """
    from services.payout_service import get_payout_service
    
    service = get_payout_service()
    admin_id = user.get("id", "unknown")
    
    result = await service.execute_payout(payout_id, admin_id)
    
    return {
        "payout_id": result.payout_id,
        "success": result.success,
        "status": result.status.value,
        "gateway_reference": result.gateway_reference,
        "error": result.error_message,
        "processed_at": result.processed_at.isoformat()
    }


@router.get("/payouts/history")
async def get_payout_history(
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=100),
    status: Optional[str] = None,
    user: dict = Depends(get_current_admin_user)
):
    """
    Retorna histórico completo de payouts com filtros.
    """
    from database import db
    
    payouts_collection = db["payouts"]
    
    query = {}
    if status:
        query["status"] = status
    
    skip = (page - 1) * limit
    
    payouts = await payouts_collection.find(query).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    total = await payouts_collection.count_documents(query)
    
    results = []
    for payout in payouts:
        carrier = await users_collection.find_one({"_id": ObjectId(payout["carrier_id"])})
        
        results.append({
            "id": str(payout["_id"]),
            "match_id": payout["match_id"],
            "carrier_id": payout["carrier_id"],
            "carrier_name": carrier.get("name") if carrier else "N/A",
            "carrier_pix": payout.get("carrier_pix_key"),
            "gross_amount": payout["gross_amount"],
            "platform_fee": payout["platform_fee"],
            "net_amount": payout["net_amount"],
            "status": payout["status"],
            "trigger": payout.get("trigger"),
            "provider_id": payout.get("provider_id"),
            "created_at": payout["created_at"].isoformat() if payout.get("created_at") else None,
            "eligible_at": payout["eligible_at"].isoformat() if payout.get("eligible_at") else None,
            "processed_at": payout["processed_at"].isoformat() if payout.get("processed_at") else None,
            "audit_log_count": len(payout.get("audit_log", []))
        })
    
    return {
        "payouts": results,
        "total": total,
        "page": page,
        "pages": (total + limit - 1) // limit
    }


@router.get("/payouts/{payout_id}/audit")
async def get_payout_audit_log(
    payout_id: str,
    user: dict = Depends(get_current_admin_user)
):
    """
    Retorna log de auditoria completo de um payout.
    """
    from database import db
    
    payouts_collection = db["payouts"]
    
    payout = await payouts_collection.find_one({"_id": ObjectId(payout_id)})
    if not payout:
        raise HTTPException(status_code=404, detail="Payout não encontrado")
    
    return {
        "payout_id": payout_id,
        "status": payout["status"],
        "audit_log": [
            {
                "timestamp": entry["timestamp"].isoformat() if entry.get("timestamp") else None,
                "action": entry["action"],
                "actor": entry["actor"],
                "details": entry.get("details", {})
            }
            for entry in payout.get("audit_log", [])
        ]
    }

