"""User management routes."""
from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime, timezone
from bson import ObjectId

from database import users_collection, verifications_collection
from models import VerificationStatus, TrustLevel
from auth import get_current_user_id
from trust_service import (
    get_trust_level_config, 
    calculate_trust_level, 
    get_next_level_requirements
)

router = APIRouter()


@router.post("/verify")
async def submit_verification(
    verification_data: dict,
    user_id: str = Depends(get_current_user_id)
):
    """Submit user verification documents."""
    cpf = verification_data.get("cpf")
    
    # Check if CPF is already registered by another user
    if cpf:
        # Normalize CPF - remove dots and dashes
        cpf_normalized = cpf.replace(".", "").replace("-", "").strip()
        
        # Check if CPF exists in verifications for another user
        existing_verification = await verifications_collection.find_one({
            "cpf": {"$regex": f"^{cpf_normalized.replace('.', '\\.').replace('-', '\\-?')}$|^{cpf_normalized[:3]}\\.?{cpf_normalized[3:6]}\\.?{cpf_normalized[6:9]}\\-?{cpf_normalized[9:]}$", "$options": "i"},
            "user_id": {"$ne": user_id}
        })
        
        if not existing_verification:
            # Also check with normalized CPF directly
            existing_verification = await verifications_collection.find_one({
                "$or": [
                    {"cpf": cpf},
                    {"cpf": cpf_normalized},
                    {"cpf": f"{cpf_normalized[:3]}.{cpf_normalized[3:6]}.{cpf_normalized[6:9]}-{cpf_normalized[9:]}"}
                ],
                "user_id": {"$ne": user_id}
            })
        
        if existing_verification:
            raise HTTPException(
                status_code=400, 
                detail="Este CPF já está cadastrado em outra conta. Se você acredita que houve um erro, entre em contato com o suporte."
            )
    
    verification_doc = {
        "user_id": user_id,
        "cpf": verification_data.get("cpf"),
        "birth_date": verification_data.get("birth_date"),
        "address": verification_data.get("address"),
        "documents": verification_data.get("documents"),
        "status": "pending",
        "submitted_at": datetime.now(timezone.utc),
        "reviewed_at": None,
        "reviewed_by": None
    }
    
    await verifications_collection.insert_one(verification_doc)
    
    await users_collection.update_one(
        {"_id": ObjectId(user_id)},
        {"$set": {"verification_status": VerificationStatus.PENDING}}
    )
    
    return {"message": "Documentos enviados para verificação", "status": "pending"}


@router.get("/verification-status")
async def get_verification_status(user_id: str = Depends(get_current_user_id)):
    """Get user verification status."""
    user = await users_collection.find_one({"_id": ObjectId(user_id)})
    verification = await verifications_collection.find_one({"user_id": user_id})
    
    return {
        "verification_status": user.get("verification_status", "pending"),
        "has_submitted": verification is not None,
        "can_create_trips": user.get("verification_status") == "verified",
        "can_create_shipments": user.get("verification_status") == "verified"
    }


@router.get("/trust-level")
async def get_user_trust_level(user_id: str = Depends(get_current_user_id)):
    """Get user's trust level details and next level requirements."""
    user = await users_collection.find_one({"_id": ObjectId(user_id)})
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    
    current_level = user.get("trust_level", TrustLevel.LEVEL_1)
    config = get_trust_level_config(current_level)
    next_level_info = get_next_level_requirements(
        current_level,
        user.get("total_deliveries", 0),
        user.get("rating", 0.0)
    )
    
    return {
        "current_level": current_level,
        "level_name": config["name"],
        "level_description": config["description"],
        "badge_color": config["badge_color"],
        "limits": {
            "max_shipment_value": config["max_shipment_value"] if config["max_shipment_value"] != float('inf') else None,
            "max_weight_kg": config["max_weight_kg"] if config["max_weight_kg"] != float('inf') else None,
            "can_create_trips": config["can_create_trips"],
            "can_create_shipments": config["can_create_shipments"]
        },
        "stats": {
            "total_deliveries": user.get("total_deliveries", 0),
            "rating": user.get("rating", 0.0)
        },
        "next_level": next_level_info
    }


@router.post("/update-trust-level")
async def update_user_trust_level(user_id: str = Depends(get_current_user_id)):
    """Recalculate and update user's trust level based on current stats."""
    user = await users_collection.find_one({"_id": ObjectId(user_id)})
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    
    new_level = calculate_trust_level(
        user.get("verification_status", "pending"),
        user.get("total_deliveries", 0),
        user.get("rating", 0.0)
    )
    
    old_level = user.get("trust_level", TrustLevel.LEVEL_1)
    
    if new_level != old_level:
        await users_collection.update_one(
            {"_id": ObjectId(user_id)},
            {"$set": {"trust_level": new_level}}
        )
        
        return {
            "updated": True,
            "old_level": old_level,
            "new_level": new_level,
            "message": f"Parabéns! Você subiu para o nível {get_trust_level_config(new_level)['name']}!"
        }
    
    return {
        "updated": False,
        "current_level": old_level,
        "message": "Seu nível de confiança permanece o mesmo."
    }
