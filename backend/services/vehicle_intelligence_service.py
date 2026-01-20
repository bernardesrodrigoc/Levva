"""
Vehicle Intelligence Service for Levva Platform

Provides intelligent capacity suggestions based on:
1. Platform statistics (primary source)
2. Fallback defaults by vehicle type

STATISTICAL APPROACH:
- Group vehicles by: type, brand, model, year_range (±2 years)
- Calculate MEDIAN (not average) to avoid outliers
- Minimum sample size: 5 vehicles
- Flag significant deviations for internal review

This system improves over time as more vehicles are registered.
"""

import logging
from typing import Optional, Dict, List, Tuple
from datetime import datetime
from enum import Enum
from statistics import median
from dataclasses import dataclass

logger = logging.getLogger(__name__)


# Minimum sample size to use platform statistics
MIN_SAMPLE_SIZE = 5

# Deviation threshold (percentage) to flag for review
DEVIATION_THRESHOLD_PERCENT = 50


class TransportType(str, Enum):
    MOTORCYCLE = "motorcycle"
    CAR = "car"
    VAN = "van"
    TRUCK = "truck"
    BUS_PASSENGER = "bus_passenger"
    CARPOOL_PASSENGER = "carpool_passenger"


@dataclass
class CapacitySuggestion:
    """Capacity suggestion with metadata"""
    weight_kg: float
    volume_liters: float
    source: str  # "platform_statistics" | "vehicle_type_default" | "fallback"
    sample_size: int
    confidence: str  # "high" | "medium" | "low"
    vehicle_type: str
    brand: Optional[str] = None
    model: Optional[str] = None
    year_range: Optional[str] = None


# Default capacities by vehicle type (fallback when no platform data)
# Based on common Brazilian vehicles and logistics standards
DEFAULT_CAPACITIES = {
    TransportType.MOTORCYCLE: {
        "weight_kg": 25.0,
        "volume_liters": 80.0,
        "description": "Moto com baú/bag"
    },
    TransportType.CAR: {
        "weight_kg": 250.0,  # Average between hatchback and sedan
        "volume_liters": 340.0,
        "description": "Carro popular (porta-malas)"
    },
    TransportType.VAN: {
        "weight_kg": 800.0,
        "volume_liters": 2000.0,
        "description": "Van de carga"
    },
    TransportType.TRUCK: {
        "weight_kg": 3000.0,
        "volume_liters": 15000.0,
        "description": "Caminhão leve"
    },
    TransportType.BUS_PASSENGER: {
        "weight_kg": 23.0,
        "volume_liters": 120.0,
        "description": "Passageiro de ônibus (bagagem de mão + despachada)"
    },
    TransportType.CARPOOL_PASSENGER: {
        "weight_kg": 30.0,
        "volume_liters": 100.0,
        "description": "Passageiro de carona (espaço no banco/porta-malas)"
    }
}


# More granular defaults by car type
CAR_SUBTYPE_DEFAULTS = {
    "hatchback": {"weight_kg": 200.0, "volume_liters": 280.0},
    "sedan": {"weight_kg": 300.0, "volume_liters": 400.0},
    "suv": {"weight_kg": 450.0, "volume_liters": 550.0},
    "pickup": {"weight_kg": 500.0, "volume_liters": 800.0},
    "wagon": {"weight_kg": 400.0, "volume_liters": 500.0},
}


