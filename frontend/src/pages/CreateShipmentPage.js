import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Package, MapPin, Cube, CurrencyDollar, Camera } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
  const [formData, setFormData] = useState({
    originCity: '',
    originState: '',
    originLat: -23.5505,
    originLng: -46.6333,
    destinationCity: '',
    destinationState: '',
    destinationLat: -22.9068,
    destinationLng: -43.1729,
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

    setLoading(true);

    try {
      const shipmentData = {
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
        legal_acceptance: true
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
          <p className="text-muted-foreground">Cadastre seu pacote e encontre um transportador</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Origin */}
          <Card data-testid="origin-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin size={24} weight="duotone" className="text-jungle" />
                Origem
              </CardTitle>
              <CardDescription>De onde o pacote será coletado?</CardDescription>
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
              <CardDescription>Para onde o pacote vai?</CardDescription>
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

          {/* Package Details */}
          <Card data-testid="package-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Cube size={24} weight="duotone" className="text-jungle" />
                Detalhes do Pacote
              </CardTitle>
              <CardDescription>Dimensões e descrição</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid md:grid-cols-4 gap-4">
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
                <div>
                  <Label htmlFor="weightKg">Peso (kg)</Label>
                  <Input
                    id="weightKg"
                    type="number"
                    step="0.1"
                    placeholder="5"
                    value={formData.weightKg}
                    onChange={(e) => handleChange('weightKg', e.target.value)}
                    required
                    className="h-12 mt-2"
                    data-testid="weight-input"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="category">Categoria</Label>
                <Input
                  id="category"
                  placeholder="Eletrônicos, Documentos, Alimentos, etc."
                  value={formData.category}
                  onChange={(e) => handleChange('category', e.target.value)}
                  required
                  className="h-12 mt-2"
                  data-testid="category-input"
                />
              </div>

              <div>
                <Label htmlFor="description">Descrição</Label>
                <Textarea
                  id="description"
                  placeholder="Descreva o conteúdo do pacote"
                  value={formData.description}
                  onChange={(e) => handleChange('description', e.target.value)}
                  required
                  rows={3}
                  className="mt-2"
                  data-testid="description-input"
                />
              </div>
            </CardContent>
          </Card>

          {/* Value */}
          <Card data-testid="value-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CurrencyDollar size={24} weight="duotone" className="text-jungle" />
                Valor Declarado
              </CardTitle>
              <CardDescription>Qual o valor do conteúdo?</CardDescription>
            </CardHeader>
            <CardContent>
              <Label htmlFor="declaredValue">Valor (R$)</Label>
              <Input
                id="declaredValue"
                type="number"
                step="0.01"
                placeholder="500.00"
                value={formData.declaredValue}
                onChange={(e) => handleChange('declaredValue', e.target.value)}
                required
                className="h-12 mt-2"
                data-testid="declared-value-input"
              />
            </CardContent>
          </Card>

          {/* Photos */}
          <Card data-testid="photos-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Camera size={24} weight="duotone" className="text-jungle" />
                Fotos Obrigatórias
              </CardTitle>
              <CardDescription>3 fotos são necessárias para segurança</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert>
                <AlertDescription>
                  No MVP, use URLs de placeholder. Na próxima fase, implementaremos upload real com Cloudflare R2.
                </AlertDescription>
              </Alert>

              <div className="grid md:grid-cols-3 gap-4">
                <div>
                  <Label>1. Item visível</Label>
                  <div className="mt-2 border-2 border-dashed border-border rounded-lg p-4 text-center">
                    <Camera size={32} className="mx-auto text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground">Placeholder URL</p>
                  </div>
                </div>
                <div>
                  <Label>2. Embalagem aberta</Label>
                  <div className="mt-2 border-2 border-dashed border-border rounded-lg p-4 text-center">
                    <Camera size={32} className="mx-auto text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground">Placeholder URL</p>
                  </div>
                </div>
                <div>
                  <Label>3. Embalagem fechada</Label>
                  <div className="mt-2 border-2 border-dashed border-border rounded-lg p-4 text-center">
                    <Camera size={32} className="mx-auto text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground">Placeholder URL</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Legal */}
          <Card data-testid="legal-card">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <Checkbox
                  id="legalAcceptance"
                  checked={legalAcceptance}
                  onCheckedChange={setLegalAcceptance}
                  data-testid="legal-acceptance-checkbox"
                />
                <div>
                  <Label htmlFor="legalAcceptance" className="cursor-pointer">
                    Aceito total responsabilidade pelo conteúdo deste pacote
                  </Label>
                  <p className="text-sm text-muted-foreground mt-1">
                    Declaro que o conteúdo é legal, não contém itens proibidos e cumpre todas as leis aplicáveis.
                  </p>
                </div>
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