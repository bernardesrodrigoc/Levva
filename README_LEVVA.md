# Levva - Plataforma de Frete Colaborativo

## Visão Geral
Levva é uma plataforma web completa de crowdshipping (frete colaborativo) desenvolvida para o mercado brasileiro. Conecta pessoas que já estão viajando com quem precisa enviar pequenos volumes ao longo de rotas similares.

## Arquitetura Técnica

### Stack Tecnológica
- **Frontend**: React 19 com Tailwind CSS
- **Backend**: FastAPI (Python 3.11)
- **Banco de Dados**: MongoDB
- **Mapas**: OpenStreetMap + Leaflet
- **Pagamentos**: Mercado Pago (sistema de escrow)
- **Armazenamento**: Cloudflare R2 (fotos e documentos)
- **Ícones**: Phosphor Icons
- **Animações**: Framer Motion

### Estrutura do Projeto
```
/app/
├── backend/
│   ├── server.py           # API principal
│   ├── models.py           # Modelos Pydantic
│   ├── database.py         # Configuração MongoDB
│   ├── auth.py             # Autenticação JWT
│   └── requirements.txt    # Dependências Python
├── frontend/
│   ├── src/
│   │   ├── pages/          # Páginas principais
│   │   ├── components/     # Componentes UI
│   │   ├── context/        # Context API (Auth)
│   │   └── App.js          # App principal
│   └── package.json        # Dependências Node.js
└── design_guidelines.json  # Sistema de design
```

## Funcionalidades Implementadas

### ✅ Autenticação e Usuários
- Registro com email e senha
- Login com JWT
- Papéis de usuário: Sender, Carrier, Both
- Sistema de níveis de confiança (Level 1-5)
- Status de verificação

### ✅ Gestão de Viagens (Transportadores)
- Criar viagens com:
  - Origem e destino (coordenadas)
  - Data e hora de partida
  - Tipo de veículo (moto, carro, pickup, van)
  - Espaço de carga disponível
  - Desvio máximo de rota
  - Preço por kg
- Listar viagens disponíveis
- Filtrar por cidade de origem/destino

### ✅ Gestão de Envios (Remetentes)
- Criar envios com:
  - Origem e destino
  - Dimensões e peso do pacote
  - Categoria e descrição
  - Valor declarado
  - 3 fotos obrigatórias (item, embalagem aberta, embalagem fechada)
  - Aceite de responsabilidade legal
- Listar envios disponíveis
- Filtrar por cidade

### ✅ Sistema de Correspondência
- Criar matches entre viagens e envios
- Cálculo automático de preço
- Comissão da plataforma (15%)
- Status do match (pending_payment, paid, in_transit, delivered)

### ✅ Confirmação de Entrega
- Confirmação de coleta com foto
- Confirmação de entrega com foto
- Liberação automática do pagamento em escrow

### ✅ Sistema de Avaliações
- Avaliação mútua (1-5 estrelas)
- Comentários opcionais
- Atualização automática da média de rating do usuário
- Prevenção de avaliações duplicadas

### ✅ Pagamentos (Integração Mercado Pago)
- Criação de preferência de pagamento
- Sistema de escrow
- Webhook para notificações
- Liberação de fundos após confirmação de entrega

### ✅ Upload de Imagens (Cloudflare R2)
- Geração de URLs pré-assinadas
- Upload direto para R2
- Organização por tipo (perfil, documentos, pacotes, evidências)

### ✅ Painel Administrativo
- Estatísticas gerais
- Gestão de denúncias
- Moderação de usuários
- Revisão de verificações

## Design System - "Levva"

