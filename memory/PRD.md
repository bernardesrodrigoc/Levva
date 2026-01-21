# Levva - Plataforma de Logística de Frete

## Status: P0 MERCADO PAGO REAL INTEGRATION COMPLETE ✅

### P0 Mercado Pago Integration (January 21, 2026)

#### Integração REAL com Mercado Pago ✅
- **SDK**: mercadopago v2.3.0 (oficial)
- **Credenciais**: ACCESS_TOKEN e PUBLIC_KEY configurados em .env
- **Checkout**: URLs reais geradas para pagamento (PIX/Cartão)

#### Fluxo de Pagamento Completo:
1. ✅ **Initiate Payment** → Cria preferência no MP → Retorna `checkout_url`
2. ✅ **Webhook** → Recebe notificações de status (approved/pending/rejected/refunded)
3. ✅ **Status Update** → Atualiza payment e match no MongoDB
4. ✅ **Financial Record** → Registra em `financial_events` para auditoria

#### Endpoints de Pagamento:
- `POST /api/payments/initiate` - Cria preferência e retorna checkout_url
- `POST /api/payments/webhook/mercadopago` - Webhook real do MP
- `GET /api/payments/{match_id}/status` - Status do pagamento
- `GET /api/payments/{match_id}/refresh-status` - Força consulta na API do MP
- `POST /api/payments/{match_id}/refund` - Reembolso (admin only)
- `POST /api/payments/{match_id}/simulate-approved` - [DEV] Simular aprovação

#### Registro Financeiro Consistente:
- **Total Amount**: Valor total pago pelo sender
- **Platform Fee**: 15% de comissão (configurável)
- **Carrier Amount**: Valor líquido para o transportador
- **Mercado Pago Fee**: Taxa cobrada pelo gateway (registrada)

#### Arquitetura Provider Pattern:
```
/app/backend/providers/
├── base.py            # Interface abstrata PaymentProvider
├── mercado_pago.py    # IMPLEMENTAÇÃO REAL do Mercado Pago
└── mock_provider.py   # MockProvider para testes de payout
```

#### Status Mapping:
| MP Status | Internal Status | Match Status |
|-----------|-----------------|--------------|
| approved | paid_escrow | paid |
| pending | payment_pending | - |
| rejected | payment_pending | - |
| refunded | refunded | cancelled |
| charged_back | dispute_opened | disputed |

---

### P3 Hybrid Payout System Complete ✅

#### Sistema Semi-Automático de Payouts
- **Payout Registration**: Automático ao confirmar entrega
- **Execution**: Manual pelo admin (botão "Executar Payouts do Dia")
- **Audit Trail**: Cada ação registrada no `audit_log` do payout

#### Endpoints de Payout:
- `POST /api/admin/payouts/execute-daily` - Executa batch de payouts
- `GET /api/admin/payouts/pending` - Lista payouts elegíveis
- `GET /api/admin/finance/summary` - Métricas financeiras
- `GET /api/users/me/balance` - Saldo do transportador

---

### P0 Stabilization Completed (January 20, 2026)

#### 1. Geolocalização ✅ CORRIGIDO
- **Problema**: Botão "Usar localização atual" falhava silenciosamente
- **Solução**: Mensagens de erro claras para cada tipo de falha (permissão, GPS, timeout)
- **Evidência**: Mensagem em vermelho quando permissão negada

#### 2. Filtragem de Status ✅ CORRIGIDO  
- **Problema**: Admin stats contava todos os matches (incluindo cancelados)
- **Solução**: Endpoint `/api/admin/stats` agora usa `get_active_statuses()`
- **Evidência**: "Matches Ativos: 4 de 16 total"

#### 3. Histórico Global ✅ IMPLEMENTADO
- **Endpoints**: `/api/admin/history/global`, `/api/admin/history/summary`
- **UI**: Aba "Histórico Global" no Admin Dashboard
- **Breakdown**: Por status (cancelled_by_carrier, expired, delivered, etc.)

#### 4. Cancelamento como Evento ✅ VERIFICADO
- Cancela → Remove de telas ativas → Move para histórico → Atualiza métricas

---

### P1 Payment Flow Completed (January 20, 2026)

#### Fluxo Completo Testado:
1. ✅ Criar Envio (preço imutável)
2. ✅ Criar Viagem compatível
3. ✅ Criar Match (status: pending_payment)
4. ✅ Iniciar Pagamento
5. ✅ Simular Pagamento Aprovado (escrow)
6. ✅ Marcar como Entregue (Carrier)
7. ✅ Confirmar Entrega (Sender)

---

### P2 Financial Features Completed (January 20, 2026)

#### 1. Cadastro de Pix ✅
- **Endpoint**: `POST /api/users/payout-method`
- **Tipos**: CPF, CNPJ, email, telefone, aleatório
- **Auto-desbloqueio**: Payouts bloqueados são liberados ao cadastrar Pix

#### 2. Fluxo de Payout ✅
- **Estados**: payout_blocked → payout_ready → payout_completed
- **Bloqueio**: Sem Pix = payout_blocked_no_payout_method
- **Admin**: Pode marcar payout como concluído

#### 3. Disputa ✅
- **Endpoint**: `POST /api/payments/{match_id}/open-dispute`
- **Sender** pode abrir disputa se não confirmar entrega
- **Admin** visualiza todas as disputas

#### 4. Retenção (Escrow) ✅
- Pagamento fica retido até confirmação
- **Prazo**: 7 dias para auto-confirmação
- **Admin** visualiza valores em escrow

#### 5. Liberação Automática ✅
- **Serviço**: `auto_confirmation_service.py`
- **Endpoint Manual**: `POST /api/admin/payouts/run-auto-confirm`
- Após 7 dias sem ação do sender, confirma automaticamente

#### 6. Histórico Financeiro Admin ✅
- **Endpoints**:
  - `GET /api/admin/finance/summary` - Totais
  - `GET /api/admin/finance/history` - Transações
  - `GET /api/admin/finance/escrow` - Valores retidos
- **UI**: Tab "Financeiro" no Admin Dashboard

#### Métricas Financeiras:
- Volume Total: R$ 1.115,04
- Receita Plataforma: R$ 100,42
- Em Escrow: R$ 756,65
- Pendente Carriers: R$ 541,15

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
