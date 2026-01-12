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
- **Real-time:** WebSockets (GPS Tracking)

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

3. **Sistema de Matching Inteligente** ✅ (12/01/2026)
   - Página de sugestões inteligentes (/sugestoes)
   - Algoritmo de matching por corredor de rota
   - **Fallback por proximidade de coordenadas quando não há polyline**
   - Cálculo automático de score de match
   - Ranking por relevância

4. **Precificação Dinâmica** ✅ (12/01/2026)
   - Endpoint POST /api/trips/calculate-price
   - Preço sugerido baseado em distância
   - Faixas de preço por distância (curta, média, longa)
   - Exemplos de preço para diferentes pesos
   - Comissão da plataforma: 15%

5. **Rotas Recorrentes** ✅ (12/01/2026)
   - Campo recurrence no modelo Trip
   - UI para seleção de dias da semana
   - Data final opcional
   - Horário fixo

6. **GPS Tracking em Tempo Real** ✅ NOVO (12/01/2026)
   - WebSocket para comunicação bidirecional
   - Transportador envia localização periodicamente (10-30 segundos)
   - Remetente acompanha entrega em tempo real
   - Histórico de rota salvo no MongoDB
   - Mapa com ícone animado do transportador
   - Controles de iniciar/parar/pausar rastreamento
   - Endpoints REST para status e histórico

7. **Sistema de Notificações Híbrido** ✅ NOVO (12/01/2026)
   - Notificações in-app com badge no sino
   - Dropdown com lista de notificações
   - Marcar como lida (individual ou todas)
   - Excluir notificações
   - Email para eventos críticos (quando Resend configurado)
   - 15 tipos de notificação diferentes
   - Templates em português

8. **Detalhes da Combinação**
   - Página completa com rota, valores, timeline
   - Confirmação de coleta/entrega com foto
   - Mapa com visualização da rota (Leaflet)
   - **LiveTrackingMap para entregas em trânsito**

9. **Sistema de Chat**
   - Chat em tempo real entre transportador e remetente
   - Polling a cada 5 segundos
   - Mensagens com timestamp

10. **Verificação de Identidade**
    - Formulário multi-step para verificação
    - Upload de foto de perfil, documento (frente/verso), selfie, CNH
    - Upload real para Cloudflare R2 usando presigned URLs

11. **Painel Administrativo**
    - Dashboard com estatísticas
    - Lista de verificações pendentes
    - Aprovar/Rejeitar verificações
    - Sistema de disputas com resolução

12. **Sistema de Avaliações**
    - Avaliar transportador/remetente após entrega
    - Média de avaliação no perfil

13. **Níveis Progressivos de Confiança**
    - 5 níveis: Iniciante → Verificado → Confiável → Experiente → Elite
    - Limites de valor/peso por nível
    - Card de progresso no dashboard
    - Upgrade automático baseado em entregas e avaliação

14. **Pagamentos Mercado Pago**
    - Integração completa com checkout redirect
    - Webhook para confirmação de pagamento
    - Sistema de escrow

## Novos Componentes Criados (12/01/2026)

### Backend
- `websocket_manager.py` - Gerenciador de conexões WebSocket
- `notification_service.py` - Serviço de notificações
- Endpoints WebSocket: `/ws/tracking/{match_id}/carrier` e `/ws/tracking/{match_id}/watch`
- Endpoints REST: `/api/notifications/*` e `/api/tracking/*`

### Frontend
- `NotificationBell.js` - Componente de sino com dropdown
- `LiveTrackingMap.js` - Mapa com rastreamento em tempo real
- `useGPSTracking.js` - Hook para WebSocket de GPS

## Credenciais de Teste
- **Admin:** admin@levva.com / adminpassword
- **Usuário teste (carrier):** teste@levva.com / password123
- **Usuário teste (sender):** remetente_sp_1768238849@levva.com / teste123

## Arquivos Principais
```
/app/backend/
├── server.py              # Todas as rotas da API
├── models.py              # Modelos Pydantic
├── database.py            # Conexão MongoDB
├── auth.py                # JWT e senhas
├── route_service.py       # OSRM routing, haversine, corridor matching
├── trust_service.py       # Níveis de confiança
├── websocket_manager.py   # WebSocket para GPS tracking ⭐ NOVO
└── notification_service.py # Notificações in-app + email ⭐ NOVO

/app/frontend/src/
├── pages/
│   ├── DashboardPage.js       # Com NotificationBell
│   ├── MatchDetailPage.js     # Com LiveTrackingSection
│   ├── MatchSuggestionsPage.js
│   ├── CreateTripPage.js
│   ├── CreateShipmentPage.js
│   ├── AdminDashboard.js
│   └── VerificationPage.js
├── components/
│   ├── NotificationBell.js    # ⭐ NOVO
│   ├── LiveTrackingMap.js     # ⭐ NOVO
│   ├── LocationPicker.js
│   ├── RouteMap.js
│   ├── TrustLevelCard.js
│   └── ChatBox.js
├── hooks/
│   └── useGPSTracking.js      # ⭐ NOVO
└── context/
    └── AuthContext.js
```

## Status dos Testes
- **Iteration 1:** Backend 14/14, Frontend 100%
- **Iteration 2:** Backend 27/27, Frontend 100% (uploads R2 + pagamentos MP)
- **Iteration 3:** Backend 13/13, Frontend 100% (sugestões + precificação + recorrência)
- **Iteration 4:** Backend 17/17, Frontend 100% (notificações + GPS tracking)

## Backlog

### P1 (Alta Prioridade) - Em progresso
- [x] GPS Tracking em tempo real (WebSockets) ✅
- [x] Notificações in-app ✅
- [ ] **Email via Resend** - Requer API key do usuário

### P2 (Média Prioridade)
- [ ] Preview visual da rota antes de publicar viagem
- [ ] Estimativa de tempo de chegada (ETA)
- [ ] Gamificação/badges para usuários

### P3 (Baixa Prioridade)
- [ ] Push notifications
- [ ] App mobile nativo
- [ ] Integração com mais meios de pagamento

## Integrações de Terceiros
| Serviço | Status | Observações |
|---------|--------|-------------|
| Cloudflare R2 | ✅ Funcionando | Storage de documentos |
| Mercado Pago | ✅ Funcionando | Pagamentos com checkout |
| OSRM | ✅ Funcionando | Roteamento e polylines |
| OpenStreetMap | ✅ Funcionando | Tiles de mapa |
| Resend | ⚠️ MOCKED | Requer API key - atualmente apenas logs |
