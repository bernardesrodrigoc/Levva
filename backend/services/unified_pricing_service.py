"""
Unified Pricing Service - SINGLE SOURCE OF TRUTH
================================================

This is the ONLY place where pricing logic exists.
No other file should calculate or recompute prices.

PRICING ARCHITECTURE:
---------------------
1. ESTIMATE (Phase A): Returns non-binding estimate for UI display
2. FINAL (Phase B): Calculates and returns immutable price at creation

PRICING FORMULA:
---------------
1. Distance Price: Progressive tiers based on km
   - 0-50km: R$5 base + R$0.30/km
   - 50-200km: R$20 base + R$0.20/km
   - 200-500km: R$50 base + R$0.15/km
   - 500+km: R$95 base + R$0.10/km

2. Weight Multiplier: 1 + (weight_kg - 1) * 0.02 (+2% per kg above 1kg)

3. Category Multiplier:
   - document: 0.5
   - small: 0.8
   - medium: 1.0
   - large: 1.3
   - extra_large: 1.6

4. Base Price = distance_price * weight_multiplier * category_multiplier
   (Minimum: R$8.00)

5. Platform Fee: Calculated on base_price
   - R$0-50: 18%
   - R$50-200: 15%
   - R$200-500: 13%
   - R$500+: 10%

6. Final Price = Base Price + Platform Fee

ADMIN CONTROL:
--------------
Platform fee percentages are stored in config_collection.
Changes only affect NEW shipments, not existing ones.
"""

import math
from datetime import datetime, timezone
from typing import Optional, Dict, Any
from database import config_collection
import logging

logger = logging.getLogger(__name__)


# ============================================================
# DEFAULT CONFIGURATION (used if admin hasn't configured)
# ============================================================

DEFAULT_PLATFORM_FEE_TIERS = [
    {"min": 0, "max": 50, "percentage": 18},
    {"min": 50, "max": 200, "percentage": 15},
    {"min": 200, "max": 500, "percentage": 13},
    {"min": 500, "max": float('inf'), "percentage": 10},
]

CATEGORY_MULTIPLIERS = {
    "document": 0.5,
    "documents": 0.5,
    "small": 0.8,
    "medium": 1.0,
    "large": 1.3,
    "extra_large": 1.6,
    # Legacy/alternative names
    "electronics": 1.0,
    "clothing": 0.9,
    "food": 1.0,
    "gifts": 0.9,
    "other": 1.0,
}

MINIMUM_PRICE = 8.0  # R$8 minimum


# ============================================================
# PURE FUNCTIONS - No side effects, deterministic
# ============================================================

