"""
Unified Pricing Router - SINGLE API FOR ALL PRICING
===================================================

Two endpoints only:
1. POST /api/pricing/estimate - For UI display (non-binding)
2. Internal function for shipment creation (binding)

Frontend should NEVER calculate prices.
All displayed prices come from:
- /api/pricing/estimate for pre-creation
- shipment.price for post-creation (persisted, immutable)
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from datetime import datetime

from auth import get_current_user_id
from core.dependencies import get_current_admin_user
from services.unified_pricing_service import (
    estimate_price_range,
    calculate_final_price,
    get_current_fee_config,
    update_platform_fee_config,
    DEFAULT_PLATFORM_FEE_TIERS
)

router = APIRouter()


# ============================================================
# REQUEST/RESPONSE MODELS
# ============================================================

class PriceEstimateRequest(BaseModel):
    """Request for price estimate (Phase A - UX only)."""
    origin_lat: float
    origin_lng: float
    dest_lat: float
    dest_lng: float
    weight_kg: float = 1.0


class PriceEstimateResponse(BaseModel):
    """Non-binding price estimate for UI display."""
    estimated_min: float
    estimated_max: float
    estimated_avg: float
    distance_km: float
    currency: str
    disclaimer: str


class FeeConfigRequest(BaseModel):
    """Admin request to update fee tiers."""
    tiers: list  # [{"min": 0, "max": 50, "percentage": 18}, ...]


# ============================================================
# PUBLIC ENDPOINTS
# ============================================================

@router.post("/estimate", response_model=PriceEstimateResponse)
async def get_price_estimate(request: PriceEstimateRequest):
    """
    Get price estimate for UI display.
    
    This is Phase A of pricing - for UX only.
    Shows possible range before user finalizes details.
    
    IMPORTANT:
    - This estimate is NOT binding
    - Actual price is calculated at shipment creation
    - Frontend should display this as "Estimativa: R$X - R$Y"
    """
    estimate = estimate_price_range(
        origin_lat=request.origin_lat,
        origin_lng=request.origin_lng,
        dest_lat=request.dest_lat,
        dest_lng=request.dest_lng,
        weight_kg=request.weight_kg
    )
    
    return estimate


@router.get("/estimate")
async def get_price_estimate_get(
    origin_lat: float,
    origin_lng: float,
    dest_lat: float,
    dest_lng: float,
    weight_kg: float = 1.0
):
    """
    GET version of price estimate for simple UI integrations.
    Same as POST /estimate but with query parameters.
    """
    estimate = estimate_price_range(
        origin_lat=origin_lat,
        origin_lng=origin_lng,
        dest_lat=dest_lat,
        dest_lng=dest_lng,
        weight_kg=weight_kg
    )
    
    return estimate


# ============================================================
# ADMIN ENDPOINTS
# ============================================================

@router.get("/admin/config")
async def get_fee_configuration(user: dict = Depends(get_current_admin_user)):
    """
    Admin: Get current platform fee configuration.
    
    Returns:
    - Current fee tiers
    - When last updated
    - Whether using defaults
    """
    return await get_current_fee_config()


@router.put("/admin/config")
async def update_fee_configuration(
    config: FeeConfigRequest,
    user: dict = Depends(get_current_admin_user)
):
    """
    Admin: Update platform fee tiers.
    
    Changes ONLY affect NEW shipments.
    Existing shipments keep their original pricing.
    
    Example tiers:
    [
        {"min": 0, "max": 50, "percentage": 18},
        {"min": 50, "max": 200, "percentage": 15},
        {"min": 200, "max": 500, "percentage": 13},
        {"min": 500, "max": 999999, "percentage": 10}
    ]
    """
    # Validate tiers
    for tier in config.tiers:
        if "min" not in tier or "max" not in tier or "percentage" not in tier:
            raise HTTPException(
                status_code=400,
                detail="Each tier must have: min, max, percentage"
            )
        if not (0 <= tier["percentage"] <= 100):
            raise HTTPException(
                status_code=400,
                detail="Percentage must be between 0 and 100"
            )
    
    success = await update_platform_fee_config(config.tiers)
    
    if not success:
        raise HTTPException(status_code=500, detail="Failed to update configuration")
    
    return {
        "message": "Fee configuration updated successfully",
        "note": "Changes only affect new shipments",
        "tiers": config.tiers
    }


@router.post("/admin/reset-defaults")
async def reset_fee_defaults(user: dict = Depends(get_current_admin_user)):
    """Admin: Reset fee tiers to platform defaults."""
    success = await update_platform_fee_config(DEFAULT_PLATFORM_FEE_TIERS)
    
    if not success:
        raise HTTPException(status_code=500, detail="Failed to reset configuration")
    
    return {
        "message": "Fee configuration reset to defaults",
        "tiers": DEFAULT_PLATFORM_FEE_TIERS
    }
