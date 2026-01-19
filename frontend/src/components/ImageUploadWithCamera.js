import React, { useState, useRef } from 'react';
import { Camera, Image, Upload, X, Check, Spinner, CameraRotate } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import axios from 'axios';
import { useAuth } from '@/context/AuthContext';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

/**
 * ImageUploadWithCamera - Componente de upload com suporte a câmera
 * - Botão separado para câmera e galeria no mobile
 * - Preview de imagem
 * - Upload para R2
 */
const ImageUploadWithCamera = ({
  onUploadComplete,
  fileType = 'package',
  label = 'Adicionar Foto',
  maxSizeMB = 10,
  acceptedTypes = ['image/jpeg', 'image/png', 'image/webp'],
  showPreview = true,
  className = '',
  disabled = false,
  currentImageUrl = null
}) => {
  const { token } = useAuth();
  const cameraInputRef = useRef(null);
  const galleryInputRef = useRef(null);
  const [preview, setPreview] = useState(currentImageUrl);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadedUrl, setUploadedUrl] = useState(currentImageUrl);

  const handleFileSelect = async (event, source) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!acceptedTypes.includes(file.type)) {
      toast.error(`Tipo não suportado. Use: JPG, PNG ou WebP`);
      return;
    }

    // Validate file size
    const sizeMB = file.size / (1024 * 1024);
    if (sizeMB > maxSizeMB) {
      toast.error(`Arquivo muito grande. Máximo: ${maxSizeMB}MB`);
      return;
    }

    // Show preview immediately
    if (showPreview) {
      const reader = new FileReader();
      reader.onload = (e) => setPreview(e.target.result);
      reader.readAsDataURL(file);
    }

    // Upload to R2
    await uploadToR2(file);
  };

  const uploadToR2 = async (file) => {
    setUploading(true);
    setUploadProgress(0);

    try {
      // Use FormData for multipart upload through backend proxy
      const formData = new FormData();
      formData.append('file', file);
      formData.append('file_type', fileType);

      setUploadProgress(10);

      // Upload directly to backend proxy (bypasses R2 CORS issues)
      const response = await axios.post(
        `${API}/uploads/direct`,
        formData,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'multipart/form-data'
          },
          onUploadProgress: (progressEvent) => {
            const progress = Math.round((progressEvent.loaded * 80) / progressEvent.total) + 10;
            setUploadProgress(progress);
          }
        }
      );

      setUploadProgress(100);
      
      const { file_url, file_key } = response.data;
      setUploadedUrl(file_url);
      
      // Callback with the URL
      if (onUploadComplete) {
        onUploadComplete(file_url, file_key);
      }

      toast.success('Foto enviada com sucesso!');
    } catch (error) {
      console.error('Upload error:', error);
      const errorMsg = error.response?.data?.detail || 'Erro ao enviar foto. Tente novamente.';
      toast.error(errorMsg);
      // Keep preview but clear uploaded state
      setUploadedUrl(null);
    } finally {
      setUploading(false);
    }
  };

  const clearUpload = () => {
    setPreview(null);
    setUploadedUrl(null);
    setUploadProgress(0);
    if (cameraInputRef.current) cameraInputRef.current.value = '';
    if (galleryInputRef.current) galleryInputRef.current.value = '';
    if (onUploadComplete) onUploadComplete(null, null);
  };

  const openCamera = () => {
    cameraInputRef.current?.click();
  };

  const openGallery = () => {
    galleryInputRef.current?.click();
  };

  return (
    <div className={`relative ${className}`}>
      {/* Hidden file inputs */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => handleFileSelect(e, 'camera')}
        className="hidden"
        disabled={disabled || uploading}
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept={acceptedTypes.join(',')}
        onChange={(e) => handleFileSelect(e, 'gallery')}
        className="hidden"
        disabled={disabled || uploading}
      />

      {/* Upload area - when no image */}
      {!preview && !uploadedUrl ? (
        <div className="space-y-2">
          {label && (
            <p className="text-xs md:text-sm font-medium text-muted-foreground mb-2">{label}</p>
          )}
          
          <div className={`
            w-full aspect-square md:aspect-video 
            bg-muted/30 border-2 border-dashed border-muted-foreground/30 
            rounded-xl flex flex-col items-center justify-center gap-3 p-4
            ${disabled ? 'opacity-50' : ''}
          `}>
            {uploading ? (
              <>
                <Spinner size={32} className="animate-spin text-jungle" />
                <span className="text-sm text-muted-foreground">
                  Enviando... {uploadProgress}%
                </span>
                <div className="w-full max-w-[150px] h-1.5 bg-muted rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-jungle transition-all duration-300"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </>
            ) : (
              <>
                <div className="w-14 h-14 bg-jungle/10 rounded-full flex items-center justify-center">
                  <Camera size={28} className="text-jungle" />
                </div>
                
                {/* Two buttons for camera and gallery */}
                <div className="flex gap-2 w-full max-w-[280px]">
                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    onClick={openCamera}
                    disabled={disabled}
                    className="flex-1 bg-jungle hover:bg-jungle-800 h-10 text-sm"
                  >
                    <Camera size={18} className="mr-1.5" />
                    Câmera
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={openGallery}
                    disabled={disabled}
                    className="flex-1 h-10 text-sm"
                  >
                    <Image size={18} className="mr-1.5" />
                    Galeria
                  </Button>
                </div>
                
                <span className="text-[10px] text-muted-foreground/70 text-center">
                  JPG, PNG ou WebP • Máx. {maxSizeMB}MB
                </span>
              </>
            )}
          </div>
        </div>
      ) : (
        /* Preview / Uploaded state */
        <div className="space-y-2">
          {label && (
            <p className="text-xs md:text-sm font-medium text-muted-foreground mb-2">{label}</p>
          )}
          
          <div className="relative w-full aspect-square md:aspect-video rounded-xl overflow-hidden border-2 border-jungle/30 bg-muted">
            <img 
              src={uploadedUrl || preview} 
              alt="Preview" 
              className="w-full h-full object-cover"
            />
            
            {/* Overlay gradient */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
            
            {/* Status and actions */}
            <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
              {/* Status badge */}
              <div className={`
                flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium
                ${uploadedUrl ? 'bg-green-500 text-white' : uploading ? 'bg-yellow-500 text-black' : 'bg-gray-500 text-white'}
              `}>
                {uploadedUrl ? (
                  <>
                    <Check size={14} weight="bold" />
                    <span>Enviado</span>
                  </>
                ) : uploading ? (
                  <>
                    <Spinner size={14} className="animate-spin" />
                    <span>{uploadProgress}%</span>
                  </>
                ) : (
                  <span>Preview</span>
                )}
              </div>
              
              {/* Action buttons */}
              <div className="flex gap-1.5">
                {!uploading && (
                  <Button
                    type="button"
                    size="icon"
                    variant="secondary"
                    className="h-8 w-8 rounded-full bg-white/90 hover:bg-white"
                    onClick={openCamera}
                    disabled={uploading}
                    title="Tirar nova foto"
                  >
                    <CameraRotate size={16} className="text-gray-700" />
                  </Button>
                )}
                <Button
                  type="button"
                  size="icon"
                  variant="destructive"
                  className="h-8 w-8 rounded-full"
                  onClick={clearUpload}
                  disabled={uploading}
                  title="Remover"
                >
                  <X size={16} />
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ImageUploadWithCamera;
