"""Upload routes for Cloudflare R2."""
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
import uuid
import os
import logging

try:
    import boto3
    from botocore.config import Config
except ImportError:
    boto3 = None

from models import UploadInitiate
from auth import get_current_user_id
from core.config import settings

logger = logging.getLogger(__name__)
router = APIRouter()

# Max file size: 10MB
MAX_FILE_SIZE = 10 * 1024 * 1024


def get_r2_client():
    """Get configured R2 client."""
    if not boto3:
        return None
    
    if settings.r2_access_key and settings.r2_secret_key and settings.r2_endpoint_url:
        return boto3.client(
            "s3",
            endpoint_url=settings.r2_endpoint_url,
            aws_access_key_id=settings.r2_access_key,
            aws_secret_access_key=settings.r2_secret_key,
            region_name="auto",
            config=Config(signature_version="s3v4")
        )
    return None


@router.post("/direct")
async def upload_file_direct(
    file: UploadFile = File(...),
    file_type: str = Form(default="general"),
    user_id: str = Depends(get_current_user_id)
):
    """
    Upload file directly through backend (proxy).
    This bypasses CORS issues with R2.
    """
    r2_client = get_r2_client()
    
    if not r2_client:
        raise HTTPException(status_code=503, detail="Serviço de upload não configurado")
    
    # Validate content type
    allowed_types = ["image/jpeg", "image/png", "image/webp", "image/jpg"]
    if file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail=f"Tipo de arquivo não suportado. Use: JPG, PNG ou WebP")
    
    # Read file content
    try:
        content = await file.read()
        
        # Validate file size
        if len(content) > MAX_FILE_SIZE:
            raise HTTPException(status_code=400, detail="Arquivo muito grande. Máximo: 10MB")
        
        # Generate unique file key
        upload_id = str(uuid.uuid4())
        file_extension = file.content_type.split('/')[-1]
        if file_extension == "jpg":
            file_extension = "jpeg"
        file_key = f"{file_type}/{user_id}/{upload_id}.{file_extension}"
        
        # Upload to R2
        r2_client.put_object(
            Bucket=settings.r2_bucket_name,
            Key=file_key,
            Body=content,
            ContentType=file.content_type
        )
        
        # Generate presigned URL for reading (valid for 7 days)
        public_url = r2_client.generate_presigned_url(
            ClientMethod="get_object",
            Params={
                "Bucket": settings.r2_bucket_name,
                "Key": file_key
            },
            ExpiresIn=604800  # 7 days
        )
        
        logger.info(f"File uploaded successfully: {file_key}")
        
        return {
            "success": True,
            "file_key": file_key,
            "file_url": public_url,
            "file_type": file_type,
            "content_type": file.content_type,
            "size_bytes": len(content)
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Erro no upload: {e}")
        raise HTTPException(status_code=500, detail="Erro ao fazer upload do arquivo")


@router.post("/presigned-url")
async def get_presigned_url(upload_data: UploadInitiate, user_id: str = Depends(get_current_user_id)):
    """Generate presigned URL for file upload (requires CORS config on R2)."""
    r2_client = get_r2_client()
    
    if not r2_client:
        raise HTTPException(status_code=503, detail="Serviço de upload não configurado")
    
    upload_id = str(uuid.uuid4())
    file_extension = upload_data.content_type.split('/')[-1]
    file_key = f"{upload_data.file_type}/{user_id}/{upload_id}.{file_extension}"
    
    try:
        presigned_url = r2_client.generate_presigned_url(
            ClientMethod="put_object",
            Params={
                "Bucket": settings.r2_bucket_name,
                "Key": file_key,
                "ContentType": upload_data.content_type
            },
            ExpiresIn=600  # 10 minutes
        )
        
        return {
            "presigned_url": presigned_url,
            "file_key": file_key,
            "upload_id": upload_id,
            "content_type": upload_data.content_type
        }
    except Exception as e:
        logger.error(f"Erro ao gerar URL pré-assinada: {e}")
        raise HTTPException(status_code=500, detail="Erro ao gerar URL de upload")


@router.post("/confirm")
async def confirm_upload(
    upload_data: dict,
    user_id: str = Depends(get_current_user_id)
):
    """Confirm upload and return public URL."""
    file_key = upload_data.get("file_key")
    file_type = upload_data.get("file_type")
    
    if not file_key:
        raise HTTPException(status_code=400, detail="file_key é obrigatório")
    
    r2_client = get_r2_client()
    if not r2_client:
        raise HTTPException(status_code=503, detail="Serviço de upload não configurado")
    
    try:
        # Generate presigned URL for reading (valid for 7 days)
        public_url = r2_client.generate_presigned_url(
            ClientMethod="get_object",
            Params={
                "Bucket": settings.r2_bucket_name,
                "Key": file_key
            },
            ExpiresIn=604800  # 7 days
        )
        
        return {
            "file_key": file_key,
            "file_url": public_url,
            "file_type": file_type
        }
    except Exception as e:
        logger.error(f"Erro ao confirmar upload: {e}")
        raise HTTPException(status_code=500, detail="Erro ao confirmar upload")


@router.get("/file-url/{file_key:path}")
async def get_file_url(file_key: str, user_id: str = Depends(get_current_user_id)):
    """Generate temporary URL for file viewing."""
    r2_client = get_r2_client()
    if not r2_client:
        raise HTTPException(status_code=503, detail="Serviço de upload não configurado")
    
    try:
        presigned_url = r2_client.generate_presigned_url(
            ClientMethod="get_object",
            Params={
                "Bucket": settings.r2_bucket_name,
                "Key": file_key
            },
            ExpiresIn=3600  # 1 hour
        )
        return {"url": presigned_url}
    except Exception as e:
        logger.error(f"Erro ao gerar URL de visualização: {e}")
        raise HTTPException(status_code=500, detail="Erro ao gerar URL")
