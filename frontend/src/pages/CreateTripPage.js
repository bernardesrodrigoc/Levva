import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Package, TruckIcon, Calendar, Cube, Path, Repeat, CurrencyDollar, Info, PlusCircle } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import LocationPicker from '@/components/LocationPicker';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';
import axios from 'axios';

// Garante HTTPS na URL se necessário
const getBackendUrl = () => {
  let url = process.env.REACT_APP_BACKEND_URL || '';
  if (url && !url.startsWith('http')) {
    url = `https://${url}`;
  }
  return url.replace(/\/$/, '');
};

const API = `${getBackendUrl()}/api`;

const DAYS_OF_WEEK = [
  { id: 0, label: 'Seg' },
  { id: 1, label: 'Ter' },
  { id: 2, label: 'Qua' },
  { id: 3, label: 'Qui' },
  { id: 4, label: 'Sex' },
  { id: 5, label: 'Sáb' },
  { id: 6, label: 'Dom' }
];

const CreateTripPage = () => {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  
  // Dados principais
  const [origin, setOrigin] = useState(null);
  const [destination, setDestination] = useState(null);
  const [priceInfo, setPriceInfo] = useState(null);
  const [myVehicles, setMyVehicles] = useState([]); // Lista de veículos do usuário
  
  const [formData, setFormData] = useState({
    departureDate: '',
    departureTime: '08:00',
    selectedVehicleId: 'manual', // Controle do dropdown
    vehicleType: 'car',
    volumeM3: '',
    maxWeightKg: '',
    corridorRadiusKm: 10,
    pricePerKg: '',
    isRecurring: false,
    recurringDays: [],
    recurringEndDate: ''
  });

  // 1. Busca veículos ao carregar
  useEffect(() => {
    fetchMyVehicles();
  }, []);

  // 2. Calcula preço ao definir origem/destino
  useEffect(() => {
    if (origin?.lat && destination?.lat) {
      calculatePrice();
    }
  }, [origin, destination]);

  const fetchMyVehicles = async () => {
    try {
      const res = await axios.get(`${API}/vehicles`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setMyVehicles(res.data);
    } catch (error) {
      console.error("Erro ao buscar veículos", error);
    }
  };

  const calculatePrice = async () => {
    try {
      const response = await axios.post(`${API}/trips/calculate-price`, null, {
        params: {
          origin_lat: origin.lat,
          origin_lng: origin.lng,
          dest_lat: destination.lat,
          dest_lng: destination.lng
        }
      });
      setPriceInfo(response.data);
      if (!formData.pricePerKg) {
        setFormData(prev => ({ ...prev, pricePerKg: response.data.suggested_price_per_kg.toString() }));
      }
    } catch (error) {
      console.error('Error calculating price:', error);
    }
  };

  // --- Lógica de Seleção Inteligente de Veículo ---
  const handleVehicleSelect = (vehicleId) => {
    if (vehicleId === 'manual') {
        // Reseta para manual mas mantém os dados atuais pra não frustrar o usuário
        setFormData(prev => ({ ...prev, selectedVehicleId: 'manual' }));
        return;
    }

    const vehicle = myVehicles.find(v => v.id === vehicleId);
    if (vehicle) {
        // CONVERSÃO: O banco guarda em Litros, a viagem usa m³.
        // 1000 Litros = 1 m³
        const volumeM3 = (vehicle.capacity_volume_liters / 1000).toFixed(2);
        
        setFormData(prev => ({
            ...prev,
            selectedVehicleId: vehicleId,
            vehicleType: vehicle.type,
            maxWeightKg: vehicle.capacity_weight_kg.toString(),
            volumeM3: volumeM3
        }));
        
        toast.info(`Dados de ${vehicle.name} carregados!`);
    }
  };
  // -----------------------------------------------

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const toggleRecurringDay = (dayId) => {
    setFormData(prev => ({
      ...prev,
      recurringDays: prev.recurringDays.includes(dayId)
        ? prev.recurringDays.filter(d => d !== dayId)
        : [...prev.recurringDays, dayId]
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!origin?.lat || !origin?.lng) {
      toast.error('Selecione o ponto de origem no mapa');
      return;
    }
    
    if (!destination?.lat || !destination?.lng) {
      toast.error('Selecione o ponto de destino no mapa');
      return;
    }

    if (formData.isRecurring && formData.recurringDays.length === 0) {
      toast.error('Selecione pelo menos um dia da semana para viagens recorrentes');
      return;
    }

    setLoading(true);

    try {
      const tripData = {
        origin: {
          city: origin.city || 'Cidade não identificada',
          state: origin.state || 'BR',
          address: origin.address,
          lat: origin.lat,
          lng: origin.lng
        },
        destination: {
          city: destination.city || 'Cidade não identificada',
          state: destination.state || 'BR',
          address: destination.address,
          lat: destination.lat,
          lng: destination.lng
        },
        departure_date: `${formData.departureDate}T${formData.departureTime}:00Z`,
        vehicle_type: formData.vehicleType,
        cargo_space: {
          volume_m3: parseFloat(formData.volumeM3),
          max_weight_kg: parseFloat(formData.maxWeightKg)
        },
        corridor_radius_km: formData.corridorRadiusKm,
        price_per_kg: formData.pricePerKg ? parseFloat(formData.pricePerKg) : null,
        recurrence: formData.isRecurring ? {
          is_recurring: true,
          days_of_week: formData.recurringDays,
          time: formData.departureTime,
          end_date: formData.recurringEndDate ? `${formData.recurringEndDate}T23:59:59Z` : null
        } : null
      };

      await axios.post(`${API}/trips`, tripData, {
        headers: { Authorization: `Bearer ${token}` }
      });

      toast.success(formData.isRecurring ? 'Rota recorrente criada com sucesso!' : 'Viagem criada com sucesso!');
      navigate('/dashboard');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Erro ao criar viagem');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-24 md:pb-8">
      {/* Header - Mobile Optimized */}
      <header className="glass border-b sticky top-0 z-50">
        <div className="container mx-auto px-4 md:px-6 py-3 md:py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Package size={28} weight="duotone" className="text-jungle" />
            <span className="text-xl md:text-2xl font-heading font-bold text-jungle">Levva</span>
          </div>
          <Button 
            variant="ghost" 
            size="sm"
            onClick={() => navigate('/dashboard')} 
            data-testid="back-to-dashboard-btn"
            className="text-sm"
          >
            <span className="hidden md:inline">Voltar ao Dashboard</span>
            <span className="md:hidden">Voltar</span>
          </Button>
        </div>
      </header>

      <div className="container mx-auto px-4 md:px-6 py-6 md:py-8 max-w-4xl">
        {/* Title - Mobile Optimized */}
        <div className="mb-6 md:mb-8">
          <h1 className="text-2xl md:text-4xl font-heading font-bold mb-2 flex items-center gap-2 md:gap-3">
            <TruckIcon size={32} weight="duotone" className="text-jungle hidden md:block" />
            Criar Nova Viagem
          </h1>
          <p className="text-sm md:text-base text-muted-foreground">Defina sua rota no mapa e encontre pacotes para transportar</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 md:space-y-6">
          {/* Origin with Map */}
          <Card data-testid="origin-card">
            <CardHeader className="p-4 md:p-6 pb-2 md:pb-4">
              <CardTitle className="text-jungle text-base md:text-lg">Ponto de Partida</CardTitle>
              <CardDescription className="text-xs md:text-sm">Clique no mapa ou busque o endereço</CardDescription>
            </CardHeader>
            <CardContent className="p-4 md:p-6 pt-0">
              <div className="h-[250px] md:h-[350px] w-full rounded-lg overflow-hidden border">
                  <LocationPicker
                    label="Origem"
                    value={origin}
                    onChange={setOrigin}
                    markerColor="green"
                    placeholder="Buscar endereço de partida..."
                    testIdPrefix="origin"
                  />
              </div>
            </CardContent>
          </Card>

          {/* Destination with Map */}
          <Card data-testid="destination-card">
            <CardHeader className="p-4 md:p-6 pb-2 md:pb-4">
              <CardTitle className="text-lime text-base md:text-lg">Ponto de Chegada</CardTitle>
              <CardDescription className="text-xs md:text-sm">Clique no mapa ou busque o endereço de destino</CardDescription>
            </CardHeader>
            <CardContent className="p-4 md:p-6 pt-0">
              <div className="h-[250px] md:h-[350px] w-full rounded-lg overflow-hidden border">
                  <LocationPicker
                    label="Destino"
                    value={destination}
                    onChange={setDestination}
                    markerColor="red"
                    placeholder="Buscar endereço de destino..."
                    testIdPrefix="destination"
                  />
              </div>
            </CardContent>
          </Card>

          {/* Route Corridor - Mobile Optimized */}
          <Card data-testid="corridor-card">
            <CardHeader className="p-4 md:p-6 pb-2 md:pb-4">
              <CardTitle className="flex items-center gap-2 text-base md:text-lg">
                <Path size={20} weight="duotone" className="text-jungle" />
                Raio do Corredor
              </CardTitle>
              <CardDescription className="text-xs md:text-sm">
                Distância máxima para desvio da rota
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 md:p-6 pt-0 space-y-3 md:space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs md:text-sm text-muted-foreground">Raio do corredor</span>
                <span className="font-bold text-jungle text-lg">{formData.corridorRadiusKm} km</span>
              </div>
              <Slider
                value={[formData.corridorRadiusKm]}
                onValueChange={([value]) => handleChange('corridorRadiusKm', value)}
                min={2}
                max={50}
                step={1}
                className="w-full"
              />
              <p className="text-[10px] md:text-xs text-muted-foreground">
                Envios dentro de {formData.corridorRadiusKm}km da sua rota serão sugeridos
              </p>
            </CardContent>
          </Card>

          {/* Vehicle & Cargo - Mobile Optimized */}
          <Card data-testid="vehicle-card" className="border-jungle/20 border-2">
            <CardHeader className="p-4 md:p-6 pb-2 md:pb-4">
              <CardTitle className="flex items-center gap-2 text-base md:text-lg">
                <Cube size={20} weight="duotone" className="text-jungle" />
                Veículo e Capacidade
              </CardTitle>
              <CardDescription className="text-xs md:text-sm">Como você fará este transporte?</CardDescription>
            </CardHeader>
            <CardContent className="p-4 md:p-6 pt-0 space-y-4 md:space-y-6">
              
              {/* Seleção de Veículo Pré-cadastrado */}
              <div className="bg-muted/30 p-3 md:p-4 rounded-lg">
                <div className="flex justify-between items-center mb-2">
                    <Label htmlFor="vehicleSelect" className="text-xs md:text-sm">Selecione um Veículo</Label>
                    <Button 
                        type="button" 
                        variant="link" 
                        className="text-xs h-auto p-0 text-jungle"
                        onClick={() => navigate('/vehicles')}
                    >
                        Gerenciar
                    </Button>
                </div>
                <Select 
                    value={formData.selectedVehicleId} 
                    onValueChange={handleVehicleSelect}
                >
                  <SelectTrigger className="h-11 md:h-12 border-jungle/30 text-base">
                    <SelectValue placeholder="Escolha um veículo..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">-- Inserir Manualmente --</SelectItem>
                    {myVehicles.map(v => (
                        <SelectItem key={v.id} value={v.id}>
                            {v.name} ({v.capacity_weight_kg}kg)
                        </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {formData.selectedVehicleId !== 'manual' && (
                    <p className="text-xs text-green-600 mt-2 flex items-center gap-1">
                        <Info size={14} /> Capacidade preenchida automaticamente
                    </p>
                )}
              </div>

              <div className="grid md:grid-cols-3 gap-4">
                 <div>
                    <Label htmlFor="vehicleType">Tipo de Veículo</Label>
                    <Select 
                        value={formData.vehicleType} 
                        onValueChange={(value) => handleChange('vehicleType', value)}
                        disabled={formData.selectedVehicleId !== 'manual'}
                    >
                      <SelectTrigger className="h-12 mt-2">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="motorcycle">Moto</SelectItem>
                        <SelectItem value="car">Carro</SelectItem>
                        <SelectItem value="pickup">Pickup</SelectItem>
                        <SelectItem value="van">Van</SelectItem>
                        <SelectItem value="truck">Caminhão</SelectItem>
                        <SelectItem value="bus_passenger">Passageiro (Ônibus)</SelectItem>
                      </SelectContent>
                    </Select>
                 </div>

                <div>
                  <Label htmlFor="maxWeightKg">Peso Disponível (kg)</Label>
                  <Input
                    id="maxWeightKg"
                    type="number"
                    placeholder="20"
                    value={formData.maxWeightKg}
                    onChange={(e) => handleChange('maxWeightKg', e.target.value)}
                    required
                    className="h-12 mt-2 font-medium"
                    readOnly={formData.selectedVehicleId !== 'manual'}
                  />
                </div>

                <div>
                  <Label htmlFor="volumeM3">Volume (m³)</Label>
                  <Input
                    id="volumeM3"
                    type="number"
                    step="0.01"
                    placeholder="0.5"
                    value={formData.volumeM3}
                    onChange={(e) => handleChange('volumeM3', e.target.value)}
                    required
                    className="h-12 mt-2 font-medium"
                    readOnly={formData.selectedVehicleId !== 'manual'}
                  />
                  <p className="text-[10px] text-muted-foreground mt-1 text-right">
                    (1m³ = 1000 Litros)
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Date & Time */}
          <Card data-testid="datetime-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar size={24} weight="duotone" className="text-jungle" />
                {formData.isRecurring ? 'Horário e Início' : 'Data e Hora'}
              </CardTitle>
            </CardHeader>
            <CardContent className="grid md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="departureDate">{formData.isRecurring ? 'Data da primeira viagem' : 'Data de Partida'}</Label>
                <Input
                  id="departureDate"
                  type="date"
                  value={formData.departureDate}
                  onChange={(e) => handleChange('departureDate', e.target.value)}
                  required
                  className="h-12 mt-2"
                />
              </div>
              <div>
                <Label htmlFor="departureTime">Horário</Label>
                <Input
                  id="departureTime"
                  type="time"
                  value={formData.departureTime}
                  onChange={(e) => handleChange('departureTime', e.target.value)}
                  required
                  className="h-12 mt-2"
                />
              </div>
            </CardContent>
          </Card>

          {/* Recurring Trip Option */}
          <Card data-testid="recurring-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Repeat size={24} weight="duotone" className="text-jungle" />
                Rota Recorrente
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="isRecurring" className="font-medium">Ativar rota recorrente</Label>
                  <p className="text-xs text-muted-foreground">Ideal para quem faz o mesmo trajeto frequentemente</p>
                </div>
                <Switch
                  id="isRecurring"
                  checked={formData.isRecurring}
                  onCheckedChange={(checked) => handleChange('isRecurring', checked)}
                />
              </div>

              {formData.isRecurring && (
                <div className="space-y-4 pt-4 border-t">
                  <div>
                    <Label className="mb-3 block">Dias da semana</Label>
                    <div className="flex gap-2 flex-wrap">
                      {DAYS_OF_WEEK.map(day => (
                        <Button
                          key={day.id}
                          type="button"
                          variant={formData.recurringDays.includes(day.id) ? "default" : "outline"}
                          className={formData.recurringDays.includes(day.id) ? "bg-jungle hover:bg-jungle-800" : ""}
                          size="sm"
                          onClick={() => toggleRecurringDay(day.id)}
                        >
                          {day.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="recurringEndDate">Data final (opcional)</Label>
                    <Input
                      id="recurringEndDate"
                      type="date"
                      value={formData.recurringEndDate}
                      onChange={(e) => handleChange('recurringEndDate', e.target.value)}
                      className="h-12 mt-2"
                    />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Pricing */}
          <Card data-testid="pricing-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CurrencyDollar size={24} weight="duotone" className="text-jungle" />
                Precificação
              </CardTitle>
              <CardDescription>Defina quanto você cobra por kg transportado</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {priceInfo && (
                <Alert className="bg-jungle/5 border-jungle/30">
                  <Info size={16} className="text-jungle" />
                  <AlertDescription>
                    <div className="flex items-center justify-between">
                      <span>Distância estimada: <strong>{priceInfo.distance_km} km</strong></span>
                      <span>Preço sugerido: <strong>R$ {priceInfo.suggested_price_per_kg}/kg</strong></span>
                    </div>
                  </AlertDescription>
                </Alert>
              )}

              <div>
                <Label htmlFor="pricePerKg">Preço por kg (R$)</Label>
                <Input
                  id="pricePerKg"
                  type="number"
                  step="0.01"
                  placeholder={priceInfo?.suggested_price_per_kg?.toString() || "5.00"}
                  value={formData.pricePerKg}
                  onChange={(e) => handleChange('pricePerKg', e.target.value)}
                  className="h-12 mt-2"
                />
              </div>
            </CardContent>
          </Card>

          <div className="flex gap-4">
            <Button
              type="button"
              variant="outline"
              className="flex-1 h-12"
              onClick={() => navigate('/dashboard')}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              className="flex-1 h-12 bg-jungle hover:bg-jungle-800"
              disabled={loading}
            >
              {loading ? 'Publicando...' : (formData.isRecurring ? 'Criar Rota Recorrente' : 'Publicar Viagem')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateTripPage;
