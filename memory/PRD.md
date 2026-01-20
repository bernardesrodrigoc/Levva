# Levva - Plataforma de Logística de Frete

## Original Problem Statement
Plataforma de logística para conectar remetentes (senders) com transportadores (carriers) para entrega de pacotes. O sistema permite:
- Remetentes: criar envios, encontrar viagens compatíveis, pagar por entregas
- Transportadores: criar viagens, encontrar pacotes para transportar, receber pagamentos
- Admin: gerenciar usuários, verificações, disputas e payouts

## Current Phase: PRODUCT VALIDATION ✅

## What's Been Implemented (January 2026)

### P0 Issues - ALL FIXED ✅

#### Issue 1: Reactive Pricing ✅
- **Root Cause**: `useCallback` + `useEffect` separados não detectavam mudanças corretamente
- **Fix**: Consolidado em único `useEffect` com cleanup e `AbortController`
- **Files Changed**: 
  - `/app/frontend/src/components/IntelligentPricing.js`
  - `/app/backend/routers/intelligence.py`
- **Test Result**: 5kg=R$86.45, 20kg=R$143.59 (SP-RJ) - preço atualiza LIVE

#### Issue 2: Match Cancellation ✅
- Backend endpoint `/api/trips/{trip_id}/cancel` funcionando
- Frontend com diálogos de cancelamento e motivo
- Status atualizado corretamente

#### Issue 3: Payment Flow (Escrow) ✅
- **Backend Endpoints**:
  - `POST /api/payments/{match_id}/mark-delivered` - Transportador marca entrega
  - `POST /api/payments/{match_id}/confirm-delivery` - Sender confirma recebimento
  - `POST /api/payments/{match_id}/open-dispute` - Sender abre disputa
  - `GET /api/payments/{match_id}/delivery-status` - Status com countdown
- **Frontend** (`MatchDetailPage.js`):
  - Botão "Marcar como Entregue" para transportador
  - Botões "Confirmar Recebimento" e "Abrir Disputa" para sender
  - Countdown de auto-confirmação (7 dias)
- **Bug Fix**: Timezone-aware datetime comparison in delivery-status

### Core Features Implemented
- User authentication (JWT)
- Trip creation with geospatial data
- Shipment creation with intelligent pricing
- Matching engine (geospatial + route corridor)
- Vehicle management with intelligent suggestions
- Real-time chat between users
- GPS tracking for deliveries
- Admin dashboard (users, verifications, disputes, payouts)
- Payment escrow flow (MercadoPago - mocked)

## Architecture

```
/app/
├── backend/
│   ├── routers/
│   │   ├── admin.py       - Admin endpoints
│   │   ├── auth.py        - Authentication
│   │   ├── intelligence.py - Pricing & suggestions
│   │   ├── matches.py     - Match management
│   │   ├── payments.py    - Payment & escrow flow
│   │   ├── shipments.py   - Shipment CRUD
│   │   ├── trips.py       - Trip CRUD & cancellation
│   │   └── vehicles.py    - Vehicle management
│   ├── services/
│   │   ├── auto_confirmation_service.py
│   │   ├── pricing_service.py
│   │   ├── suggestions_service.py
│   │   └── vehicle_intelligence_service.py
│   └── server.py
└── frontend/
    └── src/
        ├── components/
        │   ├── IntelligentPricing.js  # Fixed reactive pricing
        │   ├── MatchingTrips.js
        │   └── ChatBox.js
        ├── pages/
        │   ├── AdminDashboard.js
        │   ├── CreateShipmentPage.js
        │   ├── MatchDetailPage.js     # Updated with payment flow
        │   ├── ProfilePage.js
        │   ├── TripDetailsPage.js
        │   └── VehiclesPage.js
        └── context/AuthContext.js
```

## Database Schema (MongoDB)
- **users**: Authentication, profiles, pix_key for payouts
- **trips**: Transporter journeys with route, capacity, dates
- **shipments**: Sender packages with dimensions, weight, route
- **matches**: Trip-Shipment connections with status
- **payments**: Payment records with escrow status
- **vehicles**: Transporter vehicle registry
- **messages**: Chat messages between users

## Key API Endpoints
- `POST /api/intelligence/pricing/calculate` - Calculate shipment price
- `POST /api/payments/{match_id}/mark-delivered` - Transporter marks delivery
- `POST /api/payments/{match_id}/confirm-delivery` - Sender confirms receipt
- `POST /api/trips/{trip_id}/cancel` - Cancel trip with reason
- `GET /api/admin/payouts/ready` - Admin: view ready payouts

## Test Credentials
- **Admin**: admin@levva.com / adminpassword
- **Test Carrier**: test_carrier_payment@test.com / testpassword123
- **Test Sender**: test_sender_payment@test.com / testpassword123

## Mocked APIs
- **MercadoPago**: Payment initiation - checkout_url not generated
- **Resend**: Email notifications - logged but not sent

## Prioritized Backlog

### P1 - Next Tasks
- [ ] Verify Intelligent Suggestions in UI
- [ ] Verify "View Trip Details" navigation
- [ ] Verify pricing consistency (transporter vs sender)
- [ ] Fix chat timestamps

### P2 - Future
- [ ] Full Email Notification Integration (Resend)
- [ ] Backend filtering for browse pages
- [ ] Admin dashboard for flagged vehicles
- [ ] Mobile-responsive improvements

### P3 - Enhancements
- [ ] Push notifications
- [ ] Advanced search/filters
- [ ] Analytics dashboard
- [ ] Multi-language support
