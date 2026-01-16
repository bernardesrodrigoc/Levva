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
  const { token } = useAuth();
  const navigate = useNavigate();
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    originCity: '',
    destinationCity: ''
  });

  useEffect(() => {
    fetchTrips();
  }, []);

  const fetchTrips = async (filterParams = {}) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterParams.originCity) params.append('origin_city', filterParams.originCity);
      if (filterParams.destinationCity) params.append('destination_city', filterParams.destinationCity);
      params.append('status', 'published');

      const response = await axios.get(`${API}/trips?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setTrips(response.data);
    } catch (error) {
      toast.error('Erro ao carregar viagens');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    fetchTrips(filters);
  };

  // Ajustado para evitar conflito com o clique do Card
  const handleCreateMatch = async (e, tripId) => {
    e.stopPropagation(); // Impede que o clique no botão abra a página de detalhes
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
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="glass border-b sticky top-0 z-50">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Package size={32} weight="duotone" className="text-jungle" />
            <span className="text-2xl font-heading font-bold text-jungle">Levva</span>
          </div>
          <Button variant="ghost" onClick={() => navigate('/dashboard')} data-testid="back-to-dashboard-btn">
            Voltar ao Dashboard
          </Button>
        </div>
      </header>

      <div className="container mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-4xl font-heading font-bold mb-2 flex items-center gap-3">
            <TruckIcon size={40} weight="duotone" className="text-jungle" />
            Buscar Viagens
          </h1>
          <p className="text-muted-foreground">Encontre transportadores para seu envio</p>
        </div>

        {/* Filters */}
        <Card className="mb-8" data-testid="filters-card">
          <CardHeader>
            <CardTitle>Filtros</CardTitle>
            <CardDescription>Refine sua busca</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-3 gap-4">
              <div>
                <Label htmlFor="originCity">Cidade de Origem</Label>
                <Input
                  id="originCity"
                  placeholder="Ex: São Paulo"
                  value={filters.originCity}
                  onChange={(e) => setFilters(prev => ({ ...prev, originCity: e.target.value }))}
                  className="h-12 mt-2"
                  data-testid="origin-filter-input"
                />
              </div>
              <div>
                <Label htmlFor="destinationCity">Cidade de Destino</Label>
                <Input
                  id="destinationCity"
                  placeholder="Ex: Rio de Janeiro"
                  value={filters.destinationCity}
                  onChange={(e) => setFilters(prev => ({ ...prev, destinationCity: e.target.value }))}
                  className="h-12 mt-2"
                  data-testid="destination-filter-input"
                />
              </div>
              <div className="flex items-end">
                <Button 
                  onClick={handleSearch} 
                  className="h-12 w-full bg-jungle hover:bg-jungle-800"
                  data-testid="search-btn"
                >
                  Buscar
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Results */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-jungle"></div>
          </div>
        ) : trips.length === 0 ? (
          <Card className="text-center py-12">
            <CardContent>
              <TruckIcon size={48} weight="duotone" className="mx-auto text-muted-foreground mb-4" />
              <p className="text-lg font-semibold mb-2">Nenhuma viagem encontrada</p>
              <p className="text-muted-foreground">Tente ajustar os filtros ou volte mais tarde</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">{trips.length} viagem(ns) encontrada(s)</p>
            {trips.map((trip) => (
              <Card 
                key={trip.id} 
                // AQUI ESTÁ A MUDANÇA: onClick para navegar aos detalhes
                className="card-hover cursor-pointer hover:border-jungle transition-all" 
                data-testid={`trip-card-${trip.id}`}
                onClick={() => navigate(`/viagens/${trip.id}`)}
              >
                <CardContent className="p-6">
                  <div className="flex items-start justify-between gap-6">
                    <div className="flex-1">
                      {/* Route */}
                      <div className="flex items-center gap-4 mb-4">
                        <div className="flex items-center gap-2">
                          <MapPin size={20} weight="fill" className="text-jungle" />
                          <div>
                            <p className="font-semibold">{trip.origin.city}, {trip.origin.state}</p>
                            <p className="text-xs text-muted-foreground">Origem</p>
                          </div>
                        </div>
                        <div className="flex-1 border-t-2 border-dashed border-border" />
                        <div className="flex items-center gap-2">
                          <MapPin size={20} weight="fill" className="text-lime" />
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
                        // Alterado para passar o evento 'e' e parar propagação
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
