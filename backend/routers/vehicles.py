"""Vehicle routes."""
from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime, timezone
from typing import List
from bson import ObjectId

from database import db
from models import VehicleCreate, VehicleDB
from auth import get_current_user_id

router = APIRouter()


@router.post("", response_model=VehicleDB)
async def create_vehicle(
    vehicle_in: VehicleCreate, 
    user_id: str = Depends(get_current_user_id)
):
    """Create a new vehicle."""
    if vehicle_in.type in ["motorcycle", "car", "van", "truck"] and not vehicle_in.license_plate:
        raise HTTPException(status_code=400, detail="Placa é obrigatória para veículos motorizados")
    
    vehicle_data = vehicle_in.model_dump()
    vehicle_data["owner_id"] = user_id
    vehicle_data["is_verified"] = False
    vehicle_data["created_at"] = datetime.now(timezone.utc)
    
    new_vehicle = await db.vehicles.insert_one(vehicle_data)
    created_vehicle = await db.vehicles.find_one({"_id": new_vehicle.inserted_id})
    created_vehicle["_id"] = str(created_vehicle["_id"])
    
    return VehicleDB(**created_vehicle)


@router.get("", response_model=List[VehicleDB])
async def get_my_vehicles(user_id: str = Depends(get_current_user_id)):
    """Get vehicles for current user."""
    vehicles = await db.vehicles.find({"owner_id": user_id}).to_list(100)
    results = []
    for v in vehicles:
        v["_id"] = str(v["_id"])
        results.append(VehicleDB(**v))
    return results


@router.delete("/{vehicle_id}")
async def delete_vehicle(vehicle_id: str, user_id: str = Depends(get_current_user_id)):
    """Delete a vehicle."""
    result = await db.vehicles.delete_one({"_id": ObjectId(vehicle_id), "owner_id": user_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Veículo não encontrado")
    return {"message": "Veículo removido"}
