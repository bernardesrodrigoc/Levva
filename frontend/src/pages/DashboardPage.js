import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Package, TruckIcon, User, SignOut, Plus, MapTrifold } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { VerificationAlert } from '@/components/VerificationAlert';
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

  useEffect(() => {
    fetchData();
    fetchVerificationStatus();
  }, []);

  const fetchData = async () => {
    try {
      const headers = { Authorization: `Bearer ${token}` };
      
      const [tripsRes, shipmentsRes, matchesRes] = await Promise.all([
        axios.get(`${API}/trips/my-trips`, { headers }),
        axios.get(`${API}/shipments/my-shipments`, { headers }),
        axios.get(`${API}/matches/my-matches`, { headers })
      ]);

      setStats({
        myTrips: tripsRes.data,
        myShipments: shipmentsRes.data,
        myMatches: matchesRes.data
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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-jungle"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
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
                className="bg-jungle hover:bg-jungle-800"
                data-testid="admin-panel-btn"
              >
                Painel Admin
              </Button>
            )}
            <div className="flex items-center gap-3">
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
          </div>
        </div>
      </header>

      <div className="container mx-auto px-6 py-8">
        {/* Welcome Section */}
        <div className="mb-8">
          <h1 className="text-4xl font-heading font-bold mb-2">Olá, {user?.name}!</h1>
          <p className="text-muted-foreground">Bem-vindo ao seu painel de controle</p>
        </div>

        {/* Verification Alert */}
        {verificationStatus && (
          <div className="mb-8">
            <VerificationAlert verificationStatus={verificationStatus} />
          </div>
        )}

        {/* Quick Actions */}
        <div className="grid md:grid-cols-2 gap-6 mb-8">
          {(user?.role === 'carrier' || user?.role === 'both') && (
            <Card className="card-hover cursor-pointer" onClick={() => handleCreateAction('/criar-viagem')} data-testid="create-trip-card">\n              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-jungle/10 rounded-xl flex items-center justify-center">
                      <TruckIcon size={24} weight="duotone" className="text-jungle" />
                    </div>
                    <div>
                      <CardTitle>Criar Viagem</CardTitle>
                      <CardDescription>Publique uma rota disponível</CardDescription>
                    </div>
                  </div>
                  <Plus size={24} className="text-muted-foreground" />
                </div>
              </CardHeader>
            </Card>
          )}

          {(user?.role === 'sender' || user?.role === 'both') && (
            <Card className="card-hover cursor-pointer" onClick={() => handleCreateAction('/criar-envio')} data-testid="create-shipment-card">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-lime/10 rounded-xl flex items-center justify-center">
                      <Package size={24} weight="duotone" className="text-lime" />
                    </div>
                    <div>
                      <CardTitle>Criar Envio</CardTitle>
                      <CardDescription>Cadastre um pacote para enviar</CardDescription>
                    </div>
                  </div>
                  <Plus size={24} className="text-muted-foreground" />
                </div>
              </CardHeader>
            </Card>
          )}
        </div>

        {/* Browse Section */}
        <div className="grid md:grid-cols-2 gap-6 mb-8">
          <Card className="card-hover cursor-pointer" onClick={() => navigate('/viagens')} data-testid="browse-trips-card">
            <CardHeader>
              <div className="flex items-center gap-3">
                <MapTrifold size={24} weight="duotone" className="text-jungle" />
                <div>
                  <CardTitle>Buscar Viagens</CardTitle>
                  <CardDescription>Encontre transportadores</CardDescription>
                </div>
              </div>
            </CardHeader>
          </Card>

          <Card className="card-hover cursor-pointer" onClick={() => navigate('/envios')} data-testid="browse-shipments-card">
            <CardHeader>
              <div className="flex items-center gap-3">
                <Package size={24} weight="duotone" className="text-lime" />
                <div>
                  <CardTitle>Buscar Envios</CardTitle>
                  <CardDescription>Encontre pacotes para transportar</CardDescription>
                </div>
              </div>
            </CardHeader>
          </Card>
        </div>

        {/* Stats Cards */}
        <div className="grid md:grid-cols-3 gap-6">
          <Card data-testid="my-trips-card">
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">Minhas Viagens</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{stats.myTrips.length}</p>
            </CardContent>
          </Card>

          <Card data-testid="my-shipments-card">
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">Meus Envios</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{stats.myShipments.length}</p>
            </CardContent>
          </Card>

          <Card data-testid="my-matches-card">
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">Combinações Ativas</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{stats.myMatches.length}</p>
            </CardContent>
          </Card>
        </div>

        {/* Recent Activity */}
        {stats.myMatches.length > 0 && (
          <div className="mt-8">
            <h2 className="text-2xl font-heading font-bold mb-4">Atividades Recentes</h2>
            <div className="space-y-4">
              {stats.myMatches.slice(0, 3).map((match) => (
                <Card 
                  key={match.id} 
                  className="card-hover cursor-pointer" 
                  onClick={() => navigate(`/match/${match.id}`)}
                  data-testid={`match-card-${match.id}`}
                >
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold">Combinação #{match.id.slice(0, 8)}</p>
                        <p className="text-sm text-muted-foreground">Status: {match.status}</p>
                      </div>
                      <Badge className="bg-jungle text-white">
                        R$ {match.estimated_price?.toFixed(2)}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DashboardPage;