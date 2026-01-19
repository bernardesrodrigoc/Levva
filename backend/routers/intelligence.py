"""
Intelligence Routes - Smart pricing, capacity, and suggestions endpoints
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from datetime import datetime, timezone
from typing import Optional
from pydantic import BaseModel

from auth import get_current_user_id
from services.pricing_service import (
    calculate_intelligent_price,
    estimate_price_range,
    calculate_simple_price,
    CargoCategory,
    CARGO_CATEGORY_CONFIG
)
from services.capacity_service import (
    get_trip_capacity_status,
    can_add_shipment_to_trip,
    find_trips_with_capacity,
    calculate_volume_liters,
    estimate_trip_slots
)
from services.suggestions_service import (
    get_date_suggestions,
    get_location_suggestions,
    get_time_slot_suggestions,
    get_comprehensive_suggestions
)
from route_service import haversine_distance

router = APIRouter()


# ============ Pricing Endpoints ============

class PriceCalculationRequest(BaseModel):
    origin_lat: float
    origin_lng: float
    dest_lat: float
    dest_lng: float
    origin_city: str
    destination_city: str
    weight_kg: float
    length_cm: float = 20
    width_cm: float = 20
    height_cm: float = 20
    category: Optional[str] = None
    departure_date: Optional[datetime] = None
    deviation_km: float = 0
    trip_used_capacity_percent: float = 0


@router.post("/pricing/calculate")
async def calculate_price(
    request: PriceCalculationRequest,
    user_id: str = Depends(get_current_user_id)
):
    """
    Calculate intelligent price for a shipment.
    Returns total price and carrier earnings.
    """
    distance_km = haversine_distance(
        request.origin_lat, request.origin_lng,
        request.dest_lat, request.dest_lng
    )
    
    result = await calculate_intelligent_price(
        distance_km=distance_km,
        deviation_km=request.deviation_km,
        weight_kg=request.weight_kg,
        length_cm=request.length_cm,
        width_cm=request.width_cm,
        height_cm=request.height_cm,
        category=request.category,
        trip_used_capacity_percent=request.trip_used_capacity_percent,
        origin_city=request.origin_city,
        destination_city=request.destination_city,
        departure_date=request.departure_date or datetime.now(timezone.utc)
    )
    
    return {
        "total_price": result["total_price"],
        "carrier_earnings": result["carrier_earnings"],
        "currency": result["currency"],
        "distance_km": round(distance_km, 1),
        "category": result["_breakdown"]["category"],
        "category_name": result["_breakdown"]["category_name"]
    }


@router.get("/pricing/estimate")
async def estimate_price(
    origin_lat: float,
    origin_lng: float,
    dest_lat: float,
    dest_lng: float,
    weight_kg: float = 1.0
):
    """
    Quick price estimate (min/max range).
    No authentication required for public estimates.
    """
    distance_km = haversine_distance(origin_lat, origin_lng, dest_lat, dest_lng)
    return {
        **estimate_price_range(distance_km, weight_kg),
        "distance_km": round(distance_km, 1)
    }


@router.get("/pricing/categories")
async def get_cargo_categories():
    """Get available cargo categories with their limits."""
    return [
        {
            "value": cat.value,
            "name": config["name"],
            "max_weight_kg": config["max_weight_kg"],
            "max_volume_liters": config["max_volume_liters"],
            "price_multiplier": config["multiplier"]
        }
        for cat, config in CARGO_CATEGORY_CONFIG.items()
    ]


# ============ Capacity Endpoints ============

@router.get("/capacity/trip/{trip_id}")
async def get_capacity_status(
    trip_id: str,
    user_id: str = Depends(get_current_user_id)
):
    """Get capacity status for a trip including all matched shipments."""
    status = await get_trip_capacity_status(trip_id)
    
    if "error" in status:
        raise HTTPException(status_code=404, detail=status["error"])
    
    return status


@router.get("/capacity/check-fit")
async def check_shipment_fit(
    trip_id: str,
    weight_kg: float,
    length_cm: float,
    width_cm: float,
    height_cm: float,
    user_id: str = Depends(get_current_user_id)
):
    """Check if a shipment can fit in a trip's remaining capacity."""
    can_fit, reason, capacity_after = await can_add_shipment_to_trip(
        trip_id, weight_kg, length_cm, width_cm, height_cm
    )
    
    volume_liters = calculate_volume_liters(length_cm, width_cm, height_cm)
    
    return {
        "can_fit": can_fit,
        "reason": reason,
        "shipment_details": {
            "weight_kg": weight_kg,
            "volume_liters": round(volume_liters, 1)
        },
        "capacity_after_adding": capacity_after if can_fit else None
    }