### Identidade Visual
- **Cores Primárias**: 
  - Jungle Deep (#047857) - Verde esmeralda
  - Lime Punch (#84CC16) - Verde limão vibrante
- **Tipografia**:
  - Headings: Outfit (500, 600, 700)
  - Body: Plus Jakarta Sans (400, 500, 600)
  - Monospace: JetBrains Mono
- **Estilo**: Moderno, minimalista, confiável

### Componentes UI
- Glassmorphism no header (backdrop-blur + transparência)
- Cards com hover effects (-translate-y-1)
- Botões pill-shaped
- Inputs altos (h-12) com bg slate-50
- Badges para trust levels

## API Endpoints

### Autenticação
- `POST /api/auth/register` - Registro de usuário
- `POST /api/auth/login` - Login
- `GET /api/auth/me` - Dados do usuário atual

### Viagens
- `POST /api/trips` - Criar viagem
- `GET /api/trips` - Listar viagens (filtros: origin_city, destination_city, status)
- `GET /api/trips/my-trips` - Minhas viagens

### Envios
- `POST /api/shipments` - Criar envio
- `GET /api/shipments` - Listar envios
- `GET /api/shipments/my-shipments` - Meus envios

### Matches
- `POST /api/matches/create` - Criar combinação
- `GET /api/matches/my-matches` - Minhas combinações
- `POST /api/matches/{id}/confirm-pickup` - Confirmar coleta
- `POST /api/matches/{id}/confirm-delivery` - Confirmar entrega

### Pagamentos
- `POST /api/payments/initiate` - Iniciar pagamento
- `POST /api/payments/webhook` - Webhook Mercado Pago

### Avaliações
- `POST /api/ratings` - Criar avaliação
- `GET /api/ratings/{user_id}` - Avaliações de um usuário

### Uploads
- `POST /api/uploads/presigned-url` - Gerar URL pré-assinada

### Admin
- `GET /api/admin/stats` - Estatísticas da plataforma
- `POST /api/admin/flags` - Criar denúncia

## Modelos de Dados

### User
```python
{
  "email": str,
  "password_hash": str,
  "name": str,
  "phone": str,
  "role": "sender" | "carrier" | "both",
  "trust_level": "level_1" to "level_5",
  "verification_status": "pending" | "verified" | "rejected",
  "profile_photo_url": str,
  "rating": float,
  "total_deliveries": int
}
```

### Trip
```python
{
  "carrier_id": str,
  "origin": {"city", "state", "lat", "lng"},
  "destination": {"city", "state", "lat", "lng"},
  "departure_date": datetime,
  "vehicle_type": "motorcycle" | "car" | "pickup" | "van",
  "cargo_space": {"volume_m3", "max_weight_kg"},
  "max_deviation_km": int,
  "price_per_kg": float,
  "status": "published" | "matched" | "in_progress" | "completed"
}
```

### Shipment
```python
{
  "sender_id": str,
  "origin": {"city", "state", "lat", "lng"},
  "destination": {"city", "state", "lat", "lng"},
  "package": {
    "length_cm", "width_cm", "height_cm", "weight_kg",
    "category", "description"
  },
  "declared_value": float,
  "photos": {
    "item_visible", "packaging_open", "packaging_sealed"
  },
  "status": "published" | "matched" | "in_transit" | "delivered"
}
```

### Match
```python
{
  "trip_id": str,
  "shipment_id": str,
  "carrier_id": str,
  "sender_id": str,
  "estimated_price": float,
  "platform_commission": float (15%),
  "carrier_earnings": float,
  "status": str,
  "pickup_confirmed_at": datetime,
  "delivery_confirmed_at": datetime
}
```

## Segurança e Confiança

### Implementado
- ✅ Autenticação JWT com tokens de 7 dias
- ✅ Hash de senhas com bcrypt
- ✅ Sistema de níveis de confiança progressivo
- ✅ Fotos obrigatórias em coleta e entrega
- ✅ Pagamento em escrow (liberado após confirmação)
- ✅ Avaliações mútuas
- ✅ Sistema de denúncias
- ✅ Aceite obrigatório de responsabilidade legal

### Planejado para Próximas Fases
- Verificação de identidade com documento + selfie
- Verificação de CNH para transportadores
- GPS tracking em tempo real
- Detecção automática de comportamento anormal
- Sistema de disputas
- Limites baseados em trust level

## Variáveis de Ambiente

### Backend (.env)
```
MONGO_URL=mongodb://localhost:27017
DB_NAME=levva_database
CORS_ORIGINS=*
JWT_SECRET_KEY=your-secret-key
MERCADOPAGO_ACCESS_TOKEN=your-mp-token
R2_ACCESS_KEY=your-r2-key
R2_SECRET_KEY=your-r2-secret
R2_ENDPOINT_URL=your-r2-endpoint
R2_BUCKET_NAME=levva-uploads
FRONTEND_URL=your-frontend-url
```

### Frontend (.env)
```
REACT_APP_BACKEND_URL=your-backend-url
```

## Como Executar

### Backend
```bash
cd /app/backend
pip install -r requirements.txt
python -m uvicorn server:app --reload --host 0.0.0.0 --port 8001
```

### Frontend
```bash
cd /app/frontend
yarn install
yarn start
```

## Páginas Implementadas

1. **Landing Page** (`/`)
   - Hero com CTA
   - Como funciona
   - Seção de segurança
   - Footer

2. **Registro** (`/register`)
   - Formulário completo
   - Seletor de papel (sender/carrier/both)
   - Split-screen com imagem

3. **Login** (`/login`)
   - Email + senha
   - Link para registro
   - Split-screen com imagem

4. **Dashboard** (`/dashboard`)
   - Estatísticas do usuário
   - Quick actions (criar viagem/envio)
   - Navegação para busca
   - Trust level badge
   - Atividades recentes

## Próximos Passos Recomendados

### Fase 2 - Funcionalidades Core
1. **Páginas de Criação**
   - Formulário criar viagem com mapa interativo
   - Formulário criar envio com upload de 3 fotos
   - Validação de campos

2. **Páginas de Navegação**
   - Lista de viagens disponíveis
   - Lista de envios disponíveis
   - Filtros avançados

3. **Página de Match/Entrega**
   - Detalhes do match
   - Mapa com rastreamento
   - Botões de confirmação (coleta/entrega)
   - Upload de fotos de evidência

4. **Perfil do Usuário**
   - Editar dados
   - Upload de foto de perfil
   - Verificação de identidade
   - Histórico de entregas
   - Avaliações recebidas

### Fase 3 - Integração de Pagamentos
1. Checkout Mercado Pago completo
2. Webhook handling robusto
3. Histórico de transações
4. Comprovantes

### Fase 4 - Trust & Safety
1. Upload e verificação de documentos
2. Verificação de CNH para carriers
3. Sistema de disputas completo
4. Admin dashboard funcional
5. Revisão manual de denúncias

### Fase 5 - UX Avançada
1. GPS tracking em tempo real
2. Notificações push
3. Chat entre sender/carrier
4. Sistema de avaliações detalhado
5. Dashboard com gráficos

## Testes Realizados

✅ Registro de usuário  
✅ Login  
✅ Obter dados do usuário (GET /auth/me)  
✅ Criar viagem  
✅ Criar envio  
✅ Frontend landing page carregando  
✅ Frontend register page carregando  
✅ Design system implementado corretamente  

## Stack de Qualidade

- **Linting**: Configurado (flake8, mypy, black para backend)
- **Testing**: Pytest configurado
- **Git**: Estrutura pronta para versionamento
- **Deployment**: Supervisord para processos

## Compliance Legal

A plataforma está posicionada como **intermediária tecnológica**, não como empresa de transporte. Implementa:

- ✅ Aceite obrigatório de Termos de Uso
- ✅ Declaração de responsabilidade pelo conteúdo (sender)
- ✅ Sistema de denúncias
- ✅ Capacidade de suspensão de usuários
- ⏳ Política de privacidade (a implementar)
- ⏳ Termos de uso detalhados (a implementar)

## Métricas de Sucesso (KPIs Sugeridos)

1. Taxa de conversão (registro → primeiro match)
2. Tempo médio para match
3. Taxa de conclusão de entregas
4. Rating médio da plataforma
5. Usuários ativos mensais (MAU)
6. Valor transacionado
7. Taxa de disputas
8. NPS (Net Promoter Score)

---

**Status**: MVP Funcional ✅  
**Data de Criação**: Janeiro 2025  
**Última Atualização**: 12/01/2025  
**Versão**: 1.0.0  
