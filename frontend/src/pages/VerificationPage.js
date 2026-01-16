import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Package, Camera, IdentificationCard, User, Warning, SpinnerGap, CheckCircle } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import MobileDatePicker from '@/components/MobileDatePicker';
import CEPInput from '@/components/CEPInput';
import ImageUploadWithCamera from '@/components/ImageUploadWithCamera';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Estados brasileiros
const BRAZILIAN_STATES = [
  { value: 'AC', label: 'Acre' },
  { value: 'AL', label: 'Alagoas' },
  { value: 'AP', label: 'Amapá' },
  { value: 'AM', label: 'Amazonas' },
  { value: 'BA', label: 'Bahia' },
  { value: 'CE', label: 'Ceará' },
  { value: 'DF', label: 'Distrito Federal' },
  { value: 'ES', label: 'Espírito Santo' },
  { value: 'GO', label: 'Goiás' },
  { value: 'MA', label: 'Maranhão' },
  { value: 'MT', label: 'Mato Grosso' },
  { value: 'MS', label: 'Mato Grosso do Sul' },
  { value: 'MG', label: 'Minas Gerais' },
  { value: 'PA', label: 'Pará' },
  { value: 'PB', label: 'Paraíba' },
  { value: 'PR', label: 'Paraná' },
  { value: 'PE', label: 'Pernambuco' },
  { value: 'PI', label: 'Piauí' },
  { value: 'RJ', label: 'Rio de Janeiro' },
  { value: 'RN', label: 'Rio Grande do Norte' },
  { value: 'RS', label: 'Rio Grande do Sul' },
  { value: 'RO', label: 'Rondônia' },
  { value: 'RR', label: 'Roraima' },
  { value: 'SC', label: 'Santa Catarina' },
  { value: 'SP', label: 'São Paulo' },
  { value: 'SE', label: 'Sergipe' },
  { value: 'TO', label: 'Tocantins' }
];

