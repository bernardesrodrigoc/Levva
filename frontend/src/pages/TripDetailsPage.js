import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Truck, Calendar, MapPin, User, ArrowLeft, Package } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import axios from 'axios';
import RouteMap from '@/components/RouteMap'; // Seu componente de mapa corrigido
import { useAuth } from '@/context/AuthContext';

const getBackendUrl = () => {
    let url = process.env.REACT_APP_BACKEND_URL || '';
    if (url && !url.startsWith('http')) { url = `https://${url}`; }
    return url.replace(/\/$/, '');
};
const API = `${getBackendUrl()}/api`;

const TripDetailsPage = () => {
  const { tripId } = useParams(); // Pega o ID da URL
  const navigate = useNavigate();
  const { token, user } = useAuth();
  const [trip, setTrip] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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
    fetchTrip();
  }, [tripId, token]);

  if (loading) return <div className="min-h-screen flex items-center justify-center">Carregando detalhes...</div>;
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
        
        {/* Coluna Esquerda: Mapa e Rota */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* MAPA - AQUI A MÁGICA ACONTECE */}
          <Card className="overflow-hidden border-2 border-jungle/10 h-[300px] md:h-[450px]">
            <RouteMap 
                // Passando as props individuais conforme seu RouteMap.js pede
                originCity={trip.origin.city}
                originLat={trip.origin.lat}
                originLng={trip.origin.lng}
                originAddress={trip.origin.address}
                
                destinationCity={trip.destination.city}
                destinationLat={trip.destination.lat}
                destinationLng={trip.destination.lng}
                destinationAddress={trip.destination.address}
                
                routePolyline={trip.route_polyline} // A string da cobrinha
                showCorridor={true} // Mostrar o raio de desvio
                corridorRadiusKm={trip.corridor_radius_km || 10}
                height="100%"
            />
          </Card>

          {/* Card de Detalhes */}
          <Card>
            <CardHeader><CardTitle>Cronograma</CardTitle></CardHeader>
            <CardContent className="grid sm:grid-cols-2 gap-6">
                <div className="space-y-3">
                    <div className="flex items-start gap-3">
                        <div className="mt-1"><MapPin className="text-jungle" weight="fill" size={24}/></div>
                        <div>
                            <span className="text-xs text-muted-foreground uppercase font-bold">Partida</span>
                            <p className="font-semibold text-lg">{trip.origin.city}, {trip.origin.state}</p>
                            <p className="text-sm text-muted-foreground">{trip.origin.address}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 pl-9 text-sm font-medium">
                        <Calendar className="text-jungle" />
                        {new Date(trip.departure_date).toLocaleDateString()} às {new Date(trip.departure_date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                    </div>
                </div>

                <div className="space-y-3">
                    <div className="flex items-start gap-3">
                        <div className="mt-1"><MapPin className="text-red-500" weight="fill" size={24}/></div>
                        <div>
                            <span className="text-xs text-muted-foreground uppercase font-bold">Chegada</span>
                            <p className="font-semibold text-lg">{trip.destination.city}, {trip.destination.state}</p>
                            <p className="text-sm text-muted-foreground">{trip.destination.address}</p>
                        </div>
                    </div>
                </div>
            </CardContent>
          </Card>
        </div>

        {/* Coluna Direita: Informações do Motorista e Ação */}
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center">
                            <User size={24} />
                        </div>
                        <div>
                            <p className="font-bold text-lg">{trip.carrier_name}</p>
                            <div className="flex items-center gap-1 text-sm text-yellow-500 font-medium">
                                ★ {trip.carrier_rating?.toFixed(1) || 'Novo'}
                            </div>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex justify-between items-center p-3 bg-muted/50 rounded-lg border">
                        <span className="text-sm text-muted-foreground">Veículo</span>
                        <div className="flex items-center gap-2 font-medium">
                            <Truck size={18} /> 
                            <span className="capitalize">{trip.vehicle_type === 'car' ? 'Carro' : trip.vehicle_type}</span>
                        </div>
                    </div>
                    
                    <div className="flex justify-between items-center p-3 bg-muted/50 rounded-lg border">
                        <span className="text-sm text-muted-foreground">Capacidade Livre</span>
                        <span className="font-bold text-jungle">{trip.available_capacity_kg} kg</span>
                    </div>

                    <div className="flex justify-between items-center p-3 bg-muted/50 rounded-lg border">
                        <span className="text-sm text-muted-foreground">Raio de desvio</span>
                        <span className="font-medium">{trip.corridor_radius_km || 10} km</span>
                    </div>
                    
                    <div className="pt-4 border-t mt-4">
                        <div className="flex justify-between items-end mb-4">
                            <span className="text-muted-foreground font-medium">Preço estimado</span>
                            <span className="text-3xl font-bold text-jungle">
                                R$ {trip.price_per_kg?.toFixed(2)}<span className="text-sm font-normal text-muted-foreground">/kg</span>
                            </span>
                        </div>

                        {user?.id !== trip.carrier_id ? (
                            <Button className="w-full bg-jungle hover:bg-jungle-800 h-12 text-lg shadow-md">
                                <Package className="mr-2" /> Solicitar Envio
                            </Button>
                        ) : (
                            <Button variant="outline" className="w-full border-jungle text-jungle hover:bg-jungle/10">
                                Gerenciar Minha Viagem
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
