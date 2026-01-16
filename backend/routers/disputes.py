"""Dispute routes."""
from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime, timezone
from bson import ObjectId

from database import users_collection, matches_collection, disputes_collection, messages_collection
from models import DisputeCreate, UserRole
from auth import get_current_user_id

router = APIRouter()


class DisputeStatus:
    OPEN = "open"
    UNDER_REVIEW = "under_review"
    RESOLVED_SENDER = "resolved_sender"
    RESOLVED_CARRIER = "resolved_carrier"
    RESOLVED_SPLIT = "resolved_split"
    CLOSED = "closed"


async def get_user_match_ids(user_id: str) -> list:
    """Helper to get all match IDs for a user."""
    matches = await matches_collection.find({
        "$or": [{"sender_id": user_id}, {"carrier_id": user_id}]
    }).to_list(100)
    return [str(m["_id"]) for m in matches]


@router.post("")
async def create_dispute(dispute_data: DisputeCreate, user_id: str = Depends(get_current_user_id)):
    """Create a new dispute for a match."""
    match = await matches_collection.find_one({"_id": ObjectId(dispute_data.match_id)})
    
    if not match:
        raise HTTPException(status_code=404, detail="Combinação não encontrada")
    
    if user_id not in [match["sender_id"], match["carrier_id"]]:
        raise HTTPException(status_code=403, detail="Você não faz parte desta combinação")
    
    existing = await disputes_collection.find_one({"match_id": dispute_data.match_id, "status": {"$ne": "closed"}})
    if existing:
        raise HTTPException(status_code=400, detail="Já existe uma disputa aberta para esta combinação")
    
    user = await users_collection.find_one({"_id": ObjectId(user_id)})
    
    dispute_doc = {
        "match_id": dispute_data.match_id,
        "opened_by": user_id,
        "opened_by_name": user["name"],
        "opened_by_role": "sender" if user_id == match["sender_id"] else "carrier",
        "reason": dispute_data.reason,
        "description": dispute_data.description,
        "evidence_urls": dispute_data.evidence_urls if hasattr(dispute_data, 'evidence_urls') else [],
        "status": DisputeStatus.OPEN,
        "admin_notes": [],
        "resolution": None,
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc)
    }
    
    result = await disputes_collection.insert_one(dispute_doc)
    
    await matches_collection.update_one(
        {"_id": ObjectId(dispute_data.match_id)},
        {"$set": {"status": "disputed", "dispute_id": str(result.inserted_id)}}
    )
    
    return {
        "id": str(result.inserted_id),
        "match_id": dispute_data.match_id,
        "status": DisputeStatus.OPEN,
        "message": "Disputa aberta com sucesso. Nossa equipe irá analisar."
    }


@router.get("/my-disputes")
async def get_my_disputes(user_id: str = Depends(get_current_user_id)):
    """Get disputes for current user."""
    match_ids = await get_user_match_ids(user_id)
    
    disputes = await disputes_collection.find({
        "$or": [
            {"opened_by": user_id},
            {"match_id": {"$in": match_ids}}
        ]
    }).sort("created_at", -1).to_list(50)
    
    for dispute in disputes:
        dispute["id"] = str(dispute.pop("_id"))
    
    return disputes
