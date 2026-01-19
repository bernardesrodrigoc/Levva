"""
Intelligence Routes - Smart pricing, capacity, and suggestions endpoints

MATCHING PRINCIPLE: Geospatial-first approach
All suggestions use coordinates as the primary matching criterion.
City names are only used for display purposes, not matching logic.
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
    get_comprehensive_suggestions,
    get_matching_trips_for_shipment
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


# ============ Suggestions Endpoints (GEOSPATIAL-FIRST) ============

class DateSuggestionsRequest(BaseModel):
    """Request for date suggestions - GEOSPATIAL PRIMARY"""
    origin_lat: float
    origin_lng: float
    dest_lat: float
    dest_lng: float
    origin_city: Optional[str] = None  # For display only
    destination_city: Optional[str] = None  # For display only
    is_shipment: bool = True
    preferred_date: Optional[str] = None


@router.post("/suggestions/dates")
async def suggest_dates(
    request: DateSuggestionsRequest,
    user_id: str = Depends(get_current_user_id)
):
    """
    Get date suggestions with match probability.
    
    PRIMARY CRITERION: Coordinates (origin_lat/lng, dest_lat/lng)
    FALLBACK: City names (only if coordinates unavailable)
    
    - is_shipment=True: Suggest dates when transporters are available
    - is_shipment=False: Suggest dates when shipments are waiting
    """
    pref_date = datetime.fromisoformat(request.preferred_date) if request.preferred_date else datetime.now(timezone.utc)
    
    suggestions = await get_date_suggestions(
        origin_lat=request.origin_lat,
        origin_lng=request.origin_lng,
        dest_lat=request.dest_lat,
        dest_lng=request.dest_lng,
        preferred_date=pref_date,
        is_shipment=request.is_shipment
    )
    
    # Build display route string
    origin_display = request.origin_city or f"({request.origin_lat:.2f}, {request.origin_lng:.2f})"
    dest_display = request.destination_city or f"({request.dest_lat:.2f}, {request.dest_lng:.2f})"
    
    return {
        "route": f"{origin_display} → {dest_display}",
        "type": "shipment" if request.is_shipment else "trip",
        "matching_criteria": "geospatial",
        "suggestions": suggestions,
        "best_date": suggestions[0] if suggestions else None
    }


@router.post("/suggestions/matching-trips")
async def get_matching_trips(
    origin_lat: float,
    origin_lng: float,
    dest_lat: float,
    dest_lng: float,
    weight_kg: float = 1.0,
    preferred_date: Optional[str] = None,
    days_ahead: int = 14,
    user_id: str = Depends(get_current_user_id)
):
    """
    Get trips that can carry a shipment based on GEOSPATIAL matching.
    
    This is the PRIMARY endpoint for showing compatible trips during shipment creation.
    
    Matching criteria:
    1. Shipment coordinates within trip's corridor radius
    2. Trip has sufficient capacity (weight)
    3. Trip departs within date range
    
    Returns trips sorted by match score (higher = better fit).
    """
    pref_date = datetime.fromisoformat(preferred_date) if preferred_date else datetime.now(timezone.utc)
    
    matching_trips = await get_matching_trips_for_shipment(
        origin_lat=origin_lat,
        origin_lng=origin_lng,
        dest_lat=dest_lat,
        dest_lng=dest_lng,
        weight_kg=weight_kg,
        preferred_date=pref_date,
        days_ahead=days_ahead
    )
    
    return {
        "shipment_location": {
            "origin": {"lat": origin_lat, "lng": origin_lng},
            "destination": {"lat": dest_lat, "lng": dest_lng}
        },
        "matching_criteria": "geospatial_corridor",
        "total_matching_trips": len(matching_trips),
        "trips": matching_trips,
        "best_match": matching_trips[0] if matching_trips else None
    }


@router.post("/suggestions/locations")
async def suggest_locations(
    lat: float,
    lng: float,
    is_origin: bool = True,
    user_id: str = Depends(get_current_user_id)
):
    """
    Get location suggestions for pickup/dropoff.
    
    Uses COORDINATES to find:
    - Nearby strategic points (terminals, stations, shopping centers)
    - Aggregation opportunities (areas with multiple shipments)
    
    No city name dependency - purely geospatial.
    """
    suggestions = await get_location_suggestions(
        user_lat=lat,
        user_lng=lng,
        is_origin=is_origin
    )
    
    return {
        "type": "origin" if is_origin else "destination",
        "user_location": {"lat": lat, "lng": lng},
        "matching_criteria": "geospatial",
        "suggestions": suggestions
    }


class TimeSlotsRequest(BaseModel):
    """Request for time slot suggestions - GEOSPATIAL PRIMARY"""
    origin_lat: float
    origin_lng: float
    dest_lat: float
    dest_lng: float
    date: str
    corridor_radius_km: float = 50.0


@router.post("/suggestions/time-slots")
async def suggest_time_slots(
    request: TimeSlotsRequest,
    user_id: str = Depends(get_current_user_id)
):
    """
    Get optimal time slot suggestions for a specific date.
    
    Uses GEOSPATIAL matching to find trips, not city names.
    Returns time slots with trip availability based on coordinate proximity.
    """
    target_date = datetime.fromisoformat(request.date)
    
    suggestions = await get_time_slot_suggestions(
        origin_lat=request.origin_lat,
        origin_lng=request.origin_lng,
        dest_lat=request.dest_lat,
        dest_lng=request.dest_lng,
        date=target_date,
        corridor_radius_km=request.corridor_radius_km
    )
    
    return {
        "date": request.date,
        "location": {
            "origin": {"lat": request.origin_lat, "lng": request.origin_lng},
            "destination": {"lat": request.dest_lat, "lng": request.dest_lng}
        },
        "matching_criteria": "geospatial",
        "corridor_radius_km": request.corridor_radius_km,
        "time_slots": suggestions
    }


class ComprehensiveSuggestionsRequest(BaseModel):
    """Request for all suggestions - GEOSPATIAL PRIMARY"""
    origin_lat: float
    origin_lng: float
    dest_lat: float
    dest_lng: float
    weight_kg: float = 1.0
    origin_city: Optional[str] = None  # For display only
    destination_city: Optional[str] = None  # For display only
    is_shipment: bool = True
    preferred_date: Optional[str] = None


@router.post("/suggestions/comprehensive")
async def get_all_suggestions(
    request: ComprehensiveSuggestionsRequest,
    user_id: str = Depends(get_current_user_id)
):
    """
    Get all suggestions in one call:
    - Best dates with match probability
    - Matching trips (geospatial)
    - Origin location suggestions
    - Destination location suggestions
    - Time slots
    
    ALL MATCHING IS GEOSPATIAL-FIRST.
    City names are only used for display purposes.
    """
    pref_date = datetime.fromisoformat(request.preferred_date) if request.preferred_date else None
    
    suggestions = await get_comprehensive_suggestions(
        origin_lat=request.origin_lat,
        origin_lng=request.origin_lng,
        dest_lat=request.dest_lat,
        dest_lng=request.dest_lng,
        weight_kg=request.weight_kg,
        preferred_date=pref_date,
        is_shipment=request.is_shipment
    )
    
    # Add display info
    origin_display = request.origin_city or f"({request.origin_lat:.2f}, {request.origin_lng:.2f})"
    dest_display = request.destination_city or f"({request.dest_lat:.2f}, {request.dest_lng:.2f})"
    
    return {
        "route_display": f"{origin_display} → {dest_display}",
        "matching_criteria": "geospatial_primary",
        **suggestions
    }


# ============ Legacy Endpoints (for backward compatibility) ============
# These redirect to the new geospatial endpoints with coordinate lookup

@router.get("/suggestions/dates")
async def suggest_dates_legacy(
    origin_city: str,
    destination_city: str,
    is_shipment: bool = True,
    preferred_date: Optional[str] = None,
    user_id: str = Depends(get_current_user_id)
):
    """
    LEGACY ENDPOINT - Maintained for backward compatibility.
    
    Converts city names to coordinates and uses geospatial matching.
    Prefer the POST /suggestions/dates endpoint with coordinates.
    """
    from route_service import get_city_coordinates
    
    origin_coords = get_city_coordinates(origin_city)
    dest_coords = get_city_coordinates(destination_city)
    
    pref_date = datetime.fromisoformat(preferred_date) if preferred_date else datetime.now(timezone.utc)
    
    suggestions = await get_date_suggestions(
        origin_lat=origin_coords[0],
        origin_lng=origin_coords[1],
        dest_lat=dest_coords[0],
        dest_lng=dest_coords[1],
        preferred_date=pref_date,
        is_shipment=is_shipment
    )
    
    return {
        "route": f"{origin_city} → {destination_city}",
        "type": "shipment" if is_shipment else "trip",
        "matching_criteria": "geospatial_from_city_lookup",
        "note": "City names converted to coordinates. For better accuracy, use POST endpoint with coordinates.",
        "suggestions": suggestions,
        "best_date": suggestions[0] if suggestions else None
    }


@router.get("/suggestions/locations")
async def suggest_locations_legacy(
    city: str,
    lat: float,
    lng: float,
    is_origin: bool = True,
    user_id: str = Depends(get_current_user_id)
):
    """
    LEGACY ENDPOINT - Maintained for backward compatibility.
    
    Uses the provided coordinates (ignores city name for matching).
    """
    suggestions = await get_location_suggestions(
        user_lat=lat,
        user_lng=lng,
        is_origin=is_origin
    )
    
    return {
        "city": city,
        "type": "origin" if is_origin else "destination",
        "user_location": {"lat": lat, "lng": lng},
        "matching_criteria": "geospatial",
        "suggestions": suggestions
    }


@router.get("/suggestions/time-slots")
async def suggest_time_slots_legacy(
    origin_city: str,
    destination_city: str,
    date: str,
    user_id: str = Depends(get_current_user_id)
):
    """
    LEGACY ENDPOINT - Maintained for backward compatibility.
    
    Converts city names to coordinates and uses geospatial matching.
    Prefer the POST /suggestions/time-slots endpoint with coordinates.
    """
    from route_service import get_city_coordinates
    
    origin_coords = get_city_coordinates(origin_city)
    dest_coords = get_city_coordinates(destination_city)
    
    target_date = datetime.fromisoformat(date)
    
    suggestions = await get_time_slot_suggestions(
        origin_lat=origin_coords[0],
        origin_lng=origin_coords[1],
        dest_lat=dest_coords[0],
        dest_lng=dest_coords[1],
        date=target_date
    )
    
    return {
        "date": date,
        "route": f"{origin_city} → {destination_city}",
        "matching_criteria": "geospatial_from_city_lookup",
        "note": "City names converted to coordinates. For better accuracy, use POST endpoint with coordinates.",
        "time_slots": suggestions
    }
