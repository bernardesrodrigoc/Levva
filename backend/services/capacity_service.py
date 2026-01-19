"""
Capacity Management Service for Levva Platform

Handles:
- Multiple shipments per transport
- Volume and weight tracking
- Capacity utilization display
- Automatic overbooking prevention
"""

from typing import List, Tuple, Optional
from datetime import datetime
import logging

logger = logging.getLogger(__name__)


def calculate_volume_liters(length_cm: float, width_cm: float, height_cm: float) -> float:
    """Calculate volume in liters from dimensions in cm"""
    return (length_cm * width_cm * height_cm) / 1000


def calculate_capacity_usage(
    used_weight_kg: float,
    used_volume_liters: float,
    max_weight_kg: float,
    max_volume_liters: float
) -> dict:
    """
    Calculate capacity usage percentages.
    Returns both weight and volume usage, plus combined utilization.
    """
    weight_percent = (used_weight_kg / max_weight_kg * 100) if max_weight_kg > 0 else 0
    volume_percent = (used_volume_liters / max_volume_liters * 100) if max_volume_liters > 0 else 0
    
    # Combined utilization is the higher of the two (limiting factor)
    combined_percent = max(weight_percent, volume_percent)
    
    return {
        "used_weight_kg": round(used_weight_kg, 2),
        "max_weight_kg": round(max_weight_kg, 2),
        "available_weight_kg": round(max(0, max_weight_kg - used_weight_kg), 2),
        "weight_percent": round(weight_percent, 1),
        
        "used_volume_liters": round(used_volume_liters, 1),
        "max_volume_liters": round(max_volume_liters, 1),
        "available_volume_liters": round(max(0, max_volume_liters - used_volume_liters), 1),
        "volume_percent": round(volume_percent, 1),
        
        "combined_utilization_percent": round(combined_percent, 1),
        "is_full": combined_percent >= 95,
        "limiting_factor": "weight" if weight_percent > volume_percent else "volume"
    }


def check_shipment_fits(
    shipment_weight_kg: float,
    shipment_volume_liters: float,
    trip_available_weight_kg: float,
    trip_available_volume_liters: float
) -> Tuple[bool, str]:
    """
    Check if a shipment fits in the available trip capacity.
    Returns (fits, reason).
    """
    if shipment_weight_kg > trip_available_weight_kg:
        return (
            False,
            f"Peso excede capacidade disponível. Disponível: {trip_available_weight_kg:.1f}kg, Necessário: {shipment_weight_kg:.1f}kg"
        )
    
    if shipment_volume_liters > trip_available_volume_liters:
        return (
            False,
            f"Volume excede capacidade disponível. Disponível: {trip_available_volume_liters:.1f}L, Necessário: {shipment_volume_liters:.1f}L"
        )
    
    return (True, "")


async def get_trip_capacity_status(trip_id: str) -> dict:
    """
    Get current capacity status for a trip, including all matched shipments.
    """
    from database import trips_collection, matches_collection, shipments_collection
    from bson import ObjectId
    
    trip = await trips_collection.find_one({"_id": ObjectId(trip_id)})
    if not trip:
        return {"error": "Trip not found"}
    
    # Get max capacity from trip
    cargo_space = trip.get("cargo_space", {})
    max_weight_kg = cargo_space.get("max_weight_kg", 50)
    max_volume_m3 = cargo_space.get("volume_m3", 0.5)
    max_volume_liters = max_volume_m3 * 1000  # Convert m³ to liters
    
    # Get all active matches for this trip
    active_matches = await matches_collection.find({
        "trip_id": trip_id,
        "status": {"$in": ["pending_payment", "paid", "in_transit"]}
    }).to_list(100)
    
    # Calculate used capacity
    used_weight_kg = 0
    used_volume_liters = 0
    matched_shipments = []
    
    for match in active_matches:
        shipment = await shipments_collection.find_one({"_id": ObjectId(match["shipment_id"])})
        if shipment:
            package = shipment.get("package", {})
            weight = package.get("weight_kg", 0)
            volume = calculate_volume_liters(
                package.get("length_cm", 0),
                package.get("width_cm", 0),
                package.get("height_cm", 0)
            )
            
            used_weight_kg += weight
            used_volume_liters += volume
            
            matched_shipments.append({
                "shipment_id": match["shipment_id"],
                "description": package.get("description", "Envio"),
                "weight_kg": weight,
                "volume_liters": round(volume, 1),
                "status": match["status"]
            })
    
    capacity_status = calculate_capacity_usage(
        used_weight_kg, used_volume_liters,
        max_weight_kg, max_volume_liters
    )
    
    capacity_status["trip_id"] = trip_id
    capacity_status["matched_shipments_count"] = len(matched_shipments)
    capacity_status["matched_shipments"] = matched_shipments
    
    return capacity_status


