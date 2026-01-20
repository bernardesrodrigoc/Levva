# Levva - Plataforma de Logística de Frete

## Original Problem Statement
Plataforma de logística para conectar remetentes (senders) com transportadores (carriers) para entrega de pacotes.

## Current Phase: UNIFIED PRICING IMPLEMENTATION ✅

## What's Been Implemented (January 2026)

### Unified Pricing Architecture ✅
- **Single Source of Truth**: All pricing in `/app/backend/services/unified_pricing_service.py`
- **Two Phase Pricing**:
  - Phase A: Estimate for UI (`POST /api/pricing/estimate`) - NON-BINDING
  - Phase B: Final price at creation (`shipment.price`) - IMMUTABLE
- **Admin Control**: Fee tiers configurable via `/api/pricing/admin/config`
- **No Divergence**: Match & payment use persisted price, never recalculate

### P0 Issues - ALL FIXED ✅
1. **Reactive Pricing** - FIXED (price updates LIVE in UI)
2. **Match Cancellation** - WORKING
3. **Payment Flow** - IMPLEMENTED (mark-delivered, confirm-delivery, disputes)

### Core Features
- User authentication (JWT)
- Trip & Shipment creation with geospatial data
- Intelligent matching engine
- Vehicle management with suggestions
- Real-time chat & GPS tracking
- Admin dashboard (users, verifications, payouts)
- Payment escrow flow (MercadoPago)

## Architecture

```
/app/
├── backend/
│   ├── routers/
│   │   ├── pricing.py         # NEW - Unified pricing endpoints
│   │   ├── shipments.py       # Updated - Persists price at creation
│   │   ├── matches.py         # Updated - Uses persisted price
│   │   └── ...
│   └── services/
│       ├── unified_pricing_service.py  # NEW - Single source of truth
│       └── ...
└── frontend/
    └── src/
        └── components/
            └── IntelligentPricing.js  # Updated - Uses /api/pricing/estimate
```

## Pricing Formula

```
BASE_PRICE = distance_price * weight_mult * category_mult
           (minimum R$8.00)

PLATFORM_FEE = BASE_PRICE * fee_percentage (10-18%)

FINAL_PRICE = BASE_PRICE + PLATFORM_FEE
```

## Key API Endpoints
- `POST /api/pricing/estimate` - Get price estimate (UX only)
- `POST /api/shipments` - Create shipment with persisted price
- `GET /api/pricing/admin/config` - View fee configuration
- `PUT /api/pricing/admin/config` - Update fee tiers

## Test Credentials
- **Admin**: admin@levva.com / adminpassword
- **Test Sender**: test_sender_payment@test.com / testpassword123

## Documentation
- `/app/memory/PRICING_ARCHITECTURE.md` - Detailed pricing architecture

## Prioritized Backlog

### P1 - Next Tasks
- [ ] Test complete E2E flow: create shipment → match → payment → delivery
- [ ] Verify intelligent suggestions in UI
- [ ] Fix any remaining navigation bugs

### P2 - Future
- [ ] Full email notifications (Resend)
- [ ] Mobile-responsive improvements
- [ ] Analytics dashboard
