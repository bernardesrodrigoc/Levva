import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Package, MapPin, Cube, CurrencyDollar, Star, User } from '@phosphor-icons/react';
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

const BrowseShipmentsPage = () => {
  // ADICIONADO: user para poder filtrar
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const [shipments, setShipments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    originCity: '',
    destinationCity: ''
  });

  // CORREÇÃO: Só busca quando token e user existirem
  useEffect(() => {
    if (token && user) {
      fetchShipments();
    }
  }, [token, user]);

  const fetchShipments = async (filterParams = {}) => {
    if (!token) return; // Proteção extra

    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterParams.originCity) params.append('origin_city', filterParams.originCity);
      if (filterParams.destinationCity) params.append('destination_city', filterParams.destinationCity);
      params.append('status', 'published');

      const response = await axios.get(`${API}/shipments?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      // CORREÇÃO: Filtra para remover MEUS envios da lista
      const othersShipments = response.data.filter(shipment => shipment.sender_id !== user.id);
      
      setShipments(othersShipments);
    } catch (error) {
      console.error(error);
      if (error.response?.status !== 401) {
        toast.error('Erro ao carregar envios');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    fetchShipments(filters);
  };

  const handleCreateMatch = async (shipmentId, shipment) => {
    navigate('/criar-combinacao', { state: { shipmentId } });
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
            <Package size={28} weight="duotone" className="text-lime hidden md:block" />
            Buscar Envios
          </h1>
          <p className="text-sm md:text-base text-muted-foreground">Encontre pacotes para transportar</p>
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
        ) : shipments.length === 0 ? (
          <Card className="text-center py-10 md:py-12">
            <CardContent>
              <Package size={40} weight="duotone" className="mx-auto text-muted-foreground mb-3 md:mb-4" />
              <p className="text-base md:text-lg font-semibold mb-1 md:mb-2">Nenhum envio encontrado</p>
              <p className="text-sm text-muted-foreground">Tente ajustar os filtros ou volte mais tarde</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3 md:space-y-4">
            <p className="text-xs md:text-sm text-muted-foreground">{shipments.length} envio(s) encontrado(s)</p>
            {shipments.map((shipment) => (
              <Card key={shipment.id} className="card-hover" data-testid={`shipment-card-${shipment.id}`}>
                <CardContent className="p-6">
                  <div className="flex items-start justify-between gap-6">
                    <div className="flex-1">
                      {/* Route */}
                      <div className="flex items-center gap-4 mb-4">
                        <div className="flex items-center gap-2">
                          <MapPin size={20} weight="fill" className="text-jungle" />
                          <div>
                            <p className="font-semibold">{shipment.origin.city}, {shipment.origin.state}</p>
                            <p className="text-xs text-muted-foreground">Origem</p>
                          </div>
                        </div>
                        <div className="flex-1 border-t-2 border-dashed border-border" />
                        <div className="flex items-center gap-2">
                          <MapPin size={20} weight="fill" className="text-lime" />
                          <div>
                            <p className="font-semibold">{shipment.destination.city}, {shipment.destination.state}</p>
                            <p className="text-xs text-muted-foreground">Destino</p>
                          </div>
                        </div>
                      </div>

                      {/* Package Details */}
                      <div className="grid md:grid-cols-4 gap-4 mb-4">
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">Categoria</p>
                          <div className="flex items-center gap-2">
                            <Cube size={16} className="text-jungle" />
                            <p className="text-sm font-medium">{shipment.package.category}</p>
                          </div>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">Peso</p>
                          <p className="text-sm font-medium">{shipment.package.weight_kg} kg</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">Dimensões (cm)</p>
                          <p className="text-sm font-medium">
                            {shipment.package.length_cm}×{shipment.package.width_cm}×{shipment.package.height_cm}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">Valor</p>
                          <div className="flex items-center gap-1">
                            <CurrencyDollar size={16} className="text-jungle" />
                            <p className="text-sm font-medium">R$ {shipment.declared_value.toFixed(2)}</p>
                          </div>
                        </div>
                      </div>

                      {/* Description */}
                      <p className="text-sm text-muted-foreground mb-4">{shipment.package.description}</p>

                      {/* Sender Info */}
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-lime/10 rounded-full flex items-center justify-center">
                          <User size={20} className="text-lime" />
                        </div>
                        <div>
                          <p className="font-medium text-sm">{shipment.sender_name}</p>
                          <div className="flex items-center gap-1">
                            <Star size={14} weight="fill" className="text-yellow-500" />
                            <span className="text-xs text-muted-foreground">
                              {shipment.sender_rating > 0 ? shipment.sender_rating.toFixed(1) : 'Novo'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Action */}
                    <div className="flex flex-col items-end gap-2">
                      <Badge className="bg-lime/10 text-lime-700 hover:bg-lime/20">
                        {shipment.status === 'published' ? 'Disponível' : shipment.status}
                      </Badge>
                      <Button 
                        onClick={() => handleCreateMatch(shipment.id, shipment)}
                        className="bg-jungle hover:bg-jungle-800"
                        data-testid={`match-btn-${shipment.id}`}
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

export default BrowseShipmentsPage;
