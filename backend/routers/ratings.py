"""Rating routes."""
from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime, timezone
from bson import ObjectId

from database import users_collection, matches_collection, ratings_collection
from models import RatingCreate
from auth import get_current_user_id

router = APIRouter()


@router.post("")
async def create_rating(rating_data: RatingCreate, user_id: str = Depends(get_current_user_id)):
    """Create a rating for a match."""
    match = await matches_collection.find_one({"_id": ObjectId(rating_data.match_id)})
    
    if not match:
        raise HTTPException(status_code=404, detail="Combinação não encontrada")
    
    if user_id not in [match["carrier_id"], match["sender_id"]]:
        raise HTTPException(status_code=403, detail="Você não pode avaliar esta transação")
    
    # Check if rating already exists
    existing = await ratings_collection.find_one({
        "match_id": rating_data.match_id,
        "rater_id": user_id
    })
    
    if existing:
        raise HTTPException(status_code=400, detail="Você já avaliou esta transação")
    
    user = await users_collection.find_one({"_id": ObjectId(user_id)})
    
    rating_doc = {
        **rating_data.model_dump(),
        "rater_id": user_id,
        "rater_name": user["name"],
        "created_at": datetime.now(timezone.utc)
    }
    
    await ratings_collection.insert_one(rating_doc)
    
    # Update user rating
    user_ratings = await ratings_collection.find({"rated_user_id": rating_data.rated_user_id}).to_list(1000)
    avg_rating = sum(r["rating"] for r in user_ratings) / len(user_ratings) if user_ratings else 0
    
    await users_collection.update_one(
        {"_id": ObjectId(rating_data.rated_user_id)},
        {"$set": {"rating": round(avg_rating, 2)}}
    )
    
    return {"message": "Avaliação criada com sucesso"}


@router.get("/{rated_user_id}")
async def get_user_ratings(rated_user_id: str):
    """Get ratings for a user."""
    ratings = await ratings_collection.find({"rated_user_id": rated_user_id}).to_list(100)
    
    for rating in ratings:
        rating["id"] = str(rating.pop("_id"))
    
    return ratings