# Known vehicle models with typical capacities (seed data for cold start)
# This helps when platform has few registrations
KNOWN_MODELS = {
    # Motorcycles
    ("motorcycle", "honda", "cg"): {"weight_kg": 20.0, "volume_liters": 60.0},
    ("motorcycle", "honda", "biz"): {"weight_kg": 15.0, "volume_liters": 50.0},
    ("motorcycle", "yamaha", "factor"): {"weight_kg": 20.0, "volume_liters": 60.0},
    ("motorcycle", "yamaha", "fazer"): {"weight_kg": 25.0, "volume_liters": 70.0},
    
    # Popular hatchbacks
    ("car", "volkswagen", "gol"): {"weight_kg": 200.0, "volume_liters": 285.0},
    ("car", "fiat", "argo"): {"weight_kg": 220.0, "volume_liters": 300.0},
    ("car", "fiat", "mobi"): {"weight_kg": 180.0, "volume_liters": 235.0},
    ("car", "chevrolet", "onix"): {"weight_kg": 220.0, "volume_liters": 303.0},
    ("car", "hyundai", "hb20"): {"weight_kg": 210.0, "volume_liters": 300.0},
    ("car", "renault", "kwid"): {"weight_kg": 180.0, "volume_liters": 290.0},
    
    # Sedans
    ("car", "volkswagen", "virtus"): {"weight_kg": 300.0, "volume_liters": 521.0},
    ("car", "chevrolet", "onix plus"): {"weight_kg": 280.0, "volume_liters": 470.0},
    ("car", "fiat", "cronos"): {"weight_kg": 290.0, "volume_liters": 525.0},
    ("car", "honda", "city"): {"weight_kg": 300.0, "volume_liters": 519.0},
    ("car", "toyota", "corolla"): {"weight_kg": 350.0, "volume_liters": 470.0},
    ("car", "honda", "civic"): {"weight_kg": 350.0, "volume_liters": 519.0},
    
    # SUVs
    ("car", "jeep", "renegade"): {"weight_kg": 400.0, "volume_liters": 320.0},
    ("car", "jeep", "compass"): {"weight_kg": 450.0, "volume_liters": 410.0},
    ("car", "hyundai", "creta"): {"weight_kg": 430.0, "volume_liters": 422.0},
    ("car", "volkswagen", "t-cross"): {"weight_kg": 420.0, "volume_liters": 373.0},
    ("car", "chevrolet", "tracker"): {"weight_kg": 400.0, "volume_liters": 363.0},
    
    # Pickups
    ("car", "fiat", "strada"): {"weight_kg": 650.0, "volume_liters": 1100.0},
    ("car", "volkswagen", "saveiro"): {"weight_kg": 700.0, "volume_liters": 1200.0},
    ("car", "chevrolet", "montana"): {"weight_kg": 680.0, "volume_liters": 1000.0},
    ("car", "toyota", "hilux"): {"weight_kg": 1000.0, "volume_liters": 1400.0},
    
    # Vans
    ("van", "fiat", "fiorino"): {"weight_kg": 650.0, "volume_liters": 1750.0},
    ("van", "renault", "kangoo"): {"weight_kg": 600.0, "volume_liters": 2600.0},
    ("van", "mercedes", "sprinter"): {"weight_kg": 1500.0, "volume_liters": 9000.0},
    ("van", "fiat", "ducato"): {"weight_kg": 1200.0, "volume_liters": 8000.0},
    ("van", "iveco", "daily"): {"weight_kg": 1800.0, "volume_liters": 12000.0},
}


def normalize_string(s: Optional[str]) -> str:
    """Normalize string for matching (lowercase, strip, remove accents)"""
    if not s:
        return ""
    import unicodedata
    normalized = unicodedata.normalize('NFD', s.lower().strip())
    return ''.join(c for c in normalized if unicodedata.category(c) != 'Mn')


def get_year_range(year: Optional[int]) -> Optional[str]:
    """Get year range string (±2 years)"""
    if not year:
        return None
    return f"{year - 2}-{year + 2}"


