# Levva - Guia Rápido de Uso

## 🚀 Acesso Rápido

### URLs
- **Frontend**: https://logistic-mvp.preview.emergentagent.com
- **Backend API**: https://logistic-mvp.preview.emergentagent.com/api

### Credenciais Admin
```
Email: admin@levva.com
Senha: admin123
```

### Credenciais Usuário Teste
```
Email: teste@levva.com
Senha: senha123
```

## 📋 Fluxos Principais

### 1. Como Admin - Aprovar Verificações
1. Login com admin@levva.com
2. Dashboard → Card "Painel Administrativo" OU botão "Painel Admin"
3. Ver verificações pendentes com fotos
4. Clicar "Aprovar" ou "Rejeitar"
5. Confirmar decisão

### 2. Como Usuário - Cadastro Completo
1. Registrar em /register
2. Login
3. Dashboard → "Verificar Agora" (alerta vermelho)
4. Completar 4 etapas:
   - Etapa 1: CPF, endereço
   - Etapa 2: Foto de perfil
   - Etapa 3: RG frente/verso + Selfie
   - Etapa 4: CNH (se carrier)
5. Aguardar aprovação admin

### 3. Criar e Combinar Viagem/Envio
1. Dashboard → "Criar Viagem" ou "Criar Envio"
2. Preencher formulário
3. Buscar em /viagens ou /envios
4. Clicar "Combinar"
5. Selecionar sua viagem/envio
6. "Criar Combinação"
7. Ver detalhes em /match/[id]

### 4. Confirmar Coleta/Entrega
1. Ir para detalhes do match
2. Carrier clica "Confirmar Coleta" (quando status = paid)
3. Upload foto
4. Status → in_transit
5. Carrier clica "Confirmar Entrega"
6. Upload foto
7. Status → delivered
8. Pagamento liberado automaticamente

### 5. Avaliar
1. Match com status "delivered"
2. Clicar "Avaliar [Transportador/Remetente]"
3. Selecionar estrelas (1-5)
4. Comentário opcional
5. Enviar avaliação

## 🔧 Endpoints Principais

### Auth
- POST /api/auth/register
- POST /api/auth/login
- GET /api/auth/me

### Verificação
- POST /api/users/verify
- GET /api/users/verification-status

### Viagens
- POST /api/trips
- GET /api/trips (filtros: origin_city, destination_city, status)
- GET /api/trips/my-trips

### Envios
- POST /api/shipments
- GET /api/shipments
- GET /api/shipments/my-shipments

### Matches
- POST /api/matches/create?trip_id=X&shipment_id=Y
- GET /api/matches/my-matches
- GET /api/matches/{id}
- POST /api/matches/{id}/confirm-pickup
- POST /api/matches/{id}/confirm-delivery

### Admin
- GET /api/admin/stats
- GET /api/admin/verifications/pending
- POST /api/admin/verifications/{id}/review

### Ratings
- POST /api/ratings
- GET /api/ratings/{user_id}

## 🎯 Páginas

| Rota | Descrição | Acesso |
|------|-----------|--------|
| / | Landing page | Público |
| /login | Login | Público |
| /register | Registro | Público |
| /dashboard | Dashboard principal | Autenticado |
| /verificacao | 4 etapas verificação | Autenticado |
| /admin | Painel admin | Admin only |
| /perfil | Perfil usuário | Autenticado |
| /criar-viagem | Form viagem | Carrier verificado |
| /criar-envio | Form envio | Sender verificado |
| /viagens | Buscar viagens | Autenticado |
| /envios | Buscar envios | Autenticado |
| /criar-combinacao | Combinar trip+shipment | Autenticado |
| /match/:id | Detalhes match | Autenticado |

## 🔐 Níveis de Confiança

- **Level 1**: Iniciante (novo usuário)
- **Level 2**: Bronze (5+ entregas)
- **Level 3**: Prata (20+ entregas)
- **Level 4**: Ouro (50+ entregas)
- **Level 5**: Platina (100+ entregas)

Níveis mais altos desbloqueiam:
- Valores declarados maiores
- Mais volume por envio
- Prioridade nos matches

## 💰 Sistema de Pagamento

- **Comissão Levva**: 15% do valor total
- **Escrow**: Pagamento retido até confirmação de entrega
- **Liberação**: Automática após carrier confirmar entrega
- **Preço padrão**: R$ 5,00/kg (se não especificado)

## 🛡️ Segurança

**Obrigatórios:**
- CPF
- Endereço completo
- Foto de perfil
- RG/CNH frente + verso
- Selfie com documento
- CNH (para carriers)

**Durante entrega:**
- Foto na coleta
- Foto na entrega
- GPS tracking (planejado)

## 📊 Status dos Sistemas

- ✅ Auth JWT
- ✅ Verificação 4 etapas
- ✅ Admin aprovação
- ✅ Criar viagens/envios
- ✅ Busca com filtros
- ✅ Sistema combinação
- ✅ Confirmação coleta/entrega
- ✅ Avaliações mútuas
- ✅ Cálculo preços/comissão
- ⏳ Upload R2 (preparado)
- ⏳ Mercado Pago webhook (preparado)
- ⏳ Mapas Leaflet (preparado)

## 🔄 Próximos Passos

1. **Implementar upload real R2**
2. **Webhook Mercado Pago ativo**
3. **Mapa interativo nas rotas**
4. **Notificações push**
5. **Chat em tempo real**
6. **App mobile React Native**
