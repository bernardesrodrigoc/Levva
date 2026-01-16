"""Common dependencies for FastAPI routes."""
from fastapi import Depends, HTTPException
from bson import ObjectId

from auth import get_current_user_id
from database import users_collection
from models import UserRole


async def get_current_user(user_id: str = Depends(get_current_user_id)):
    """Get the current authenticated user document."""
    user = await users_collection.find_one({"_id": ObjectId(user_id)})
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    return user


async def get_current_admin_user(user_id: str = Depends(get_current_user_id)):
    """Get current user and verify admin role."""
    user = await users_collection.find_one({"_id": ObjectId(user_id)})
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    if user.get("role") != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Acesso negado - requer privilégios de administrador")
    return user


def get_user_id(user_id: str = Depends(get_current_user_id)) -> str:
    """Simple dependency to get user_id string."""
    return user_id
