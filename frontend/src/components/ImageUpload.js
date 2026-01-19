import React, { useState, useRef } from 'react';
import { Camera, Upload, X, Check, Spinner } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import axios from 'axios';
import { useAuth } from '@/context/AuthContext';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

/**
 * ImageUpload Component - Mobile-First Design
 * Supports camera capture on mobile and file selection on desktop
 * Uses Cloudflare R2 presigned URLs for secure uploads
 */
const ImageUpload = ({
  onUploadComplete,
  fileType = 'package', // 'package', 'profile', 'vehicle', 'document'
  label = 'Adicionar Foto',
  maxSizeMB = 10,
  acceptedTypes = ['image/jpeg', 'image/png', 'image/webp'],
  showPreview = true,
  className = '',
  disabled = false
}) => {
  const { token } = useAuth();
  const fileInputRef = useRef(null);
  const [preview, setPreview] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadedUrl, setUploadedUrl] = useState(null);

  const handleFileSelect = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!acceptedTypes.includes(file.type)) {
      toast.error(`Tipo de arquivo não suportado. Use: ${acceptedTypes.map(t => t.split('/')[1]).join(', ')}`);
      return;
    }

    // Validate file size
    const sizeMB = file.size / (1024 * 1024);
    if (sizeMB > maxSizeMB) {
      toast.error(`Arquivo muito grande. Máximo: ${maxSizeMB}MB`);
      return;
    }

    // Show preview
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

      toast.success('Imagem enviada com sucesso!');
    } catch (error) {
      console.error('Upload error:', error);
      toast.error(error.response?.data?.detail || 'Erro ao enviar imagem');
      setPreview(null);
    } finally {
      setUploading(false);
    }
  };

  const clearUpload = () => {
    setPreview(null);
    setUploadedUrl(null);
    setUploadProgress(0);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className={`relative ${className}`}>
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept={acceptedTypes.join(',')}
        capture="environment"
        onChange={handleFileSelect}
        className="hidden"
        disabled={disabled || uploading}
      />

      {/* Upload area */}
      {!preview && !uploadedUrl ? (
        <button
          type="button"
          onClick={triggerFileInput}
          disabled={disabled || uploading}
          className={`
            w-full aspect-square md:aspect-video 
            bg-muted/50 hover:bg-muted/70 
            border-2 border-dashed border-muted-foreground/30 hover:border-jungle/50
            rounded-xl flex flex-col items-center justify-center gap-2 md:gap-3
            transition-all cursor-pointer
            ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
            ${uploading ? 'animate-pulse' : ''}
          `}
        >
          {uploading ? (
            <>
              <Spinner size={32} className="animate-spin text-jungle" />
              <span className="text-xs md:text-sm text-muted-foreground">
                Enviando... {uploadProgress}%
              </span>
            </>
          ) : (
            <>
              <div className="w-12 h-12 md:w-14 md:h-14 bg-jungle/10 rounded-full flex items-center justify-center">
                <Camera size={24} className="text-jungle" />
              </div>
              <span className="text-xs md:text-sm font-medium text-muted-foreground">{label}</span>
              <span className="text-[10px] md:text-xs text-muted-foreground/70">
                Toque para tirar foto ou selecionar
              </span>
            </>
          )}
        </button>
      ) : (
        /* Preview / Uploaded state */
        <div className="relative w-full aspect-square md:aspect-video rounded-xl overflow-hidden border-2 border-jungle/30 bg-muted">
          <img 
            src={uploadedUrl || preview} 
            alt="Preview" 
            className="w-full h-full object-cover"
          />
          
          {/* Overlay with status */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
          
          {/* Status badge */}
          <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
            <div className={`
              flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium
              ${uploadedUrl ? 'bg-green-500 text-white' : 'bg-yellow-500 text-black'}
            `}>
              {uploadedUrl ? (
                <>
                  <Check size={14} weight="bold" />
                  <span>Enviado</span>
                </>
              ) : (
                <>
                  <Spinner size={14} className="animate-spin" />
                  <span>{uploadProgress}%</span>
                </>
              )}
            </div>
            
            {/* Clear button */}
            <Button
              type="button"
              size="icon"
              variant="destructive"
              className="h-8 w-8 rounded-full"
              onClick={clearUpload}
              disabled={uploading}
            >
              <X size={16} />
            </Button>
          </div>
        </div>
      )}

      {/* Progress bar */}
      {uploading && (
        <div className="mt-2 h-1 bg-muted rounded-full overflow-hidden">
          <div 
            className="h-full bg-jungle transition-all duration-300 ease-out"
            style={{ width: `${uploadProgress}%` }}
          />
        </div>
      )}
    </div>
  );
};

export default ImageUpload;
