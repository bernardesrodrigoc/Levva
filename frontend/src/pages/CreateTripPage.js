import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Package, TruckIcon, MapPin, Calendar, Cube } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const CreateTripPage = () => {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    originCity: '',
    originState: '',
    originLat: -23.5505,
    originLng: -46.6333,
    destinationCity: '',
    destinationState: '',
    destinationLat: -22.9068,
    destinationLng: -43.1729,
    departureDate: '',
    departureTime: '08:00',
    vehicleType: 'car',
    volumeM3: '',
    maxWeightKg: '',
    maxDeviationKm: 10,
    pricePerKg: ''
  });

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const tripData = {
        origin: {
          city: formData.originCity,
          state: formData.originState,
          lat: parseFloat(formData.originLat),
          lng: parseFloat(formData.originLng)
        },
        destination: {
          city: formData.destinationCity,
          state: formData.destinationState,
          lat: parseFloat(formData.destinationLat),
          lng: parseFloat(formData.destinationLng)
        },
        departure_date: `${formData.departureDate}T${formData.departureTime}:00Z`,
        vehicle_type: formData.vehicleType,
        cargo_space: {
          volume_m3: parseFloat(formData.volumeM3),
          max_weight_kg: parseFloat(formData.maxWeightKg)
        },
        max_deviation_km: parseInt(formData.maxDeviationKm),
        price_per_kg: formData.pricePerKg ? parseFloat(formData.pricePerKg) : null
      };

      await axios.post(`${API}/trips`, tripData, {
        headers: { Authorization: `Bearer ${token}` }
      });

      toast.success('Viagem criada com sucesso!');
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
          <p className="text-muted-foreground">Publique sua rota e encontre pacotes para transportar</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Origin */}
          <Card data-testid="origin-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin size={24} weight="duotone" className="text-jungle" />
                Origem
              </CardTitle>
              <CardDescription>De onde você vai partir?</CardDescription>
            </CardHeader>
            <CardContent className="grid md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="originCity">Cidade</Label>
                <Input
                  id="originCity"
                  placeholder="São Paulo"
                  value={formData.originCity}
                  onChange={(e) => handleChange('originCity', e.target.value)}
                  required
                  className="h-12 mt-2"
                  data-testid="origin-city-input"
                />
              </div>
              <div>
                <Label htmlFor="originState">Estado</Label>
                <Input
                  id="originState"
                  placeholder="SP"
                  value={formData.originState}
                  onChange={(e) => handleChange('originState', e.target.value)}
                  required
                  maxLength={2}
                  className="h-12 mt-2"
                  data-testid="origin-state-input"
                />
              </div>
            </CardContent>
          </Card>

          {/* Destination */}
          <Card data-testid="destination-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin size={24} weight="duotone" className="text-lime" />
                Destino
              </CardTitle>
              <CardDescription>Para onde você vai?</CardDescription>
            </CardHeader>
            <CardContent className="grid md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="destinationCity">Cidade</Label>
                <Input
                  id="destinationCity"
                  placeholder="Rio de Janeiro"
                  value={formData.destinationCity}
                  onChange={(e) => handleChange('destinationCity', e.target.value)}
                  required
                  className="h-12 mt-2"
                  data-testid="destination-city-input"
                />
              </div>
              <div>
                <Label htmlFor="destinationState">Estado</Label>
                <Input
                  id="destinationState"
                  placeholder="RJ"
                  value={formData.destinationState}
                  onChange={(e) => handleChange('destinationState', e.target.value)}
                  required
                  maxLength={2}
                  className="h-12 mt-2"
                  data-testid="destination-state-input"
                />
              </div>
            </CardContent>
          </Card>

          {/* Date & Time */}
          <Card data-testid="datetime-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar size={24} weight="duotone" className="text-jungle" />
                Data e Hora
              </CardTitle>
              <CardDescription>Quando você pretende viajar?</CardDescription>
            </CardHeader>
            <CardContent className="grid md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="departureDate">Data de Partida</Label>
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

              <div className="grid md:grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="volumeM3">Volume (m³)</Label>
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
                  <Label htmlFor="maxWeightKg">Peso Máx. (kg)</Label>
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
                <div>
                  <Label htmlFor="maxDeviationKm">Desvio Máx. (km)</Label>
                  <Input
                    id="maxDeviationKm"
                    type="number"
                    value={formData.maxDeviationKm}
                    onChange={(e) => handleChange('maxDeviationKm', e.target.value)}
                    required
                    className="h-12 mt-2"
                    data-testid="max-deviation-input"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="pricePerKg">Preço por kg (R$) - Opcional</Label>
                <Input
                  id="pricePerKg"
                  type="number"
                  step="0.01"
                  placeholder="5.00"
                  value={formData.pricePerKg}
                  onChange={(e) => handleChange('pricePerKg', e.target.value)}
                  className="h-12 mt-2"
                  data-testid="price-per-kg-input"
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
              {loading ? 'Publicando...' : 'Publicar Viagem'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateTripPage;