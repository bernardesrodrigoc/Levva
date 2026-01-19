"""
Intelligent Pricing Service for Levva Platform

Dynamic pricing model inspired by ride-hailing platforms.
Pricing components:
- Base price per route (distance + time)
- Cargo category multiplier
- Volume and weight combined
- Required deviation from transporter's route
- Current demand vs supply on route/date
- Remaining vehicle capacity (progressive pricing)

Platform commission: 15-25% (handled internally)
"""

import math
from datetime import datetime, timedelta
from typing import Tuple, Optional
from enum import Enum
import logging

logger = logging.getLogger(__name__)


class CargoCategory(str, Enum):
    DOCUMENT = "document"      # Documentos, cartas
    SMALL = "small"            # Pacotes pequenos (até 2kg, 20x20x20cm)
    MEDIUM = "medium"          # Pacotes médios (até 10kg, 40x40x40cm)
    LARGE = "large"            # Pacotes grandes (até 30kg, 60x60x60cm)
    EXTRA_LARGE = "extra_large"  # Volumes maiores


# Category multipliers and limits
CARGO_CATEGORY_CONFIG = {
    CargoCategory.DOCUMENT: {
        "multiplier": 0.5,
        "max_weight_kg": 0.5,
        "max_volume_liters": 2,
        "name": "Documento"
    },
    CargoCategory.SMALL: {
        "multiplier": 0.8,
        "max_weight_kg": 2,
        "max_volume_liters": 8,
        "name": "Pequeno"
    },
    CargoCategory.MEDIUM: {
        "multiplier": 1.0,
        "max_weight_kg": 10,
        "max_volume_liters": 64,
        "name": "Médio"
    },
    CargoCategory.LARGE: {
        "multiplier": 1.3,
        "max_weight_kg": 30,
        "max_volume_liters": 216,
        "name": "Grande"
    },
    CargoCategory.EXTRA_LARGE: {
        "multiplier": 1.6,
        "max_weight_kg": 100,
        "max_volume_liters": 1000,
        "name": "Extra Grande"
    }
}

# Platform commission tiers (higher value = lower commission %)
COMMISSION_TIERS = [
    (0, 50, 0.25),        # R$0-50: 25%
    (50, 200, 0.20),      # R$50-200: 20%
    (200, 500, 0.18),     # R$200-500: 18%
    (500, float('inf'), 0.15)  # R$500+: 15%
]


def calculate_volume_liters(length_cm: float, width_cm: float, height_cm: float) -> float:
    """Calculate volume in liters from dimensions in cm"""
    return (length_cm * width_cm * height_cm) / 1000


def detect_cargo_category(weight_kg: float, volume_liters: float) -> CargoCategory:
    """Automatically detect cargo category based on weight and volume"""
    for category in [CargoCategory.DOCUMENT, CargoCategory.SMALL, CargoCategory.MEDIUM, 
                     CargoCategory.LARGE, CargoCategory.EXTRA_LARGE]:
        config = CARGO_CATEGORY_CONFIG[category]
        if weight_kg <= config["max_weight_kg"] and volume_liters <= config["max_volume_liters"]:
            return category
    return CargoCategory.EXTRA_LARGE


def get_commission_rate(base_price: float) -> float:
    """Get commission rate based on price tier"""
    for min_val, max_val, rate in COMMISSION_TIERS:
        if min_val <= base_price < max_val:
            return rate
    return 0.15  # Default 15%


def calculate_distance_price(distance_km: float) -> float:
    """
    Calculate base price based on distance.
    Uses progressive pricing tiers.
    """
    if distance_km <= 0:
        return 5.0  # Minimum price
    
    # Base rate + progressive tiers
    if distance_km <= 50:
        # Short distance: R$5 base + R$0.30/km
        price = 5.0 + (distance_km * 0.30)
    elif distance_km <= 200:
        # Medium distance: R$20 base + R$0.20/km
        price = 20.0 + ((distance_km - 50) * 0.20)
    elif distance_km <= 500:
        # Long distance: R$50 base + R$0.15/km
        price = 50.0 + ((distance_km - 200) * 0.15)
    else:
        # Very long distance: R$95 base + R$0.10/km
        price = 95.0 + ((distance_km - 500) * 0.10)
    
    return price