async def update_trip_available_capacity(trip_id: str) -> dict:
    """
    Recalculate and update the available capacity for a trip.
    Called after adding/removing shipments.
    """
    from database import trips_collection
    from bson import ObjectId
    
    status = await get_trip_capacity_status(trip_id)
    
    if "error" in status:
        return status
    
    # Update trip with current available capacity
    await trips_collection.update_one(
        {"_id": ObjectId(trip_id)},
        {
            "$set": {
                "available_weight_kg": status["available_weight_kg"],
                "available_volume_liters": status["available_volume_liters"],
                "capacity_utilization_percent": status["combined_utilization_percent"],
                "matched_shipments_count": status["matched_shipments_count"],
                "capacity_updated_at": datetime.utcnow()
            }
        }
    )
    
    return status


async def find_trips_with_capacity(
    min_weight_kg: float,
    min_volume_liters: float,
    origin_city: str = None,
    destination_city: str = None
) -> List[dict]:
    """
    Find trips that have enough capacity for a shipment.
    """
    from database import trips_collection
    
    query = {
        "status": "published",
        "$or": [
            {"available_weight_kg": {"$gte": min_weight_kg}},
            {"available_weight_kg": {"$exists": False}}  # Not tracked yet
        ]
    }
    
    if origin_city:
        query["origin.city"] = {"$regex": origin_city, "$options": "i"}
    if destination_city:
        query["destination.city"] = {"$regex": destination_city, "$options": "i"}
    
    trips = await trips_collection.find(query).to_list(50)
    
    # Filter by actual capacity
    result = []
    for trip in trips:
        cargo_space = trip.get("cargo_space", {})
        max_weight = cargo_space.get("max_weight_kg", 50)
        max_volume = cargo_space.get("volume_m3", 0.5) * 1000
        
        available_weight = trip.get("available_weight_kg", max_weight)
        available_volume = trip.get("available_volume_liters", max_volume)
        
        if available_weight >= min_weight_kg and available_volume >= min_volume_liters:
            trip["id"] = str(trip.pop("_id"))
            trip["capacity_status"] = calculate_capacity_usage(
                max_weight - available_weight,
                max_volume - available_volume,
                max_weight,
                max_volume
            )
            result.append(trip)
    
    return result


def estimate_trip_slots(
    max_weight_kg: float,
    max_volume_liters: float,
    avg_package_weight_kg: float = 3,
    avg_package_volume_liters: float = 15
) -> dict:
    """
    Estimate how many average packages can fit in a trip.
    Useful for capacity planning display.
    """
    weight_slots = int(max_weight_kg / avg_package_weight_kg) if avg_package_weight_kg > 0 else 0
    volume_slots = int(max_volume_liters / avg_package_volume_liters) if avg_package_volume_liters > 0 else 0
    
    # Limiting factor determines actual slots
    estimated_slots = min(weight_slots, volume_slots)
    
    return {
        "estimated_slots": estimated_slots,
        "weight_limited_slots": weight_slots,
        "volume_limited_slots": volume_slots,
        "limiting_factor": "weight" if weight_slots < volume_slots else "volume",
        "avg_package_assumptions": {
            "weight_kg": avg_package_weight_kg,
            "volume_liters": avg_package_volume_liters
        }
    }


async def can_add_shipment_to_trip(
    trip_id: str,
    shipment_weight_kg: float,
    shipment_length_cm: float,
    shipment_width_cm: float,
    shipment_height_cm: float
) -> Tuple[bool, str, dict]:
    """
    Check if a shipment can be added to a trip.
    Returns (can_add, reason, capacity_after).
    """
    status = await get_trip_capacity_status(trip_id)
    
    if "error" in status:
        return (False, status["error"], {})
    
    shipment_volume = calculate_volume_liters(
        shipment_length_cm, shipment_width_cm, shipment_height_cm
    )
    
    fits, reason = check_shipment_fits(
        shipment_weight_kg,
        shipment_volume,
        status["available_weight_kg"],
        status["available_volume_liters"]
    )
    
    if not fits:
        return (False, reason, status)
    
    # Calculate what capacity would look like after
    new_used_weight = status["used_weight_kg"] + shipment_weight_kg
    new_used_volume = status["used_volume_liters"] + shipment_volume
    
    capacity_after = calculate_capacity_usage(
        new_used_weight,
        new_used_volume,
        status["max_weight_kg"],
        status["max_volume_liters"]
    )
    
    return (True, "", capacity_after)
