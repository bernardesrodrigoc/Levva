"""
Vehicle routes with intelligent capacity suggestions.

This module provides:
1. CRUD operations for vehicles
2. Intelligent capacity suggestions based on platform statistics
3. Deviation flagging for unusual capacity values
"""
from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime, timezone
from typing import List, Optional
from bson import ObjectId
from pydantic import BaseModel

from database import db
from models import VehicleCreate, VehicleDB, TransportType
from auth import get_current_user_id
from services.vehicle_intelligence_service import (
    get_capacity_suggestion,
    check_capacity_deviation,
    get_all_vehicle_type_defaults,
    get_popular_brands_models,
    normalize_string
)

router = APIRouter()


class CapacitySuggestionRequest(BaseModel):
    """Request for capacity suggestion"""
    vehicle_type: str
    brand: Optional[str] = None
    model: Optional[str] = None
    year: Optional[int] = None


class CapacitySuggestionResponse(BaseModel):
    """Response for capacity suggestion"""
    weight_kg: float
    volume_liters: float
    source: str
    sample_size: int
    confidence: str
    vehicle_type: str
    brand: Optional[str] = None
    model: Optional[str] = None
    year_range: Optional[str] = None


class VehicleTypeDefault(BaseModel):
    """Default capacity for a vehicle type"""
    type: str
    name: str
    default_weight_kg: float
    default_volume_liters: float
    description: str


@router.post("", response_model=VehicleDB)
async def create_vehicle(
    vehicle_in: VehicleCreate, 
    user_id: str = Depends(get_current_user_id)
):
    """
    Create a new vehicle with intelligent capacity handling.
    
    - Validates license plate for motorized vehicles
    - Normalizes brand/model for statistics
    - Flags unusual capacity deviations (internal, non-blocking)
    """
    if vehicle_in.type in [TransportType.MOTORCYCLE, TransportType.CAR, TransportType.VAN, TransportType.TRUCK]:
        if not vehicle_in.license_plate:
            raise HTTPException(status_code=400, detail="Placa é obrigatória para veículos motorizados")
    
    vehicle_data = vehicle_in.model_dump()
    vehicle_data["owner_id"] = user_id
    vehicle_data["is_verified"] = False
    vehicle_data["created_at"] = datetime.now(timezone.utc)
    
    # Normalize brand and model for statistics
    vehicle_data["brand_normalized"] = normalize_string(vehicle_in.brand) if vehicle_in.brand else None
    vehicle_data["model_normalized"] = normalize_string(vehicle_in.model) if vehicle_in.model else None
    
    # Check for capacity deviation (internal flagging, non-blocking)
    suggestion = await get_capacity_suggestion(
        vehicle_type=vehicle_in.type,
        brand=vehicle_in.brand,
        model=vehicle_in.model,
        year=vehicle_in.year
    )
    
    deviation = check_capacity_deviation(
        user_weight_kg=vehicle_in.capacity_weight_kg,
        user_volume_liters=vehicle_in.capacity_volume_liters,
        suggested_weight_kg=suggestion.weight_kg,
        suggested_volume_liters=suggestion.volume_liters
    )
    
    vehicle_data["capacity_deviation_flagged"] = deviation["any_flagged"]
    if deviation["any_flagged"]:
        vehicle_data["capacity_deviation_details"] = deviation
    
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


# ============ Intelligence Endpoints ============

@router.post("/intelligence/suggest-capacity", response_model=CapacitySuggestionResponse)
async def suggest_capacity(
    request: CapacitySuggestionRequest,
    user_id: str = Depends(get_current_user_id)
):
    """
    Get intelligent capacity suggestion for a vehicle.
    
    Sources (priority order):
    1. Platform statistics (if sample size >= 5)
    2. Known models database
    3. Vehicle type defaults
    
    Returns suggested capacity with confidence level and source info.
    """
    suggestion = await get_capacity_suggestion(
        vehicle_type=request.vehicle_type,
        brand=request.brand,
        model=request.model,
        year=request.year
    )
    
    return CapacitySuggestionResponse(
        weight_kg=suggestion.weight_kg,
        volume_liters=suggestion.volume_liters,
        source=suggestion.source,
        sample_size=suggestion.sample_size,
        confidence=suggestion.confidence,
        vehicle_type=suggestion.vehicle_type,
        brand=suggestion.brand,
        model=suggestion.model,
        year_range=suggestion.year_range
    )


@router.get("/intelligence/defaults", response_model=List[VehicleTypeDefault])
async def get_defaults():
    """
    Get default capacities for all vehicle types.
    
    Useful for:
    - Populating UI dropdowns
    - Showing reference values
    - Initial form values
    """
    defaults = await get_all_vehicle_type_defaults()
    return [VehicleTypeDefault(**d) for d in defaults]


@router.get("/intelligence/popular/{vehicle_type}")
async def get_popular(vehicle_type: str, limit: int = 10):
    """
    Get popular brands and models for a vehicle type.
    
    Based on actual platform registrations.
    Useful for autocomplete/suggestions in UI.
    """
    try:
        TransportType(vehicle_type)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Tipo de veículo inválido: {vehicle_type}")
    
    return await get_popular_brands_models(vehicle_type, limit)


@router.get("/intelligence/statistics/{vehicle_type}")
async def get_statistics(
    vehicle_type: str,
    brand: Optional[str] = None,
    model: Optional[str] = None,
    user_id: str = Depends(get_current_user_id)
):
    """
    Get capacity statistics for a vehicle type/brand/model.
    
    Returns platform statistics if available, otherwise defaults.
    Useful for admin/analytics purposes.
    """
    from services.vehicle_intelligence_service import get_platform_statistics, get_default_capacity
    
    try:
        TransportType(vehicle_type)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Tipo de veículo inválido: {vehicle_type}")
    
    stats = await get_platform_statistics(vehicle_type, brand, model)
    
    if stats:
        return {
            "has_platform_data": True,
            "weight_kg_median": stats["weight_kg_median"],
            "volume_liters_median": stats["volume_liters_median"],
            "sample_size": stats["sample_size"],
            "grouping": stats["grouping"]
        }
    else:
        default = get_default_capacity(vehicle_type)
        return {
            "has_platform_data": False,
            "weight_kg_default": default["weight_kg"],
            "volume_liters_default": default["volume_liters"],
            "description": default.get("description", ""),
            "note": "Dados insuficientes na plataforma. Usando valores padrão."
        }


@router.post("/intelligence/check-deviation")
async def check_deviation(
    vehicle_type: str,
    user_weight_kg: float,
    user_volume_liters: float,
    brand: Optional[str] = None,
    model: Optional[str] = None,
    year: Optional[int] = None,
    user_id: str = Depends(get_current_user_id)
):
    """
    Check if user-provided capacity deviates significantly from suggestions.
    
    This is informational only - no blocking.
    Returns deviation percentage and whether it's flagged.
    """
    suggestion = await get_capacity_suggestion(
        vehicle_type=vehicle_type,
        brand=brand,
        model=model,
        year=year
    )
    
    deviation = check_capacity_deviation(
        user_weight_kg=user_weight_kg,
        user_volume_liters=user_volume_liters,
        suggested_weight_kg=suggestion.weight_kg,
        suggested_volume_liters=suggestion.volume_liters
    )
    
    return {
        "suggestion": {
            "weight_kg": suggestion.weight_kg,
            "volume_liters": suggestion.volume_liters,
            "source": suggestion.source,
            "confidence": suggestion.confidence
        },
        "user_input": {
            "weight_kg": user_weight_kg,
            "volume_liters": user_volume_liters
        },
        "deviation": deviation
    }