@router.get("/capacity/estimate-slots")
async def estimate_capacity_slots(
    max_weight_kg: float,
    max_volume_liters: float,
    avg_package_weight_kg: float = 3,
    avg_package_volume_liters: float = 15
):
    """
    Estimate how many average packages can fit in a trip.
    Useful for carriers planning their trip capacity.
    No authentication required.
    """
    return estimate_trip_slots(
        max_weight_kg,
        max_volume_liters,
        avg_package_weight_kg,
        avg_package_volume_liters
    )
    }


@router.get("/capacity/available-trips")
async def find_available_trips(
    weight_kg: float,
    length_cm: float,
    width_cm: float,
    height_cm: float,
    origin_city: Optional[str] = None,
    destination_city: Optional[str] = None,
    user_id: str = Depends(get_current_user_id)
):
    """Find trips with enough capacity for the shipment."""
    volume_liters = calculate_volume_liters(length_cm, width_cm, height_cm)
    
    trips = await find_trips_with_capacity(
        min_weight_kg=weight_kg,
        min_volume_liters=volume_liters,
        origin_city=origin_city,
        destination_city=destination_city
    )
    
    return {
        "shipment_requirements": {
            "weight_kg": weight_kg,
            "volume_liters": round(volume_liters, 1)
        },
        "available_trips_count": len(trips),
        "trips": trips
    }


# ============ Suggestions Endpoints ============

@router.get("/suggestions/dates")
async def suggest_dates(
    origin_city: str,
    destination_city: str,
    is_shipment: bool = True,
    preferred_date: Optional[str] = None,
    user_id: str = Depends(get_current_user_id)
):
    """
    Get date suggestions with match probability.
    
    - is_shipment=True: Suggest dates when transporters are available
    - is_shipment=False: Suggest dates when shipments are waiting
    """
    pref_date = datetime.fromisoformat(preferred_date) if preferred_date else datetime.now(timezone.utc)
    
    suggestions = await get_date_suggestions(
        origin_city=origin_city,
        destination_city=destination_city,
        preferred_date=pref_date,
        is_shipment=is_shipment
    )
    
    return {
        "route": f"{origin_city} → {destination_city}",
        "type": "shipment" if is_shipment else "trip",
        "suggestions": suggestions,
        "best_date": suggestions[0] if suggestions else None
    }


@router.get("/suggestions/locations")
async def suggest_locations(
    city: str,
    lat: float,
    lng: float,
    is_origin: bool = True,
    user_id: str = Depends(get_current_user_id)
):
    """
    Get location suggestions for pickup/dropoff.
    Includes strategic points and aggregation opportunities.
    """
    suggestions = await get_location_suggestions(
        user_lat=lat,
        user_lng=lng,
        city=city,
        is_origin=is_origin
    )
    
    return {
        "city": city,
        "type": "origin" if is_origin else "destination",
        "user_location": {"lat": lat, "lng": lng},
        "suggestions": suggestions
    }


@router.get("/suggestions/time-slots")
async def suggest_time_slots(
    origin_city: str,
    destination_city: str,
    date: str,
    user_id: str = Depends(get_current_user_id)
):
    """Get optimal time slot suggestions for a specific date."""
    target_date = datetime.fromisoformat(date)
    
    suggestions = await get_time_slot_suggestions(
        origin_city=origin_city,
        destination_city=destination_city,
        date=target_date
    )
    
    return {
        "date": date,
        "route": f"{origin_city} → {destination_city}",
        "time_slots": suggestions
    }


@router.post("/suggestions/comprehensive")
async def get_all_suggestions(
    origin_city: str,
    destination_city: str,
    origin_lat: float,
    origin_lng: float,
    dest_lat: float,
    dest_lng: float,
    is_shipment: bool = True,
    preferred_date: Optional[str] = None,
    user_id: str = Depends(get_current_user_id)
):
    """
    Get all suggestions in one call:
    - Best dates
    - Origin location suggestions
    - Destination location suggestions
    - Time slots
    """
    pref_date = datetime.fromisoformat(preferred_date) if preferred_date else None
    
    suggestions = await get_comprehensive_suggestions(
        origin_city=origin_city,
        destination_city=destination_city,
        origin_lat=origin_lat,
        origin_lng=origin_lng,
        dest_lat=dest_lat,
        dest_lng=dest_lng,
        preferred_date=pref_date,
        is_shipment=is_shipment
    )
    
    return suggestions