const VerificationPage = () => {
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    cpf: '',
    birthDate: '',
    zipCode: '',
    address: '',
    number: '',
    complement: '',
    neighborhood: '',
    city: '',
    state: '',
    profilePhotoUrl: null,
    idFrontUrl: null,
    idBackUrl: null,
    selfieUrl: null,
    driverLicenseUrl: null
  });

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  // Handle address auto-fill from CEP
  const handleAddressFound = (address) => {
    setFormData(prev => ({
      ...prev,
      address: address.street || prev.address,
      neighborhood: address.neighborhood || prev.neighborhood,
      city: address.city || prev.city,
      state: address.state || prev.state,
      complement: address.complement || prev.complement
    }));
  };

  // Handle photo uploads
  const handlePhotoUpload = (field, url) => {
    setFormData(prev => ({ ...prev, [field]: url }));
  };

  const handleSubmitStep1 = (e) => {
    e.preventDefault();
    if (!formData.cpf || !formData.birthDate || !formData.zipCode || !formData.city || !formData.state) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }
    setStep(2);
  };

  const handleSubmitStep2 = (e) => {
    e.preventDefault();
    if (!formData.profilePhotoUrl) {
      toast.error('Foto de perfil é obrigatória');
      return;
    }
    setStep(3);
  };

  const handleSubmitStep3 = (e) => {
    e.preventDefault();
    if (!formData.idFrontUrl || !formData.idBackUrl || !formData.selfieUrl) {
      toast.error('Todos os documentos são obrigatórios');
      return;
    }
    if (user?.role === 'carrier' || user?.role === 'both') {
      setStep(4);
    } else {
      handleFinalSubmit();
    }
  };

  const handleSubmitStep4 = (e) => {
    e.preventDefault();
    if (!formData.driverLicenseUrl) {
      toast.error('CNH é obrigatória para transportadores');
      return;
    }
    handleFinalSubmit();
  };

  const handleFinalSubmit = async () => {
    setLoading(true);
    try {
      const verificationData = {
        cpf: formData.cpf,
        birth_date: formData.birthDate,
        address: {
          street: formData.address,
          city: formData.city,
          state: formData.state,
          zip_code: formData.zipCode
        },
        documents: {
          profile_photo: formData.profilePhotoUrl,
          id_front: formData.idFrontUrl,
          id_back: formData.idBackUrl,
          selfie: formData.selfieUrl,
          driver_license: formData.driverLicenseUrl || null
        }
      };

      await axios.post(`${API}/users/verify`, verificationData, {
        headers: { Authorization: `Bearer ${token}` }
      });

      toast.success('Documentos enviados para verificação!');
      navigate('/dashboard');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Erro ao enviar verificação');
    } finally {
      setLoading(false);
    }
  };

  const progress = (step / (user?.role === 'carrier' || user?.role === 'both' ? 4 : 3)) * 100;

  const FileUploadZone = ({ label, preview, isUploading, isUploaded, onFileSelect, testId }) => (
    <div>
      <Label>{label}</Label>
      <div className="mt-2 border-2 border-dashed rounded-lg p-6 relative">
        {isUploading && (
          <div className="absolute inset-0 bg-white/80 flex items-center justify-center z-10 rounded-lg">
            <div className="flex flex-col items-center">
              <SpinnerGap className="w-8 h-8 animate-spin text-jungle" />
              <span className="text-sm mt-2">Enviando...</span>
            </div>
          </div>
        )}
        {preview ? (
          <div className="relative">
            <img src={preview} alt="Preview" className="w-full h-48 object-contain mb-4" />
            {isUploaded && (
              <div className="absolute top-2 right-2 bg-green-500 text-white rounded-full p-1">
                <CheckCircle size={20} />
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center text-center py-8">
            <Camera size={32} className="text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">Clique ou arraste para selecionar</p>
          </div>
        )}
        <Input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(e) => onFileSelect(e.target.files[0])}
          disabled={isUploading}
          data-testid={testId}
        />
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="glass border-b sticky top-0 z-50">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Package size={32} weight="duotone" className="text-jungle" />
            <span className="text-2xl font-heading font-bold text-jungle">Levva</span>
          </div>
          <Button variant="ghost" onClick={() => navigate('/dashboard')} data-testid="back-btn">
            Voltar
          </Button>
        </div>
      </header>

      <div className="container mx-auto px-6 py-8 max-w-3xl">
        {/* Alert */}
        <Alert className="mb-8 border-yellow-500 bg-yellow-50">
          <Warning size={20} className="text-yellow-600" />
          <AlertTitle className="text-yellow-800">Verificação Obrigatória</AlertTitle>
          <AlertDescription className="text-yellow-700">
            Para garantir a segurança de todos, você precisa verificar sua identidade antes de usar a plataforma.
          </AlertDescription>
        </Alert>

        {/* Progress */}
        <div className="mb-6 md:mb-8">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-2xl md:text-3xl font-heading font-bold">Verificação</h1>
            <span className="text-xs md:text-sm text-muted-foreground">Etapa {step} de {user?.role === 'carrier' || user?.role === 'both' ? 4 : 3}</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        {/* Step 1: Personal Info - REORGANIZED */}
        {step === 1 && (
          <form onSubmit={handleSubmitStep1}>
            <Card data-testid="step1-card">
              <CardHeader className="p-4 md:p-6">
                <CardTitle className="flex items-center gap-2 text-base md:text-lg">
                  <IdentificationCard size={22} weight="duotone" className="text-jungle" />
                  Dados Pessoais
                </CardTitle>
                <CardDescription className="text-xs md:text-sm">Informações básicas para sua identificação</CardDescription>
              </CardHeader>
              <CardContent className="p-4 md:p-6 pt-0 space-y-4">
                
                {/* CEP PRIMEIRO - com auto-preenchimento */}
                <div className="p-4 bg-jungle/5 rounded-lg border border-jungle/20">
                  <p className="text-xs text-jungle font-medium mb-3">Digite seu CEP para preencher o endereço automaticamente:</p>
                  <CEPInput
                    value={formData.zipCode}
                    onChange={(value) => handleChange('zipCode', value)}
                    onAddressFound={handleAddressFound}
                    label="CEP *"
                    required
                    data-testid="cep-input"
                  />
                </div>

                {/* Endereço (preenchido automaticamente) */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <Label className="text-xs md:text-sm">Rua/Logradouro *</Label>
                    <Input
                      placeholder="Rua, Avenida..."
                      value={formData.address}
                      onChange={(e) => handleChange('address', e.target.value)}
                      required
                      className="h-11 md:h-12 mt-1.5 text-base"
                      data-testid="address-input"
                    />
                  </div>
                  <div>
                    <Label className="text-xs md:text-sm">Número *</Label>
                    <Input
                      placeholder="123"
                      value={formData.number}
                      onChange={(e) => handleChange('number', e.target.value)}
                      required
                      className="h-11 md:h-12 mt-1.5 text-base"
                      data-testid="number-input"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs md:text-sm">Complemento</Label>
                    <Input
                      placeholder="Apto, Bloco..."
                      value={formData.complement}
                      onChange={(e) => handleChange('complement', e.target.value)}
                      className="h-11 md:h-12 mt-1.5 text-base"
                    />
                  </div>
                  <div>
                    <Label className="text-xs md:text-sm">Bairro *</Label>
                    <Input
                      value={formData.neighborhood}
                      onChange={(e) => handleChange('neighborhood', e.target.value)}
                      required
                      className="h-11 md:h-12 mt-1.5 text-base"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs md:text-sm">Cidade *</Label>
                    <Input
                      value={formData.city}
                      onChange={(e) => handleChange('city', e.target.value)}
                      required
                      className="h-11 md:h-12 mt-1.5 text-base"
                      data-testid="city-input"
                    />
                  </div>
                  <div>
                    <Label className="text-xs md:text-sm">Estado *</Label>
                    <Select 
                      value={formData.state} 
                      onValueChange={(value) => handleChange('state', value)}
                    >
                      <SelectTrigger className="h-11 md:h-12 mt-1.5 text-base" data-testid="state-select">
                        <SelectValue placeholder="UF" />
                      </SelectTrigger>
                      <SelectContent className="max-h-[200px]">
                        {BRAZILIAN_STATES.map((state) => (
                          <SelectItem key={state.value} value={state.value}>
                            {state.value} - {state.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Dados pessoais */}
                <div className="border-t pt-4 mt-4">
                  <p className="text-xs md:text-sm font-medium text-muted-foreground mb-3">Informações pessoais:</p>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label className="text-xs md:text-sm">CPF *</Label>
                      <Input
                        placeholder="000.000.000-00"
                        value={formData.cpf}
                        onChange={(e) => handleChange('cpf', e.target.value)}
                        required
                        className="h-11 md:h-12 mt-1.5 text-base"
                        inputMode="numeric"
                        data-testid="cpf-input"
                      />
                    </div>
                    <MobileDatePicker
                      label="Data de Nascimento *"
                      value={formData.birthDate}
                      onChange={(value) => handleChange('birthDate', value)}
                      minYear={1920}
                      maxYear={new Date().getFullYear() - 18}
                      required
                      data-testid="birthdate"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Button type="submit" className="w-full h-11 md:h-12 mt-6 bg-jungle hover:bg-jungle-800" data-testid="next-btn">
              Continuar
            </Button>
          </form>
        )}

        {/* Step 2: Profile Photo */}
        {step === 2 && (
          <form onSubmit={handleSubmitStep2}>
            <Card data-testid="step2-card">
              <CardHeader className="p-4 md:p-6">
                <CardTitle className="flex items-center gap-2 text-base md:text-lg">
                  <User size={22} weight="duotone" className="text-jungle" />
                  Foto de Perfil
                </CardTitle>
                <CardDescription className="text-xs md:text-sm">Uma foto clara do seu rosto</CardDescription>
              </CardHeader>
              <CardContent className="p-4 md:p-6 pt-0">
                <div className="max-w-sm mx-auto">
                  <ImageUploadWithCamera
                    fileType="profile"
                    label="Tire uma selfie ou escolha uma foto"
                    onUploadComplete={(url) => handlePhotoUpload('profilePhotoUrl', url)}
                    currentImageUrl={formData.profilePhotoUrl}
                    maxSizeMB={5}
                  />
                  <p className="text-xs text-muted-foreground mt-3 text-center">Use uma foto com boa iluminação</p>
                </div>
              </CardContent>
            </Card>

            <div className="flex gap-3 mt-6">
              <Button type="button" variant="outline" className="flex-1 h-11 md:h-12" onClick={() => setStep(1)}>
                Voltar
              </Button>
              <Button type="submit" className="flex-1 h-11 md:h-12 bg-jungle hover:bg-jungle-800">
                Continuar
              </Button>
            </div>
          </form>
        )}

        {/* Step 3: Documents */}
        {step === 3 && (
          <form onSubmit={handleSubmitStep3}>
            <Card data-testid="step3-card">
              <CardHeader className="p-4 md:p-6">
                <CardTitle className="flex items-center gap-2 text-base md:text-lg">
                  <IdentificationCard size={22} weight="duotone" className="text-jungle" />
                  Documentos
                </CardTitle>
                <CardDescription className="text-xs md:text-sm">RG ou CNH + Selfie com documento</CardDescription>
              </CardHeader>
              <CardContent className="p-4 md:p-6 pt-0 space-y-4 md:space-y-6">
                <ImageUploadWithCamera
                  fileType="id_front"
                  label="Frente do Documento *"
                  onUploadComplete={(url) => handlePhotoUpload('idFrontUrl', url)}
                  currentImageUrl={formData.idFrontUrl}
                  maxSizeMB={5}
                />

                <ImageUploadWithCamera
                  fileType="id_back"
                  label="Verso do Documento *"
                  onUploadComplete={(url) => handlePhotoUpload('idBackUrl', url)}
                  currentImageUrl={formData.idBackUrl}
                  maxSizeMB={5}
                />

                <ImageUploadWithCamera
                  fileType="selfie"
                  label="Selfie com Documento *"
                  onUploadComplete={(url) => handlePhotoUpload('selfieUrl', url)}
                  currentImageUrl={formData.selfieUrl}
                  maxSizeMB={5}
                />
                  onFileSelect={(file) => handleFileChange('selfie', 'selfiePreview', 'selfieUrl', 'selfie', file)}
                  testId="selfie-input"
                />
              </CardContent>
            </Card>

            <div className="flex gap-4 mt-6">
              <Button type="button" variant="outline" className="flex-1 h-12" onClick={() => setStep(2)}>
                Voltar
              </Button>
              <Button type="submit" className="flex-1 h-12 bg-jungle hover:bg-jungle-800" disabled={uploadingFile !== null}>
                {(user?.role === 'carrier' || user?.role === 'both') ? 'Continuar' : 'Enviar para Verificação'}
              </Button>
            </div>
          </form>
        )}

        {/* Step 4: Driver License (only for carriers) */}
        {step === 4 && (
          <form onSubmit={handleSubmitStep4}>
            <Card data-testid="step4-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <IdentificationCard size={24} weight="duotone" className="text-jungle" />
                  CNH - Carteira de Motorista
                </CardTitle>
                <CardDescription>Obrigatório para transportadores</CardDescription>
              </CardHeader>
              <CardContent>
                <FileUploadZone
                  label="CNH (frente e verso ou aberta) *"
                  preview={formData.driverLicensePreview}
                  isUploading={uploadingFile === 'license'}
                  isUploaded={!!formData.driverLicenseUrl}
                  onFileSelect={(file) => handleFileChange('driverLicense', 'driverLicensePreview', 'driverLicenseUrl', 'license', file)}
                  testId="driver-license-input"
                />
              </CardContent>
            </Card>

            <div className="flex gap-4 mt-6">
              <Button type="button" variant="outline" className="flex-1 h-12" onClick={() => setStep(3)}>
                Voltar
              </Button>
              <Button type="submit" className="flex-1 h-12 bg-jungle hover:bg-jungle-800" disabled={loading || uploadingFile !== null}>
                {loading ? 'Enviando...' : 'Enviar para Verificação'}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default VerificationPage;