async def get_platform_statistics(
    vehicle_type: str,
    brand: Optional[str] = None,
    model: Optional[str] = None,
    year: Optional[int] = None
) -> Optional[Dict]:
    """
    Get capacity statistics from platform data.
    
    Grouping hierarchy (from most specific to least):
    1. type + brand + model + year_range
    2. type + brand + model
    3. type + brand
    4. type only
    
    Returns None if sample size < MIN_SAMPLE_SIZE
    """
    from database import db
    
    vehicle_type_norm = normalize_string(vehicle_type)
    brand_norm = normalize_string(brand)
    model_norm = normalize_string(model)
    
    # Try most specific grouping first
    queries = []
    
    # Level 1: type + brand + model + year_range
    if brand_norm and model_norm and year:
        year_start = year - 2
        year_end = year + 2
        queries.append({
            "type": vehicle_type,
            "brand_normalized": brand_norm,
            "model_normalized": model_norm,
            "year": {"$gte": year_start, "$lte": year_end}
        })
    
    # Level 2: type + brand + model
    if brand_norm and model_norm:
        queries.append({
            "type": vehicle_type,
            "brand_normalized": brand_norm,
            "model_normalized": model_norm
        })
    
    # Level 3: type + brand
    if brand_norm:
        queries.append({
            "type": vehicle_type,
            "brand_normalized": brand_norm
        })
    
    # Level 4: type only
    queries.append({
        "type": vehicle_type
    })
    
    for query in queries:
        vehicles = await db.vehicles.find(query).to_list(1000)
        
        if len(vehicles) >= MIN_SAMPLE_SIZE:
            weights = [v.get("capacity_weight_kg", 0) for v in vehicles if v.get("capacity_weight_kg", 0) > 0]
            volumes = [v.get("capacity_volume_liters", 0) for v in vehicles if v.get("capacity_volume_liters", 0) > 0]
            
            if len(weights) >= MIN_SAMPLE_SIZE and len(volumes) >= MIN_SAMPLE_SIZE:
                return {
                    "weight_kg_median": median(weights),
                    "volume_liters_median": median(volumes),
                    "sample_size": len(vehicles),
                    "grouping": list(query.keys())
                }
    
    return None


def get_known_model_capacity(
    vehicle_type: str,
    brand: Optional[str] = None,
    model: Optional[str] = None
) -> Optional[Dict]:
    """
    Get capacity from known models database.
    Used as secondary source when platform has insufficient data.
    """
    vehicle_type_norm = normalize_string(vehicle_type)
    brand_norm = normalize_string(brand)
    model_norm = normalize_string(model)
    
    # Try exact match first
    key = (vehicle_type_norm, brand_norm, model_norm)
    if key in KNOWN_MODELS:
        return KNOWN_MODELS[key]
    
    # Try partial model match (e.g., "onix plus" should match "onix")
    for (kt, kb, km), capacity in KNOWN_MODELS.items():
        if kt == vehicle_type_norm and kb == brand_norm:
            if km in model_norm or model_norm in km:
                return capacity
    
    return None


def get_default_capacity(vehicle_type: str) -> Dict:
    """Get default capacity by vehicle type (fallback)"""
    try:
        vtype = TransportType(vehicle_type)
        return DEFAULT_CAPACITIES[vtype]
    except (ValueError, KeyError):
        # Ultimate fallback
        return {"weight_kg": 50.0, "volume_liters": 100.0, "description": "Capacidade padrão"}


async def get_capacity_suggestion(
    vehicle_type: str,
    brand: Optional[str] = None,
    model: Optional[str] = None,
    year: Optional[int] = None
) -> CapacitySuggestion:
    """
    Get intelligent capacity suggestion for a vehicle.
    
    Priority order:
    1. Platform statistics (if sample size >= MIN_SAMPLE_SIZE)
    2. Known models database
    3. Vehicle type defaults
    
    Returns CapacitySuggestion with metadata about source and confidence.
    """
    
    # 1. Try platform statistics first
    platform_stats = await get_platform_statistics(vehicle_type, brand, model, year)
    
    if platform_stats:
        confidence = "high" if platform_stats["sample_size"] >= 20 else "medium"
        year_range = get_year_range(year) if "year" in platform_stats.get("grouping", []) else None
        
        return CapacitySuggestion(
            weight_kg=round(platform_stats["weight_kg_median"], 1),
            volume_liters=round(platform_stats["volume_liters_median"], 1),
            source="platform_statistics",
            sample_size=platform_stats["sample_size"],
            confidence=confidence,
            vehicle_type=vehicle_type,
            brand=brand,
            model=model,
            year_range=year_range
        )
    
    # 2. Try known models database
    known_capacity = get_known_model_capacity(vehicle_type, brand, model)
    
    if known_capacity:
        return CapacitySuggestion(
            weight_kg=known_capacity["weight_kg"],
            volume_liters=known_capacity["volume_liters"],
            source="known_models_database",
            sample_size=0,
            confidence="medium",
            vehicle_type=vehicle_type,
            brand=brand,
            model=model
        )
    
    # 3. Fallback to vehicle type defaults
    default = get_default_capacity(vehicle_type)
    
    return CapacitySuggestion(
        weight_kg=default["weight_kg"],
        volume_liters=default["volume_liters"],
        source="vehicle_type_default",
        sample_size=0,
        confidence="low",
        vehicle_type=vehicle_type
    )


