import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Package, TruckIcon, Check, ArrowRight, MapPin, Calendar, User } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const CreateMatchPage = () => {
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  
  // IDs vindos da navegação anterior
  const { tripId: targetTripId, shipmentId: targetShipmentId } = location.state || {};
  
  // Dados do alvo (o que estamos tentando combinar)
  const [targetTrip, setTargetTrip] = useState(null);
  const [targetShipment, setTargetShipment] = useState(null);

  // Meus dados (para escolher a contraparte)
  const [myTrips, setMyTrips] = useState([]);
  const [myShipments, setMyShipments] = useState([]);
  
  // Seleção
  const [selectedTripId, setSelectedTripId] = useState('');
  const [selectedShipmentId, setSelectedShipmentId] = useState('');
  
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const headers = { Authorization: `Bearer ${token}` };
      
      const promises = [
        axios.get(`${API}/trips/my-trips`, { headers }),
        axios.get(`${API}/shipments/my-shipments`, { headers })
      ];

      // Se temos um ID alvo vindo de outra tela, buscamos os detalhes dele
      if (targetTripId) {
        promises.push(axios.get(`${API}/trips/${targetTripId}`, { headers }));
      }
      if (targetShipmentId) {
        promises.push(axios.get(`${API}/shipments/${targetShipmentId}`, { headers }));
      }

      const results = await Promise.all(promises);
      
      // Processa Meus Dados
      const myTripsData = results[0].data.filter(t => t.status === 'published');
      const myShipmentsData = results[1].data.filter(s => s.status === 'published');
      
      setMyTrips(myTripsData);
      setMyShipments(myShipmentsData);

      // Processa Dados Alvo (se houver)
      if (targetTripId) {
        setTargetTrip(results[2].data);
        setSelectedTripId(targetTripId); // Já seleciona automaticamente
      }
      
      // Ajuste de índice dependendo se targetTripId existia ou não
      const shipmentIndex = targetTripId ? 3 : 2;
      if (targetShipmentId && results[shipmentIndex]) {
        setTargetShipment(results[shipmentIndex].data);
        setSelectedShipmentId(targetShipmentId); // Já seleciona automaticamente
      }

    } catch (error) {
      console.error("Erro detalhado:", error);
      // Ignora 404 se for apenas um detalhe faltando, mas avisa erro geral
      if (error.response?.status !== 404) {
        toast.error('Erro ao carregar dados para combinação.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCreateMatch = async () => {
    if (!selectedTripId || !selectedShipmentId) {
      toast.error('É necessário ter uma viagem e um envio selecionados.');
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

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('pt-BR');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-jungle"></div>
      </div>
    );
  }

  // Lógica de Renderização:
  // Cenário 1: Sou um Remetente vendo uma Viagem (Target Trip existe)
  // Cenário 2: Sou um Transportador vendo um Envio (Target Shipment existe)
  // Cenário 3: Manual (escolho ambos da minha lista - raro)

  return (
    <div className="min-h-screen bg-background">
      <header className="glass border-b sticky top-0 z-50">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Package size={32} weight="duotone" className="text-jungle" />
            <span className="text-2xl font-heading font-bold text-jungle">Levva</span>
          </div>
          <Button variant="ghost" onClick={() => navigate(-1)}>Voltar</Button>
        </div>
      </header>

      <div className="container mx-auto px-6 py-8 max-w-6xl">
        <div className="mb-8">
          <h1 className="text-3xl font-heading font-bold mb-2">Finalizar Combinação</h1>
          <p className="text-muted-foreground">Confirme os detalhes do transporte</p>
        </div>

        <div className="grid lg:grid-cols-2 gap-8">
          
          {/* COLUNA DA ESQUERDA: VIAGEM */}
          <div className="space-y-4">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <TruckIcon className="text-jungle" /> Viagem Selecionada
            </h2>
            
            {targetTrip ? (
              // Se veio de Buscar Viagens, mostra o card fixo da viagem alvo
              <Card className="border-2 border-jungle/20 bg-jungle/5">
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div>
                        <CardTitle>{targetTrip.origin.city} → {targetTrip.destination.city}</CardTitle>
                        <CardDescription className="flex items-center gap-2 mt-1">
                            <User size={16} /> {targetTrip.carrier_name}
                        </CardDescription>
                    </div>
                    <Badge className="bg-jungle">Selecionado</Badge>
                  </div>
                </CardHeader>
                <CardContent className="grid gap-2 text-sm">
                    <div className="flex items-center gap-2"><Calendar size={16} /> {formatDate(targetTrip.departure_date)}</div>
                    <div className="flex items-center gap-2"><TruckIcon size={16} /> {targetTrip.vehicle_type}</div>
                    <div className="font-bold text-jungle mt-2">R$ {targetTrip.price_per_kg?.toFixed(2)} / kg</div>
                </CardContent>
              </Card>
            ) : (
              // Se não, lista minhas viagens para eu escolher (caso eu seja o transportador)
              <Card>
                <CardHeader><CardTitle>Minhas Viagens</CardTitle></CardHeader>
                <CardContent>
                    {myTrips.length === 0 ? (
                        <p className="text-muted-foreground text-sm">Você não tem viagens cadastradas.</p>
                    ) : (
                        <RadioGroup value={selectedTripId} onValueChange={setSelectedTripId}>
                            {myTrips.map(trip => (
                                <div key={trip.id} className="flex items-center space-x-3 border p-3 rounded hover:bg-muted">
                                    <RadioGroupItem value={trip.id} id={`trip-${trip.id}`} />
                                    <Label htmlFor={`trip-${trip.id}`} className="flex-1 cursor-pointer">
                                        {trip.origin.city} → {trip.destination.city} <span className="text-xs text-muted-foreground">({formatDate(trip.departure_date)})</span>
                                    </Label>
                                </div>
                            ))}
                        </RadioGroup>
                    )}
                </CardContent>
              </Card>
            )}
          </div>

          {/* COLUNA DA DIREITA: ENVIO */}
          <div className="space-y-4">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Package className="text-lime" /> Envio Selecionado
            </h2>

            {targetShipment ? (
               // Se veio de Buscar Envios, mostra o card fixo do envio alvo
               <Card className="border-2 border-lime/20 bg-lime/5">
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div>
                        <CardTitle>{targetShipment.origin.city} → {targetShipment.destination.city}</CardTitle>
                        <CardDescription>{targetShipment.package.description}</CardDescription>
                    </div>
                    <Badge className="bg-lime-600 hover:bg-lime-700">Selecionado</Badge>
                  </div>
                </CardHeader>
                <CardContent className="grid gap-2 text-sm">
                    <div className="flex items-center gap-2"><User size={16} /> {targetShipment.sender_name}</div>
                    <div className="font-bold mt-2">{targetShipment.package.weight_kg} kg</div>
                </CardContent>
              </Card>
            ) : (
              // Se não, lista MEUS envios para eu escolher (caso eu seja o remetente)
              <Card>
                <CardHeader>
                    <CardTitle>Meus Envios Disponíveis</CardTitle>
                    <CardDescription>Qual pacote você quer enviar nesta viagem?</CardDescription>
                </CardHeader>
                <CardContent>
                    {myShipments.length === 0 ? (
                        <div className="text-center py-6">
                            <p className="text-muted-foreground mb-4">Você não tem envios cadastrados.</p>
                            <Button variant="outline" size="sm" onClick={() => navigate('/criar-envio')}>Criar Novo Envio</Button>
                        </div>
                    ) : (
                        <RadioGroup value={selectedShipmentId} onValueChange={setSelectedShipmentId}>
                            {myShipments.map(shipment => (
                                <div key={shipment.id} className="flex items-center space-x-3 border p-3 rounded hover:bg-muted">
                                    <RadioGroupItem value={shipment.id} id={`ship-${shipment.id}`} />
                                    <Label htmlFor={`ship-${shipment.id}`} className="flex-1 cursor-pointer">
                                        <div className="font-semibold">{shipment.package.description || "Sem descrição"}</div>
                                        <div className="text-xs text-muted-foreground">
                                            {shipment.origin.city} → {shipment.destination.city} • {shipment.package.weight_kg}kg
                                        </div>
                                    </Label>
                                </div>
                            ))}
                        </RadioGroup>
                    )}
                </CardContent>
              </Card>
            )}
          </div>

        </div>

        {/* Botão de Ação */}
        <div className="mt-10 flex justify-center">
          <Button 
            size="lg" 
            className="w-full md:w-1/2 h-14 text-lg bg-jungle hover:bg-jungle-800 shadow-lg"
            onClick={handleCreateMatch}
            disabled={!selectedTripId || !selectedShipmentId || creating}
          >
            {creating ? 'Processando...' : 'Confirmar e Criar Combinação'} <ArrowRight className="ml-2" />
          </Button>
        </div>

      </div>
    </div>
  );
};

export default CreateMatchPage;
