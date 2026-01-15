from fastapi import APIRouter, Depends, HTTPException, Body, status
from typing import List
# Importação absoluta corrigida
from models import VehicleCreate, VehicleDB
# Mudamos para importar o ID, que é o que você tem disponível
from auth import get_current_user_id 
from database import db
from bson import ObjectId
from datetime import datetime

router = APIRouter()

@router.post("/", response_model=VehicleDB)
async def create_vehicle(
    vehicle_in: VehicleCreate, 
    user_id: str = Depends(get_current_user_id) # Recebe apenas o ID agora
):
    # Regra: Se for veículo motorizado, placa é obrigatória
    if vehicle_in.type in ["motorcycle", "car", "van", "truck"] and not vehicle_in.license_plate:
         raise HTTPException(status_code=400, detail="Placa é obrigatória para veículos motorizados")

    vehicle_data = vehicle_in.dict()
    # Usamos o user_id direto, sem precisar acessar .id
    vehicle_data["owner_id"] = user_id 
    vehicle_data["is_verified"] = False 
    vehicle_data["created_at"] = datetime.utcnow()
    
    new_vehicle = await db.vehicles.insert_one(vehicle_data)
    created_vehicle = await db.vehicles.find_one({"_id": new_vehicle.inserted_id})
    
    return VehicleDB(**created_vehicle)

@router.get("/", response_model=List[VehicleDB])
async def get_my_vehicles(user_id: str = Depends(get_current_user_id)):
    # Busca usando o user_id direto
    vehicles_cursor = db.vehicles.find({"owner_id": user_id})
    return [VehicleDB(**v) async for v in vehicles_cursor]

@router.delete("/{vehicle_id}")
async def delete_vehicle(vehicle_id: str, user_id: str = Depends(get_current_user_id)):
    # Deleta garantindo que o dono é quem está pedindo
    result = await db.vehicles.delete_one({"_id": ObjectId(vehicle_id), "owner_id": user_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Veículo não encontrado")
    return {"message": "Veículo removido"}
