# Levva - Plataforma de Logística de Frete

## Status: PRODUCT ENGINEERING COMPLETE ✅

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
- **Sender**: test_sender_payment@test.com / testpassword123
- **Carrier**: test_carrier_payment@test.com / testpassword123

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
