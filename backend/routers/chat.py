"""Chat routes."""
from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime, timezone
from bson import ObjectId

from database import users_collection, matches_collection, messages_collection
from auth import get_current_user_id

router = APIRouter()


@router.post("/{match_id}/messages")
async def send_message(match_id: str, message_data: dict, user_id: str = Depends(get_current_user_id)):
    """Send a message in a match chat."""
    match = await matches_collection.find_one({"_id": ObjectId(match_id)})
    
    if not match:
        raise HTTPException(status_code=404, detail="Combinação não encontrada")
    
    if user_id not in [match["carrier_id"], match["sender_id"]]:
        raise HTTPException(status_code=403, detail="Você não tem acesso a este chat")
    
    user = await users_collection.find_one({"_id": ObjectId(user_id)})
    
    message_doc = {
        "match_id": match_id,
        "sender_id": user_id,
        "sender_name": user["name"],
        "message": message_data.get("message"),
        "created_at": datetime.now(timezone.utc),
        "read": False
    }
    
    result = await messages_collection.insert_one(message_doc)
    message_doc["id"] = str(result.inserted_id)
    message_doc.pop("_id", None)
    
    return message_doc


@router.get("/{match_id}/messages")
async def get_messages(match_id: str, user_id: str = Depends(get_current_user_id)):
    """Get all messages for a match."""
    match = await matches_collection.find_one({"_id": ObjectId(match_id)})
    
    if not match:
        raise HTTPException(status_code=404, detail="Combinação não encontrada")
    
    if user_id not in [match["carrier_id"], match["sender_id"]]:
        raise HTTPException(status_code=403, detail="Você não tem acesso a este chat")
    
    messages = await messages_collection.find({"match_id": match_id}).sort("created_at", 1).to_list(500)
    
    # Mark as read
    await messages_collection.update_many(
        {"match_id": match_id, "sender_id": {"$ne": user_id}},
        {"$set": {"read": True}}
    )
    
    for msg in messages:
        msg["id"] = str(msg.pop("_id"))
    
    return messages