def check_capacity_deviation(
    user_weight_kg: float,
    user_volume_liters: float,
    suggested_weight_kg: float,
    suggested_volume_liters: float
) -> Dict:
    """
    Check if user-provided capacity deviates significantly from suggestion.
    
    Returns deviation info for internal flagging (no blocking).
    """
    weight_deviation_percent = abs(user_weight_kg - suggested_weight_kg) / suggested_weight_kg * 100 if suggested_weight_kg > 0 else 0
    volume_deviation_percent = abs(user_volume_liters - suggested_volume_liters) / suggested_volume_liters * 100 if suggested_volume_liters > 0 else 0
    
    weight_flagged = weight_deviation_percent > DEVIATION_THRESHOLD_PERCENT
    volume_flagged = volume_deviation_percent > DEVIATION_THRESHOLD_PERCENT
    
    return {
        "weight_deviation_percent": round(weight_deviation_percent, 1),
        "volume_deviation_percent": round(volume_deviation_percent, 1),
        "weight_flagged": weight_flagged,
        "volume_flagged": volume_flagged,
        "any_flagged": weight_flagged or volume_flagged,
        "threshold_percent": DEVIATION_THRESHOLD_PERCENT
    }


async def get_all_vehicle_type_defaults() -> List[Dict]:
    """Get all default capacities by vehicle type (for UI dropdown)"""
    return [
        {
            "type": vtype.value,
            "name": _get_vehicle_type_display_name(vtype),
            "default_weight_kg": config["weight_kg"],
            "default_volume_liters": config["volume_liters"],
            "description": config["description"]
        }
        for vtype, config in DEFAULT_CAPACITIES.items()
    ]


def _get_vehicle_type_display_name(vtype: TransportType) -> str:
    """Get display name for vehicle type"""
    names = {
        TransportType.MOTORCYCLE: "Moto",
        TransportType.CAR: "Carro",
        TransportType.VAN: "Van",
        TransportType.TRUCK: "Caminhão",
        TransportType.BUS_PASSENGER: "Passageiro de Ônibus",
        TransportType.CARPOOL_PASSENGER: "Carona"
    }
    return names.get(vtype, vtype.value)


async def get_popular_brands_models(vehicle_type: str, limit: int = 10) -> Dict:
    """
    Get popular brands and models for a vehicle type from platform data.
    Used to help users fill in brand/model fields.
    """
    from database import db
    
    # Aggregate brands
    brand_pipeline = [
        {"$match": {"type": vehicle_type, "brand": {"$exists": True, "$ne": None}}},
        {"$group": {"_id": "$brand", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": limit}
    ]
    
    brands = await db.vehicles.aggregate(brand_pipeline).to_list(limit)
    
    # Aggregate models
    model_pipeline = [
        {"$match": {"type": vehicle_type, "model": {"$exists": True, "$ne": None}}},
        {"$group": {"_id": {"brand": "$brand", "model": "$model"}, "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": limit}
    ]
    
    models = await db.vehicles.aggregate(model_pipeline).to_list(limit)
    
    return {
        "vehicle_type": vehicle_type,
        "popular_brands": [{"brand": b["_id"], "count": b["count"]} for b in brands],
        "popular_models": [{"brand": m["_id"]["brand"], "model": m["_id"]["model"], "count": m["count"]} for m in models]
    }
