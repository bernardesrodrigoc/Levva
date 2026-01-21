import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Package, MapPin, TruckIcon, User, Star, Check, X, Camera, CurrencyDollar, CreditCard, MapTrifold, NavigationArrow, Play, Pause, Warning, Clock, CheckCircle, XCircle, ShieldCheck } from '@phosphor-icons/react';
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
import ImageUploadWithCamera from '@/components/ImageUploadWithCamera';
import { useGPSTracking, useCarrierGPS } from '@/hooks/useGPSTracking';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Live Tracking Section Component
const LiveTrackingSection = ({ matchId, match, isCarrier, token }) => {
  const [trackingStatus, setTrackingStatus] = useState(null);
  const [locationPermissionGranted, setLocationPermissionGranted] = useState(false);
  const [isRequestingPermission, setIsRequestingPermission] = useState(false);
  
  // For sender watching
  const watcherTracking = useGPSTracking(matchId, token, false);
  
  // For carrier sending location
  const carrierGPS = useCarrierGPS(matchId, token, 15);

  // Fetch tracking status periodically
  const fetchTrackingStatus = async () => {
    try {
      const response = await axios.get(`${API}/matches/${matchId}/tracking-status`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setTrackingStatus(response.data);
      setLocationPermissionGranted(response.data.location_permission_granted);
    } catch (error) {
      console.error('Error fetching tracking status:', error);
    }
  };

  useEffect(() => {
    fetchTrackingStatus();
    
    // Poll for updates every 30 seconds for sender
    let interval;
    if (!isCarrier) {
      interval = setInterval(fetchTrackingStatus, 30000);
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [matchId, token, isCarrier]);

  // Auto-update location to backend when carrier is tracking
  useEffect(() => {
    if (isCarrier && carrierGPS.isTracking && carrierGPS.lastSentLocation) {
      // Send location update to backend for persistence
      axios.post(
        `${API}/matches/${matchId}/update-location`,
        null,
        {
          params: {
            lat: carrierGPS.lastSentLocation.latitude,
            lng: carrierGPS.lastSentLocation.longitude,
            accuracy: carrierGPS.lastSentLocation.accuracy,
            speed: carrierGPS.lastSentLocation.speed
          },
          headers: { Authorization: `Bearer ${token}` }
        }
      ).catch(err => console.error('Error updating location:', err));
    }
  }, [carrierGPS.lastSentLocation, carrierGPS.isTracking, isCarrier, matchId, token]);

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

  // Handle location permission grant (carrier)
  const handleGrantLocationPermission = async () => {
    setIsRequestingPermission(true);
    
    try {
      // First, request browser permission
      const position = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000
        });
      });
      
      // Send to backend
      await axios.post(
        `${API}/matches/${matchId}/grant-location-permission`,
        {
          granted: true,
          initial_lat: position.coords.latitude,
          initial_lng: position.coords.longitude
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      setLocationPermissionGranted(true);
      
      // Auto-start tracking
      carrierGPS.startTracking();
      
      toast.success('Localização autorizada! Rastreamento iniciado automaticamente.');
      
    } catch (error) {
      if (error.code === 1) { // Permission denied
        toast.error('Permissão de localização negada. Habilite nas configurações do navegador.');
      } else if (error.code === 2) { // Position unavailable
        toast.error('Não foi possível obter sua localização. Tente novamente.');
      } else if (error.code === 3) { // Timeout
        toast.error('Tempo esgotado ao obter localização. Tente novamente.');
      } else {
        toast.error(error.response?.data?.detail || 'Erro ao autorizar localização');
      }
    } finally {
      setIsRequestingPermission(false);
    }
  };

  // Format time ago
  const formatTimeAgo = (minutes) => {
    if (minutes === null || minutes === undefined) return 'Nunca';
    if (minutes < 1) return 'Agora';
    if (minutes < 60) return `${minutes} min atrás`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}min atrás`;
  };

  if (isCarrier) {
    // Carrier view
    return (
      <div className="space-y-4">
        {/* Location Permission Required Alert */}
        {!locationPermissionGranted && (
          <Alert className="border-amber-200 bg-amber-50">
            <Warning size={20} className="text-amber-600" />
            <AlertDescription className="text-amber-800 ml-2">
              <strong>Atenção:</strong> Você precisa autorizar o acesso à localização para realizar esta entrega.
              O remetente precisa acompanhar o trajeto em tempo real.
            </AlertDescription>
          </Alert>
        )}

        {/* Permission Button or Tracking Status */}
        <div className="p-4 bg-gray-50 rounded-lg">
          {!locationPermissionGranted ? (
            <div className="text-center space-y-4">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-jungle/10 mx-auto">
                <MapPin size={32} className="text-jungle" />
              </div>
              <div>
                <h4 className="font-semibold text-lg">Autorização de Localização</h4>
                <p className="text-sm text-muted-foreground mt-1">
                  Para confirmar a coleta e realizar a entrega, você precisa permitir o acesso à sua localização.
                </p>
              </div>
              <Button
                onClick={handleGrantLocationPermission}
                disabled={isRequestingPermission}
                className="w-full sm:w-auto bg-jungle hover:bg-jungle-800 gap-2"
                data-testid="grant-location-btn"
              >
                {isRequestingPermission ? (
                  <>
                    <span className="animate-spin">⏳</span>
                    Solicitando permissão...
                  </>
                ) : (
                  <>
                    <MapPin size={18} />
                    Permitir acesso à localização para esta entrega
                  </>
                )}
              </Button>
              <p className="text-xs text-muted-foreground">
                Sua localização será compartilhada apenas durante o transporte
              </p>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${carrierGPS.isTracking ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
                  <h4 className="font-medium">
                    {carrierGPS.isTracking ? 'Rastreamento Ativo' : 'Rastreamento Pausado'}
                  </h4>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  {carrierGPS.isTracking 
                    ? 'Sua localização está sendo enviada ao remetente'
                    : 'Retome o rastreamento para continuar a entrega'
                  }
                </p>
              </div>
              
              {carrierGPS.isTracking ? (
                <Button
                  variant="outline"
                  onClick={carrierGPS.stopTracking}
                  className="gap-2"
                  data-testid="pause-tracking-btn"
                >
                  <Pause size={18} />
                  Pausar
                </Button>
              ) : (
                <Button
                  onClick={carrierGPS.startTracking}
                  className="gap-2 bg-jungle hover:bg-jungle-800"
                  data-testid="resume-tracking-btn"
                >
                  <Play size={18} />
                  Retomar
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Current Location Status */}
        {locationPermissionGranted && carrierGPS.isTracking && carrierGPS.lastSentLocation && (
          <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
            <div className="flex items-center gap-2 text-green-700">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              <span className="text-sm font-medium">Localização atualizada</span>
            </div>
            <p className="text-xs text-green-600 mt-1">
              Última atualização: {new Date().toLocaleTimeString('pt-BR')}
            </p>
          </div>
        )}

        {/* Map */}
        <div className="h-[300px] md:h-[500px] w-full rounded-lg overflow-hidden border">
          <LiveTrackingMap
            carrierLocation={carrierGPS.lastSentLocation ? {
              lat: carrierGPS.lastSentLocation.latitude,
              lng: carrierGPS.lastSentLocation.longitude
            } : null}
            pickupLocation={match.shipment?.origin ? {
              lat: match.shipment.origin.latitude || match.shipment.origin.lat,
              lng: match.shipment.origin.longitude || match.shipment.origin.lng,
              address: match.shipment.origin.address || match.shipment.origin.city
            } : null}
            dropoffLocation={match.shipment?.destination ? {
              lat: match.shipment.destination.latitude || match.shipment.destination.lat,
              lng: match.shipment.destination.longitude || match.shipment.destination.lng,
              address: match.shipment.destination.address || match.shipment.destination.city
            } : null}
            routePolyline={match.trip?.route_polyline}
            isTracking={carrierGPS.isTracking}
            height="100%"
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
          <div className={`w-3 h-3 rounded-full ${
            watcherTracking.isConnected 
              ? (trackingStatus?.location_stale ? 'bg-amber-500' : 'bg-green-500 animate-pulse')
              : 'bg-gray-400'
          }`} />
          <span className="text-sm font-medium">
            {watcherTracking.isConnected 
              ? (trackingStatus?.location_stale ? 'Localização desatualizada' : 'Conectado ao rastreamento')
              : 'Aguardando conexão...'
            }
          </span>
        </div>
        {watcherTracking.isTracking && (
          <Badge className="bg-green-100 text-green-700">
            <NavigationArrow size={12} className="mr-1" />
            Em movimento
          </Badge>
        )}
      </div>

      {/* Last Known Location Info */}
      {trackingStatus && (
        <div className={`p-3 rounded-lg border ${
          trackingStatus.location_stale 
            ? 'bg-amber-50 border-amber-200' 
            : 'bg-blue-50 border-blue-200'
        }`}>
          {trackingStatus.location_stale ? (
            <div className="flex items-start gap-2">
              <Warning size={20} className="text-amber-600 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-800">
                  Localização não atualizada há {trackingStatus.minutes_since_update} minutos
                </p>
                <p className="text-xs text-amber-600 mt-1">
                  O transportador pode estar em área sem sinal. A última posição conhecida está no mapa.
                </p>
              </div>
            </div>
          ) : trackingStatus.last_known_location ? (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-blue-800">Última posição conhecida</p>
                <p className="text-xs text-blue-600 mt-1">
                  Atualizado: {formatTimeAgo(trackingStatus.minutes_since_update)}
                </p>
              </div>
              <Badge variant="outline" className="text-blue-700">
                <Clock size={12} className="mr-1" />
                {trackingStatus.minutes_since_update !== null 
                  ? `${trackingStatus.minutes_since_update} min`
                  : 'N/A'
                }
              </Badge>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-gray-600">
              <Clock size={18} />
              <p className="text-sm">Aguardando primeira atualização de localização...</p>
            </div>
          )}
        </div>
      )}

      {/* Map */}
      <div className="h-[300px] md:h-[500px] w-full rounded-lg overflow-hidden border">
        <LiveTrackingMap
          carrierLocation={watcherTracking.currentLocation || (trackingStatus?.last_known_location ? {
            lat: trackingStatus.last_known_location.lat,
            lng: trackingStatus.last_known_location.lng
          } : null)}
          pickupLocation={match.shipment?.origin ? {
            lat: match.shipment.origin.latitude || match.shipment.origin.lat,
            lng: match.shipment.origin.longitude || match.shipment.origin.lng,
            address: match.shipment.origin.address || match.shipment.origin.city
          } : null}
          dropoffLocation={match.shipment?.destination ? {
            lat: match.shipment.destination.latitude || match.shipment.destination.lat,
            lng: match.shipment.destination.longitude || match.shipment.destination.lng,
            address: match.shipment.destination.address || match.shipment.destination.city
          } : null}
          routePolyline={match.trip?.route_polyline}
          routeHistory={watcherTracking.routeHistory}
          isTracking={watcherTracking.isTracking}
          followCarrier={true}
          height="100%"
        />
      </div>

      {/* Last Update Info */}
      {watcherTracking.currentLocation && (
        <div className="text-xs text-muted-foreground text-center">
          Última atualização em tempo real: {new Date(watcherTracking.currentLocation.timestamp || Date.now()).toLocaleTimeString('pt-BR')}
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
  const [uploadedPhotoUrl, setUploadedPhotoUrl] = useState(null);
  const [rating, setRating] = useState(5);
  const [ratingComment, setRatingComment] = useState('');
  
  // New state for delivery flow
  const [deliveryStatus, setDeliveryStatus] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [showConfirmDeliveryDialog, setShowConfirmDeliveryDialog] = useState(false);
  const [showDisputeDialog, setShowDisputeDialog] = useState(false);
  const [confirmationNotes, setConfirmationNotes] = useState('');
  const [disputeReason, setDisputeReason] = useState('');
  const [disputeDetails, setDisputeDetails] = useState('');

  useEffect(() => {
    fetchMatchDetails();
    fetchDeliveryStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const fetchDeliveryStatus = async () => {
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const response = await axios.get(`${API}/payments/${matchId}/delivery-status`, { headers });
      setDeliveryStatus(response.data);
    } catch (error) {
      console.error('Error fetching delivery status:', error);
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

  // === NEW: Delivery Flow Functions ===
  
  const handleMarkDelivered = async () => {
    setActionLoading(true);
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const response = await axios.post(
        `${API}/payments/${matchId}/mark-delivered`,
        {},
        { headers }
      );
      
      toast.success(response.data.message);
      fetchDeliveryStatus();
      fetchMatchDetails();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Erro ao marcar entrega');
    } finally {
      setActionLoading(false);
    }
  };

  const handleConfirmDeliveryBySender = async () => {
    setActionLoading(true);
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const response = await axios.post(
        `${API}/payments/${matchId}/confirm-delivery`,
        { notes: confirmationNotes },
        { headers }
      );
      
      toast.success(response.data.message);
      setShowConfirmDeliveryDialog(false);
      setConfirmationNotes('');
      fetchDeliveryStatus();
      fetchMatchDetails();
      
      if (response.data.payout_blocked) {
        toast.info('O transportador precisa cadastrar uma chave Pix para receber o pagamento.');
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Erro ao confirmar entrega');
    } finally {
      setActionLoading(false);
    }
  };

  const handleOpenDispute = async () => {
    if (!disputeReason.trim()) {
      toast.error('Por favor, informe o motivo da disputa');
      return;
    }
    
    setActionLoading(true);
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const response = await axios.post(
        `${API}/payments/${matchId}/open-dispute`,
        { reason: disputeReason, details: disputeDetails },
        { headers }
      );
      
      toast.success(response.data.message);
      setShowDisputeDialog(false);
      setDisputeReason('');
      setDisputeDetails('');
      fetchDeliveryStatus();
      fetchMatchDetails();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Erro ao abrir disputa');
    } finally {
      setActionLoading(false);
    }
  };

  const handlePhotoUploadComplete = (url, key) => {
    setUploadedPhotoUrl(url);
  };

  const handleConfirmPickup = async () => {
    if (!uploadedPhotoUrl) {
      toast.error('Foto é obrigatória');
      return;
    }

    try {
      await axios.post(
        `${API}/matches/${matchId}/confirm-pickup`,
        { photo_url: uploadedPhotoUrl },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      toast.success('Coleta confirmada!');
      setShowPhotoDialog(false);
      setUploadedPhotoUrl(null);
      fetchMatchDetails();
    } catch (error) {
      const errorDetail = error.response?.data?.detail;
      // Handle validation error objects
      if (typeof errorDetail === 'object' && errorDetail !== null) {
        toast.error('Erro de validação. Verifique os dados.');
      } else {
        toast.error(errorDetail || 'Erro ao confirmar coleta');
      }
    }
  };

  const handleConfirmDelivery = async () => {
    if (!uploadedPhotoUrl) {
      toast.error('Foto é obrigatória');
      return;
    }

    try {
      await axios.post(
        `${API}/matches/${matchId}/confirm-delivery`,
        { photo_url: uploadedPhotoUrl },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      toast.success('Entrega confirmada!');
      setShowPhotoDialog(false);
      setUploadedPhotoUrl(null);
      fetchMatchDetails();
    } catch (error) {
      const errorDetail = error.response?.data?.detail;
      // Handle validation error objects
      if (typeof errorDetail === 'object' && errorDetail !== null) {
        toast.error('Erro de validação. Verifique os dados.');
      } else {
        toast.error(errorDetail || 'Erro ao confirmar entrega');
      }
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
    setUploadedPhotoUrl(null);
    setShowPhotoDialog(true);
  };

  const getStatusBadge = (status) => {
    const badges = {
      pending_payment: { label: 'Aguardando Pagamento', color: 'bg-yellow-100 text-yellow-700' },
      paid: { label: 'Pago', color: 'bg-blue-100 text-blue-700' },
      in_transit: { label: 'Em Trânsito', color: 'bg-purple-100 text-purple-700' },
      delivered: { label: 'Entregue', color: 'bg-jungle/10 text-jungle' },
      completed: { label: 'Concluído', color: 'bg-green-100 text-green-700' },
      disputed: { label: 'Em Disputa', color: 'bg-red-100 text-red-700' },
      cancelled: { label: 'Cancelado', color: 'bg-gray-100 text-gray-700' },
      cancelled_by_carrier: { label: 'Cancelado pelo Transportador', color: 'bg-red-100 text-red-700' },
      cancelled_by_sender: { label: 'Cancelado pelo Remetente', color: 'bg-red-100 text-red-700' }
    };
    const badge = badges[status] || { label: status, color: 'bg-gray-100 text-gray-700' };
    return <Badge className={badge.color}>{badge.label}</Badge>;
  };

  const getPaymentStatusBadge = (status) => {
    const badges = {
      payment_pending: { label: 'Aguardando Pagamento', color: 'bg-yellow-100 text-yellow-700', icon: Clock },
      paid_escrow: { label: 'Pago (em Escrow)', color: 'bg-blue-100 text-blue-700', icon: ShieldCheck },
      escrowed: { label: 'Em Custódia', color: 'bg-blue-100 text-blue-700', icon: ShieldCheck },
      paid: { label: 'Pago', color: 'bg-blue-100 text-blue-700', icon: CheckCircle },
      delivered_by_transporter: { label: 'Entregue - Aguardando Confirmação', color: 'bg-orange-100 text-orange-700', icon: Clock },
      confirmed_by_sender: { label: 'Entrega Confirmada', color: 'bg-green-100 text-green-700', icon: CheckCircle },
      auto_confirmed_timeout: { label: 'Confirmado Automaticamente', color: 'bg-green-100 text-green-700', icon: CheckCircle },
      payout_ready: { label: 'Pagamento Pronto', color: 'bg-lime/20 text-lime-700', icon: CurrencyDollar },
      payout_completed: { label: 'Pagamento Efetuado', color: 'bg-green-100 text-green-700', icon: CheckCircle },
      payout_blocked_no_payout_method: { label: 'Pagamento Bloqueado - Sem Pix', color: 'bg-red-100 text-red-700', icon: XCircle },
      dispute_opened: { label: 'Em Disputa', color: 'bg-red-100 text-red-700', icon: Warning },
      refunded: { label: 'Reembolsado', color: 'bg-gray-100 text-gray-700', icon: XCircle }
    };
    const badge = badges[status] || { label: status || 'Desconhecido', color: 'bg-gray-100 text-gray-700', icon: Clock };
    const IconComponent = badge.icon;
    return (
      <Badge className={`${badge.color} flex items-center gap-1`}>
        <IconComponent size={14} />
        {badge.label}
      </Badge>
    );
  };

  const isCarrier = user?.id === match?.carrier_id;
  const isSender = user?.id === match?.sender_id;
  const canPay = isSender && match?.status === 'pending_payment';
  
  // Location permission required for pickup/delivery
  const hasLocationPermission = match?.location_permission_granted;
  const canConfirmPickup = isCarrier && match?.status === 'paid' && !match?.pickup_confirmed_at && hasLocationPermission;
  const canConfirmDelivery = isCarrier && match?.status === 'in_transit' && !match?.delivery_confirmed_at && hasLocationPermission;
  const needsLocationPermission = isCarrier && (match?.status === 'paid' || match?.status === 'in_transit') && !hasLocationPermission;
  
  const canRate = match?.status === 'delivered' && !match?.rated;
  
  // New payment flow conditions
  const paymentStatus = deliveryStatus?.status;
  const canMarkDelivered = isCarrier && ['paid_escrow', 'escrowed', 'paid'].includes(paymentStatus);
  const canSenderConfirm = isSender && paymentStatus === 'delivered_by_transporter';
  const canOpenDispute = isSender && paymentStatus === 'delivered_by_transporter';

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
          {/* Warning: Location permission required */}
          {needsLocationPermission && (
            <Alert className="border-amber-200 bg-amber-50">
              <Warning size={20} className="text-amber-600" />
              <AlertDescription className="ml-2 text-amber-800">
                <strong>Ação necessária:</strong> Autorize o acesso à localização na seção de Rastreamento acima para confirmar coleta/entrega.
              </AlertDescription>
            </Alert>
          )}
          
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

          {/* NEW: Payment Flow Actions */}
          
          {/* Transporter: Mark as Delivered */}
          {canMarkDelivered && (
            <Card className="border-jungle bg-jungle/5">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <TruckIcon size={24} className="text-jungle flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-semibold text-sm">Entrega Realizada?</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Marque como entregue para iniciar o processo de confirmação pelo remetente.
                    </p>
                    <Button
                      onClick={handleMarkDelivered}
                      disabled={actionLoading}
                      className="w-full mt-3 h-10 bg-jungle hover:bg-jungle-800"
                      data-testid="mark-delivered-btn"
                    >
                      <CheckCircle size={18} className="mr-2" />
                      {actionLoading ? 'Processando...' : 'Marcar como Entregue'}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Sender: Confirm or Dispute */}
          {canSenderConfirm && (
            <Card className="border-orange-300 bg-orange-50">
              <CardContent className="p-4">
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <Clock size={24} className="text-orange-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-sm text-orange-800">Entrega Marcada pelo Transportador</p>
                      <p className="text-xs text-orange-600 mt-1">
                        Confirme o recebimento para liberar o pagamento ao transportador.
                      </p>
                      {deliveryStatus?.time_remaining && (
                        <p className="text-xs text-muted-foreground mt-2">
                          ⏰ Auto-confirmação em: {deliveryStatus.time_remaining.days} dias e {deliveryStatus.time_remaining.hours} horas
                        </p>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex gap-2">
                    <Button
                      onClick={() => setShowConfirmDeliveryDialog(true)}
                      className="flex-1 h-10 bg-green-600 hover:bg-green-700"
                      data-testid="sender-confirm-btn"
                    >
                      <CheckCircle size={18} className="mr-1" />
                      Confirmar Recebimento
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setShowDisputeDialog(true)}
                      className="flex-1 h-10 border-red-300 text-red-600 hover:bg-red-50"
                      data-testid="open-dispute-btn"
                    >
                      <XCircle size={18} className="mr-1" />
                      Abrir Disputa
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Show current payment status */}
          {deliveryStatus && deliveryStatus.status !== 'not_found' && (
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Status do Pagamento</span>
                  {getPaymentStatusBadge(deliveryStatus.status)}
                </div>
                {deliveryStatus.carrier_amount > 0 && (
                  <div className="flex items-center justify-between mt-2 pt-2 border-t">
                    <span className="text-sm text-muted-foreground">Valor a receber</span>
                    <span className="font-bold text-jungle">R$ {deliveryStatus.carrier_amount?.toFixed(2)}</span>
                  </div>
                )}
              </CardContent>
            </Card>
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
      <Dialog open={showPhotoDialog} onOpenChange={(open) => {
        if (!open) setUploadedPhotoUrl(null);
        setShowPhotoDialog(open);
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {photoAction === 'pickup' ? 'Confirmar Coleta' : 'Confirmar Entrega'}
            </DialogTitle>
            <DialogDescription>
              Tire uma foto do pacote para confirmar
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <ImageUploadWithCamera
              onUploadComplete={handlePhotoUploadComplete}
              fileType={photoAction === 'pickup' ? 'pickup_confirmation' : 'delivery_confirmation'}
              label="Foto do Pacote *"
              maxSizeMB={10}
              showPreview={true}
            />
            <div className="flex gap-4">
              <Button variant="outline" className="flex-1" onClick={() => {
                setShowPhotoDialog(false);
                setUploadedPhotoUrl(null);
              }}>
                Cancelar
              </Button>
              <Button
                onClick={photoAction === 'pickup' ? handleConfirmPickup : handleConfirmDelivery}
                className="flex-1 bg-jungle hover:bg-jungle-800"
                disabled={!uploadedPhotoUrl}
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

      {/* Confirm Delivery Dialog (for Sender) */}
      <Dialog open={showConfirmDeliveryDialog} onOpenChange={setShowConfirmDeliveryDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-green-700">
              <CheckCircle size={24} />
              Confirmar Recebimento
            </DialogTitle>
            <DialogDescription>
              Ao confirmar, o pagamento será liberado para o transportador.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Observações (opcional)</Label>
              <Textarea
                value={confirmationNotes}
                onChange={(e) => setConfirmationNotes(e.target.value)}
                placeholder="Deixe um comentário sobre a entrega..."
                rows={3}
                className="mt-1"
              />
            </div>
            
            <Alert className="border-green-200 bg-green-50">
              <AlertDescription className="text-green-700 text-sm">
                <strong>Importante:</strong> Após a confirmação, o valor de R$ {deliveryStatus?.carrier_amount?.toFixed(2)} será liberado para o transportador.
              </AlertDescription>
            </Alert>
            
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                className="flex-1"
                onClick={() => setShowConfirmDeliveryDialog(false)}
              >
                Cancelar
              </Button>
              <Button 
                className="flex-1 bg-green-600 hover:bg-green-700"
                onClick={handleConfirmDeliveryBySender}
                disabled={actionLoading}
                data-testid="confirm-delivery-dialog-btn"
              >
                {actionLoading ? 'Confirmando...' : 'Confirmar Recebimento'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dispute Dialog (for Sender) */}
      <Dialog open={showDisputeDialog} onOpenChange={setShowDisputeDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Warning size={24} />
              Abrir Disputa
            </DialogTitle>
            <DialogDescription>
              Se houve algum problema com a entrega, descreva abaixo para nossa equipe analisar.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Motivo da Disputa *</Label>
              <Textarea
                value={disputeReason}
                onChange={(e) => setDisputeReason(e.target.value)}
                placeholder="Ex: Pacote não foi entregue, item danificado, etc."
                rows={2}
                className="mt-1"
                data-testid="dispute-reason-input"
              />
            </div>
            
            <div>
              <Label>Detalhes Adicionais</Label>
              <Textarea
                value={disputeDetails}
                onChange={(e) => setDisputeDetails(e.target.value)}
                placeholder="Forneça mais detalhes sobre o problema..."
                rows={3}
                className="mt-1"
              />
            </div>
            
            <Alert className="border-yellow-200 bg-yellow-50">
              <AlertDescription className="text-yellow-700 text-sm">
                <strong>Nota:</strong> O pagamento ficará retido até a resolução da disputa. Nossa equipe entrará em contato em até 24 horas.
              </AlertDescription>
            </Alert>
            
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                className="flex-1"
                onClick={() => setShowDisputeDialog(false)}
              >
                Cancelar
              </Button>
              <Button 
                variant="destructive"
                className="flex-1"
                onClick={handleOpenDispute}
                disabled={actionLoading || !disputeReason.trim()}
                data-testid="submit-dispute-btn"
              >
                {actionLoading ? 'Enviando...' : 'Abrir Disputa'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MatchDetailPage;
