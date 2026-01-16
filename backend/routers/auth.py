"""Authentication routes."""
from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime, timezone
from bson import ObjectId

from database import users_collection
from models import UserRegister, UserLogin, TrustLevel, VerificationStatus
from auth import hash_password, verify_password, create_access_token, get_current_user_id

router = APIRouter()


@router.post("/register")
async def register(user_data: UserRegister):
    """Register a new user."""
    existing = await users_collection.find_one({"email": user_data.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email já cadastrado")
    
    user_doc = {
        "email": user_data.email,
        "password_hash": hash_password(user_data.password),
        "name": user_data.name,
        "phone": user_data.phone,
        "role": user_data.role,
        "trust_level": TrustLevel.LEVEL_1,
        "verification_status": VerificationStatus.PENDING,
        "profile_photo_url": None,
        "rating": 0.0,
        "total_deliveries": 0,
        "created_at": datetime.now(timezone.utc),
        "email_verified": False
    }
    
    result = await users_collection.insert_one(user_doc)
    token = create_access_token({"user_id": str(result.inserted_id)})
    
    return {
        "token": token,
        "user": {
            "id": str(result.inserted_id),
            "email": user_data.email,
            "name": user_data.name,
            "role": user_data.role
        }
    }


@router.post("/login")
async def login(credentials: UserLogin):
    """Authenticate user and return JWT token."""
    user = await users_collection.find_one({"email": credentials.email})
    if not user or not verify_password(credentials.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Credenciais inválidas")
    
    token = create_access_token({"user_id": str(user["_id"])})
    
    return {
        "token": token,
        "user": {
            "id": str(user["_id"]),
            "email": user["email"],
            "name": user["name"],
            "role": user["role"],
            "trust_level": user["trust_level"],
            "verification_status": user["verification_status"]
        }
    }


@router.get("/me")
async def get_current_user(user_id: str = Depends(get_current_user_id)):
    """Get current user profile."""
    user = await users_collection.find_one({"_id": ObjectId(user_id)})
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    
    return {
        "id": str(user["_id"]),
        "email": user["email"],
        "name": user["name"],
        "phone": user["phone"],
        "role": user["role"],
        "trust_level": user["trust_level"],
        "verification_status": user["verification_status"],
        "profile_photo_url": user.get("profile_photo_url"),
        "rating": user.get("rating", 0.0),
        "total_deliveries": user.get("total_deliveries", 0)
    }
