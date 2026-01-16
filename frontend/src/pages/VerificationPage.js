import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Package, Camera, IdentificationCard, User, Warning, SpinnerGap, CheckCircle } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import MobileDatePicker from '@/components/MobileDatePicker';
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
  const [uploadingFile, setUploadingFile] = useState(null);
  const [formData, setFormData] = useState({
    cpf: '',
    birthDate: '',
    address: '',
    city: '',
    state: '',
    zipCode: '',
    profilePhoto: null,
    profilePhotoPreview: null,
    profilePhotoUrl: null,
    idFront: null,
    idFrontPreview: null,
    idFrontUrl: null,
    idBack: null,
    idBackPreview: null,
    idBackUrl: null,
    selfie: null,
    selfiePreview: null,
    selfieUrl: null,
    driverLicense: null,
    driverLicensePreview: null,
    driverLicenseUrl: null
  });

  // Upload file to R2 using presigned URL
  const uploadFileToR2 = async (file, fileType) => {
    try {
      setUploadingFile(fileType);
      
      // Step 1: Get presigned URL from backend
      const presignedResponse = await axios.post(
        `${API}/uploads/presigned-url`,
        {
          file_type: fileType,
          content_type: file.type
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      const { presigned_url, file_key, content_type } = presignedResponse.data;
      
      // Step 2: Upload directly to R2
      await axios.put(presigned_url, file, {
        headers: {
          'Content-Type': content_type
        }
      });
      
      // Step 3: Confirm upload and get public URL
      const confirmResponse = await axios.post(
        `${API}/uploads/confirm`,
        {
          file_key: file_key,
          file_type: fileType
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      setUploadingFile(null);
      return confirmResponse.data.file_url;
      
    } catch (error) {
      console.error('Upload error:', error);
      setUploadingFile(null);
      throw error;
    }
  };

  const handleFileChange = async (field, previewField, urlField, fileType, file) => {
    if (file) {
      // First show preview
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData(prev => ({
          ...prev,
          [field]: file,
          [previewField]: reader.result
        }));
      };
      reader.readAsDataURL(file);
      
      // Then upload to R2
      try {
        const url = await uploadFileToR2(file, fileType);
        setFormData(prev => ({
          ...prev,
          [urlField]: url
        }));
        toast.success('Arquivo enviado com sucesso!');
      } catch (error) {
        toast.error('Erro ao enviar arquivo. Tente novamente.');
        setFormData(prev => ({
          ...prev,
          [field]: null,
          [previewField]: null
        }));
      }
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
                      className="h-11 md:h-12 mt-2"
                      data-testid="cpf-input"
                    />
                  </div>
                  <div>
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

                <div>
                  <Label htmlFor="address">Endereço Completo *</Label>
                  <Input
                    id="address"
                    placeholder="Rua, número, complemento"
                    value={formData.address}
                    onChange={(e) => handleChange('address', e.target.value)}
                    required
                    className="h-11 md:h-12 mt-2"
                    data-testid="address-input"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
                  <div>
                    <Label htmlFor="city">Cidade *</Label>
                    <Input
                      id="city"
                      value={formData.city}
                      onChange={(e) => handleChange('city', e.target.value)}
                      required
                      className="h-11 md:h-12 mt-2"
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
                  <div className="relative mb-4">
                    {uploadingFile === 'profile' && (
                      <div className="absolute inset-0 bg-white/80 flex items-center justify-center z-10 rounded-full">
                        <SpinnerGap className="w-8 h-8 animate-spin text-jungle" />
                      </div>
                    )}
                    {formData.profilePhotoPreview ? (
                      <div className="relative">
                        <img src={formData.profilePhotoPreview} alt="Preview" className="w-48 h-48 rounded-full object-cover" />
                        {formData.profilePhotoUrl && (
                          <div className="absolute bottom-2 right-2 bg-green-500 text-white rounded-full p-1">
                            <CheckCircle size={24} />
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="w-48 h-48 rounded-full bg-muted flex items-center justify-center">
                        <Camera size={48} className="text-muted-foreground" />
                      </div>
                    )}
                  </div>
                  <Input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(e) => handleFileChange('profilePhoto', 'profilePhotoPreview', 'profilePhotoUrl', 'profile', e.target.files[0])}
                    className="max-w-xs"
                    disabled={uploadingFile === 'profile'}
                    data-testid="profile-photo-input"
                  />
                  <p className="text-xs text-muted-foreground mt-2">Formatos aceitos: JPEG, PNG, WebP. Máximo 5MB</p>
                </div>
              </CardContent>
            </Card>

            <div className="flex gap-4 mt-6">
              <Button type="button" variant="outline" className="flex-1 h-12" onClick={() => setStep(1)}>
                Voltar
              </Button>
              <Button type="submit" className="flex-1 h-12 bg-jungle hover:bg-jungle-800" disabled={uploadingFile !== null}>
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
                <FileUploadZone
                  label="Frente do Documento *"
                  preview={formData.idFrontPreview}
                  isUploading={uploadingFile === 'id_front'}
                  isUploaded={!!formData.idFrontUrl}
                  onFileSelect={(file) => handleFileChange('idFront', 'idFrontPreview', 'idFrontUrl', 'id_front', file)}
                  testId="id-front-input"
                />

                <FileUploadZone
                  label="Verso do Documento *"
                  preview={formData.idBackPreview}
                  isUploading={uploadingFile === 'id_back'}
                  isUploaded={!!formData.idBackUrl}
                  onFileSelect={(file) => handleFileChange('idBack', 'idBackPreview', 'idBackUrl', 'id_back', file)}
                  testId="id-back-input"
                />

                <FileUploadZone
                  label="Selfie com Documento *"
                  preview={formData.selfiePreview}
                  isUploading={uploadingFile === 'selfie'}
                  isUploaded={!!formData.selfieUrl}
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
