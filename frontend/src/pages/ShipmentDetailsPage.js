import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Package, MapPin, Scales, Ruler, User, Star, ArrowLeft, Cube, CurrencyDollar } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const ShipmentDetailsPage = () => {
  const { shipmentId } = useParams();
  const { token } = useAuth();
  const navigate = useNavigate();
  const [shipment, setShipment] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchShipment();
  }, [shipmentId]);

  const fetchShipment = async () => {
    try {
      const res = await axios.get(`${API}/shipments/${shipmentId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setShipment(res.data);
    } catch (error) {
      console.error(error);
      toast.error('Erro ao carregar detalhes do envio');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-jungle"></div>
      </div>
    );
  }

  if (!shipment) {
    return (
      <div className="min-h-screen bg-background p-6">
        <Card>
          <CardContent className="p-8 text-center">
            <Package size={48} className="mx-auto text-muted-foreground mb-4" />
            <p className="text-lg">Envio não encontrado</p>
            <Button onClick={() => navigate(-1)} className="mt-4">Voltar</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const statusMap = {
    published: { label: 'Disponível', color: 'bg-lime-100 text-lime-800' },
    matched: { label: 'Combinado', color: 'bg-blue-100 text-blue-800' },
    in_transit: { label: 'Em Trânsito', color: 'bg-purple-100 text-purple-800' },
    delivered: { label: 'Entregue', color: 'bg-green-100 text-green-800' },
    cancelled: { label: 'Cancelado', color: 'bg-red-100 text-red-800' }
  };

  const status = statusMap[shipment.status] || { label: shipment.status, color: 'bg-gray-100 text-gray-800' };

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <div className="bg-jungle text-white p-4 md:p-6">
        <div className="container mx-auto">
          <Button 
            variant="ghost" 
            onClick={() => navigate(-1)}
            className="text-white hover:bg-white/10 mb-4"
            data-testid="back-btn"
          >
            <ArrowLeft size={20} className="mr-2" />
            Voltar
          </Button>
          <h1 className="text-2xl md:text-3xl font-bold">Detalhes do Envio</h1>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6 space-y-6">
        {/* Status and Route */}
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-6">
              <Badge className={status.color}>{status.label}</Badge>
              {shipment.price && (
                <div className="text-right">
                  <p className="text-2xl font-bold text-jungle">R$ {shipment.price.final_price?.toFixed(2)}</p>
                  <p className="text-xs text-muted-foreground">{shipment.price.distance_km?.toFixed(0)}km</p>
                </div>
              )}
            </div>

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 flex-1">
                <MapPin size={24} weight="fill" className="text-jungle" />
                <div>
                  <p className="font-bold">{shipment.origin.city}</p>
                  <p className="text-sm text-muted-foreground">{shipment.origin.state}</p>
                </div>
              </div>
              <div className="flex-1 border-t-2 border-dashed border-border"></div>
              <div className="flex items-center gap-2 flex-1 justify-end">
                <div className="text-right">
                  <p className="font-bold">{shipment.destination.city}</p>
                  <p className="text-sm text-muted-foreground">{shipment.destination.state}</p>
                </div>
                <MapPin size={24} weight="fill" className="text-lime" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Package Details */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package size={24} />
              Detalhes do Pacote
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Categoria</p>
              <div className="flex items-center gap-2">
                <Cube size={18} className="text-jungle" />
                <p className="font-medium">{shipment.package.category}</p>
              </div>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Peso</p>
              <div className="flex items-center gap-2">
                <Scales size={18} className="text-jungle" />
                <p className="font-medium">{shipment.package.weight_kg} kg</p>
              </div>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Dimensões</p>
              <div className="flex items-center gap-2">
                <Ruler size={18} className="text-jungle" />
                <p className="font-medium">
                  {shipment.package.length_cm}×{shipment.package.width_cm}×{shipment.package.height_cm} cm
                </p>
              </div>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Valor Declarado</p>
              <div className="flex items-center gap-2">
                <CurrencyDollar size={18} className="text-jungle" />
                <p className="font-medium">R$ {shipment.declared_value?.toFixed(2)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Description */}
        {shipment.package.description && (
          <Card>
            <CardHeader>
              <CardTitle>Descrição</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">{shipment.package.description}</p>
            </CardContent>
          </Card>
        )}

        {/* Price Breakdown - Only if price exists */}
        {shipment.price && (
          <Card className="border-jungle/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-jungle">
                <CurrencyDollar size={24} />
                Breakdown do Preço
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Preço Base (Transportador recebe)</span>
                <span className="font-medium">R$ {shipment.price.base_price?.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Taxa da Plataforma ({shipment.price.platform_fee_percentage}%)</span>
                <span className="font-medium">R$ {shipment.price.platform_fee?.toFixed(2)}</span>
              </div>
              <div className="border-t pt-3 flex justify-between items-center">
                <span className="font-bold">Preço Final</span>
                <span className="text-xl font-bold text-jungle">R$ {shipment.price.final_price?.toFixed(2)}</span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Sender Info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User size={24} />
              Remetente
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-lime/10 rounded-full flex items-center justify-center">
                <User size={24} className="text-jungle" />
              </div>
              <div>
                <p className="font-bold">{shipment.sender_name}</p>
                <div className="flex items-center gap-1">
                  <Star size={16} weight="fill" className="text-yellow-500" />
                  <span className="text-sm text-muted-foreground">
                    {shipment.sender_rating > 0 ? shipment.sender_rating.toFixed(1) : 'Novo'}
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ShipmentDetailsPage;
