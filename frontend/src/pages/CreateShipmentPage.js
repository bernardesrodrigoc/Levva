import React, { useState, useEffect } from 'react';
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
import ImageUpload from '@/components/ImageUpload';
import { PriceEstimate, CargoCategories } from '@/components/IntelligentPricing';
import SmartSuggestions from '@/components/SmartSuggestions';
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
    photoItemVisible: null,
    photoPackagingOpen: null,
    photoPackagingSealed: null
  });

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handlePhotoUpload = (field, url) => {
    handleChange(field, url);
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
    <div className="min-h-screen bg-background pb-24 md:pb-8"> {/* Extra padding for mobile nav */}
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
            <Package size={32} weight="duotone" className="text-lime hidden md:block" />
            Criar Novo Envio
          </h1>
          <p className="text-sm md:text-base text-muted-foreground">Defina os pontos de coleta e entrega no mapa</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 md:space-y-6">
          {/* Pickup Location */}
          <Card data-testid="pickup-card">
            <CardHeader className="p-4 md:p-6 pb-2 md:pb-4">
              <CardTitle className="text-jungle text-base md:text-lg">Ponto de Coleta</CardTitle>
              <CardDescription className="text-xs md:text-sm">Onde o transportador deve buscar o pacote</CardDescription>
            </CardHeader>
            <CardContent className="p-4 md:p-6 pt-0">
              <div className="h-[250px] md:h-[350px] rounded-lg overflow-hidden border">
                <LocationPicker
                  label="Local de Coleta"
                  value={pickup}
                  onChange={setPickup}
                  markerColor="green"
                  placeholder="Buscar endereço de coleta..."
                  testIdPrefix="pickup"
                />
              </div>
            </CardContent>
          </Card>

          {/* Dropoff Location */}
          <Card data-testid="dropoff-card">
            <CardHeader className="p-4 md:p-6 pb-2 md:pb-4">
              <CardTitle className="text-lime text-base md:text-lg">Ponto de Entrega</CardTitle>
              <CardDescription className="text-xs md:text-sm">Onde o pacote deve ser entregue</CardDescription>
            </CardHeader>
            <CardContent className="p-4 md:p-6 pt-0">
              <div className="h-[250px] md:h-[350px] rounded-lg overflow-hidden border">
                <LocationPicker
                  label="Local de Entrega"
                  value={dropoff}
                  onChange={setDropoff}
                  markerColor="red"
                  placeholder="Buscar endereço de entrega..."
                  testIdPrefix="dropoff"
                />
              </div>
            </CardContent>
          </Card>

          {/* Package Details - Mobile Optimized */}
          <Card data-testid="package-card">
            <CardHeader className="p-4 md:p-6 pb-2 md:pb-4">
              <CardTitle className="flex items-center gap-2 text-base md:text-lg">
                <Cube size={20} weight="duotone" className="text-jungle" />
                Detalhes do Pacote
              </CardTitle>
              <CardDescription className="text-xs md:text-sm">Informações sobre o item a ser enviado</CardDescription>
            </CardHeader>
            <CardContent className="p-4 md:p-6 pt-0 space-y-4">
              {/* Dimensions - 2 columns on mobile, 3 on desktop */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
                <div>
                  <Label htmlFor="lengthCm" className="text-xs md:text-sm">Comprimento (cm)</Label>
                  <Input
                    id="lengthCm"
                    type="number"
                    inputMode="decimal"
                    placeholder="30"
                    value={formData.lengthCm}
                    onChange={(e) => handleChange('lengthCm', e.target.value)}
                    required
                    className="h-11 md:h-12 mt-1.5 text-base"
                    data-testid="length-input"
                  />
                </div>
                <div>
                  <Label htmlFor="widthCm" className="text-xs md:text-sm">Largura (cm)</Label>
                  <Input
                    id="widthCm"
                    type="number"
                    inputMode="decimal"
                    placeholder="20"
                    value={formData.widthCm}
                    onChange={(e) => handleChange('widthCm', e.target.value)}
                    required
                    className="h-11 md:h-12 mt-1.5 text-base"
                    data-testid="width-input"
                  />
                </div>
                <div className="col-span-2 md:col-span-1">
                  <Label htmlFor="heightCm" className="text-xs md:text-sm">Altura (cm)</Label>
                  <Input
                    id="heightCm"
                    type="number"
                    inputMode="decimal"
                    placeholder="15"
                    value={formData.heightCm}
                    onChange={(e) => handleChange('heightCm', e.target.value)}
                    required
                    className="h-11 md:h-12 mt-1.5 text-base"
                    data-testid="height-input"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                <div>
                  <Label htmlFor="weightKg" className="text-xs md:text-sm">Peso (kg)</Label>
                  <Input
                    id="weightKg"
                    type="number"
                    inputMode="decimal"
                    step="0.1"
                    placeholder="2.5"
                    value={formData.weightKg}
                    onChange={(e) => handleChange('weightKg', e.target.value)}
                    required
                    className="h-11 md:h-12 mt-1.5 text-base"
                    data-testid="weight-input"
                  />
                </div>
                <div>
                  <Label htmlFor="category" className="text-xs md:text-sm">Categoria</Label>
                  <Select value={formData.category} onValueChange={(value) => handleChange('category', value)}>
                    <SelectTrigger className="h-11 md:h-12 mt-1.5 text-base" data-testid="category-select">
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
                <Label htmlFor="description" className="text-xs md:text-sm">Descrição do Item</Label>
                <Textarea
                  id="description"
                  placeholder="Descreva o conteúdo do pacote..."
                  value={formData.description}
                  onChange={(e) => handleChange('description', e.target.value)}
                  required
                  className="mt-1.5 text-base"
                  rows={3}
                  data-testid="description-input"
                />
              </div>
            </CardContent>
          </Card>

          {/* Value & Photos - Mobile Optimized with Real Uploads */}
          <Card data-testid="value-card">
            <CardHeader className="p-4 md:p-6 pb-2 md:pb-4">
              <CardTitle className="flex items-center gap-2 text-base md:text-lg">
                <CurrencyDollar size={20} weight="duotone" className="text-jungle" />
                Valor e Fotos
              </CardTitle>
              <CardDescription className="text-xs md:text-sm">Valor declarado e fotos do item</CardDescription>
            </CardHeader>
            <CardContent className="p-4 md:p-6 pt-0 space-y-4">
              <div>
                <Label htmlFor="declaredValue" className="text-xs md:text-sm">Valor Declarado (R$)</Label>
                <Input
                  id="declaredValue"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  placeholder="100.00"
                  value={formData.declaredValue}
                  onChange={(e) => handleChange('declaredValue', e.target.value)}
                  required
                  className="h-11 md:h-12 mt-1.5 text-base"
                  data-testid="declared-value-input"
                />
              </div>

              {/* Real Photo Uploads */}
              <div>
                <Label className="text-xs md:text-sm mb-2 block">Fotos do Pacote (Opcional)</Label>
                <div className="grid grid-cols-3 gap-2 md:gap-3">
                  <div>
                    <ImageUpload
                      fileType="package"
                      label="Item"
                      onUploadComplete={(url) => handlePhotoUpload('photoItemVisible', url)}
                      maxSizeMB={5}
                    />
                    <span className="text-[10px] md:text-xs text-muted-foreground block text-center mt-1">Item visível</span>
                  </div>
                  <div>
                    <ImageUpload
                      fileType="package"
                      label="Aberta"
                      onUploadComplete={(url) => handlePhotoUpload('photoPackagingOpen', url)}
                      maxSizeMB={5}
                    />
                    <span className="text-[10px] md:text-xs text-muted-foreground block text-center mt-1">Embalagem aberta</span>
                  </div>
                  <div>
                    <ImageUpload
                      fileType="package"
                      label="Fechada"
                      onUploadComplete={(url) => handlePhotoUpload('photoPackagingSealed', url)}
                      maxSizeMB={5}
                    />
                    <span className="text-[10px] md:text-xs text-muted-foreground block text-center mt-1">Embalagem fechada</span>
                  </div>
                </div>
                <p className="text-[10px] md:text-xs text-muted-foreground text-center mt-2">
                  Toque para tirar foto ou selecionar da galeria
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Intelligent Price Estimate */}
          {pickup?.lat && dropoff?.lat && parseFloat(formData.weightKg) > 0 && (
            <PriceEstimate
              originLat={pickup.lat}
              originLng={pickup.lng}
              destLat={dropoff.lat}
              destLng={dropoff.lng}
              originCity={pickup.city}
              destinationCity={dropoff.city}
              weightKg={parseFloat(formData.weightKg) || 1}
              lengthCm={parseFloat(formData.lengthCm) || 20}
              widthCm={parseFloat(formData.widthCm) || 20}
              heightCm={parseFloat(formData.heightCm) || 20}
              category={formData.category}
            />
          )}

          {/* Smart Suggestions */}
          {pickup?.city && dropoff?.city && (
            <SmartSuggestions
              originCity={pickup.city}
              destinationCity={dropoff.city}
              originLat={pickup.lat}
              originLng={pickup.lng}
              destLat={dropoff.lat}
              destLng={dropoff.lng}
              isShipment={true}
              compact={true}
            />
          )}

          {/* Legal Acceptance - Mobile Optimized */}
          <Alert className="border-yellow-500 bg-yellow-50">
            <Warning size={18} className="text-yellow-600 flex-shrink-0 mt-0.5" />
            <AlertDescription className="text-yellow-800">
              <div className="flex items-start gap-2 md:gap-3">
                <Checkbox
                  id="legalAcceptance"
                  checked={legalAcceptance}
                  onCheckedChange={setLegalAcceptance}
                  className="mt-0.5"
                  data-testid="legal-acceptance-checkbox"
                />
                <label htmlFor="legalAcceptance" className="text-xs md:text-sm cursor-pointer leading-relaxed">
                  Declaro que o conteúdo é legal, não perecível e de baixo risco. Assumo total responsabilidade pelo item enviado.
                </label>
              </div>
            </AlertDescription>
          </Alert>

          {/* Action Buttons - Sticky on mobile */}
          <div className="flex gap-3 md:gap-4 sticky bottom-20 md:static bg-background py-4 md:py-0 -mx-4 px-4 md:mx-0 md:px-0 border-t md:border-0">
            <Button
              type="button"
              variant="outline"
              className="flex-1 h-11 md:h-12 text-sm md:text-base"
              onClick={() => navigate('/dashboard')}
              data-testid="cancel-btn"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              className="flex-1 h-11 md:h-12 bg-lime hover:bg-lime/90 text-black text-sm md:text-base font-semibold"
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
