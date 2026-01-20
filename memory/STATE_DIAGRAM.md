# Levva - Diagrama de Estados e Regras de Negócio

## 1. DIAGRAMA DE ESTADOS

### 1.1 Shipment (Envio)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           ESTADOS ATIVOS                                 │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────┐    match    ┌──────────┐   pagamento   ┌────────────┐    │
│  │PUBLISHED │ ──────────► │ MATCHED  │ ────────────► │ IN_TRANSIT │    │
│  │          │             │          │               │            │    │
│  └────┬─────┘             └────┬─────┘               └─────┬──────┘    │
│       │                        │                           │           │
│       │ cancelar               │ cancelar                  │ entregar  │
│       │ (livre)                │ (com motivo)              │           │
│       ▼                        ▼                           ▼           │
└───────┼────────────────────────┼───────────────────────────┼───────────┘
        │                        │                           │
        ▼                        ▼                           ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           HISTÓRICO                                      │
├─────────────────────────────────────────────────────────────────────────┤
│  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────┐            │
│  │ DELIVERED │  │ CANCELLED │  │  EXPIRED  │  │ DISPUTED  │            │
│  │    ✓      │  │     ✗     │  │     ⏰    │  │     ⚠     │            │
│  └───────────┘  └───────────┘  └───────────┘  └───────────┘            │
│                                                                          │
│  ► Somente leitura                                                       │
│  ► Sem ações permitidas                                                  │
└─────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Trip (Viagem)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           ESTADOS ATIVOS                                 │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────┐   matches   ┌─────────────┐  iniciar  ┌─────────────┐    │
│  │PUBLISHED │ ──────────► │   MATCHED   │ ────────► │ IN_PROGRESS │    │
│  │          │             │ (com envios)│           │             │    │
│  └────┬─────┘             └──────┬──────┘           └──────┬──────┘    │
│       │                          │                         │           │
│       │ cancelar                 │ cancelar                │ completar │
│       │ (livre)                  │ (com motivo)            │           │
│       ▼                          ▼                         ▼           │
└───────┼──────────────────────────┼─────────────────────────┼───────────┘
        │                          │                         │
        ▼                          ▼                         ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           HISTÓRICO                                      │
