"""Admin routes."""
from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime, timezone
from bson import ObjectId

from database import (
    users_collection, trips_collection, shipments_collection,
    matches_collection, verifications_collection, flag_collection,
    disputes_collection, messages_collection
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
    total_users = await users_collection.count_documents({})
    active_trips = await trips_collection.count_documents({"status": TripStatus.PUBLISHED})
    active_shipments = await shipments_collection.count_documents({"status": ShipmentStatus.PUBLISHED})
    total_matches = await matches_collection.count_documents({})
    pending_verifications = await verifications_collection.count_documents({"status": "pending"})
    flagged_items = await flag_collection.count_documents({"status": "pending"})
    
    return {
        "total_users": total_users,
        "active_trips": active_trips,
        "active_shipments": active_shipments,
        "total_matches": total_matches,
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
            "opened_by_name": dispute["opened_by_name"],
            "opened_by_role": dispute["opened_by_role"],
            "reason": dispute["reason"],
            "description": dispute["description"],
            "status": dispute["status"],
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
        "opened_by": dispute["opened_by"],
        "opened_by_name": dispute["opened_by_name"],
        "opened_by_role": dispute["opened_by_role"],
        "reason": dispute["reason"],
        "description": dispute["description"],
        "evidence_urls": dispute.get("evidence_urls", []),
        "status": dispute["status"],
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
