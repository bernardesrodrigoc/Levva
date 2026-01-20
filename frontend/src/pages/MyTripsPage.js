import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Truck, Clock, Plus, CheckCircle, XCircle, Eye, Play } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const STATUS_CONFIG = {
  published: { label: 'Aguardando Match', color: 'bg-jungle/10 text-jungle', icon: Truck },
  matched: { label: 'Com Envios', color: 'bg-blue-100 text-blue-800', icon: Truck },
  in_progress: { label: 'Em Andamento', color: 'bg-purple-100 text-purple-800', icon: Play },
  completed: { label: 'Concluída', color: 'bg-green-100 text-green-800', icon: CheckCircle },
  cancelled: { label: 'Cancelada', color: 'bg-red-100 text-red-800', icon: XCircle },
  cancelled_by_carrier: { label: 'Cancelada', color: 'bg-red-100 text-red-800', icon: XCircle },
  expired: { label: 'Expirada', color: 'bg-gray-100 text-gray-600', icon: Clock }
};

const MyTripsPage = () => {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [activeTrips, setActiveTrips] = useState([]);
  const [historyTrips, setHistoryTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('active');

  useEffect(() => { fetchTrips(); }, []);

  const fetchTrips = async () => {
    setLoading(true);
    try {
      const [activeRes, historyRes] = await Promise.all([
        axios.get(`${API}/trips/my-trips`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        axios.get(`${API}/trips/my-trips/history`, {
          headers: { Authorization: `Bearer ${token}` }
        })
      ]);
      
      setActiveTrips(activeRes.data);
      setHistoryTrips(historyRes.data);
    } catch (error) {
      console.error(error);
      toast.error('Erro ao carregar viagens');
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status) => {
    const config = STATUS_CONFIG[status] || { label: status, color: 'bg-gray-100 text-gray-800' };
    return <Badge className={config.color}>{config.label}</Badge>;
  };

  const formatDate = (date) => {
    if (!date) return '';
    return new Date(date).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const renderTripCard = (trip, isHistory = false) => (
    <Card key={trip.id} className={isHistory ? 'opacity-80' : ''}>
      <CardContent className="p-6 flex flex-col md:flex-row items-center gap-6">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            {getStatusBadge(trip.status)}
            <span className="text-xs text-muted-foreground">
              {formatDate(trip.departure_date)}
            </span>
          </div>
          <div className="flex items-center gap-3 text-lg font-bold">
            <span>{trip.origin?.city}</span>
            <span className="text-muted-foreground">→</span>
            <span>{trip.destination?.city}</span>
          </div>
          
          {/* Show capacity info */}
          <div className="flex gap-4 mt-2 text-sm text-muted-foreground">
            <span>Capacidade: {trip.cargo_space?.max_weight_kg || 0}kg</span>
            {trip.vehicle_type && <span>• {trip.vehicle_type}</span>}
          </div>
          
          {/* Show cancellation reason if cancelled */}
          {trip.cancellation_reason && (
            <p className="text-xs text-red-500 mt-1">
              Motivo: {trip.cancellation_reason}
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => navigate(`/viagens/${trip.id}`)}
          >
            <Eye size={16} className="mr-1" /> Ver Detalhes
          </Button>
          
          {/* Only show cancel for active published trips */}
          {!isHistory && trip.status === 'published' && (
            <Button 
              variant="ghost" 
              size="sm"
              className="text-red-500 hover:bg-red-50" 
              onClick={() => navigate(`/viagens/${trip.id}`)}
            >
              <XCircle size={16} className="mr-1" /> Gerenciar
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );

  if (loading) return <div className="p-8 text-center">Carregando...</div>;

  return (
    <div className="container mx-auto px-6 py-8 min-h-screen bg-background pb-24">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-heading font-bold text-jungle-900">Minhas Viagens</h1>
        <Button onClick={() => navigate('/criar-viagem')} className="bg-jungle hover:bg-jungle-800">
          <Plus className="mr-2" /> Nova Viagem
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2 mb-6">
          <TabsTrigger value="active" className="flex items-center gap-2">
            <Truck size={18} />
            Ativas ({activeTrips.length})
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-2">
            <Clock size={18} />
            Histórico ({historyTrips.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="active">
          {activeTrips.length === 0 ? (
            <div className="text-center py-12 bg-muted/20 rounded-lg border-2 border-dashed">
              <Truck size={48} className="mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">Você não tem viagens ativas.</p>
              <Button onClick={() => navigate('/criar-viagem')} className="mt-4">
                Criar Primeira Viagem
              </Button>
            </div>
          ) : (
            <div className="grid gap-4">
              {activeTrips.map(trip => renderTripCard(trip, false))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="history">
          {historyTrips.length === 0 ? (
            <div className="text-center py-12 bg-muted/20 rounded-lg border-2 border-dashed">
              <Clock size={48} className="mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">Nenhuma viagem no histórico.</p>
              <p className="text-xs text-muted-foreground mt-2">
                Viagens concluídas, canceladas ou expiradas aparecerão aqui.
              </p>
            </div>
          ) : (
            <div className="grid gap-4">
              {historyTrips.map(trip => renderTripCard(trip, true))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default MyTripsPage;