def calculate_deviation_multiplier(deviation_km: float, corridor_radius_km: float) -> float:
    """
    Calculate price multiplier based on route deviation.
    Higher deviation = higher price (transporter goes out of their way).
    """
    if deviation_km <= 0:
        return 1.0
    
    # Deviation as percentage of corridor
    deviation_ratio = deviation_km / max(corridor_radius_km, 1)
    
    # Multiplier: 1.0 to 1.5 based on deviation
    return 1.0 + (min(deviation_ratio, 1.0) * 0.5)


def calculate_capacity_multiplier(
    used_capacity_percent: float,
    is_last_slot: bool = False
) -> float:
    """
    Progressive pricing based on remaining capacity.
    When capacity is filling up, prices increase (demand/supply).
    """
    if is_last_slot:
        # Premium for last slot
        return 1.3
    
    if used_capacity_percent < 30:
        # Low usage: slight discount to attract
        return 0.9
    elif used_capacity_percent < 60:
        # Normal pricing
        return 1.0
    elif used_capacity_percent < 80:
        # Getting full: slight increase
        return 1.1
    else:
        # Almost full: premium pricing
        return 1.2


async def calculate_demand_supply_multiplier(
    origin_city: str,
    destination_city: str,
    date: datetime
) -> float:
    """
    Calculate multiplier based on demand vs supply on this route/date.
    Returns 0.9-1.3 multiplier.
    """
    from database import trips_collection, shipments_collection
    
    # Get date range (same day)
    start_of_day = date.replace(hour=0, minute=0, second=0, microsecond=0)
    end_of_day = start_of_day + timedelta(days=1)
    
    # Count available trips (supply) on this route
    trips_count = await trips_collection.count_documents({
        "origin.city": {"$regex": origin_city, "$options": "i"},
        "destination.city": {"$regex": destination_city, "$options": "i"},
        "departure_date": {"$gte": start_of_day, "$lt": end_of_day},
        "status": "published"
    })
    
    # Count shipments waiting (demand) on this route
    shipments_count = await shipments_collection.count_documents({
        "origin.city": {"$regex": origin_city, "$options": "i"},
        "destination.city": {"$regex": destination_city, "$options": "i"},
        "status": "published"
    })
    
    # Calculate ratio
    if trips_count == 0:
        # No supply: high demand multiplier
        return 1.3 if shipments_count > 0 else 1.0
    
    ratio = shipments_count / trips_count
    
    if ratio > 3:
        # High demand, low supply
        return 1.3
    elif ratio > 1.5:
        # Moderate high demand
        return 1.15
    elif ratio < 0.3:
        # Low demand, high supply (discount)
        return 0.9
    elif ratio < 0.7:
        # Moderate low demand
        return 0.95
    else:
        # Balanced
        return 1.0


