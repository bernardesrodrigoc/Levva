import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Package, TruckIcon, User, SignOut, Plus, MapTrifold, Lightning, Car,
  Clock, CheckCircle, X, Warning, ArrowRight, CurrencyDollar
} from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { VerificationAlert } from '@/components/VerificationAlert';
import TrustLevelCard from '@/components/TrustLevelCard';
import NotificationBell from '@/components/NotificationBell';
import { useAuth } from '@/context/AuthContext';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const DashboardPage = () => {
  const { user, logout, token } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    myTrips: [],
    myShipments: [],
    myMatches: []
  });
  const [loading, setLoading] = useState(true);
  const [verificationStatus, setVerificationStatus] = useState(null);
  const [adminStats, setAdminStats] = useState(null);

  useEffect(() => {
    fetchData();
    fetchVerificationStatus();
    if (user?.role === 'admin') {
      fetchAdminStats();
    }
  }, [user]);

  const fetchData = async () => {
    try {
      const headers = { Authorization: `Bearer ${token}` };
      
      const [tripsRes, shipmentsRes, matchesRes] = await Promise.all([
        axios.get(`${API}/trips/my-trips`, { headers }),
        axios.get(`${API}/shipments/my-shipments`, { headers }),
        axios.get(`${API}/matches/my-matches`, { headers })
      ]);

      // Ordena matches pelos mais recentes
      const sortedMatches = matchesRes.data.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

      setStats({
        myTrips: tripsRes.data,
        myShipments: shipmentsRes.data,
        myMatches: sortedMatches
      });
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchVerificationStatus = async () => {
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const response = await axios.get(`${API}/users/verification-status`, { headers });
      setVerificationStatus(response.data.verification_status);
    } catch (error) {
      console.error('Erro ao carregar status de verificação:', error);
    }
  };

  const fetchAdminStats = async () => {
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const response = await axios.get(`${API}/admin/stats`, { headers });
      setAdminStats(response.data);
    } catch (error) {
      console.error('Erro ao carregar stats admin:', error);
    }
  };

  const handleCreateAction = (path) => {
    if (verificationStatus !== 'verified') {
      navigate('/verificacao');
      return;
    }
    navigate(path);
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const getTrustBadge = (level) => {
    const colors = {
      level_1: 'bg-slate-100 text-slate-700',
      level_2: 'bg-blue-100 text-blue-700',
      level_3: 'bg-lime-100 text-lime-700',
      level_4: 'bg-jungle-100 text-jungle-700',
      level_5: 'bg-yellow-100 text-yellow-700'
    };
    return colors[level] || colors.level_1;
  };

  // Helper para Status Visual dos Matches
  const getStatusConfig = (status) => {
    const config = {
      pending_payment: { label: 'Pagamento Pendente', color: 'bg-yellow-100 text-yellow-700', icon: CurrencyDollar },
      paid: { label: 'Aguardando Coleta', color: 'bg-blue-100 text-blue-700', icon: Package },
      in_transit: { label: 'Em Trânsito', color: 'bg-purple-100 text-purple-700', icon: TruckIcon },
      delivered: { label: 'Entregue', color: 'bg-green-100 text-green-700', icon: CheckCircle },
      cancelled: { label: 'Cancelado', color: 'bg-red-100 text-red-700', icon: X },
      disputed: { label: 'Em Disputa', color: 'bg-orange-100 text-orange-700', icon: Warning }
    };
    return config[status] || { label: status, color: 'bg-gray-100', icon: Package };
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-jungle"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-8"> {/* Padding bottom extra para mobile nav */}
      {/* Header */}
      <header className="glass border-b sticky top-0 z-50">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Package size={32} weight="duotone" className="text-jungle" />
            <span className="text-2xl font-heading font-bold text-jungle">Levva</span>
          </div>
          <div className="flex items-center gap-4">
            {user?.role === 'admin' && (
              <Button 
                onClick={() => navigate('/admin')} 
                className="hidden md:flex bg-jungle hover:bg-jungle-800"
                data-testid="admin-panel-btn"
              >
                Painel Admin
              </Button>
            )}
            <NotificationBell 
              onNotificationClick={(notification) => {
                if (notification.match_id) {
                  navigate(`/match/${notification.match_id}`);
                }
              }}
            />
            <div className="hidden md:flex items-center gap-3">
              <div className="text-right cursor-pointer" onClick={() => navigate('/perfil')} data-testid="profile-link">
                <p className="font-semibold text-sm">{user?.name}</p>
                <Badge className={getTrustBadge(user?.trust_level)}>
                  {user?.trust_level?.replace('_', ' ').toUpperCase()}
                </Badge>
              </div>
              <Button variant="ghost" size="icon" onClick={handleLogout} data-testid="logout-btn">
                <SignOut size={20} />
              </Button>
            </div>
            {/* Menu Hamburguer Mobile poderia vir aqui, mas usamos BottomNav */}
          </div>
        </div>
      </header>

      <div className="container mx-auto px-6 py-8">
        {/* Welcome Section */}
        <div className="mb-8">
          <h1 className="text-3xl md:text-4xl font-heading font-bold mb-2">Olá, {user?.name?.split(' ')[0]}!</h1>
          <p className="text-muted-foreground">Bem-vindo ao seu painel de controle</p>
        </div>

        {/* Verification Alert */}
        {verificationStatus && (
          <div className="mb-8">
            <VerificationAlert verificationStatus={verificationStatus} />
          </div>
        )}

        {/* Admin Quick Access (Mobile) */}
        {user?.role === 'admin' && (
          <Card 
            className="mb-8 border-2 border-jungle bg-jungle/5 cursor-pointer card-hover md:hidden"
            onClick={() => navigate('/admin')}
          >
            <CardContent className="p-6 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-jungle rounded-full flex items-center justify-center">
                  <User size={20} className="text-white" />
                </div>
                <div>
                  <p className="font-semibold text-jungle">Painel Admin</p>
                  <p className="text-xs text-muted-foreground">Gerenciar plataforma</p>
                </div>
              </div>
              <ArrowRight size={20} className="text-jungle" />
            </CardContent>
          </Card>
        )}

        {/* --- LISTA DE COMBINAÇÕES ATIVAS (RECENT ACTIVITY) --- */}
        <div className="mb-10">
          <h2 className="text-xl md:text-2xl font-heading font-bold mb-4 flex items-center gap-2">
            <Clock className="text-jungle" /> Entregas em Andamento
          </h2>
          
          {stats.myMatches.length === 0 ? (
             <Card className="text-center py-12 bg-muted/20 border-dashed">
               <CardContent>
                 <Package size={48} className="mx-auto text-muted-foreground mb-4 opacity-50" />
                 <h3 className="text-lg font-semibold">Nenhuma entrega ativa</h3>
                 <p className="text-muted-foreground mb-6">Crie um envio ou uma viagem para começar.</p>
               </CardContent>
             </Card>
          ) : (
            <div className="grid gap-4">
              {stats.myMatches.slice(0, 5).map((match) => { // Mostra as 5 últimas
                const StatusInfo = getStatusConfig(match.status);
                const StatusIcon = StatusInfo.icon;
                const isCarrier = match.carrier_id === user.id;

                return (
                  <Card 
                    key={match.id} 
                    className="hover:border-jungle transition-all cursor-pointer group shadow-sm hover:shadow-md"
                    onClick={() => navigate(`/match/${match.id}`)}
                  >
                    <CardContent className="p-4 md:p-6 flex flex-col md:flex-row items-start md:items-center gap-4 md:gap-6">
                      
                      {/* Ícone Indicativo */}
                      <div className={`hidden md:flex w-12 h-12 rounded-full items-center justify-center flex-shrink-0 ${isCarrier ? 'bg-jungle/10 text-jungle' : 'bg-lime/10 text-lime-600'}`}>
                        {isCarrier ? <TruckIcon size={24} weight="duotone" /> : <Package size={24} weight="duotone" />}
                      </div>

                      {/* Informações da Rota */}
                      <div className="flex-1 w-full space-y-2">
                        <div className="flex items-center justify-between md:justify-start gap-2">
                          <Badge className={StatusInfo.color}>
                            <StatusIcon className="mr-1" size={12} /> {StatusInfo.label}
                          </Badge>
                          <span className="text-[10px] md:text-xs text-muted-foreground uppercase font-bold tracking-wide">
                            {isCarrier ? 'Você leva' : 'Seu pacote'}
                          </span>
                        </div>
                        
                        <div className="flex items-center gap-2 text-base md:text-lg font-bold">
                          <span>{match.trip?.origin?.city || 'Origem'}</span>
                          <ArrowRight size={16} className="text-muted-foreground" />
                          <span>{match.trip?.destination?.city || 'Destino'}</span>
                        </div>
                        
                        <p className="text-xs md:text-sm text-muted-foreground line-clamp-1">
                          {match.shipment?.package?.description || "Encomenda"} • {match.shipment?.package?.weight_kg}kg
                        </p>
                      </div>

                      {/* Preço e Botão */}
                      <div className="flex w-full md:w-auto justify-between md:flex-col md:items-end gap-2 mt-2 md:mt-0 pt-2 md:pt-0 border-t md:border-t-0">
                        <span className="font-bold text-lg text-jungle">
                          R$ {match.estimated_price?.toFixed(2)}
                        </span>
                        <div className="flex items-center text-sm font-medium text-jungle md:text-muted-foreground group-hover:text-jungle transition-colors">
                          Ver Detalhes <ArrowRight className="ml-1" size={16} />
                        </div>
                      </div>

                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        {/* Quick Actions Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6 mb-8">
          
          {/* Lógica para Transportadores */}
          {(user?.role === 'carrier' || user?.role === 'both') && (
            <>
              <Card className="card-hover cursor-pointer" onClick={() => handleCreateAction('/criar-viagem')}>
                <CardHeader className="p-4 md:p-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 md:w-12 md:h-12 bg-jungle/10 rounded-xl flex items-center justify-center">
                        <TruckIcon size={20} md:size={24} weight="duotone" className="text-jungle" />
                      </div>
                      <div>
                        <CardTitle className="text-base md:text-lg">Criar Viagem</CardTitle>
                        <CardDescription className="text-xs md:text-sm">Publique uma rota</CardDescription>
                      </div>
                    </div>
                    <Plus size={20} className="text-muted-foreground" />
                  </div>
                </CardHeader>
              </Card>

              <Card className="card-hover cursor-pointer" onClick={() => navigate('/vehicles')}>
                <CardHeader className="p-4 md:p-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 md:w-12 md:h-12 bg-slate-100 rounded-xl flex items-center justify-center">
                        <Car size={20} md:size={24} weight="duotone" className="text-slate-600" />
                      </div>
                      <div>
                        <CardTitle className="text-base md:text-lg">Meus Veículos</CardTitle>
                        <CardDescription className="text-xs md:text-sm">Gerencie sua frota</CardDescription>
                      </div>
                    </div>
                    <div className="text-muted-foreground">→</div>
                  </div>
                </CardHeader>
              </Card>
            </>
          )}

          {/* Lógica para Remetentes */}
          {(user?.role === 'sender' || user?.role === 'both') && (
            <Card className="card-hover cursor-pointer" onClick={() => handleCreateAction('/criar-envio')}>
              <CardHeader className="p-4 md:p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 md:w-12 md:h-12 bg-lime/10 rounded-xl flex items-center justify-center">
                      <Package size={20} md:size={24} weight="duotone" className="text-lime" />
                    </div>
                    <div>
                      <CardTitle className="text-base md:text-lg">Criar Envio</CardTitle>
                      <CardDescription className="text-xs md:text-sm">Enviar um pacote</CardDescription>
                    </div>
                  </div>
                  <Plus size={20} className="text-muted-foreground" />
                </div>
              </CardHeader>
            </Card>
          )}
        </div>

        {/* Smart Suggestions */}
        <Card className="card-hover cursor-pointer mb-8 border-jungle/30 bg-gradient-to-r from-jungle/5 to-lime/5" onClick={() => navigate('/sugestoes')}>
          <CardHeader className="p-4 md:p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 md:w-12 md:h-12 bg-jungle rounded-xl flex items-center justify-center">
                  <Lightning size={20} md:size={24} weight="fill" className="text-white" />
                </div>
                <div>
                  <CardTitle className="flex items-center gap-2 text-base md:text-lg">
                    Sugestões Inteligentes
                    <Badge className="bg-jungle/20 text-jungle text-[10px]">Novo</Badge>
                  </CardTitle>
                  <CardDescription className="text-xs md:text-sm line-clamp-1">Combinações automáticas baseadas nas suas rotas</CardDescription>
                </div>
              </div>
              <Button variant="ghost" className="text-jungle hidden md:flex">
                Ver Sugestões →
              </Button>
              <ArrowRight className="text-jungle md:hidden" />
            </div>
          </CardHeader>
        </Card>

        {/* Browse & Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6 mb-8">
          
          {/* Trust Level (Esconde no mobile se já tiver no header, ou mantém se for importante) */}
          <div className="hidden md:block">
            <TrustLevelCard />
          </div>
          
          <Card className="card-hover cursor-pointer" onClick={() => navigate('/viagens')}>
            <CardHeader className="p-4 md:p-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 md:w-12 md:h-12 bg-slate-100 rounded-xl flex items-center justify-center">
                  <MapTrifold size={20} md:size={24} weight="duotone" className="text-jungle" />
                </div>
                <div>
                  <CardTitle className="text-base md:text-lg">Buscar Viagens</CardTitle>
                  <CardDescription className="text-xs md:text-sm">Encontre transportadores</CardDescription>
                </div>
              </div>
            </CardHeader>
          </Card>

          <Card className="card-hover cursor-pointer" onClick={() => navigate('/envios')}>
            <CardHeader className="p-4 md:p-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 md:w-12 md:h-12 bg-slate-100 rounded-xl flex items-center justify-center">
                  <Package size={20} md:size={24} weight="duotone" className="text-lime" />
                </div>
                <div>
                  <CardTitle className="text-base md:text-lg">Buscar Envios</CardTitle>
                  <CardDescription className="text-xs md:text-sm">Encontre pacotes</CardDescription>
                </div>
              </div>
            </CardHeader>
          </Card>
        </div>

        {/* --- STATS CLICÁVEIS (CORREÇÃO DE "ZERADO E NÃO CLICÁVEL") --- */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-6">
          <Card 
            className="cursor-pointer hover:border-jungle transition-all hover:shadow-md"
            onClick={() => navigate('/minhas-viagens')}
          >
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-xs md:text-sm font-medium text-muted-foreground flex justify-between items-center">
                Minhas Viagens <ArrowRight size={14} />
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <p className="text-2xl md:text-3xl font-bold">{stats.myTrips.length}</p>
            </CardContent>
          </Card>

          <Card 
            className="cursor-pointer hover:border-lime-500 transition-all hover:shadow-md"
            onClick={() => navigate('/meus-envios')}
          >
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-xs md:text-sm font-medium text-muted-foreground flex justify-between items-center">
                Meus Envios <ArrowRight size={14} />
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <p className="text-2xl md:text-3xl font-bold">{stats.myShipments.length}</p>
            </CardContent>
          </Card>

          <Card className="col-span-2 md:col-span-1">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-xs md:text-sm font-medium text-muted-foreground">Total de Matches</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <p className="text-2xl md:text-3xl font-bold">{stats.myMatches.length}</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
