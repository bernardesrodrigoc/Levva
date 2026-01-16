import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Package, TruckIcon, MapPin, Calendar, Star, User } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const BrowseTripsPage = () => {
  // ADICIONADO: 'user' para poder filtrar e 'isAuthenticated' (se houver no contexto) ou checar token
  const { token, user } = useAuth(); 
  const navigate = useNavigate();
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    originCity: '',
    destinationCity: ''
  });

  // CORREÇÃO DO ERRO DE REFRESH:
  // Adicionamos [token, user] nas dependências.
  // O código só executa a busca quando o usuário estiver realmente logado.
  useEffect(() => {
    if (token && user) {
      fetchTrips();
    }
  }, [token, user]);

  const fetchTrips = async (filterParams = {}) => {
    // Proteção extra: se não tiver token, não busca (evita erro 401)
    if (!token) return;

    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterParams.originCity) params.append('origin_city', filterParams.originCity);
      if (filterParams.destinationCity) params.append('destination_city', filterParams.destinationCity);
      params.append('status', 'published');

      const response = await axios.get(`${API}/trips?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      // CORREÇÃO DO FILTRO (Issue 1):
      // Filtra para remover as viagens onde EU sou o motorista
      const othersTrips = response.data.filter(trip => trip.carrier_id !== user.id);
      
      setTrips(othersTrips);
    } catch (error) {
      // Só mostra erro se não for cancelamento ou erro de auth temporário
      console.error(error);
      if (error.response?.status !== 401) {
        toast.error('Erro ao carregar viagens');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    fetchTrips(filters);
  };

  const handleCreateMatch = async (e, tripId) => {
    e.stopPropagation();
    navigate('/criar-combinacao', { state: { tripId } });
  };

  const getVehicleLabel = (type) => {
    const labels = {
      motorcycle: 'Moto',
      car: 'Carro',
      pickup: 'Pickup',
      van: 'Van'
    };
    return labels[type] || type;
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('pt-BR', { 
      day: '2-digit', 
      month: 'short', 
      year: 'numeric', 
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="min-h-screen bg-background pb-24 md:pb-8">
      {/* Header - Mobile Optimized */}
      <header className="glass border-b sticky top-0 z-50">
        <div className="container mx-auto px-4 md:px-6 py-3 md:py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Package size={28} weight="duotone" className="text-jungle" />
            <span className="text-xl md:text-2xl font-heading font-bold text-jungle">Levva</span>
          </div>
          <Button 
            variant="ghost" 
            size="sm"
            onClick={() => navigate('/dashboard')} 
            data-testid="back-to-dashboard-btn"
          >
            <span className="hidden md:inline">Voltar ao Dashboard</span>
            <span className="md:hidden">Voltar</span>
          </Button>
        </div>
      </header>

      <div className="container mx-auto px-4 md:px-6 py-4 md:py-8">
        {/* Title - Mobile Optimized */}
        <div className="mb-4 md:mb-8">
          <h1 className="text-2xl md:text-4xl font-heading font-bold mb-1 md:mb-2 flex items-center gap-2 md:gap-3">
            <TruckIcon size={28} weight="duotone" className="text-jungle hidden md:block" />
            Buscar Viagens
          </h1>
          <p className="text-sm md:text-base text-muted-foreground">Encontre transportadores para seu envio</p>
        </div>

        {/* Filters - Mobile Optimized */}
        <Card className="mb-4 md:mb-8" data-testid="filters-card">
          <CardHeader className="p-4 md:p-6 pb-2 md:pb-4">
            <CardTitle className="text-base md:text-lg">Filtros</CardTitle>
            <CardDescription className="text-xs md:text-sm">Refine sua busca</CardDescription>
          </CardHeader>
          <CardContent className="p-4 md:p-6 pt-0">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
              <div>
                <Label htmlFor="originCity" className="text-xs md:text-sm">Cidade de Origem</Label>
                <Input
                  id="originCity"
                  placeholder="Ex: São Paulo"
                  value={filters.originCity}
                  onChange={(e) => setFilters(prev => ({ ...prev, originCity: e.target.value }))}
                  className="h-11 md:h-12 mt-1.5 text-base"
                  data-testid="origin-filter-input"
                />
              </div>
              <div>
                <Label htmlFor="destinationCity" className="text-xs md:text-sm">Cidade de Destino</Label>
                <Input
                  id="destinationCity"
                  placeholder="Ex: Rio de Janeiro"
                  value={filters.destinationCity}
                  onChange={(e) => setFilters(prev => ({ ...prev, destinationCity: e.target.value }))}
                  className="h-11 md:h-12 mt-1.5 text-base"
                  data-testid="destination-filter-input"
                />
              </div>
              <div className="flex items-end">
                <Button 
                  onClick={handleSearch} 
                  className="h-11 md:h-12 w-full bg-jungle hover:bg-jungle-800 text-sm md:text-base"
                  data-testid="search-btn"
                >
                  Buscar
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Results - Mobile Optimized */}
        {loading ? (
          <div className="flex items-center justify-center py-16 md:py-20">
            <div className="animate-spin rounded-full h-10 w-10 md:h-12 md:w-12 border-b-2 border-jungle"></div>
          </div>
        ) : trips.length === 0 ? (
          <Card className="text-center py-10 md:py-12">
            <CardContent>
              <TruckIcon size={40} weight="duotone" className="mx-auto text-muted-foreground mb-3 md:mb-4" />
              <p className="text-base md:text-lg font-semibold mb-1 md:mb-2">Nenhuma viagem encontrada</p>
              <p className="text-sm text-muted-foreground">Tente ajustar os filtros ou volte mais tarde</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3 md:space-y-4">
            <p className="text-xs md:text-sm text-muted-foreground">{trips.length} viagem(ns) encontrada(s)</p>
            {trips.map((trip) => (
              <Card 
                key={trip.id} 
                className="card-hover cursor-pointer hover:border-jungle transition-all" 
                data-testid={`trip-card-${trip.id}`}
                onClick={() => navigate(`/viagens/${trip.id}`)}
              >
                <CardContent className="p-4 md:p-6">
                  <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 md:gap-6">
                    <div className="flex-1">
                      {/* Route - Mobile Optimized */}
                      <div className="flex items-center gap-2 md:gap-4 mb-3 md:mb-4">
                        <div className="flex items-center gap-1.5 md:gap-2 flex-1">
                          <MapPin size={18} weight="fill" className="text-jungle flex-shrink-0" />
                          <div className="min-w-0">
                            <p className="font-semibold text-sm md:text-base truncate">{trip.origin.city}</p>
                            <p className="text-[10px] md:text-xs text-muted-foreground">Origem</p>
                          </div>
                        </div>
                        <div className="flex-shrink-0 w-8 md:flex-1 border-t-2 border-dashed border-border" />
                        <div className="flex items-center gap-1.5 md:gap-2 flex-1 justify-end md:justify-start">
                          <MapPin size={18} weight="fill" className="text-lime flex-shrink-0" />
                          <div>
                            <p className="font-semibold">{trip.destination.city}, {trip.destination.state}</p>
                            <p className="text-xs text-muted-foreground">Destino</p>
                          </div>
                        </div>
                      </div>

                      {/* Details */}
                      <div className="grid md:grid-cols-4 gap-4 mb-4">
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">Partida</p>
                          <div className="flex items-center gap-2">
                            <Calendar size={16} className="text-jungle" />
                            <p className="text-sm font-medium">{formatDate(trip.departure_date)}</p>
                          </div>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">Veículo</p>
                          <div className="flex items-center gap-2">
                            <TruckIcon size={16} className="text-jungle" />
                            <p className="text-sm font-medium">{getVehicleLabel(trip.vehicle_type)}</p>
                          </div>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">Capacidade</p>
                          <p className="text-sm font-medium">{trip.cargo_space?.max_weight_kg || 0} kg</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">Preço/kg</p>
                          <p className="text-sm font-medium">
                            {trip.price_per_kg ? `R$ ${trip.price_per_kg.toFixed(2)}` : 'A combinar'}
                          </p>
                        </div>
                      </div>

                      {/* Carrier Info */}
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 bg-jungle/10 rounded-full flex items-center justify-center">
                          <User size={20} className="text-jungle" />
                        </div>
                        <div>
                          <p className="font-medium text-sm">{trip.carrier_name}</p>
                          <div className="flex items-center gap-1">
                            <Star size={14} weight="fill" className="text-yellow-500" />
                            <span className="text-xs text-muted-foreground">
                              {trip.carrier_rating > 0 ? trip.carrier_rating.toFixed(1) : 'Novo'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Action */}
                    <div className="flex flex-col items-end gap-2">
                      <Badge className="bg-lime/10 text-lime-700 hover:bg-lime/20">
                        {trip.status === 'published' ? 'Disponível' : trip.status}
                      </Badge>
                      <Button 
                        onClick={(e) => handleCreateMatch(e, trip.id)}
                        className="bg-jungle hover:bg-jungle-800"
                        data-testid={`match-btn-${trip.id}`}
                      >
                        Combinar
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default BrowseTripsPage;