def calculate_distance_km(
    origin_lat: float, 
    origin_lng: float, 
    dest_lat: float, 
    dest_lng: float
) -> float:
    """
    Calculate distance between two points using Haversine formula.
    Returns distance in kilometers.
    """
    R = 6371  # Earth's radius in km
    
    lat1_rad = math.radians(origin_lat)
    lat2_rad = math.radians(dest_lat)
    delta_lat = math.radians(dest_lat - origin_lat)
    delta_lng = math.radians(dest_lng - origin_lng)
    
    a = (math.sin(delta_lat / 2) ** 2 + 
         math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(delta_lng / 2) ** 2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    
    return R * c


def calculate_distance_price(distance_km: float) -> float:
    """
    Calculate base price based on distance using progressive tiers.
    This is a PURE function - no DB calls, no side effects.
    """
    if distance_km <= 0:
        return 5.0  # Minimum base
    
    if distance_km <= 50:
        # Short: R$5 base + R$0.30/km
        return 5.0 + (distance_km * 0.30)
    elif distance_km <= 200:
        # Medium: R$20 base + R$0.20/km for distance above 50
        return 20.0 + ((distance_km - 50) * 0.20)
    elif distance_km <= 500:
        # Long: R$50 base + R$0.15/km for distance above 200
        return 50.0 + ((distance_km - 200) * 0.15)
    else:
        # Very long: R$95 base + R$0.10/km for distance above 500
        return 95.0 + ((distance_km - 500) * 0.10)


def get_category_multiplier(category: str) -> float:
    """Get multiplier for cargo category."""
    return CATEGORY_MULTIPLIERS.get(category.lower(), 1.0)


def calculate_weight_multiplier(weight_kg: float) -> float:
    """Calculate weight multiplier (+2% per kg above 1kg)."""
    return 1.0 + max(0, (weight_kg - 1)) * 0.02


def get_platform_fee_percentage(base_price: float, fee_tiers: list = None) -> float:
    """
    Get platform fee percentage based on base price.
    Uses admin-configured tiers or defaults.
    """
    tiers = fee_tiers or DEFAULT_PLATFORM_FEE_TIERS
    
    for tier in tiers:
        if tier["min"] <= base_price < tier["max"]:
            return tier["percentage"]
    
    return 10  # Default 10% for very high values


# ============================================================
# MAIN PRICING FUNCTIONS
# ============================================================

async def get_admin_fee_config() -> list:
    """
    Fetch platform fee configuration from admin settings.
    Returns default tiers if not configured.
    """
    try:
        config = await config_collection.find_one({"key": "platform_fee_tiers"})
        if config and "tiers" in config:
            return config["tiers"]
    except Exception as e:
        logger.warning(f"Could not fetch fee config: {e}")
    
    return DEFAULT_PLATFORM_FEE_TIERS


def calculate_base_price(
    distance_km: float,
    weight_kg: float,
    category: str
) -> float:
    """
    Calculate the base price (carrier earnings) - PURE FUNCTION.
    This is what the carrier receives.
    """
    # Distance component
    distance_price = calculate_distance_price(distance_km)
    
    # Multipliers
    weight_mult = calculate_weight_multiplier(weight_kg)
    category_mult = get_category_multiplier(category)
    
    # Base price calculation
    base = distance_price * weight_mult * category_mult
    
    # Apply minimum
    return max(MINIMUM_PRICE, round(base, 2))


async def calculate_final_price(
    origin_lat: float,
    origin_lng: float,
    dest_lat: float,
    dest_lng: float,
    weight_kg: float,
    category: str
) -> Dict[str, Any]:
    """
    Calculate the FINAL price breakdown for a shipment.
    
    This is called ONLY at shipment creation.
    The result is stored and NEVER recalculated.
    
    Returns:
        {
            "base_price": float,         # Carrier earnings
            "platform_fee": float,       # Platform commission
            "platform_fee_percentage": float,
            "final_price": float,        # Total sender pays
            "distance_km": float,
            "weight_kg": float,
            "category": str,
            "currency": "BRL",
            "calculated_at": datetime
        }
    """
    # Calculate distance
    distance_km = calculate_distance_km(origin_lat, origin_lng, dest_lat, dest_lng)
    
    # Calculate base price (carrier earnings)
    base_price = calculate_base_price(distance_km, weight_kg, category)
    
    # Get admin fee config
    fee_tiers = await get_admin_fee_config()
    fee_percentage = get_platform_fee_percentage(base_price, fee_tiers)
    
    # Calculate platform fee
    platform_fee = round(base_price * (fee_percentage / 100), 2)
    
    # Final price = base + fee
    final_price = round(base_price + platform_fee, 2)
    
    return {
        "base_price": base_price,
        "platform_fee": platform_fee,
        "platform_fee_percentage": fee_percentage,
        "final_price": final_price,
        "distance_km": round(distance_km, 1),
        "weight_kg": round(weight_kg, 2),
        "category": category,
        "currency": "BRL",
        "calculated_at": datetime.now(timezone.utc)
    }


def estimate_price_range(
    origin_lat: float,
    origin_lng: float,
    dest_lat: float,
    dest_lng: float,
    weight_kg: float
) -> Dict[str, Any]:
    """
    Estimate price range for UI display (Phase A).
    
    This is for UX only - shows possible range before user
    selects category or finalizes details.
    
    IMPORTANT: This estimate is NOT binding. The actual price
    is calculated at shipment creation time.
    """
    distance_km = calculate_distance_km(origin_lat, origin_lng, dest_lat, dest_lng)
    
    # Min scenario: document category, lowest fee tier
    min_base = calculate_base_price(distance_km, weight_kg, "document")
    min_fee = min_base * 0.10  # Assume 10% for estimate
    min_price = round(min_base + min_fee, 2)
    
    # Max scenario: extra_large category, highest fee tier
    max_base = calculate_base_price(distance_km, weight_kg, "extra_large")
    max_fee = max_base * 0.18  # Assume 18% for estimate
    max_price = round(max_base + max_fee, 2)
    
    # Average estimate
    avg_price = round((min_price + max_price) / 2, 2)
    
    return {
        "estimated_min": min_price,
        "estimated_max": max_price,
        "estimated_avg": avg_price,
        "distance_km": round(distance_km, 1),
        "currency": "BRL",
        "disclaimer": "Este é apenas uma estimativa. O preço final será calculado na criação do envio."
    }


# ============================================================
# ADMIN FUNCTIONS
# ============================================================

async def update_platform_fee_config(tiers: list) -> bool:
    """
    Admin function to update platform fee tiers.
    Changes only affect NEW shipments.
    
    Args:
        tiers: List of {"min": float, "max": float, "percentage": float}
    """
    try:
        await config_collection.update_one(
            {"key": "platform_fee_tiers"},
            {
                "$set": {
                    "key": "platform_fee_tiers",
                    "tiers": tiers,
                    "updated_at": datetime.now(timezone.utc)
                }
            },
            upsert=True
        )
        logger.info(f"Platform fee tiers updated: {tiers}")
        return True
    except Exception as e:
        logger.error(f"Failed to update fee config: {e}")
        return False


async def get_current_fee_config() -> Dict[str, Any]:
    """Get current platform fee configuration for admin display."""
    tiers = await get_admin_fee_config()
    config = await config_collection.find_one({"key": "platform_fee_tiers"})
    
    return {
        "tiers": tiers,
        "updated_at": config.get("updated_at") if config else None,
        "is_default": config is None
    }
