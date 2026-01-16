"""Custom exception handlers for FastAPI."""
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import JSONResponse
from bson.errors import InvalidId
import logging

logger = logging.getLogger(__name__)


class LevvaException(Exception):
    """Base exception for Levva application."""
    def __init__(self, message: str, status_code: int = 400):
        self.message = message
        self.status_code = status_code
        super().__init__(self.message)


class NotFoundError(LevvaException):
    """Resource not found."""
    def __init__(self, resource: str = "Recurso"):
        super().__init__(f"{resource} não encontrado(a)", status_code=404)


class UnauthorizedError(LevvaException):
    """User not authorized."""
    def __init__(self, message: str = "Acesso não autorizado"):
        super().__init__(message, status_code=401)


class ForbiddenError(LevvaException):
    """User forbidden from accessing resource."""
    def __init__(self, message: str = "Acesso negado"):
        super().__init__(message, status_code=403)


class ValidationError(LevvaException):
    """Validation error."""
    def __init__(self, message: str):
        super().__init__(message, status_code=422)


class BusinessRuleError(LevvaException):
    """Business rule violation."""
    def __init__(self, message: str):
        super().__init__(message, status_code=400)


def setup_exception_handlers(app: FastAPI):
    """Register custom exception handlers."""
    
    @app.exception_handler(LevvaException)
    async def levva_exception_handler(request: Request, exc: LevvaException):
        return JSONResponse(
            status_code=exc.status_code,
            content={"detail": exc.message, "error_type": exc.__class__.__name__}
        )
    
    @app.exception_handler(InvalidId)
    async def invalid_id_handler(request: Request, exc: InvalidId):
        return JSONResponse(
            status_code=400,
            content={"detail": "ID inválido", "error_type": "InvalidId"}
        )
    
    @app.exception_handler(Exception)
    async def generic_exception_handler(request: Request, exc: Exception):
        # Don't override HTTPException
        if isinstance(exc, HTTPException):
            raise exc
        
        logger.error(f"Unhandled exception: {exc}", exc_info=True)
        return JSONResponse(
            status_code=500,
            content={"detail": "Erro interno do servidor", "error_type": "InternalError"}
        )
