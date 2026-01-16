import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Truck, Calendar, MapPin, Package, User, ArrowLeft, CheckCircle } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import axios from 'axios';
import RouteMap from '@/components/RouteMap'; // Importa nosso novo mapa
import { useAuth } from '@/context/AuthContext';

const getBackendUrl = () => {
    let url = process.env.REACT_APP_BACKEND_URL || '';
    if (url && !url.startsWith('http')) { url = `https://${url}`; }
    return url.replace(/\/$/, '');
};
const API = `${getBackendUrl()}/api`;

const TripDetailsPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { token, user } = useAuth();
  const [trip, setTrip] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTrip = async () => {
      try {
        // Ajuste a rota se necessário (ex: /trips/{id})
        // Como não criamos rota específica "publica" de detalhe único no server.py ainda,
        // vamos supor que você vai usar a rota de match ou criar um GET /trips/{id} simples
        // SE DER ERRO 404 aqui, precisaremos adicionar @api_router.get("/trips/{trip_id}") no backend
        const res = await axios.get(`${API}/trips/${id}`, {
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
    fetchTrip();
  }, [id, token]);

  if (loading) return <div className="min-h-screen flex items-center justify-center">Carregando...</div>;
  if (!trip) return <div className="min-h-screen flex items-center justify-center">Viagem não encontrada</div>;

  return (
    <div className="min-h-screen bg-background pb-12">
      {/* Header */}
      <header className="bg-white border-b sticky top-0 z-40">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft size={20} />
          </Button>
          <div>
             <h1 className="text-xl font-bold flex items-center gap-2">
                {trip.origin.city} <span className="text-muted-foreground">→</span> {trip.destination.city}
             </h1>
             <p className="text-sm text-muted-foreground">Viagem #{trip.id.slice(-6)}</p>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8 grid lg:grid-cols-3 gap-8">
        
        {/* Coluna Esquerda: Informações */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* MAPA COM A ROTA */}
          <Card className="overflow-hidden border-2 border-jungle/10 h-[400px]">
            <RouteMap 
                origin={trip.origin} 
                destination={trip.destination} 
                routePolyline={trip.route_polyline} // A mágica acontece aqui
            />
          </Card>

          {/* Detalhes da Rota */}
          <Card>
            <CardHeader><CardTitle>Detalhes do Trajeto</CardTitle></CardHeader>
            <CardContent className="grid sm:grid-cols-2 gap-6">
                <div className="space-y-1">
                    <span className="text-xs text-muted-foreground uppercase font-bold">Saída</span>
                    <div className="flex items-start gap-2">
                        <MapPin className="text-jungle mt-1" weight="fill" />
                        <div>
                            <p className="font-semibold">{trip.origin.city}, {trip.origin.state}</p>
                            <p className="text-sm text-muted-foreground">{trip.origin.address}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 mt-2 text-sm">
                        <Calendar className="text-jungle" />
                        {new Date(trip.departure_date).toLocaleDateString()} às {new Date(trip.departure_date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                    </div>
                </div>

                <div className="space-y-1">
                    <span className="text-xs text-muted-foreground uppercase font-bold">Chegada</span>
                    <div className="flex items-start gap-2">
                        <MapPin className="text-red-500 mt-1" weight="fill" />
                        <div>
                            <p className="font-semibold">{trip.destination.city}, {trip.destination.state}</p>
                            <p className="text-sm text-muted-foreground">{trip.destination.address}</p>
                        </div>
                    </div>
                </div>
            </CardContent>
          </Card>
        </div>

        {/* Coluna Direita: Ação e Motorista */}
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center">
                            <User size={24} />
                        </div>
                        <div>
                            <p className="font-bold">{trip.carrier_name}</p>
                            <div className="flex items-center gap-1 text-sm text-yellow-500">
                                ★ {trip.carrier_rating?.toFixed(1) || 'Nv'}
                            </div>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex justify-between items-center p-3 bg-muted rounded-lg">
                        <span className="text-sm">Veículo</span>
                        <div className="flex items-center gap-2 font-medium">
                            <Truck /> {trip.vehicle_type === 'car' ? 'Carro' : trip.vehicle_type}
                        </div>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-muted rounded-lg">
                        <span className="text-sm">Espaço Livre</span>
                        <span className="font-medium text-jungle">{trip.available_capacity_kg} kg</span>
                    </div>
                    
                    <div className="pt-4 border-t">
                        <div className="flex justify-between items-end mb-4">
                            <span className="text-muted-foreground">Preço sugerido</span>
                            <span className="text-2xl font-bold text-jungle">
                                R$ {trip.price_per_kg?.toFixed(2)}<span className="text-sm font-normal text-muted-foreground">/kg</span>
                            </span>
                        </div>

                        {user?.id !== trip.carrier_id ? (
                            <Button className="w-full bg-jungle hover:bg-jungle-800 h-12 text-lg">
                                Solicitar Envio
                            </Button>
                        ) : (
                            <Button variant="outline" className="w-full">
                                Gerenciar Viagem
                            </Button>
                        )}
                    </div>
                </CardContent>
            </Card>
        </div>

      </div>
    </div>
  );
};

export default TripDetailsPage;
