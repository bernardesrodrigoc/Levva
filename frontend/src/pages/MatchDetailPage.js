import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Package, MapPin, TruckIcon, User, Star, Check, X, Camera, CurrencyDollar, CreditCard, MapTrifold, NavigationArrow, Play, Pause, Warning } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ChatBox } from '@/components/ChatBox';
import RouteMap from '@/components/RouteMap';
import LiveTrackingMap from '@/components/LiveTrackingMap';
import { useGPSTracking, useCarrierGPS } from '@/hooks/useGPSTracking';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Live Tracking Section Component
const LiveTrackingSection = ({ matchId, match, isCarrier, token }) => {
  const [trackingStatus, setTrackingStatus] = useState(null);
  
  // For sender watching
  const watcherTracking = useGPSTracking(matchId, token, false);
  
  // For carrier sending location
  const carrierGPS = useCarrierGPS(matchId, token, 15);

  useEffect(() => {
    // Fetch initial tracking status
    const fetchStatus = async () => {
      try {
        const response = await axios.get(`${API}/tracking/${matchId}/status`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setTrackingStatus(response.data);
      } catch (error) {
        console.error('Error fetching tracking status:', error);
      }
    };
    fetchStatus();
  }, [matchId, token]);

  // Connect watcher when component mounts (for sender)
  useEffect(() => {
    if (!isCarrier) {
      watcherTracking.connect();
      watcherTracking.requestLastLocation();
      watcherTracking.requestRouteHistory();
    }
    
    return () => {
      if (!isCarrier) {
        watcherTracking.disconnect();
      }
    };
  }, [isCarrier]);

  if (isCarrier) {
    // Carrier view - controls to start/stop tracking
    return (
      <div className="space-y-4">
        {/* Permission Alert */}
        {carrierGPS.permissionStatus === 'denied' && (
          <Alert className="border-red-200 bg-red-50">
            <AlertDescription className="text-red-700">
              Permissão de localização negada. Habilite nas configurações do navegador para usar o rastreamento.
            </AlertDescription>
          </Alert>
        )}

        {/* Tracking Controls */}
        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
          <div>
            <h4 className="font-medium">Rastreamento GPS</h4>
            <p className="text-sm text-muted-foreground">
              {carrierGPS.isTracking 
                ? 'Sua localização está sendo enviada ao remetente'
                : 'Inicie o rastreamento para que o remetente acompanhe a entrega'
              }
            </p>
          </div>
          
          {carrierGPS.isTracking ? (
            <Button
              variant="outline"
              onClick={carrierGPS.stopTracking}
              className="gap-2"
              data-testid="stop-tracking-btn"
            >
              <Pause size={18} />
              Parar
            </Button>
          ) : (
            <Button
              onClick={carrierGPS.startTracking}
              className="gap-2 bg-jungle hover:bg-jungle-800"
              data-testid="start-tracking-btn"
            >
              <Play size={18} />
              Iniciar
            </Button>
          )}
        </div>

        {/* Status Info */}
        {carrierGPS.isTracking && carrierGPS.lastSentLocation && (
          <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
            <div className="flex items-center gap-2 text-green-700">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              <span className="text-sm font-medium">Rastreamento ativo</span>
            </div>
            <p className="text-xs text-green-600 mt-1">
              Última atualização: {new Date().toLocaleTimeString('pt-BR')}
            </p>
          </div>
        )}

        {/* RESPONSIVIDADE: Wrapper para controlar altura do mapa */}
        <div className="h-[300px] md:h-[500px] w-full rounded-lg overflow-hidden border">
            <LiveTrackingMap
            carrierLocation={carrierGPS.lastSentLocation ? {
                lat: carrierGPS.lastSentLocation.latitude,
                lng: carrierGPS.lastSentLocation.longitude
            } : null}
            pickupLocation={match.shipment?.origin}
            dropoffLocation={match.shipment?.destination}
            routePolyline={match.trip?.route_polyline}
            isTracking={carrierGPS.isTracking}
            height="100%" // Ocupa a altura do pai
            />
        </div>
      </div>
    );
  }

  // Sender view - watch carrier location
  return (
    <div className="space-y-4">
      {/* Connection Status */}
      <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${watcherTracking.isConnected ? 'bg-green-500' : 'bg-gray-400'}`} />
          <span className="text-sm">
            {watcherTracking.isConnected ? 'Conectado' : 'Conectando...'}
          </span>
        </div>
        {watcherTracking.isTracking && (
          <Badge className="bg-green-100 text-green-700">
            <NavigationArrow size={12} className="mr-1" />
            Em movimento
          </Badge>
        )}
      </div>

      {/* RESPONSIVIDADE: Wrapper para altura do mapa */}
      <div className="h-[300px] md:h-[500px] w-full rounded-lg overflow-hidden border">
        <LiveTrackingMap
            carrierLocation={watcherTracking.currentLocation}
            pickupLocation={match.shipment?.origin}
            dropoffLocation={match.shipment?.destination}
            routePolyline={match.trip?.route_polyline}
            routeHistory={watcherTracking.routeHistory}
            isTracking={watcherTracking.isTracking}
            followCarrier={true}
            height="100%" // Ocupa a altura do pai
        />
      </div>

      {/* Last Update Info */}
      {watcherTracking.currentLocation && (
        <div className="text-xs text-muted-foreground text-center">
          Última atualização: {watcherTracking.currentLocation.timestamp 
            ? new Date(watcherTracking.currentLocation.timestamp).toLocaleTimeString('pt-BR')
            : 'Agora'
          }
        </div>
      )}
    </div>
  );
};

const MatchDetailPage = () => {
  const { matchId } = useParams();
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const [match, setMatch] = useState(null);
  const [loading, setLoading] = useState(true);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [showRatingDialog, setShowRatingDialog] = useState(false);
  const [showPhotoDialog, setShowPhotoDialog] = useState(false);
  const [photoAction, setPhotoAction] = useState(null);
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [rating, setRating] = useState(5);
  const [ratingComment, setRatingComment] = useState('');

  useEffect(() => {
    fetchMatchDetails();
  }, [matchId]);

  const fetchMatchDetails = async () => {
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const response = await axios.get(`${API}/matches/${matchId}`, { headers });
      setMatch(response.data);
    } catch (error) {
      toast.error('Erro ao carregar detalhes');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handlePayment = async () => {
    setPaymentLoading(true);
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const response = await axios.post(
        `${API}/payments/initiate`,
        {
          match_id: matchId,
          amount: match.estimated_price
        },
        { headers }
      );

      if (response.data.checkout_url) {
        // Redirect to Mercado Pago checkout
        window.location.href = response.data.checkout_url;
      } else {
        toast.error('Erro ao gerar link de pagamento');
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Erro ao iniciar pagamento');
    } finally {
      setPaymentLoading(false);
    }
  };

  const handlePhotoChange = (file) => {
    if (file) {
      setPhotoFile(file);
      const reader = new FileReader();
      reader.onloadend = () => setPhotoPreview(reader.result);
      reader.readAsDataURL(file);
    }
  };

  const handleConfirmPickup = async () => {
    if (!photoFile) {
      toast.error('Foto é obrigatória');
      return;
    }

    try {
      // In production, upload to R2 first
      const photoUrl = 'https://via.placeholder.com/400x300?text=Pickup+Photo';

      await axios.post(
        `${API}/matches/${matchId}/confirm-pickup`,
        { photo_url: photoUrl },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      toast.success('Coleta confirmada!');
      setShowPhotoDialog(false);
      fetchMatchDetails();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Erro ao confirmar coleta');
    }
  };

  const handleConfirmDelivery = async () => {
    if (!photoFile) {
      toast.error('Foto é obrigatória');
      return;
    }

    try {
      const photoUrl = 'https://via.placeholder.com/400x300?text=Delivery+Photo';

      await axios.post(
        `${API}/matches/${matchId}/confirm-delivery`,
        { photo_url: photoUrl },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      toast.success('Entrega confirmada!');
      setShowPhotoDialog(false);
      fetchMatchDetails();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Erro ao confirmar entrega');
    }
  };

  const handleSubmitRating = async () => {
    try {
      const ratedUserId = user.id === match.carrier_id ? match.sender_id : match.carrier_id;

      await axios.post(
        `${API}/ratings`,
        {
          match_id: matchId,
          rated_user_id: ratedUserId,
          rating: rating,
          comment: ratingComment
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      toast.success('Avaliação enviada!');
      setShowRatingDialog(false);
      navigate('/dashboard');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Erro ao avaliar');
    }
  };

  const openPhotoDialog = (action) => {
    setPhotoAction(action);
    setPhotoFile(null);
    setPhotoPreview(null);
    setShowPhotoDialog(true);
  };

  const getStatusBadge = (status) => {
    const badges = {
      pending_payment: { label: 'Aguardando Pagamento', color: 'bg-yellow-100 text-yellow-700' },
      paid: { label: 'Pago', color: 'bg-blue-100 text-blue-700' },
      in_transit: { label: 'Em Trânsito', color: 'bg-purple-100 text-purple-700' },
      delivered: { label: 'Entregue', color: 'bg-jungle/10 text-jungle' }
    };
    const badge = badges[status] || { label: status, color: 'bg-gray-100 text-gray-700' };
    return <Badge className={badge.color}>{badge.label}</Badge>;
  };

  const isCarrier = user?.id === match?.carrier_id;
  const isSender = user?.id === match?.sender_id;
  const canPay = isSender && match?.status === 'pending_payment';
  const canConfirmPickup = isCarrier && match?.status === 'paid' && !match?.pickup_confirmed_at;
  const canConfirmDelivery = isCarrier && match?.status === 'in_transit' && !match?.delivery_confirmed_at;
  const canRate = match?.status === 'delivered' && !match?.rated;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 md:h-12 md:w-12 border-b-2 border-jungle"></div>
      </div>
    );
  }

  if (!match) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center">
          <p className="text-base md:text-lg font-semibold mb-2">Combinação não encontrada</p>
          <Button onClick={() => navigate('/dashboard')} size="sm">Voltar</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24 md:pb-8">
      {/* Header - Mobile Optimized */}
      <header className="glass border-b sticky top-0 z-50">
        <div className="container mx-auto px-4 md:px-6 py-3 md:py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Package size={28} weight="duotone" className="text-jungle" />
            <span className="text-xl md:text-2xl font-heading font-bold text-jungle">Levva</span>
          </div>
          <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard')} data-testid="back-btn">
            Voltar
          </Button>
        </div>
      </header>

      <div className="container mx-auto px-4 md:px-6 py-4 md:py-8 max-w-5xl">
        {/* Title - Mobile Optimized */}
        <div className="mb-4 md:mb-6 flex flex-col md:flex-row md:items-center justify-between gap-3 md:gap-4">
          <div>
            <h1 className="text-xl md:text-3xl font-heading font-bold mb-1 md:mb-2">Detalhes da Combinação</h1>
            <p className="text-xs md:text-sm text-muted-foreground">ID: {matchId?.slice(0, 12)}...</p>
          </div>
          {getStatusBadge(match.status)}
        </div>

        {/* Route Card - Mobile Optimized */}
        <Card className="mb-4 md:mb-6">
          <CardHeader className="p-4 md:p-6 pb-2 md:pb-4">
            <CardTitle className="text-base md:text-lg">Rota</CardTitle>
          </CardHeader>
          <CardContent className="p-4 md:p-6 pt-0">
            <div className="flex items-center gap-2 md:gap-4">
              <div className="flex items-center gap-1.5 md:gap-2 flex-1 min-w-0">
                <MapPin size={20} weight="fill" className="text-jungle flex-shrink-0" />
                <div className="min-w-0">
                  <p className="font-semibold text-sm md:text-base truncate">{match.trip?.origin.city}</p>
                  <p className="text-[10px] md:text-sm text-muted-foreground">Origem</p>
                </div>
              </div>
              <div className="flex-shrink-0 w-6 md:flex-1 border-t-2 border-dashed" />
              <div className="flex items-center gap-1.5 md:gap-2 flex-1 min-w-0 justify-end md:justify-start">
                <MapPin size={20} weight="fill" className="text-lime flex-shrink-0" />
                <div className="min-w-0 text-right md:text-left">
                  <p className="font-semibold text-sm md:text-base truncate">{match.trip?.destination.city}</p>
                  <p className="text-[10px] md:text-sm text-muted-foreground">Destino</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Route Map / Live Tracking - Mobile Optimized */}
        <Card className="mb-4 md:mb-6 overflow-hidden">
          <CardHeader className="p-4 md:p-6 pb-2 md:pb-4">
            <CardTitle className="flex items-center gap-2 text-base md:text-lg">
              <MapTrifold size={20} weight="duotone" className="text-jungle" />
              {match.status === 'in_transit' ? 'Rastreamento' : 'Mapa da Rota'}
            </CardTitle>
            <CardDescription className="text-xs md:text-sm">
              {match.status === 'in_transit' 
                ? 'Acompanhe em tempo real'
                : 'Visualize o trajeto'
              }
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 md:p-6 pt-0">
            {/* Live Tracking for in_transit status */}
            {match.status === 'in_transit' ? (
              <LiveTrackingSection 
                matchId={matchId} 
                match={match} 
                isCarrier={isCarrier}
                token={token}
              />
            ) : (
              /* Static Route Map - Mobile Optimized */
              <div className="h-[250px] md:h-[400px] w-full rounded-lg overflow-hidden border">
                  <RouteMap
                    originCity={match.trip?.origin.city}
                    originLat={match.trip?.origin.lat}
                    originLng={match.trip?.origin.lng}
                    originAddress={match.trip?.origin.address}
                    destinationCity={match.trip?.destination.city}
                    destinationLat={match.trip?.destination.lat}
                    destinationLng={match.trip?.destination.lng}
                    destinationAddress={match.trip?.destination.address}
                    routePolyline={match.trip?.route_polyline}
                    corridorRadiusKm={match.trip?.corridor_radius_km || 10}
                    showCorridor={true}
                    pickupLocation={match.shipment?.origin}
                    dropoffLocation={match.shipment?.destination}
                    status={match.status}
                    height="100%"
                  />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Payment Card - Mobile Optimized */}
        <Card className="mb-4 md:mb-6">
          <CardHeader className="p-4 md:p-6 pb-2 md:pb-4">
            <CardTitle className="text-base md:text-lg">Valores</CardTitle>
          </CardHeader>
          <CardContent className="p-4 md:p-6 pt-0">
            <div className="space-y-2 md:space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Valor Total</span>
                <span className="font-semibold text-base md:text-lg">R$ {match.estimated_price?.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs md:text-sm text-muted-foreground">Comissão Levva (15%)</span>
                <span className="text-xs md:text-sm text-muted-foreground">- R$ {match.platform_commission?.toFixed(2)}</span>
              </div>
              <div className="border-t pt-2 md:pt-3 flex items-center justify-between">
                <span className="font-semibold text-sm">Transportador Recebe</span>
                <span className="font-bold text-jungle text-lg md:text-xl">R$ {match.carrier_earnings?.toFixed(2)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Payment Action Card - Mobile Optimized */}
        {canPay && (
          <Card className="mb-4 md:mb-6 border-jungle bg-jungle/5">
            <CardHeader className="p-4 md:p-6 pb-2 md:pb-4">
              <CardTitle className="flex items-center gap-2 text-base md:text-lg">
                <CreditCard size={20} weight="duotone" className="text-jungle" />
                Pagamento Pendente
              </CardTitle>
              <CardDescription className="text-xs md:text-sm">
                Realize o pagamento para confirmar. O valor ficará em escrow até a entrega.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 md:p-6 pt-0">
              <Button
                onClick={handlePayment}
                disabled={paymentLoading}
                className="w-full h-11 md:h-12 bg-jungle hover:bg-jungle-800 text-base md:text-lg"
                data-testid="pay-btn"
              >
                {paymentLoading ? (
                  'Processando...'
                ) : (
                  <>
                    <CreditCard size={18} className="mr-2" />
                    Pagar R$ {match.estimated_price?.toFixed(2)}
                  </>
                )}
              </Button>
              <p className="text-[10px] md:text-xs text-center text-muted-foreground mt-2 md:mt-3">
                Pagamento seguro via Mercado Pago
              </p>
            </CardContent>
          </Card>
        )}

        {/* Users Card - Mobile Optimized */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 mb-4 md:mb-6">
          <Card>
            <CardHeader className="p-4 md:p-6 pb-2 md:pb-4">
              <CardTitle className="text-sm md:text-base">Transportador</CardTitle>
            </CardHeader>
            <CardContent className="p-4 md:p-6 pt-0">
              <div className="flex items-center gap-2 md:gap-3">
                <div className="w-10 h-10 md:w-12 md:h-12 bg-jungle/10 rounded-full flex items-center justify-center">
                  <TruckIcon size={20} className="text-jungle" />
                </div>
                <div>
                  <p className="font-semibold text-sm md:text-base">{match.carrier_name}</p>
                  <div className="flex items-center gap-1">
                    <Star size={12} weight="fill" className="text-yellow-500" />
                    <span className="text-xs text-muted-foreground">
                      {match.carrier_rating > 0 ? match.carrier_rating.toFixed(1) : 'Novo'}
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="p-4 md:p-6 pb-2 md:pb-4">
              <CardTitle className="text-base">Remetente</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-lime/10 rounded-full flex items-center justify-center">
                  <User size={24} className="text-lime" />
                </div>
                <div>
                  <p className="font-semibold">{match.sender_name}</p>
                  <div className="flex items-center gap-1">
                    <Star size={14} weight="fill" className="text-yellow-500" />
                    <span className="text-sm text-muted-foreground">
                      {match.sender_rating > 0 ? match.sender_rating.toFixed(1) : 'Novo'}
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Timeline */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Linha do Tempo</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-start gap-4">
                <div className="w-8 h-8 rounded-full bg-jungle flex items-center justify-center flex-shrink-0">
                  <Check size={16} className="text-white" />
                </div>
                <div>
                  <p className="font-semibold">Combinação Criada</p>
                  <p className="text-sm text-muted-foreground">
                    {new Date(match.created_at).toLocaleString('pt-BR')}
                  </p>
                </div>
              </div>

              {match.pickup_confirmed_at && (
                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 rounded-full bg-jungle flex items-center justify-center flex-shrink-0">
                    <Check size={16} className="text-white" />
                  </div>
                  <div>
                    <p className="font-semibold">Coleta Confirmada</p>
                    <p className="text-sm text-muted-foreground">
                      {new Date(match.pickup_confirmed_at).toLocaleString('pt-BR')}
                    </p>
                  </div>
                </div>
              )}

              {match.delivery_confirmed_at && (
                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 rounded-full bg-jungle flex items-center justify-center flex-shrink-0">
                    <Check size={16} className="text-white" />
                  </div>
                  <div>
                    <p className="font-semibold">Entrega Confirmada</p>
                    <p className="text-sm text-muted-foreground">
                      {new Date(match.delivery_confirmed_at).toLocaleString('pt-BR')}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex flex-col gap-4">
          {canConfirmPickup && (
            <Button
              onClick={() => openPhotoDialog('pickup')}
              className="h-12 bg-jungle hover:bg-jungle-800"
              data-testid="confirm-pickup-btn"
            >
              <Camera size={20} className="mr-2" />
              Confirmar Coleta (com foto)
            </Button>
          )}

          {canConfirmDelivery && (
            <Button
              onClick={() => openPhotoDialog('delivery')}
              className="h-12 bg-jungle hover:bg-jungle-800"
              data-testid="confirm-delivery-btn"
            >
              <Camera size={20} className="mr-2" />
              Confirmar Entrega (com foto)
            </Button>
          )}

          {canRate && (
            <Button
              onClick={() => setShowRatingDialog(true)}
              className="h-12 bg-jungle hover:bg-jungle-800"
              data-testid="rate-btn"
            >
              <Star size={20} className="mr-2" />
              Avaliar {isCarrier ? 'Remetente' : 'Transportador'}
            </Button>
          )}
        </div>

        {/* Chat Section */}
        <div className="mt-8">
          <ChatBox 
            matchId={matchId} 
            recipientName={isCarrier ? match.sender_name : match.carrier_name}
          />
        </div>
      </div>

      {/* Photo Dialog */}
      <Dialog open={showPhotoDialog} onOpenChange={setShowPhotoDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {photoAction === 'pickup' ? 'Confirmar Coleta' : 'Confirmar Entrega'}
            </DialogTitle>
            <DialogDescription>
              Tire uma foto do pacote para confirmar
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Foto *</Label>
              {photoPreview ? (
                <img src={photoPreview} alt="Preview" className="w-full h-48 object-cover rounded-lg mt-2" />
              ) : (
                <div className="mt-2 border-2 border-dashed rounded-lg p-8 text-center">
                  <Camera size={32} className="mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">Tire ou selecione uma foto</p>
                </div>
              )}
              <Input
                type="file"
                accept="image/*"
                onChange={(e) => handlePhotoChange(e.target.files[0])}
                className="mt-2"
                data-testid="photo-input"
              />
            </div>
            <div className="flex gap-4">
              <Button variant="outline" className="flex-1" onClick={() => setShowPhotoDialog(false)}>
                Cancelar
              </Button>
              <Button
                onClick={photoAction === 'pickup' ? handleConfirmPickup : handleConfirmDelivery}
                className="flex-1 bg-jungle hover:bg-jungle-800"
                disabled={!photoFile}
                data-testid="confirm-photo-btn"
              >
                Confirmar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Rating Dialog */}
      <Dialog open={showRatingDialog} onOpenChange={setShowRatingDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Avaliar {isCarrier ? 'Remetente' : 'Transportador'}</DialogTitle>
            <DialogDescription>
              Sua avaliação ajuda a construir confiança na plataforma
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Sua avaliação</Label>
              <div className="flex items-center gap-2 mt-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <Star
                    key={star}
                    size={32}
                    weight={star <= rating ? 'fill' : 'regular'}
                    className={`cursor-pointer ${star <= rating ? 'text-yellow-500' : 'text-gray-300'}`}
                    onClick={() => setRating(star)}
                  />
                ))}
              </div>
            </div>
            <div>
              <Label>Comentário (opcional)</Label>
              <Textarea
                value={ratingComment}
                onChange={(e) => setRatingComment(e.target.value)}
                placeholder="Compartilhe sua experiência..."
                rows={4}
                className="mt-2"
                data-testid="rating-comment-input"
              />
            </div>
            <div className="flex gap-4">
              <Button variant="outline" className="flex-1" onClick={() => setShowRatingDialog(false)}>
                Cancelar
              </Button>
              <Button
                onClick={handleSubmitRating}
                className="flex-1 bg-jungle hover:bg-jungle-800"
                data-testid="submit-rating-btn"
              >
                Enviar Avaliação
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MatchDetailPage;
