# Levva - Plataforma de Crowdshipping

## Problema Original
Construir uma plataforma web completa (web-first, responsiva para mobile e desktop) para frete colaborativo (crowdshipping) chamada "Levva". A plataforma conecta pessoas que já estão viajando (Transportadores) com pessoas que precisam enviar pequenos itens legais e de baixo risco (Remetentes).

## Requisitos do Produto
- **Idioma:** Português (Brasil)
- **Funções de Usuário:** Remetente, Transportador, Admin
- **Registro e Confiança:**
  - Verificação de email/telefone, foto de perfil
  - Verificação de identidade obrigatória (documento + selfie) para desbloquear funcionalidades
  - Transportadores precisam fazer upload da CNH
  - Níveis progressivos de confiança

## Stack Tecnológico
- **Backend:** FastAPI + MongoDB (motor async)
- **Frontend:** React + Tailwind CSS + Shadcn UI
- **Autenticação:** JWT
- **Mapas/Roteamento:** OpenStreetMap + Leaflet + OSRM
- **Pagamentos:** Mercado Pago
- **Storage:** Cloudflare R2

## O Que Foi Implementado

### Funcionalidades Core Concluídas:
1. **Sistema de Autenticação**
   - Registro de usuário com roles (sender, carrier, both, admin)
   - Login com JWT
   - Rotas protegidas

2. **Gerenciamento de Viagens e Envios**
   - Criar/listar viagens (transportadores)
   - Criar/listar envios (remetentes)
   - Filtros por origem/destino
   - **Seleção de coordenadas via mapa interativo (LocationPicker)**
   - **Geração de polyline via OSRM**

3. **Sistema de Matching Inteligente** ✅ CORRIGIDO (12/01/2026)
   - Página de sugestões inteligentes (/sugestoes)
   - Algoritmo de matching por corredor de rota
   - **Fallback por proximidade de coordenadas quando não há polyline**
   - Cálculo automático de score de match
   - Ranking por relevância

4. **Precificação Dinâmica** ✅ IMPLEMENTADO (12/01/2026)
   - Endpoint POST /api/trips/calculate-price
   - Preço sugerido baseado em distância
   - Faixas de preço por distância (curta, média, longa)
   - Exemplos de preço para diferentes pesos
   - Comissão da plataforma: 15%

5. **Rotas Recorrentes** ✅ IMPLEMENTADO (12/01/2026)
   - Campo recurrence no modelo Trip
   - UI para seleção de dias da semana
   - Data final opcional
   - Horário fixo

6. **Detalhes da Combinação**
   - Página completa com rota, valores, timeline
   - Confirmação de coleta/entrega com foto
   - Mapa com visualização da rota (Leaflet)

7. **Sistema de Chat**
   - Chat em tempo real entre transportador e remetente
   - Polling a cada 5 segundos
   - Mensagens com timestamp

8. **Verificação de Identidade**
   - Formulário multi-step para verificação
   - Upload de foto de perfil, documento (frente/verso), selfie, CNH
   - Upload real para Cloudflare R2 usando presigned URLs

9. **Painel Administrativo**
   - Dashboard com estatísticas
   - Lista de verificações pendentes
   - Aprovar/Rejeitar verificações
   - Sistema de disputas com resolução

10. **Sistema de Avaliações**
    - Avaliar transportador/remetente após entrega
    - Média de avaliação no perfil

11. **Níveis Progressivos de Confiança**
    - 5 níveis: Iniciante → Verificado → Confiável → Experiente → Elite
    - Limites de valor/peso por nível
    - Card de progresso no dashboard
    - Upgrade automático baseado em entregas e avaliação

12. **Pagamentos Mercado Pago**
    - Integração completa com checkout redirect
    - Webhook para confirmação de pagamento
    - Sistema de escrow

## Correções Aplicadas (12/01/2026)

### Bug Fix: Sugestões Inteligentes
- **Problema:** Query MongoDB buscava campo `available_capacity_kg` que não existia em documentos antigos
- **Solução:** Usar $or para verificar `available_capacity_kg` OU `cargo_space.max_weight_kg`
- **Melhoria:** Adicionado fallback por proximidade de coordenadas quando não há polyline

### Novo Feature: Precificação Dinâmica
- Endpoint `POST /api/trips/calculate-price`
- Faixas de preço:
  - ≤50km: base R$3,00 + R$0,02/km
  - 50-200km: base R$3,50 + R$0,015/km
  - 200-500km: base R$4,00 + R$0,01/km
  - >500km: base R$5,00 + R$0,008/km
- Máximo: R$12,00/kg

### Novo Feature: Rotas Recorrentes
- Campo `recurrence` no modelo `TripCreate`
- Opções: dias da semana, horário, data final (opcional)
- UI no frontend com toggle e seleção de dias

## Credenciais de Teste
- **Admin:** admin@levva.com / adminpassword
- **Usuário teste (carrier):** teste@levva.com / password123
- **Usuário teste (sender):** remetente_sp_1768238849@levva.com / teste123

## Arquivos Principais
```
/app/backend/
├── server.py         # Todas as rotas da API
├── models.py         # Modelos Pydantic (inclui RecurrencePattern)
├── database.py       # Conexão MongoDB
├── auth.py           # JWT e senhas
├── route_service.py  # OSRM routing, haversine, corridor matching
└── trust_service.py  # Níveis de confiança

/app/frontend/src/
├── pages/
│   ├── DashboardPage.js
│   ├── MatchDetailPage.js
│   ├── MatchSuggestionsPage.js  # Sugestões inteligentes
│   ├── CreateTripPage.js        # Inclui recorrência e precificação
│   ├── CreateShipmentPage.js
│   ├── AdminDashboard.js
│   └── VerificationPage.js
├── components/
│   ├── LocationPicker.js       # Seletor de coordenadas via mapa
│   ├── RouteMap.js             # Visualização de rota
│   ├── TrustLevelCard.js       # Card de nível de confiança
│   └── ChatBox.js
└── context/
    └── AuthContext.js
```

## Status dos Testes
- **Iteration 1:** Backend 14/14, Frontend 100%
- **Iteration 2:** Backend 27/27, Frontend 100% (uploads R2 + pagamentos MP)
- **Iteration 3:** Backend 13/13, Frontend 100% (sugestões + precificação + recorrência)

## Backlog

### P1 (Alta Prioridade)
- [ ] GPS Tracking em tempo real (WebSockets)
- [ ] Notificações por email/push

### P2 (Média Prioridade)
- [ ] Preview visual da rota antes de publicar viagem
- [ ] Estimativa de tempo de chegada (ETA)
- [ ] Gamificação/badges para usuários

### P3 (Baixa Prioridade)
- [ ] App mobile nativo
- [ ] Integração com mais meios de pagamento
