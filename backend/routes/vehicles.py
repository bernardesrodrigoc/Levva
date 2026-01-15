from fastapi import APIRouter, Depends, HTTPException, Body, status
from typing import List

from models import VehicleCreate, VehicleDB, UserDB
from auth import get_current_user
from database import db
from bson import ObjectId
from datetime import datetime

router = APIRouter()
# ... o resto do código continua igual ...

router = APIRouter()

@router.post("/", response_model=VehicleDB)
async def create_vehicle(
    vehicle_in: VehicleCreate, 
    current_user: UserDB = Depends(get_current_user)
):
    # Regra: Se for veículo motorizado, placa é obrigatória
    if vehicle_in.type in ["motorcycle", "car", "van", "truck"] and not vehicle_in.license_plate:
         raise HTTPException(status_code=400, detail="Placa é obrigatória para veículos motorizados")

    vehicle_data = vehicle_in.dict()
    vehicle_data["owner_id"] = str(current_user.id)
    vehicle_data["is_verified"] = False # Começa pendente
    vehicle_data["created_at"] = datetime.utcnow()
    
    new_vehicle = await db.vehicles.insert_one(vehicle_data)
    created_vehicle = await db.vehicles.find_one({"_id": new_vehicle.inserted_id})
    
    return VehicleDB(**created_vehicle)

@router.get("/", response_model=List[VehicleDB])
async def get_my_vehicles(current_user: UserDB = Depends(get_current_user)):
    vehicles_cursor = db.vehicles.find({"owner_id": str(current_user.id)})
    return [VehicleDB(**v) async for v in vehicles_cursor]

@router.delete("/{vehicle_id}")
async def delete_vehicle(vehicle_id: str, current_user: UserDB = Depends(get_current_user)):
    result = await db.vehicles.delete_one({"_id": ObjectId(vehicle_id), "owner_id": str(current_user.id)})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Veículo não encontrado")
    return {"message": "Veículo removido"}
