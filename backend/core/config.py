"""Application configuration and settings."""
from pydantic_settings import BaseSettings
from functools import lru_cache
from typing import Optional
import os
from pathlib import Path


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""
    
    # Database
    mongo_url: str = "mongodb://localhost:27017"
    db_name: str = "levva_database"
    
    # JWT
    jwt_secret_key: str = "levva-secret-key-change-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expiration_days: int = 7
    
    # CORS
    cors_origins: str = "*"
    
    # Mercado Pago
    mercadopago_access_token: Optional[str] = None
    mercadopago_public_key: Optional[str] = None
    
    # Cloudflare R2
    r2_access_key: Optional[str] = None
    r2_secret_key: Optional[str] = None
    r2_endpoint_url: Optional[str] = None
    r2_bucket_name: Optional[str] = None
    r2_public_url: Optional[str] = None
    
    # URLs
    frontend_url: str = "http://localhost:3000"
    
    # Resend (Email)
    resend_api_key: Optional[str] = None
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = False


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()


settings = get_settings()
