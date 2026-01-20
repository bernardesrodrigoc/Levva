# Levva - Plataforma de Logística de Frete

## Status: CORE STABILIZATION COMPLETE ✅

### P0 Stabilization Completed (January 20, 2026)

#### 1. Geolocalização ✅ CORRIGIDO
- **Problema**: Botão "Usar localização atual" falhava silenciosamente
- **Solução**: Mensagens de erro claras para cada tipo de falha (permissão, GPS, timeout)
- **Evidência**: Mensagem em vermelho quando permissão negada

#### 2. Filtragem de Status ✅ CORRIGIDO  
- **Problema**: Admin stats contava todos os matches (incluindo cancelados)
- **Solução**: Endpoint `/api/admin/stats` agora usa `get_active_statuses()`
- **Evidência**: "Matches Ativos: 4 de 13 total"

#### 3. Histórico Global ✅ IMPLEMENTADO
- **Endpoints**: `/api/admin/history/global`, `/api/admin/history/summary`
- **UI**: Aba "Histórico Global" no Admin Dashboard
- **Breakdown**: Por status (cancelled_by_carrier, expired, delivered, etc.)

#### 4. Cancelamento como Evento ✅ VERIFICADO
- Cancela → Remove de telas ativas → Move para histórico → Atualiza métricas

### Checklist de Validação (TODOS PASSARAM)
- ✅ Criar viagem
- ✅ Criar envio  
- ✅ Cancelar viagem → some das telas ativas
- ✅ Cancelar envio → some das telas ativas
- ✅ Admin consegue ver tudo
- ✅ Localização atual funciona (com feedback de erro)

---

## Implemented Features (January 20, 2026)

### 1. HISTÓRICO (Conceito Obrigatório) ✅
- **Nenhuma entidade é apagada** - Tudo vai para histórico
- **Aba "Histórico"** em Meus Envios e Minhas Viagens
- **Estados no histórico**: delivered, cancelled, expired
- **Somente leitura** - sem ações

### 2. CANCELAMENTO BASEADO EM STATUS ✅
- **Sem match**: Cancelamento livre
- **Match sem pagamento**: Requer motivo obrigatório
- **Aguardando pagamento**: Não cancela (expira automaticamente)
- **Pago**: Apenas via disputa

Endpoints implementados:
- `GET /api/shipments/{id}/can-cancel` - Verifica regras
- `POST /api/shipments/{id}/cancel` - Executa cancelamento

### 3. EXPIRAÇÃO AUTOMÁTICA ✅
- **Match pending_payment**: 48h → expired
- **Trip após departure_date**: 24h → expired
- **Shipment published**: 30 dias → expired

Serviço: `/app/backend/services/expiration_service.py`
Admin trigger: `POST /api/admin/run-expirations`

### 4. REPUTAÇÃO (MVP) ✅
- **Entrega concluída**: +1 ponto
- **Cancelamento após pagamento**: -2 pontos
- **Cancelamento antes do pagamento**: Neutro (registrado)
- **Expiração**: Neutro

Serviço: `/app/backend/services/reputation_service.py`

### 5. UX - SUGESTÕES INTELIGENTES ✅
- Viagens: Data obrigatória
- Envios: Data flexível
- Sugestões explicáveis (score, desvio, ganho)

---

## State Diagram

Ver `/app/memory/STATE_DIAGRAM.md` para diagrama completo.

### Estados Ativos (Telas Principais)
- **Shipment**: draft, published, matched, in_transit
- **Trip**: draft, published, matched, in_progress
- **Match**: pending_payment, paid, in_transit

### Estados Histórico
- **Shipment**: delivered, cancelled, expired
- **Trip**: completed, cancelled, expired
- **Match**: delivered, cancelled, expired, disputed

---

## Allowed Actions by Status

### Shipment
| Status | Ações Permitidas |
|--------|------------------|
| PUBLISHED | edit, cancel, view_suggestions |
| MATCHED | view_match, cancel*, chat |
| IN_TRANSIT | track, chat, dispute |
| DELIVERED | rate, view_history |

*cancel com motivo obrigatório se tiver match

### Trip
| Status | Ações Permitidas |
|--------|------------------|
| PUBLISHED | edit, cancel, browse_shipments |
| MATCHED | view_matches, cancel*, start_trip |
| IN_PROGRESS | update_location, complete |
| COMPLETED | rate, view_history |

---

## Key Files

| File | Purpose |
|------|---------|
| `expiration_service.py` | Expiração automática |
| `reputation_service.py` | Sistema de reputação |
| `cancellation_rules_service.py` | Regras de cancelamento |
| `STATE_DIAGRAM.md` | Diagrama de estados |
| `MyShipmentsPage.js` | UI com tabs Ativos/Histórico |
| `MyTripsPage.js` | UI com tabs Ativos/Histórico |

---

## Test Credentials
- **Admin**: admin@levva.com / adminpassword
- **Sender E2E**: test_sender_e2e@levva.com / Test123!
- **Carrier E2E**: test_carrier_e2e@levva.com / Test123!
- **Sender Payment**: test_sender_payment@test.com / testpassword123
- **Carrier Payment**: test_carrier_payment@test.com / testpassword123

---

## Pending Tasks (Backlog)

### P1 - Email Notifications
- Configure Resend to send real emails for critical events
- Currently MOCKED to console logs

### P2 - Chat Timestamps
- Verify timezone display in chat messages

### P3 - Admin Flagged Vehicles
- Test the review flow for flagged vehicles

### P4 - Scheduled Jobs
- Move expiration and auto-confirmation from admin endpoints to cron jobs

### P5 - Enhanced Reputation
- Display user reputation score in UI
- More complex scoring logic

---

## API Endpoints

### Cancellation
- `GET /api/shipments/{id}/can-cancel` - Check rules
- `POST /api/shipments/{id}/cancel` - Execute with reason

### Admin
- `POST /api/admin/run-expirations` - Trigger expiration check
- `POST /api/admin/payouts/run-auto-confirm` - Auto-confirm deliveries

### History
- `GET /api/shipments/my-shipments` - Active only
- `GET /api/shipments/my-shipments/history` - History only
- `GET /api/trips/my-trips` - Active only
- `GET /api/trips/my-trips/history` - History only
