# Levva Pricing Architecture - Technical Report

## Overview

This document describes the unified pricing architecture implemented for the Levva platform.
The architecture ensures **consistent pricing** with **no divergence** between creation, listing, match, or payment.

---

## RULE #1 – Single Source of Truth

**Location**: `/app/backend/services/unified_pricing_service.py`

All pricing logic lives in ONE file. No other file calculates or recomputes prices.

### Key Functions:
- `calculate_final_price()` - Called at shipment creation, returns immutable price
- `estimate_price_range()` - Called for UI display, returns non-binding estimate
- `calculate_base_price()` - Pure function for base price calculation
- `get_platform_fee_percentage()` - Gets fee % from admin config or defaults

---

## RULE #2 – Two Phase Pricing

### PHASE A – ESTIMATE (UX only)

**Endpoint**: `POST /api/pricing/estimate`

```json
// Request
{
  "origin_lat": -23.5505,
  "origin_lng": -46.6333,
  "dest_lat": -22.9068,
  "dest_lng": -43.1729,
  "weight_kg": 5
}

// Response
{
  "estimated_min": 44.02,
  "estimated_max": 151.12,
  "estimated_avg": 97.57,
  "distance_km": 360.7,
  "currency": "BRL",
  "disclaimer": "Este é apenas uma estimativa. O preço final será calculado na criação do envio."
}
```

- Shows possible range before user finalizes details
- NOT binding - actual price calculated at creation
- Frontend displays: "R$ X - R$ Y (estimativa)"

### PHASE B – FINAL PRICE (Creation)

**When**: Shipment is created via `POST /api/shipments`

**What happens**:
1. Backend calls `calculate_final_price()`
2. Price breakdown is calculated using current admin fee config
3. Full breakdown is stored in `shipment.price`:

```json
{
  "price": {
    "base_price": 80.04,           // Carrier earnings
    "platform_fee": 12.01,          // Platform commission
    "platform_fee_percentage": 15.0,
    "final_price": 92.05,           // Sender pays
    "distance_km": 360.7,
    "weight_kg": 5.0,
    "category": "electronics",
    "currency": "BRL",
    "calculated_at": "2026-01-20T19:47:00Z"
  }
}
```

**After creation**:
- Price is **IMMUTABLE**
- All screens use `shipment.price.final_price`
- Match creation uses persisted price (no recalculation)
- Payment uses persisted price

---

## RULE #3 – Admin Configuration

**Storage**: `config_collection` in MongoDB

**Key**: `platform_fee_tiers`

**Default tiers**:
```json
[
  {"min": 0, "max": 50, "percentage": 18},
  {"min": 50, "max": 200, "percentage": 15},
  {"min": 200, "max": 500, "percentage": 13},
  {"min": 500, "max": 999999, "percentage": 10}
]
```

**Admin endpoints**:
- `GET /api/pricing/admin/config` - View current config
- `PUT /api/pricing/admin/config` - Update tiers
- `POST /api/pricing/admin/reset-defaults` - Reset to defaults

**Important**: Changes only affect NEW shipments. Existing shipments keep their original pricing.

---

## RULE #4 – Match & Payment

When a match is created (`POST /api/matches`):

1. System checks if `shipment.price` exists
2. **If exists**: Uses persisted price (new architecture)
3. **If not**: Falls back to legacy calculation (for old shipments)

```python
# In /app/backend/routers/matches.py
shipment_price = shipment.get("price")

if shipment_price:
    # Use persisted price (new unified pricing architecture)
    total_price = shipment_price.get("final_price")
    carrier_earnings = shipment_price.get("base_price")
    platform_commission = shipment_price.get("platform_fee")
else:
    # Legacy calculation for old shipments
    ...
```

**Payment amounts**:
- Sender pays: `shipment.price.final_price`
- Carrier receives: `shipment.price.base_price`
- Platform keeps: `shipment.price.platform_fee`

---

## Pricing Formula

```
1. DISTANCE PRICE (progressive tiers):
   - 0-50km:   R$5 base + R$0.30/km
   - 50-200km: R$20 base + R$0.20/km (above 50)
   - 200-500km: R$50 base + R$0.15/km (above 200)
   - 500+km:   R$95 base + R$0.10/km (above 500)

2. WEIGHT MULTIPLIER:
   1 + (weight_kg - 1) * 0.02  (+2% per kg above 1kg)

3. CATEGORY MULTIPLIER:
   - document: 0.5
   - small: 0.8
   - medium: 1.0
   - large: 1.3
   - extra_large: 1.6
   - electronics/clothing/food/gifts/other: 0.9-1.0

4. BASE PRICE:
   MAX(R$8.00, distance_price * weight_mult * category_mult)

5. PLATFORM FEE:
   base_price * fee_percentage (from admin config)

6. FINAL PRICE:
   base_price + platform_fee
```

---

## Why Price Cannot Diverge

1. **Single calculation point**: Price only calculated in `unified_pricing_service.py`
2. **Persisted at creation**: Stored in `shipment.price`, never recalculated
3. **Match uses persisted**: `matches.py` reads from `shipment.price`
4. **Payment uses persisted**: Amount from `shipment.price.final_price`
5. **Frontend only displays**: Never calculates, only shows persisted or estimate

---

## Files Changed

| File | Change |
|------|--------|
| `/app/backend/services/unified_pricing_service.py` | NEW - Single source of truth |
| `/app/backend/routers/pricing.py` | NEW - Pricing endpoints |
| `/app/backend/routers/__init__.py` | Added pricing router |
| `/app/backend/routers/shipments.py` | Calculates and persists price on creation |
| `/app/backend/routers/matches.py` | Uses persisted price from shipment |
| `/app/backend/models.py` | Added `PriceBreakdown` model |
| `/app/backend/database.py` | Added `config_collection` |
| `/app/frontend/src/components/IntelligentPricing.js` | Uses `/api/pricing/estimate` |

---

## Verification

### Backend Test
```bash
# Price estimate (SP -> RJ, 5kg)
curl -X POST "$API/api/pricing/estimate" -H "Content-Type: application/json" \
  -d '{"origin_lat": -23.5505, "origin_lng": -46.6333, "dest_lat": -22.9068, "dest_lng": -43.1729, "weight_kg": 5}'

# Response: {"estimated_min":44.02,"estimated_max":151.12,"estimated_avg":97.57,"distance_km":360.7,...}
```

### Shipment Creation
```bash
# Create shipment - price is calculated and persisted
POST /api/shipments

# Response includes:
{
  "id": "696fdbc0e4acf5f57a2174e5",
  "price": {
    "base_price": 80.04,
    "platform_fee": 12.01,
    "platform_fee_percentage": 15.0,
    "final_price": 92.05,
    ...
  }
}
```

### UI Verification
- Navigate to `/criar-envio`
- Enter pickup/dropoff locations
- Enter weight
- See: "Estimativa de Preço: R$ X - R$ Y"
- See disclaimer: "O preço final será calculado na criação do envio"

---

## Migration Notes

- **Old shipments**: Will continue to work via legacy calculation in `matches.py`
- **New shipments**: Automatically have `price` field populated
- **Gradual migration**: As old shipments expire/complete, all will use new architecture
- **No breaking changes**: Frontend and existing flows continue to work
