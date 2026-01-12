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

## O Que Foi Implementado

### Data: 12/01/2026

#### Funcionalidades Core Concluídas:
1. **Sistema de Autenticação**
   - Registro de usuário com roles (sender, carrier, both, admin)
   - Login com JWT
   - Rotas protegidas

2. **Gerenciamento de Viagens e Envios**
   - Criar/listar viagens (transportadores)
   - Criar/listar envios (remetentes)
   - Filtros por origem/destino

3. **Sistema de Matching Manual**
   - Página para criar combinações (/criar-combinacao)
   - Cálculo automático de preço (preço por kg + comissão 15%)
   - Status tracking (pending_payment, paid, in_transit, delivered)

4. **Detalhes da Combinação**
   - Página completa com rota, valores, timeline
   - Confirmação de coleta/entrega com foto
   - **CORRIGIDO:** Erro de serialização de ObjectId

5. **Sistema de Chat**
   - Chat em tempo real entre transportador e remetente
   - Polling a cada 5 segundos
   - Mensagens com timestamp

6. **Verificação de Identidade**
   - Formulário multi-step para verificação
   - Upload de foto de perfil, documento (frente/verso), selfie, CNH
   - **IMPLEMENTADO:** Upload real para Cloudflare R2 usando presigned URLs

7. **Painel Administrativo**
   - Dashboard com estatísticas (usuários, viagens, envios, verificações)
   - Lista de verificações pendentes
   - Visualização de documentos do usuário
   - Aprovar/Rejeitar verificações

8. **Sistema de Avaliações**
   - Avaliar transportador/remetente após entrega
   - Média de avaliação no perfil

### Correções Aplicadas Nesta Sessão:
1. **Erro na página de detalhes do match** - Corrigido problema de serialização de ObjectId nos objetos aninhados (trip, shipment)
2. **Erro ao criar combinação** - Corrigido tratamento de price_per_kg = None (default 5.0)
3. **Texto "\n" no dashboard** - Removido caractere literal no código

## Backlog Priorizado

### P0 (Crítico - Próximos)
1. ~~**Implementar Upload Real de Arquivos (Cloudflare R2)**~~ ✅ CONCLUÍDO
   - Presigned URLs implementados
   - Upload direto para R2 funcionando
   - URLs temporárias para visualização

2. ~~**Implementar Pagamentos Mercado Pago**~~ ✅ CONCLUÍDO
   - Sistema de escrow implementado
   - Checkout redirect funcionando
   - Páginas de retorno criadas

### P1 (Alta Prioridade)
3. ~~**Sistema de Avaliações e Reputação**~~ ✅ IMPLEMENTADO
4. ~~**Rastreamento GPS com Leaflet**~~ ✅ IMPLEMENTADO - Mapa de rota na página de detalhes

### P2 (Média Prioridade)
5. ~~**Motor de Matching Automático**~~ ✅ IMPLEMENTADO - Página de sugestões inteligentes
6. **Níveis Progressivos de Confiança** - Parcialmente implementado
7. **Ferramentas de Resolução de Disputas** - Não iniciado

## Credenciais de Teste
- **Admin:** admin@levva.com / adminpassword
- **Usuário teste:** teste@levva.com / password123

## Arquivos Principais
```
/app/backend/
├── server.py       # Todas as rotas da API
├── models.py       # Modelos Pydantic
├── database.py     # Conexão MongoDB
└── auth.py         # JWT e senhas

/app/frontend/src/
├── pages/
│   ├── DashboardPage.js
│   ├── MatchDetailPage.js
│   ├── CreateMatchPage.js
│   ├── AdminDashboard.js
│   └── VerificationPage.js
├── components/
│   └── ChatBox.js
└── context/
    └── AuthContext.js
```

## Status dos Testes
- Iteration 1: Backend 14/14, Frontend 100%
- Iteration 2: Backend 27/27, Frontend 100% (uploads R2 + pagamentos Mercado Pago)
- Relatórios: /app/test_reports/iteration_1.json, /app/test_reports/iteration_2.json

## Funcionalidades Implementadas Nesta Sessão (12/01/2026)
1. ✅ **Correções de bugs** - Match detail, criar combinação, chat
2. ✅ **Upload Cloudflare R2** - Presigned URLs funcionando
3. ✅ **Pagamentos Mercado Pago** - Checkout redirect funcionando
4. ✅ **Mapa de Rota (Leaflet)** - Visualização de rotas com OpenStreetMap
5. ✅ **Matching Automático** - Sugestões inteligentes baseadas em rotas
6. ✅ **Rotas Precisas com Coordenadas** - Implementação completa:
   - LocationPicker com mapa interativo e autocomplete de endereços
   - Polyline de rota via OSRM (Open Source Routing Machine)
   - Matching por corredor configurável (2-20km)
   - Algoritmo de proximidade para ranking de matches
   - Armazenamento de lat/lng para todos os pontos
   - Visualização do corredor no mapa de detalhes
