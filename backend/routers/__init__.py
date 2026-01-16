"""API Routers for Levva application."""
from fastapi import APIRouter

from .auth import router as auth_router
from .users import router as users_router
from .trips import router as trips_router
from .shipments import router as shipments_router
from .matches import router as matches_router
from .payments import router as payments_router
from .ratings import router as ratings_router
from .disputes import router as disputes_router
from .uploads import router as uploads_router
from .admin import router as admin_router
from .chat import router as chat_router
from .notifications import router as notifications_router
from .tracking import router as tracking_router
from .vehicles import router as vehicles_router


def create_api_router() -> APIRouter:
    """Create and configure the main API router."""
    api_router = APIRouter(prefix="/api")
    
    # Register all routers
    api_router.include_router(auth_router, prefix="/auth", tags=["Autenticação"])
    api_router.include_router(users_router, prefix="/users", tags=["Usuários"])
    api_router.include_router(trips_router, prefix="/trips", tags=["Viagens"])
    api_router.include_router(shipments_router, prefix="/shipments", tags=["Envios"])
    api_router.include_router(matches_router, prefix="/matches", tags=["Combinações"])
    api_router.include_router(payments_router, prefix="/payments", tags=["Pagamentos"])
    api_router.include_router(ratings_router, prefix="/ratings", tags=["Avaliações"])
    api_router.include_router(disputes_router, prefix="/disputes", tags=["Disputas"])
    api_router.include_router(uploads_router, prefix="/uploads", tags=["Uploads"])
    api_router.include_router(admin_router, prefix="/admin", tags=["Administração"])
    api_router.include_router(chat_router, prefix="/chat", tags=["Chat"])
    api_router.include_router(notifications_router, prefix="/notifications", tags=["Notificações"])
    api_router.include_router(tracking_router, prefix="/tracking", tags=["Rastreamento GPS"])
    api_router.include_router(vehicles_router, prefix="/vehicles", tags=["Veículos"])
    
    return api_router