async def calculate_intelligent_price(
    # Distance and route
    distance_km: float,
    deviation_km: float = 0,
    corridor_radius_km: float = 10,
    
    # Cargo details
    weight_kg: float = 1.0,
    length_cm: float = 20,
    width_cm: float = 20,
    height_cm: float = 20,
    category: Optional[str] = None,
    
    # Capacity
    trip_used_capacity_percent: float = 0,
    is_last_slot: bool = False,
    
    # Route info for demand/supply
    origin_city: str = None,
    destination_city: str = None,
    departure_date: datetime = None
) -> dict:
    """
    Calculate the complete intelligent price for a shipment.
    Returns detailed breakdown (internal) and final user price.
    """
    
    # 1. Calculate volume
    volume_liters = calculate_volume_liters(length_cm, width_cm, height_cm)
    
    # 2. Detect/validate category
    if category:
        try:
            cargo_category = CargoCategory(category)
        except ValueError:
            cargo_category = detect_cargo_category(weight_kg, volume_liters)
    else:
        cargo_category = detect_cargo_category(weight_kg, volume_liters)
    
    category_config = CARGO_CATEGORY_CONFIG[cargo_category]
    
    # 3. Base distance price
    base_distance_price = calculate_distance_price(distance_km)
    
    # 4. Apply multipliers
    category_multiplier = category_config["multiplier"]
    deviation_multiplier = calculate_deviation_multiplier(deviation_km, corridor_radius_km)
    capacity_multiplier = calculate_capacity_multiplier(trip_used_capacity_percent, is_last_slot)
    
    # 5. Demand/supply multiplier (async)
    demand_multiplier = 1.0
    if origin_city and destination_city and departure_date:
        demand_multiplier = await calculate_demand_supply_multiplier(
            origin_city, destination_city, departure_date
        )
    
    # 6. Weight/volume factor (heavier = more expensive)
    # Use dimensional weight if larger than actual weight
    dimensional_weight = volume_liters / 5  # 5 liters per kg factor
    chargeable_weight = max(weight_kg, dimensional_weight)
    weight_factor = 1.0 + (chargeable_weight * 0.02)  # +2% per kg
    
    # 7. Calculate subtotal
    subtotal = base_distance_price * category_multiplier * deviation_multiplier * \
               capacity_multiplier * demand_multiplier * weight_factor
    
    # 8. Apply minimum price
    min_price = 8.0  # Minimum R$8
    subtotal = max(subtotal, min_price)
    
    # 9. Round to clean value
    subtotal = round(subtotal, 2)
    
    # 10. Calculate commission
    commission_rate = get_commission_rate(subtotal)
    platform_commission = round(subtotal * commission_rate, 2)
    carrier_earnings = round(subtotal - platform_commission, 2)
    
    return {
        # User-facing (single total)
        "total_price": subtotal,
        "currency": "BRL",
        
        # For carrier
        "carrier_earnings": carrier_earnings,
        
        # Internal breakdown
        "_breakdown": {
            "base_distance_price": round(base_distance_price, 2),
            "distance_km": round(distance_km, 1),
            "category": cargo_category.value,
            "category_name": category_config["name"],
            "category_multiplier": category_multiplier,
            "deviation_km": round(deviation_km, 2),
            "deviation_multiplier": round(deviation_multiplier, 2),
            "capacity_multiplier": round(capacity_multiplier, 2),
            "demand_multiplier": round(demand_multiplier, 2),
            "chargeable_weight_kg": round(chargeable_weight, 2),
            "weight_factor": round(weight_factor, 2),
            "volume_liters": round(volume_liters, 1),
            "commission_rate": commission_rate,
            "platform_commission": platform_commission
        }
    }


def calculate_simple_price(
    distance_km: float,
    weight_kg: float,
    category: str = "medium"
) -> Tuple[float, float, float]:
    """
    Simplified synchronous price calculation.
    Returns (total_price, carrier_earnings, platform_commission).
    """
    base_price = calculate_distance_price(distance_km)
    
    try:
        cargo_category = CargoCategory(category)
    except ValueError:
        cargo_category = CargoCategory.MEDIUM
    
    category_multiplier = CARGO_CATEGORY_CONFIG[cargo_category]["multiplier"]
    weight_factor = 1.0 + (weight_kg * 0.02)
    
    total = max(8.0, round(base_price * category_multiplier * weight_factor, 2))
    commission_rate = get_commission_rate(total)
    commission = round(total * commission_rate, 2)
    earnings = round(total - commission, 2)
    
    return (total, earnings, commission)


def estimate_price_range(
    distance_km: float,
    weight_kg: float
) -> dict:
    """
    Estimate price range for a shipment (for UI display).
    Shows min/max based on possible multipliers.
    """
    base_price = calculate_distance_price(distance_km)
    weight_factor = 1.0 + (weight_kg * 0.02)
    
    # Minimum scenario: document, low demand, route alignment
    min_price = max(8.0, base_price * 0.5 * 0.9 * weight_factor)
    
    # Maximum scenario: extra large, high demand, deviation, capacity full
    max_price = base_price * 1.6 * 1.3 * 1.3 * weight_factor
    
    # Average estimate
    avg_price = (min_price + max_price) / 2
    
    return {
        "estimated_min": round(min_price, 2),
        "estimated_max": round(max_price, 2),
        "estimated_avg": round(avg_price, 2),
        "currency": "BRL"
    }
