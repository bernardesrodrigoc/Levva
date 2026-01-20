import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Package, Trash, Plus, Clock, CheckCircle, XCircle, Eye } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const STATUS_CONFIG = {
  published: { label: 'Disponível', color: 'bg-lime-100 text-lime-800', icon: Package },
  matched: { label: 'Combinado', color: 'bg-blue-100 text-blue-800', icon: Package },
  in_transit: { label: 'Em Trânsito', color: 'bg-purple-100 text-purple-800', icon: Package },
  delivered: { label: 'Entregue', color: 'bg-green-100 text-green-800', icon: CheckCircle },
  cancelled: { label: 'Cancelado', color: 'bg-red-100 text-red-800', icon: XCircle },
  cancelled_by_sender: { label: 'Cancelado', color: 'bg-red-100 text-red-800', icon: XCircle },
  cancelled_by_carrier: { label: 'Cancelado pelo Transportador', color: 'bg-orange-100 text-orange-800', icon: XCircle },
  expired: { label: 'Expirado', color: 'bg-gray-100 text-gray-600', icon: Clock }
};

const MyShipmentsPage = () => {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [activeShipments, setActiveShipments] = useState([]);
  const [historyShipments, setHistoryShipments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('active');
  
  // Cancel dialog state
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelInfo, setCancelInfo] = useState(null);
  const [cancelLoading, setCancelLoading] = useState(false);

  useEffect(() => { 
    fetchShipments();
  }, []);

  const fetchShipments = async () => {
    setLoading(true);
    try {
      // Fetch active and history in parallel
      const [activeRes, historyRes] = await Promise.all([
        axios.get(`${API}/shipments/my-shipments`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        axios.get(`${API}/shipments/my-shipments/history`, {
          headers: { Authorization: `Bearer ${token}` }
        })
      ]);
      
      setActiveShipments(activeRes.data);
      setHistoryShipments(historyRes.data);
    } catch (error) {
      console.error(error);
      toast.error('Erro ao carregar envios');
    } finally {
      setLoading(false);
    }
  };

  const checkCanCancel = async (shipmentId) => {
    try {
      const res = await axios.get(`${API}/shipments/${shipmentId}/can-cancel`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      return res.data;
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Erro ao verificar cancelamento');
      return null;
    }
  };

  const handleCancelClick = async (shipment) => {
    const info = await checkCanCancel(shipment.id);
    if (!info) return;
    
    if (!info.can_cancel) {
      toast.error(info.message);
      return;
    }
    
    setCancelTarget(shipment);
    setCancelInfo(info);
    setCancelReason('');
    setShowCancelDialog(true);
  };

  const handleConfirmCancel = async () => {
    if (cancelInfo.requires_reason && !cancelReason.trim()) {
      toast.error('Por favor, informe o motivo do cancelamento');
      return;
    }
    
    setCancelLoading(true);
    try {
      await axios.post(
        `${API}/shipments/${cancelTarget.id}/cancel`,
        { reason: cancelReason },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      toast.success('Envio cancelado com sucesso');
      setShowCancelDialog(false);
      fetchShipments();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Erro ao cancelar');
    } finally {
      setCancelLoading(false);
    }
  };

  const getStatusBadge = (status) => {
    const config = STATUS_CONFIG[status] || { label: status, color: 'bg-gray-100 text-gray-800' };
    return <Badge className={config.color}>{config.label}</Badge>;
  };

  const renderShipmentCard = (ship, isHistory = false) => (
    <Card key={ship.id} className={isHistory ? 'opacity-80' : ''}>
      <CardContent className="p-6 flex flex-col md:flex-row items-center gap-6">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            {getStatusBadge(ship.status)}
            <span className="font-bold">{ship.package?.weight_kg || 0} kg</span>
          </div>
          <div className="flex items-center gap-3 text-lg font-bold">
            <span>{ship.origin?.city}</span>
            <span className="text-muted-foreground">→</span>
            <span>{ship.destination?.city}</span>
          </div>
          <p className="text-sm text-muted-foreground">{ship.package?.description}</p>
          
          {/* Show cancellation reason if cancelled */}
          {ship.cancellation_reason && (
            <p className="text-xs text-red-500 mt-1">
              Motivo: {ship.cancellation_reason}
            </p>
          )}
        </div>

        {/* Price */}
        {ship.price && (
          <div className="text-right min-w-[120px]">
            <p className="text-2xl font-bold text-lime-700">
              R$ {ship.price.final_price?.toFixed(2)}
            </p>
            <p className="text-xs text-muted-foreground">
              {ship.price.distance_km?.toFixed(0)}km • {ship.price.platform_fee_percentage}% taxa
            </p>
          </div>
        )}

        {/* Actions - Only for active items */}
        {!isHistory && (
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => navigate(`/envio/${ship.id}`)}
            >
              <Eye size={16} className="mr-1" /> Ver
            </Button>
            
            {ship.status === 'published' && (
              <Button 
                variant="ghost" 
                size="sm"
                className="text-red-500 hover:bg-red-50" 
                onClick={() => handleCancelClick(ship)}
              >
                <XCircle size={16} className="mr-1" /> Cancelar
              </Button>
            )}
            
            {ship.status === 'matched' && (
              <Button 
                variant="ghost" 
                size="sm"
                className="text-orange-500 hover:bg-orange-50" 
                onClick={() => handleCancelClick(ship)}
              >
                <XCircle size={16} className="mr-1" /> Cancelar
              </Button>
            )}
          </div>
        )}
        
        {/* History - view only */}
        {isHistory && (
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => navigate(`/envio/${ship.id}`)}
          >
            <Eye size={16} className="mr-1" /> Ver Detalhes
          </Button>
        )}
      </CardContent>
    </Card>
  );

  if (loading) return <div className="p-8 text-center">Carregando...</div>;

  return (
    <div className="container mx-auto px-6 py-8 min-h-screen bg-background pb-24">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-heading font-bold text-lime-900">Meus Envios</h1>
        <Button onClick={() => navigate('/criar-envio')} className="bg-lime-600 hover:bg-lime-700 text-white">
          <Plus className="mr-2" /> Novo Envio
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2 mb-6">
          <TabsTrigger value="active" className="flex items-center gap-2">
            <Package size={18} />
            Ativos ({activeShipments.length})
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-2">
            <Clock size={18} />
            Histórico ({historyShipments.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="active">
          {activeShipments.length === 0 ? (
            <div className="text-center py-12 bg-muted/20 rounded-lg border-2 border-dashed">
              <Package size={48} className="mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">Você não tem envios ativos.</p>
              <Button onClick={() => navigate('/criar-envio')} className="mt-4">
                Criar Primeiro Envio
              </Button>
            </div>
          ) : (
            <div className="grid gap-4">
              {activeShipments.map(ship => renderShipmentCard(ship, false))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="history">
          {historyShipments.length === 0 ? (
            <div className="text-center py-12 bg-muted/20 rounded-lg border-2 border-dashed">
              <Clock size={48} className="mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">Nenhum envio no histórico.</p>
              <p className="text-xs text-muted-foreground mt-2">
                Envios concluídos, cancelados ou expirados aparecerão aqui.
              </p>
            </div>
          ) : (
            <div className="grid gap-4">
              {historyShipments.map(ship => renderShipmentCard(ship, true))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Cancel Dialog */}
      <Dialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <XCircle size={24} />
              Cancelar Envio
            </DialogTitle>
            <DialogDescription>
              {cancelInfo?.message}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {cancelInfo?.requires_reason && (
              <div>
                <Label>Motivo do Cancelamento *</Label>
                <Textarea
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="Informe o motivo do cancelamento..."
                  className="mt-1"
                  rows={3}
                />
              </div>
            )}
            
            {cancelInfo?.impact && (
              <div className={`p-3 rounded-lg ${
                cancelInfo.impact.reputation_impact === 'negative' 
                  ? 'bg-red-50 border border-red-200' 
                  : 'bg-gray-50 border border-gray-200'
              }`}>
                <p className="text-sm">
                  <strong>Impacto na reputação:</strong> {cancelInfo.impact.description}
                </p>
              </div>
            )}
            
            <div className="flex gap-2 pt-4">
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
                onClick={handleConfirmCancel}
                disabled={cancelLoading || (cancelInfo?.requires_reason && !cancelReason.trim())}
              >
                {cancelLoading ? 'Cancelando...' : 'Confirmar Cancelamento'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MyShipmentsPage;
