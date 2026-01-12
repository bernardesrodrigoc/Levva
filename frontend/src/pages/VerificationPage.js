import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Package, Camera, IdentificationCard, User, Warning } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const VerificationPage = () => {
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    cpf: '',
    birthDate: '',
    address: '',
    city: '',
    state: '',
    zipCode: '',
    profilePhoto: null,
    profilePhotoPreview: null,
    idFront: null,
    idFrontPreview: null,
    idBack: null,
    idBackPreview: null,
    selfie: null,
    selfiePreview: null,
    driverLicense: null,
    driverLicensePreview: null
  });

  const handleFileChange = (field, previewField, file) => {
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData(prev => ({
          ...prev,
          [field]: file,
          [previewField]: reader.result
        }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmitStep1 = (e) => {
    e.preventDefault();
    if (!formData.cpf || !formData.birthDate || !formData.address || !formData.city || !formData.state || !formData.zipCode) {
      toast.error('Preencha todos os campos');
      return;
    }
    setStep(2);
  };

  const handleSubmitStep2 = (e) => {
    e.preventDefault();
    if (!formData.profilePhoto) {
      toast.error('Foto de perfil é obrigatória');
      return;
    }
    setStep(3);
  };

  const handleSubmitStep3 = (e) => {
    e.preventDefault();
    if (!formData.idFront || !formData.idBack || !formData.selfie) {
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
    if (!formData.driverLicense) {
      toast.error('CNH é obrigatória para transportadores');
      return;
    }
    handleFinalSubmit();
  };

  const handleFinalSubmit = async () => {
    setLoading(true);
    try {\n      // Use real Unsplash URLs as placeholders until R2 is implemented
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
          profile_photo: formData.profilePhotoPreview || 'https://images.unsplash.com/photo-1633332755192-727a05c4013d?w=300&h=300&fit=crop',
          id_front: formData.idFrontPreview || 'https://images.unsplash.com/photo-1589829545856-d10d557cf95f?w=400&h=300&fit=crop',
          id_back: formData.idBackPreview || 'https://images.unsplash.com/photo-1589829545856-d10d557cf95f?w=400&h=300&fit=crop',
          selfie: formData.selfiePreview || 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=300&h=300&fit=crop',
          driver_license: formData.driverLicense ? (formData.driverLicensePreview || 'https://images.unsplash.com/photo-1589829545856-d10d557cf95f?w=400&h=300&fit=crop') : null
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
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-3xl font-heading font-bold">Verificação de Identidade</h1>
            <span className="text-sm text-muted-foreground">Etapa {step} de {user?.role === 'carrier' || user?.role === 'both' ? 4 : 3}</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        {/* Step 1: Personal Info */}
        {step === 1 && (
          <form onSubmit={handleSubmitStep1}>
            <Card data-testid="step1-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <IdentificationCard size={24} weight="duotone" className="text-jungle" />
                  Dados Pessoais
                </CardTitle>
                <CardDescription>Informações básicas para sua identificação</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="cpf">CPF *</Label>
                    <Input
                      id="cpf"
                      placeholder="000.000.000-00"
                      value={formData.cpf}
                      onChange={(e) => handleChange('cpf', e.target.value)}
                      required
                      className="h-12 mt-2"
                      data-testid="cpf-input"
                    />
                  </div>
                  <div>
                    <Label htmlFor="birthDate">Data de Nascimento *</Label>
                    <Input
                      id="birthDate"
                      type="date"
                      value={formData.birthDate}
                      onChange={(e) => handleChange('birthDate', e.target.value)}
                      required
                      className="h-12 mt-2"
                      data-testid="birthdate-input"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="address">Endereço Completo *</Label>
                  <Input
                    id="address"
                    placeholder="Rua, número, complemento"
                    value={formData.address}
                    onChange={(e) => handleChange('address', e.target.value)}
                    required
                    className="h-12 mt-2"
                    data-testid="address-input"
                  />
                </div>

                <div className="grid md:grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="city">Cidade *</Label>
                    <Input
                      id="city"
                      value={formData.city}
                      onChange={(e) => handleChange('city', e.target.value)}
                      required
                      className="h-12 mt-2"
                      data-testid="city-input"
                    />
                  </div>
                  <div>
                    <Label htmlFor="state">Estado *</Label>
                    <Input
                      id="state"
                      maxLength={2}
                      placeholder="SP"
                      value={formData.state}
                      onChange={(e) => handleChange('state', e.target.value.toUpperCase())}
                      required
                      className="h-12 mt-2"
                      data-testid="state-input"
                    />
                  </div>
                  <div>
                    <Label htmlFor="zipCode">CEP *</Label>
                    <Input
                      id="zipCode"
                      placeholder="00000-000"
                      value={formData.zipCode}
                      onChange={(e) => handleChange('zipCode', e.target.value)}
                      required
                      className="h-12 mt-2"
                      data-testid="zipcode-input"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Button type="submit" className="w-full h-12 mt-6 bg-jungle hover:bg-jungle-800" data-testid="next-btn">
              Continuar
            </Button>
          </form>
        )}

        {/* Step 2: Profile Photo */}
        {step === 2 && (
          <form onSubmit={handleSubmitStep2}>
            <Card data-testid="step2-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User size={24} weight="duotone" className="text-jungle" />
                  Foto de Perfil
                </CardTitle>
                <CardDescription>Uma foto clara do seu rosto</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col items-center">
                  {formData.profilePhotoPreview ? (
                    <img src={formData.profilePhotoPreview} alt="Preview" className="w-48 h-48 rounded-full object-cover mb-4" />
                  ) : (
                    <div className="w-48 h-48 rounded-full bg-muted flex items-center justify-center mb-4">
                      <Camera size={48} className="text-muted-foreground" />
                    </div>
                  )}
                  <Input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleFileChange('profilePhoto', 'profilePhotoPreview', e.target.files[0])}
                    className="max-w-xs"
                    data-testid="profile-photo-input"
                  />
                </div>
              </CardContent>
            </Card>

            <div className="flex gap-4 mt-6">
              <Button type="button" variant="outline" className="flex-1 h-12" onClick={() => setStep(1)}>
                Voltar
              </Button>
              <Button type="submit" className="flex-1 h-12 bg-jungle hover:bg-jungle-800">
                Continuar
              </Button>
            </div>
          </form>
        )}

        {/* Step 3: Documents */}
        {step === 3 && (
          <form onSubmit={handleSubmitStep3}>
            <Card data-testid="step3-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <IdentificationCard size={24} weight="duotone" className="text-jungle" />
                  Documentos
                </CardTitle>
                <CardDescription>RG ou CNH + Selfie com documento</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* ID Front */}
                <div>
                  <Label>Frente do Documento *</Label>
                  <div className="mt-2 border-2 border-dashed rounded-lg p-6">
                    {formData.idFrontPreview ? (
                      <img src={formData.idFrontPreview} alt="ID Front" className="w-full h-48 object-contain mb-4" />
                    ) : (
                      <div className="flex flex-col items-center text-center py-8">
                        <Camera size={32} className="text-muted-foreground mb-2" />
                        <p className="text-sm text-muted-foreground">Frente do RG ou CNH</p>
                      </div>
                    )}
                    <Input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleFileChange('idFront', 'idFrontPreview', e.target.files[0])}
                      data-testid="id-front-input"
                    />
                  </div>
                </div>

                {/* ID Back */}
                <div>
                  <Label>Verso do Documento *</Label>
                  <div className="mt-2 border-2 border-dashed rounded-lg p-6">
                    {formData.idBackPreview ? (
                      <img src={formData.idBackPreview} alt="ID Back" className="w-full h-48 object-contain mb-4" />
                    ) : (
                      <div className="flex flex-col items-center text-center py-8">
                        <Camera size={32} className="text-muted-foreground mb-2" />
                        <p className="text-sm text-muted-foreground">Verso do documento</p>
                      </div>
                    )}
                    <Input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleFileChange('idBack', 'idBackPreview', e.target.files[0])}
                      data-testid="id-back-input"
                    />
                  </div>
                </div>

                {/* Selfie */}
                <div>
                  <Label>Selfie com Documento *</Label>
                  <div className="mt-2 border-2 border-dashed rounded-lg p-6">
                    {formData.selfiePreview ? (
                      <img src={formData.selfiePreview} alt="Selfie" className="w-full h-48 object-contain mb-4" />
                    ) : (
                      <div className="flex flex-col items-center text-center py-8">
                        <Camera size={32} className="text-muted-foreground mb-2" />
                        <p className="text-sm text-muted-foreground">Você segurando o documento ao lado do rosto</p>
                      </div>
                    )}
                    <Input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleFileChange('selfie', 'selfiePreview', e.target.files[0])}
                      data-testid="selfie-input"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="flex gap-4 mt-6">
              <Button type="button" variant="outline" className="flex-1 h-12" onClick={() => setStep(2)}>
                Voltar
              </Button>
              <Button type="submit" className="flex-1 h-12 bg-jungle hover:bg-jungle-800">
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
                <div>
                  <Label>CNH (frente e verso ou aberta) *</Label>
                  <div className="mt-2 border-2 border-dashed rounded-lg p-6">
                    {formData.driverLicensePreview ? (
                      <img src={formData.driverLicensePreview} alt="CNH" className="w-full h-48 object-contain mb-4" />
                    ) : (
                      <div className="flex flex-col items-center text-center py-8">
                        <Camera size={32} className="text-muted-foreground mb-2" />
                        <p className="text-sm text-muted-foreground">CNH válida</p>
                      </div>
                    )}
                    <Input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleFileChange('driverLicense', 'driverLicensePreview', e.target.files[0])}
                      data-testid="driver-license-input"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="flex gap-4 mt-6">
              <Button type="button" variant="outline" className="flex-1 h-12" onClick={() => setStep(3)}>
                Voltar
              </Button>
              <Button type="submit" className="flex-1 h-12 bg-jungle hover:bg-jungle-800" disabled={loading}>
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