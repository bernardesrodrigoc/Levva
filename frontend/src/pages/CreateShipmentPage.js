import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Package, Cube, CurrencyDollar, Camera, Warning } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import LocationPicker from '@/components/LocationPicker';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const CreateShipmentPage = () => {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [legalAcceptance, setLegalAcceptance] = useState(false);
  const [pickup, setPickup] = useState(null);
  const [dropoff, setDropoff] = useState(null);
  const [formData, setFormData] = useState({
    lengthCm: '',
    widthCm: '',
    heightCm: '',
    weightKg: '',
    category: '',
    description: '',
    declaredValue: '',
    photoItemVisible: 'https://via.placeholder.com/300x200?text=Foto+Item',
    photoPackagingOpen: 'https://via.placeholder.com/300x200?text=Embalagem+Aberta',
    photoPackagingSealed: 'https://via.placeholder.com/300x200?text=Embalagem+Fechada'
  });

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!legalAcceptance) {
      toast.error('Você deve aceitar a responsabilidade legal pelo conteúdo');
      return;
    }

    if (!pickup?.lat || !pickup?.lng) {
      toast.error('Selecione o ponto de coleta no mapa');
      return;
    }

    if (!dropoff?.lat || !dropoff?.lng) {
      toast.error('Selecione o ponto de entrega no mapa');
      return;
    }

    setLoading(true);

    try {
      const shipmentData = {
        origin: {
          city: pickup.city || 'Cidade não identificada',
          state: pickup.state || 'BR',
          address: pickup.address,
          lat: pickup.lat,
          lng: pickup.lng
        },
        destination: {
          city: dropoff.city || 'Cidade não identificada',
          state: dropoff.state || 'BR',
          address: dropoff.address,
          lat: dropoff.lat,
          lng: dropoff.lng
        },
        package: {
          length_cm: parseFloat(formData.lengthCm),
          width_cm: parseFloat(formData.widthCm),
          height_cm: parseFloat(formData.heightCm),
          weight_kg: parseFloat(formData.weightKg),
          category: formData.category,
          description: formData.description
        },
        declared_value: parseFloat(formData.declaredValue),
        photos: {
          item_visible: formData.photoItemVisible,
          packaging_open: formData.photoPackagingOpen,
          packaging_sealed: formData.photoPackagingSealed
        },
        legal_acceptance: legalAcceptance
      };

      await axios.post(`${API}/shipments`, shipmentData, {
        headers: { Authorization: `Bearer ${token}` }
      });

      toast.success('Envio criado com sucesso!');
      navigate('/dashboard');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Erro ao criar envio');
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
            <Package size={40} weight="duotone" className="text-lime" />
            Criar Novo Envio
          </h1>
          <p className="text-muted-foreground">Defina os pontos de coleta e entrega no mapa</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Pickup Location */}
          <Card data-testid="pickup-card">
            <CardHeader>
              <CardTitle className="text-jungle">Ponto de Coleta</CardTitle>
              <CardDescription>Onde o transportador deve buscar o pacote</CardDescription>
            </CardHeader>
            <CardContent>
              <LocationPicker
                label="Local de Coleta"
                value={pickup}
                onChange={setPickup}
                markerColor="green"
                placeholder="Buscar endereço de coleta..."
                testIdPrefix="pickup"
              />
            </CardContent>
          </Card>

          {/* Dropoff Location */}
          <Card data-testid="dropoff-card">
            <CardHeader>
              <CardTitle className="text-lime">Ponto de Entrega</CardTitle>
              <CardDescription>Onde o pacote deve ser entregue</CardDescription>
            </CardHeader>
            <CardContent>
              <LocationPicker
                label="Local de Entrega"
                value={dropoff}
                onChange={setDropoff}
                markerColor="red"
                placeholder="Buscar endereço de entrega..."
                testIdPrefix="dropoff"
              />
            </CardContent>
          </Card>

          {/* Package Details */}
          <Card data-testid="package-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Cube size={24} weight="duotone" className="text-jungle" />
                Detalhes do Pacote
              </CardTitle>
              <CardDescription>Informações sobre o item a ser enviado</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="lengthCm">Comprimento (cm)</Label>
                  <Input
                    id="lengthCm"
                    type="number"
                    placeholder="30"
                    value={formData.lengthCm}
                    onChange={(e) => handleChange('lengthCm', e.target.value)}
                    required
                    className="h-12 mt-2"
                    data-testid="length-input"
                  />
                </div>
                <div>
                  <Label htmlFor="widthCm">Largura (cm)</Label>
                  <Input
                    id="widthCm"
                    type="number"
                    placeholder="20"
                    value={formData.widthCm}
                    onChange={(e) => handleChange('widthCm', e.target.value)}
                    required
                    className="h-12 mt-2"
                    data-testid="width-input"
                  />
                </div>
                <div>
                  <Label htmlFor="heightCm">Altura (cm)</Label>
                  <Input
                    id="heightCm"
                    type="number"
                    placeholder="15"
                    value={formData.heightCm}
                    onChange={(e) => handleChange('heightCm', e.target.value)}
                    required
                    className="h-12 mt-2"
                    data-testid="height-input"
                  />
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="weightKg">Peso (kg)</Label>
                  <Input
                    id="weightKg"
                    type="number"
                    step="0.1"
                    placeholder="2.5"
                    value={formData.weightKg}
                    onChange={(e) => handleChange('weightKg', e.target.value)}
                    required
                    className="h-12 mt-2"
                    data-testid="weight-input"
                  />
                </div>
                <div>
                  <Label htmlFor="category">Categoria</Label>
                  <Select value={formData.category} onValueChange={(value) => handleChange('category', value)}>
                    <SelectTrigger className="h-12 mt-2" data-testid="category-select">
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="documents">Documentos</SelectItem>
                      <SelectItem value="electronics">Eletrônicos</SelectItem>
                      <SelectItem value="clothing">Roupas</SelectItem>
                      <SelectItem value="food">Alimentos (não perecíveis)</SelectItem>
                      <SelectItem value="gifts">Presentes</SelectItem>
                      <SelectItem value="other">Outros</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label htmlFor="description">Descrição do Item</Label>
                <Textarea
                  id="description"
                  placeholder="Descreva o conteúdo do pacote..."
                  value={formData.description}
                  onChange={(e) => handleChange('description', e.target.value)}
                  required
                  className="mt-2"
                  rows={3}
                  data-testid="description-input"
                />
              </div>
            </CardContent>
          </Card>

          {/* Value & Photos */}
          <Card data-testid="value-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CurrencyDollar size={24} weight="duotone" className="text-jungle" />
                Valor e Fotos
              </CardTitle>
              <CardDescription>Valor declarado e fotos do item</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="declaredValue">Valor Declarado (R$)</Label>
                <Input
                  id="declaredValue"
                  type="number"
                  step="0.01"
                  placeholder="100.00"
                  value={formData.declaredValue}
                  onChange={(e) => handleChange('declaredValue', e.target.value)}
                  required
                  className="h-12 mt-2"
                  data-testid="declared-value-input"
                />
              </div>

              {/* Photo placeholders */}
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center">
                  <div className="aspect-video bg-muted rounded-lg flex items-center justify-center mb-2">
                    <Camera size={32} className="text-muted-foreground" />
                  </div>
                  <span className="text-xs text-muted-foreground">Item visível</span>
                </div>
                <div className="text-center">
                  <div className="aspect-video bg-muted rounded-lg flex items-center justify-center mb-2">
                    <Camera size={32} className="text-muted-foreground" />
                  </div>
                  <span className="text-xs text-muted-foreground">Embalagem aberta</span>
                </div>
                <div className="text-center">
                  <div className="aspect-video bg-muted rounded-lg flex items-center justify-center mb-2">
                    <Camera size={32} className="text-muted-foreground" />
                  </div>
                  <span className="text-xs text-muted-foreground">Embalagem fechada</span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground text-center">
                Upload de fotos em breve. Por enquanto, fotos de exemplo serão usadas.
              </p>
            </CardContent>
          </Card>

          {/* Legal Acceptance */}
          <Alert className="border-yellow-500 bg-yellow-50">
            <Warning size={20} className="text-yellow-600" />
            <AlertDescription className="text-yellow-800">
              <div className="flex items-start gap-3">
                <Checkbox
                  id="legalAcceptance"
                  checked={legalAcceptance}
                  onCheckedChange={setLegalAcceptance}
                  data-testid="legal-acceptance-checkbox"
                />
                <label htmlFor="legalAcceptance" className="text-sm cursor-pointer">
                  Declaro que o conteúdo é legal, não perecível e de baixo risco. Assumo total responsabilidade pelo item enviado e suas consequências.
                </label>
              </div>
            </AlertDescription>
          </Alert>

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
              className="flex-1 h-12 bg-lime hover:bg-lime/90 text-black"
              disabled={loading || !legalAcceptance}
              data-testid="submit-shipment-btn"
            >
              {loading ? 'Publicando...' : 'Publicar Envio'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateShipmentPage;