├─────────────────────────────────────────────────────────────────────────┤
│  ┌───────────┐  ┌───────────┐  ┌───────────┐                           │
│  │ COMPLETED │  │ CANCELLED │  │  EXPIRED  │                           │
│  │    ✓      │  │     ✗     │  │     ⏰    │                           │
│  └───────────┘  └───────────┘  └───────────┘                           │
└─────────────────────────────────────────────────────────────────────────┘
```

### 1.3 Match (Combinação)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           ESTADOS ATIVOS                                 │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─────────────────┐  pagar   ┌──────┐  coletar  ┌───────────┐         │
│  │ PENDING_PAYMENT │ ───────► │ PAID │ ────────► │ IN_TRANSIT│         │
│  │    (48h TTL)    │          │      │           │           │         │
│  └────────┬────────┘          └──┬───┘           └─────┬─────┘         │
│           │                      │                     │               │
│           │ expirar              │ disputa             │ entregar      │
│           │ (auto)               │                     │               │
│           ▼                      ▼                     ▼               │
└───────────┼──────────────────────┼─────────────────────┼───────────────┘
            │                      │                     │
            ▼                      ▼                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           HISTÓRICO                                      │
├─────────────────────────────────────────────────────────────────────────┤
│  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────┐            │
│  │ DELIVERED │  │ CANCELLED │  │  EXPIRED  │  │ DISPUTED  │            │
│  │    ✓      │  │     ✗     │  │     ⏰    │  │     ⚠     │            │
│  └───────────┘  └───────────┘  └───────────┘  └───────────┘            │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 2. REGRAS DE CANCELAMENTO POR STATUS

### 2.1 Shipment

| Status Atual | Pode Cancelar? | Regra | Impacto Reputação |
|--------------|----------------|-------|-------------------|
| PUBLISHED | ✅ SIM | Livre, sem motivo | Neutro |
| MATCHED (sem pag.) | ✅ SIM | Com motivo obrigatório | Neutro (registrado) |
| MATCHED (aguard. pag.) | ❌ NÃO | Expira automaticamente em 48h | Neutro |
| IN_TRANSIT | ❌ NÃO | Apenas via disputa/suporte | N/A |
| DELIVERED | ❌ NÃO | Estado final | N/A |

### 2.2 Trip

| Status Atual | Pode Cancelar? | Regra | Impacto Reputação |
|--------------|----------------|-------|-------------------|
| PUBLISHED | ✅ SIM | Livre, sem motivo | Neutro |
| MATCHED (sem pag.) | ✅ SIM | Com motivo obrigatório | Neutro (registrado) |
| MATCHED (com pag.) | ❌ NÃO | Apenas via disputa/suporte | Negativo |
| IN_PROGRESS | ❌ NÃO | Apenas via disputa/suporte | N/A |
| COMPLETED | ❌ NÃO | Estado final | N/A |

### 2.3 Match

| Status Atual | Pode Cancelar? | Quem? | Regra |
|--------------|----------------|-------|-------|
| PENDING_PAYMENT | ✅ Expira | Sistema | Auto após 48h |
| PAID | ❌ NÃO | - | Via disputa apenas |
| IN_TRANSIT | ❌ NÃO | - | Via disputa apenas |
| DELIVERED | ❌ NÃO | - | Estado final |

---

## 3. TIMEOUTS E EXPIRAÇÃO

| Entidade | Estado | Timeout | Ação Automática |
|----------|--------|---------|-----------------|
| Match | PENDING_PAYMENT | 48 horas | → EXPIRED |
| Trip | PUBLISHED (sem match) | 24h após data viagem | → EXPIRED |
| Shipment | PUBLISHED | 30 dias | → EXPIRED |
| Payment | DELIVERED_BY_TRANSPORTER | 7 dias | → AUTO_CONFIRMED |

---

## 4. REPUTAÇÃO (MVP)

### 4.1 Eventos Positivos
- Entrega concluída: +1 ponto
- Avaliação 5 estrelas: +0.5 ponto
- Avaliação 4 estrelas: +0.25 ponto

### 4.2 Eventos Negativos
- Cancelamento após pagamento: -2 pontos
- Disputa perdida: -3 pontos
- Avaliação 1-2 estrelas: -0.5 ponto

### 4.3 Eventos Neutros (Registrados)
- Cancelamento antes do pagamento
- Expiração automática
- Avaliação 3 estrelas

---

## 5. HISTÓRICO

### 5.1 Estados que vão para Histórico

**Shipment:**
- DELIVERED
- CANCELLED
- CANCELLED_BY_SENDER
- CANCELLED_BY_CARRIER
- EXPIRED

**Trip:**
- COMPLETED
- CANCELLED
- CANCELLED_BY_CARRIER
- EXPIRED

**Match:**
- DELIVERED
- CANCELLED
- EXPIRED
- DISPUTED (resolvido)

### 5.2 Comportamento do Histórico
- Somente leitura
- Sem botões de ação
- Ordenado por data (mais recente primeiro)
- Filtros: Todos | Concluídos | Cancelados | Expirados

---

## 6. SUGESTÕES INTELIGENTES - REGRAS UX

### 6.1 Criar Viagem
- **Data**: OBRIGATÓRIA
- **Horário**: Aproximado (manhã/tarde/noite ou hora específica)
- **Validação**: Data não pode ser no passado

### 6.2 Criar Envio
- **Data**: OPCIONAL
- **Flexibilidade**: "Qualquer data" ou "Até [data]"
- **Padrão**: Flexível (próximos 7 dias)

### 6.3 Explicabilidade das Sugestões
Cada sugestão deve mostrar:
- Motivo do match (rota compatível)
- Score de compatibilidade (Excelente/Bom/Regular)
- Desvio da rota (se aplicável)
- Ganho estimado (para carrier)
