import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Truck, Calendar, MapPin, User, ArrowLeft, Package, Warning, X, Check } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import axios from 'axios';
import RouteMap from '@/components/RouteMap';
import { useAuth } from '@/context/AuthContext';

const getBackendUrl = () => {
    let url = process.env.REACT_APP_BACKEND_URL || '';
    if (url && !url.startsWith('http')) { url = `https://${url}`; }
    return url.replace(/\/$/, '');
};
const API = `${getBackendUrl()}/api`;

const TripDetailsPage = () => {
  const { tripId } = useParams();
  const navigate = useNavigate();
  const { token, user } = useAuth();
  const [trip, setTrip] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // Management state
  const [showManageDialog, setShowManageDialog] = useState(false);
  const [managementInfo, setManagementInfo] = useState(null);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    fetchTrip();
  }, [tripId, token]);

  const fetchTrip = async () => {
    try {
      const res = await axios.get(`${API}/trips/${tripId}`, {
          headers: { Authorization: `Bearer ${token}` }
      });
      setTrip(res.data);
    } catch (error) {
      console.error("Erro ao carregar viagem", error);
      toast.error("Não foi possível carregar os detalhes da viagem.");
    } finally {
      setLoading(false);
    }
  };

  const fetchManagementInfo = async () => {
    try {
      const res = await axios.get(`${API}/trips/${tripId}/management`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setManagementInfo(res.data);
      setShowManageDialog(true);
    } catch (error) {
      console.error("Erro ao carregar info de gerenciamento", error);
      toast.error("Erro ao carregar informações de gerenciamento");
    }
  };

  const handleCancelTrip = async () => {
    if (!cancelReason.trim()) {
      toast.error("Por favor, informe o motivo do cancelamento");
      return;
    }
    
    setCancelling(true);
    try {
      const res = await axios.post(
        `${API}/trips/${tripId}/cancel`,
        { reason: cancelReason },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      toast.success(res.data.message);
      if (res.data.refund_pending) {
        toast.info("O reembolso será processado em breve.");
      }
      
      setShowCancelDialog(false);
      setShowManageDialog(false);
      fetchTrip(); // Refresh trip data
    } catch (error) {
      toast.error(error.response?.data?.detail || "Erro ao cancelar viagem");
    } finally {
      setCancelling(false);
    }
  };

  const getStatusBadge = (status) => {
    const statusConfig = {
      published: { label: 'Publicada', variant: 'default', className: 'bg-green-100 text-green-700' },
      matched: { label: 'Combinada', variant: 'default', className: 'bg-blue-100 text-blue-700' },
      in_progress: { label: 'Em Andamento', variant: 'default', className: 'bg-yellow-100 text-yellow-700' },
      completed: { label: 'Concluída', variant: 'default', className: 'bg-green-100 text-green-700' },
      cancelled: { label: 'Cancelada', variant: 'destructive', className: 'bg-red-100 text-red-700' },
      cancelled_by_carrier: { label: 'Cancelada pelo Transportador', variant: 'destructive', className: 'bg-red-100 text-red-700' },
      cancelled_by_sender: { label: 'Cancelada pelo Remetente', variant: 'destructive', className: 'bg-red-100 text-red-700' },
    };
    const config = statusConfig[status] || { label: status, className: 'bg-gray-100 text-gray-700' };
    return <Badge className={config.className}>{config.label}</Badge>;
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center">Carregando detalhes...</div>;
  if (!trip) return <div className="min-h-screen flex items-center justify-center">Viagem não encontrada</div>;

  const isOwner = user?.id === trip.carrier_id;
  const isCancelled = trip.status?.includes('cancelled');

  return (
    <div className="min-h-screen bg-background pb-12">
      {/* Header with Back Button */}
      <header className="bg-white border-b sticky top-0 z-40">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => navigate(-1)}
            data-testid="back-button"
          >
            <ArrowLeft size={24} />
          </Button>
          <div>
            <h1 className="text-xl font-bold">Detalhes da Viagem</h1>
            <p className="text-sm text-muted-foreground">{trip.origin?.city} → {trip.destination?.city}</p>
          </div>
          <div className="ml-auto">
            {getStatusBadge(trip.status)}
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6 grid md:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="md:col-span-2 space-y-6">
          {/* Map */}
          <Card>
            <CardContent className="p-0 h-[300px] rounded-lg overflow-hidden">
              <RouteMap
                origin={{ lat: trip.origin?.lat, lng: trip.origin?.lng }}
                destination={{ lat: trip.destination?.lat, lng: trip.destination?.lng }}
                polyline={trip.route_polyline}
              />
            </CardContent>
          </Card>

          {/* Trip Info */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Truck className="text-jungle" /> Informações da Viagem
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-start gap-3">
                  <MapPin size={20} className="text-green-600 mt-1" />
                  <div>
                    <p className="text-xs text-muted-foreground">Origem</p>
                    <p className="font-medium">{trip.origin?.city}, {trip.origin?.state}</p>
                    <p className="text-sm text-muted-foreground">{trip.origin?.neighborhood}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <MapPin size={20} className="text-red-600 mt-1" />
                  <div>
                    <p className="text-xs text-muted-foreground">Destino</p>
                    <p className="font-medium">{trip.destination?.city}, {trip.destination?.state}</p>
                    <p className="text-sm text-muted-foreground">{trip.destination?.neighborhood}</p>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-3 pt-4 border-t">
                <Calendar size={20} className="text-jungle" />
                <div>
                  <p className="text-xs text-muted-foreground">Data de Partida</p>
                  <p className="font-medium">
                    {trip.departure_date 
                      ? new Date(trip.departure_date).toLocaleDateString('pt-BR', {
                          weekday: 'long', day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit'
                        })
                      : 'Data não definida'}
                  </p>
                </div>
              </div>

              {trip.vehicle_type && (
                <div className="flex items-center gap-3 pt-4 border-t">
                  <Truck size={20} className="text-jungle" />
                  <div>
                    <p className="text-xs text-muted-foreground">Veículo</p>
                    <p className="font-medium capitalize">{trip.vehicle_type}</p>
                  </div>
                </div>
              )}

              {/* Cancellation Info */}
              {trip.cancellation && (
                <div className="bg-red-50 p-4 rounded-lg border border-red-200 mt-4">
                  <p className="font-medium text-red-700 flex items-center gap-2">
                    <Warning size={18} /> Viagem Cancelada
                  </p>
                  <p className="text-sm text-red-600 mt-1">Motivo: {trip.cancellation.reason}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Em: {new Date(trip.cancellation.cancelled_at).toLocaleString('pt-BR')}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <Card className="h-fit sticky top-24">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <User className="text-jungle" /> {isOwner ? 'Sua Viagem' : 'Transportador'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-center p-4 bg-muted/30 rounded-lg">
              <span className="text-3xl font-bold text-jungle">
                R$ {trip.price_per_kg?.toFixed(2)}<span className="text-sm font-normal text-muted-foreground">/kg</span>
              </span>
            </div>

            {!isOwner ? (
              <Button 
                className="w-full bg-jungle hover:bg-jungle-800 h-12 text-lg shadow-md"
                onClick={() => navigate(`/matches/new?trip_id=${tripId}`)}
                disabled={isCancelled}
              >
                <Package className="mr-2" /> Solicitar Envio
              </Button>
            ) : (
              <div className="space-y-2">
                <Button 
                  variant="outline" 
                  className="w-full border-jungle text-jungle hover:bg-jungle/10"
                  onClick={fetchManagementInfo}
                  disabled={isCancelled}
                  data-testid="manage-trip-btn"
                >
                  Gerenciar Minha Viagem
                </Button>
                {isCancelled && (
                  <p className="text-xs text-center text-muted-foreground">
                    Esta viagem foi cancelada e não pode ser gerenciada.
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Management Dialog */}
      <Dialog open={showManageDialog} onOpenChange={setShowManageDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Gerenciar Viagem</DialogTitle>
            <DialogDescription>
              Gerencie sua viagem de {trip.origin?.city} para {trip.destination?.city}
            </DialogDescription>
          </DialogHeader>
          
          {managementInfo && (
            <div className="space-y-4">
              {/* Status Info */}
              <div className="bg-muted/30 p-4 rounded-lg">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm text-muted-foreground">Status</span>
                  {getStatusBadge(managementInfo.status)}
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Combinações</span>
                  <span className="font-medium">{managementInfo.matches_count}</span>
                </div>
                {managementInfo.has_paid_matches && (
                  <div className="flex justify-between items-center mt-2">
                    <span className="text-sm text-muted-foreground">Pagamentos</span>
                    <Badge className="bg-green-100 text-green-700">Há pagamentos</Badge>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="space-y-2">
                {managementInfo.available_actions.includes('view_matches') && (
                  <Button 
                    className="w-full" 
                    variant="outline"
                    onClick={() => {
                      setShowManageDialog(false);
                      navigate(`/my-trips`);
                    }}
                  >
                    Ver Combinações
                  </Button>
                )}
                
                {managementInfo.available_actions.includes('start_trip') && (
                  <Button className="w-full bg-jungle hover:bg-jungle-800">
                    <Check className="mr-2" size={18} /> Iniciar Viagem
                  </Button>
                )}

                {managementInfo.cancellation_allowed && (
                  <Button 
                    variant="destructive" 
                    className="w-full"
                    onClick={() => {
                      setShowManageDialog(false);
                      setShowCancelDialog(true);
                    }}
                  >
                    <X className="mr-2" size={18} /> Cancelar Viagem
                  </Button>
                )}
                
                {managementInfo.cancellation_has_penalty && (
                  <p className="text-xs text-center text-yellow-600">
                    ⚠️ O cancelamento pode gerar penalidades ou reembolsos.
                  </p>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Cancel Confirmation Dialog */}
      <Dialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-red-600 flex items-center gap-2">
              <Warning /> Cancelar Viagem
            </DialogTitle>
            <DialogDescription>
              Esta ação não pode ser desfeita. Por favor, informe o motivo do cancelamento.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label>Motivo do Cancelamento *</Label>
              <Textarea
                className="mt-1"
                placeholder="Ex: Mudança de planos, problema com o veículo..."
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                rows={3}
              />
            </div>
            
            {managementInfo?.has_paid_matches && (
              <div className="bg-yellow-50 p-3 rounded-lg border border-yellow-200">
                <p className="text-sm text-yellow-700">
                  <Warning className="inline mr-1" size={16} />
                  Há pagamentos associados a esta viagem. O reembolso será processado automaticamente.
                </p>
              </div>
            )}
            
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                className="flex-1"
                onClick={() => setShowCancelDialog(false)}
              >
                Voltar
              </Button>
              <Button 
                variant="destructive" 
                className="flex-1"
                onClick={handleCancelTrip}
                disabled={cancelling}
              >
                {cancelling ? 'Cancelando...' : 'Confirmar Cancelamento'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TripDetailsPage;
