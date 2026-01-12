import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Package, TruckIcon, Check, ArrowRight } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const CreateMatchPage = () => {
  const { token } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { tripId, shipmentId } = location.state || {};
  
  const [myTrips, setMyTrips] = useState([]);
  const [myShipments, setMyShipments] = useState([]);
  const [selectedTripId, setSelectedTripId] = useState(tripId || '');
  const [selectedShipmentId, setSelectedShipmentId] = useState(shipmentId || '');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const headers = { Authorization: `Bearer ${token}` };
      
      const [tripsRes, shipmentsRes] = await Promise.all([
        axios.get(`${API}/trips/my-trips`, { headers }),
        axios.get(`${API}/shipments/my-shipments`, { headers })
      ]);

      // Filter only published
      const availableTrips = tripsRes.data.filter(t => t.status === 'published');
      const availableShipments = shipmentsRes.data.filter(s => s.status === 'published');

      setMyTrips(availableTrips);
      setMyShipments(availableShipments);
    } catch (error) {
      toast.error('Erro ao carregar dados');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateMatch = async () => {
    if (!selectedTripId || !selectedShipmentId) {
      toast.error('Selecione uma viagem e um envio');
      return;
    }

    setCreating(true);
    try {
      const response = await axios.post(
        `${API}/matches/create`,
        null,
        {
          params: {
            trip_id: selectedTripId,
            shipment_id: selectedShipmentId
          },
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      toast.success('Combinação criada com sucesso!');
      navigate(`/match/${response.data.id}`);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Erro ao criar combinação');
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-jungle"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="glass border-b sticky top-0 z-50">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Package size={32} weight="duotone" className="text-jungle" />
            <span className="text-2xl font-heading font-bold text-jungle">Levva</span>
          </div>
          <Button variant="ghost" onClick={() => navigate(-1)} data-testid="back-btn">
            Voltar
          </Button>
        </div>
      </header>

      <div className="container mx-auto px-6 py-8 max-w-6xl">
        <div className="mb-8">
          <h1 className="text-4xl font-heading font-bold mb-2">Criar Combinação</h1>
          <p className="text-muted-foreground">Selecione uma viagem e um envio para combinar</p>
        </div>

        <div className="grid lg:grid-cols-2 gap-8">
          {/* My Trips */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TruckIcon size={24} weight="duotone" className="text-jungle" />
                Minhas Viagens Disponíveis
              </CardTitle>
              <CardDescription>
                {myTrips.length} viagem(ns) publicada(s)
              </CardDescription>
            </CardHeader>
            <CardContent>
              {myTrips.length === 0 ? (
                <div className="text-center py-8">
                  <TruckIcon size={48} className="mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground mb-4">Você não tem viagens disponíveis</p>
                  <Button onClick={() => navigate('/criar-viagem')} variant="outline">
                    Criar Viagem
                  </Button>
                </div>
              ) : (
                <RadioGroup value={selectedTripId} onValueChange={setSelectedTripId}>
                  <div className="space-y-3">
                    {myTrips.map((trip) => (
                      <div key={trip.id} className="flex items-center space-x-3 border rounded-lg p-4 hover:bg-muted/50">
                        <RadioGroupItem value={trip.id} id={`trip-${trip.id}`} />
                        <Label htmlFor={`trip-${trip.id}`} className="flex-1 cursor-pointer">
                          <div>
                            <p className="font-semibold">
                              {trip.origin.city} → {trip.destination.city}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {new Date(trip.departure_date).toLocaleDateString('pt-BR')} • {trip.vehicle_type}
                            </p>
                          </div>
                        </Label>
                        {selectedTripId === trip.id && (
                          <Check size={20} className="text-jungle" />
                        )}
                      </div>
                    ))}
                  </div>
                </RadioGroup>
              )}
            </CardContent>
          </Card>

          {/* My Shipments */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package size={24} weight="duotone" className="text-lime" />
                Meus Envios Disponíveis
              </CardTitle>
              <CardDescription>
                {myShipments.length} envio(s) publicado(s)
              </CardDescription>
            </CardHeader>
            <CardContent>
              {myShipments.length === 0 ? (
                <div className="text-center py-8">
                  <Package size={48} className="mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground mb-4">Você não tem envios disponíveis</p>
                  <Button onClick={() => navigate('/criar-envio')} variant="outline">
                    Criar Envio
                  </Button>
                </div>
              ) : (
                <RadioGroup value={selectedShipmentId} onValueChange={setSelectedShipmentId}>
                  <div className="space-y-3">
                    {myShipments.map((shipment) => (
                      <div key={shipment.id} className="flex items-center space-x-3 border rounded-lg p-4 hover:bg-muted/50">
                        <RadioGroupItem value={shipment.id} id={`shipment-${shipment.id}`} />
                        <Label htmlFor={`shipment-${shipment.id}`} className="flex-1 cursor-pointer">
                          <div>
                            <p className="font-semibold">
                              {shipment.origin.city} → {shipment.destination.city}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {shipment.package.weight_kg}kg • {shipment.package.category}
                            </p>
                          </div>
                        </Label>
                        {selectedShipmentId === shipment.id && (
                          <Check size={20} className="text-lime" />
                        )}
                      </div>
                    ))}
                  </div>
                </RadioGroup>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Create Button */}
        <div className="mt-8 flex justify-center">
          <Button
            onClick={handleCreateMatch}
            disabled={!selectedTripId || !selectedShipmentId || creating}
            className="h-14 px-12 bg-jungle hover:bg-jungle-800 text-lg"
            data-testid="create-match-btn"
          >
            {creating ? 'Criando...' : (
              <>
                Criar Combinação
                <ArrowRight size={24} className="ml-2" />
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default CreateMatchPage;