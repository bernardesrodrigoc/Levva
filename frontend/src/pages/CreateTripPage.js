import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Package, TruckIcon, Calendar, Cube, Path, Repeat, CurrencyDollar, Info } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import LocationPicker from '@/components/LocationPicker';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

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
  const [origin, setOrigin] = useState(null);
  const [destination, setDestination] = useState(null);
  const [priceInfo, setPriceInfo] = useState(null);
  const [formData, setFormData] = useState({
    departureDate: '',
    departureTime: '08:00',
    vehicleType: 'car',
    volumeM3: '',
    maxWeightKg: '',
    corridorRadiusKm: 10,
    pricePerKg: '',
    isRecurring: false,
    recurringDays: [],
    recurringEndDate: ''
  });

  // Calculate suggested price when origin/destination change
  useEffect(() => {
    if (origin?.lat && destination?.lat) {
      calculatePrice();
    }
  }, [origin, destination]);

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
      // Auto-fill suggested price if empty
      if (!formData.pricePerKg) {
        setFormData(prev => ({ ...prev, pricePerKg: response.data.suggested_price_per_kg.toString() }));
      }
    } catch (error) {
      console.error('Error calculating price:', error);
    }
  };

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
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="glass border-b sticky top-0 z-50">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Package size={32} weight="duotone" className="text-jungle" />
            <span className="text-2xl font-heading font-bold text-jungle">Levva</span>
          </div>
          <Button variant="ghost" onClick={() => navigate('/dashboard')} data-testid="back-to-dashboard-btn">
            Voltar ao Dashboard
          </Button>
        </div>
      </header>

      <div className="container mx-auto px-6 py-8 max-w-4xl">
        <div className="mb-8">
          <h1 className="text-4xl font-heading font-bold mb-2 flex items-center gap-3">
            <TruckIcon size={40} weight="duotone" className="text-jungle" />
            Criar Nova Viagem
          </h1>
          <p className="text-muted-foreground">Defina sua rota no mapa e encontre pacotes para transportar</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Origin with Map */}
          <Card data-testid="origin-card">
            <CardHeader>
              <CardTitle className="text-jungle">Ponto de Partida</CardTitle>
              <CardDescription>Clique no mapa ou busque o endereço de onde você vai partir</CardDescription>
            </CardHeader>
            <CardContent>
              <LocationPicker
                label="Origem"
                value={origin}
                onChange={setOrigin}
                markerColor="green"
                placeholder="Buscar endereço de partida..."
                testIdPrefix="origin"
              />
            </CardContent>
          </Card>

          {/* Destination with Map */}
          <Card data-testid="destination-card">
            <CardHeader>
              <CardTitle className="text-lime">Ponto de Chegada</CardTitle>
              <CardDescription>Clique no mapa ou busque o endereço de destino</CardDescription>
            </CardHeader>
            <CardContent>
              <LocationPicker
                label="Destino"
                value={destination}
                onChange={setDestination}
                markerColor="red"
                placeholder="Buscar endereço de destino..."
                testIdPrefix="destination"
              />
            </CardContent>
          </Card>

          {/* Route Corridor */}
          <Card data-testid="corridor-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Path size={24} weight="duotone" className="text-jungle" />
                Raio do Corredor
              </CardTitle>
              <CardDescription>
                Distância máxima que você aceita desviar da rota para coleta/entrega
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Raio do corredor</span>
                <span className="font-bold text-jungle">{formData.corridorRadiusKm} km</span>
              </div>
              <Slider
                value={[formData.corridorRadiusKm]}
                onValueChange={([value]) => handleChange('corridorRadiusKm', value)}
                min={2}
                max={20}
                step={1}
                className="w-full"
              />
              <p className="text-xs text-muted-foreground">
                Envios com pontos de coleta e entrega dentro de {formData.corridorRadiusKm}km da sua rota serão sugeridos
              </p>
            </CardContent>
          </Card>

          {/* Recurring Trip Option */}
          <Card data-testid="recurring-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Repeat size={24} weight="duotone" className="text-jungle" />
                Rota Recorrente
              </CardTitle>
              <CardDescription>
                Faça o mesmo trajeto regularmente? Configure uma rota recorrente
              </CardDescription>
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
                    <p className="text-xs text-muted-foreground mt-1">
                      Deixe em branco para rota sem data de término
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Date & Time */}
          <Card data-testid="datetime-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar size={24} weight="duotone" className="text-jungle" />
                {formData.isRecurring ? 'Horário e Primeira Viagem' : 'Data e Hora'}
              </CardTitle>
              <CardDescription>
                {formData.isRecurring 
                  ? 'Defina o horário das viagens e a data da primeira' 
                  : 'Quando você pretende viajar?'
                }
              </CardDescription>
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
                  data-testid="departure-date-input"
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
                  data-testid="departure-time-input"
                />
              </div>
            </CardContent>
          </Card>

          {/* Vehicle & Cargo */}
          <Card data-testid="vehicle-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Cube size={24} weight="duotone" className="text-jungle" />
                Veículo e Carga
              </CardTitle>
              <CardDescription>Informações sobre seu veículo e espaço disponível</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="vehicleType">Tipo de Veículo</Label>
                <Select value={formData.vehicleType} onValueChange={(value) => handleChange('vehicleType', value)}>
                  <SelectTrigger className="h-12 mt-2" data-testid="vehicle-type-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="motorcycle">Moto</SelectItem>
                    <SelectItem value="car">Carro</SelectItem>
                    <SelectItem value="pickup">Pickup</SelectItem>
                    <SelectItem value="van">Van</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="volumeM3">Volume disponível (m³)</Label>
                  <Input
                    id="volumeM3"
                    type="number"
                    step="0.1"
                    placeholder="0.5"
                    value={formData.volumeM3}
                    onChange={(e) => handleChange('volumeM3', e.target.value)}
                    required
                    className="h-12 mt-2"
                    data-testid="volume-input"
                  />
                </div>
                <div>
                  <Label htmlFor="maxWeightKg">Peso máximo (kg)</Label>
                  <Input
                    id="maxWeightKg"
                    type="number"
                    placeholder="20"
                    value={formData.maxWeightKg}
                    onChange={(e) => handleChange('maxWeightKg', e.target.value)}
                    required
                    className="h-12 mt-2"
                    data-testid="max-weight-input"
                  />
                </div>
              </div>
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
                    <div className="mt-2 text-xs">
                      Exemplos: 1kg = R$ {priceInfo.examples['1kg']} | 5kg = R$ {priceInfo.examples['5kg']} | 10kg = R$ {priceInfo.examples['10kg']}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      Comissão Levva: {priceInfo.platform_fee_percent}% • Você recebe: {priceInfo.carrier_receives_percent}%
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
                  data-testid="price-per-kg-input"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Deixe em branco para usar o preço sugerido automaticamente
                </p>
              </div>
            </CardContent>
          </Card>

          <div className="flex gap-4">
            <Button
              type="button"
              variant="outline"
              className="flex-1 h-12"
              onClick={() => navigate('/dashboard')}
              data-testid="cancel-btn"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              className="flex-1 h-12 bg-jungle hover:bg-jungle-800"
              disabled={loading}
              data-testid="submit-trip-btn"
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
