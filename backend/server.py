"""
Levva API - Main Application Entry Point

A modular FastAPI application for freight matching logistics.
"""
from fastapi import FastAPI, WebSocket, Query
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from pathlib import Path
import logging

from database import init_indexes, users_collection, matches_collection
from auth import decode_token
from websocket_manager import manager, handle_carrier_messages, handle_watcher_messages
from core.config import settings
from core.exceptions import setup_exception_handlers
from routers import create_api_router
from bson import ObjectId

# Load environment variables
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def create_app() -> FastAPI:
    """Application factory for creating the FastAPI app."""
    
    app = FastAPI(
        title="Levva API",
        description="Plataforma de frete colaborativo (crowdshipping)",
        version="2.0.0",
        docs_url="/api/docs",
        redoc_url="/api/redoc",
        openapi_url="/api/openapi.json"
    )
    
    # Configure CORS
    origins = [
        "http://localhost:3000",
        "http://localhost:8080",
        settings.frontend_url,
        "*"
    ]
    
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    
    # Setup custom exception handlers
    setup_exception_handlers(app)
    
    # Include API routers
    api_router = create_api_router()
    app.include_router(api_router)
    
    # Health check endpoint (outside /api prefix for k8s probes)
    @app.get("/health")
    async def health_check():
        return {"status": "healthy", "service": "Levva API", "version": "2.0.0"}
    
    # Also expose under /api for consistency
    @app.get("/api/health")
    async def api_health_check():
        return {"status": "healthy", "service": "Levva API", "version": "2.0.0"}
    
    return app


# Create the app instance
app = create_app()


# ============= WEBSOCKET ENDPOINTS =============
# WebSocket endpoints must be registered directly on the app, not on routers

@app.websocket("/ws/tracking/{match_id}/carrier")
async def websocket_carrier_tracking(websocket: WebSocket, match_id: str, token: str = Query(...)):
    """
    WebSocket endpoint for carrier to send location updates.
    Connect with: ws://host/ws/tracking/{match_id}/carrier?token=JWT_TOKEN
    
    Send messages:
    - {"type": "location_update", "lat": -23.5, "lng": -46.6, "accuracy": 10, "speed": 30, "heading": 90}
    - {"type": "pause_tracking"}
    - {"type": "resume_tracking"}
    - {"type": "set_interval", "interval": 20}
    - {"type": "ping"}
    """
    try:
        # Validate token
        try:
            payload = decode_token(token)
            user_id = payload.get("user_id")
        except Exception:
            await websocket.close(code=4001, reason="Token inválido ou expirado")
            return
        
        if not user_id:
            await websocket.close(code=4001, reason="Token inválido")
            return
        
        # Validate match and carrier
        match = await matches_collection.find_one({"_id": ObjectId(match_id)})
        if not match:
            await websocket.close(code=4004, reason="Combinação não encontrada")
            return
        
        if user_id != match["carrier_id"]:
            await websocket.close(code=4003, reason="Apenas o transportador pode enviar localização")
            return
        
        # Enforce status check
        if match.get("status") not in ["paid", "in_transit"]:
            await websocket.close(code=4000, reason="Rastreamento não permitido para este status")
            return
        
        # Connect and handle messages
        await manager.connect_carrier(websocket, user_id, match_id)
        await handle_carrier_messages(websocket, user_id, match_id, {})
        
    except Exception as e:
        logger.error(f"Carrier WebSocket error: {e}")
        try:
            await websocket.close(code=4000, reason=str(e))
        except:
            pass


@app.websocket("/ws/tracking/{match_id}/watch")
async def websocket_watch_tracking(websocket: WebSocket, match_id: str, token: str = Query(...)):
    """
    WebSocket endpoint for sender to watch carrier location.
    Connect with: ws://host/ws/tracking/{match_id}/watch?token=JWT_TOKEN
    
    Receives messages:
    - {"type": "location_update", "location": {...}, "timestamp": "..."}
    - {"type": "tracking_started", ...}
    - {"type": "tracking_stopped", ...}
    - {"type": "tracking_paused", ...}
    - {"type": "tracking_resumed", ...}
    
    Send messages:
    - {"type": "ping"}
    - {"type": "get_last_location"}
    - {"type": "get_route_history"}
    """
    try:
        # Validate token
        try:
            payload = decode_token(token)
            user_id = payload.get("user_id")
        except Exception:
            await websocket.close(code=4001, reason="Token inválido ou expirado")
            return
        
        if not user_id:
            await websocket.close(code=4001, reason="Token inválido")
            return
        
        # Validate match and access
        match = await matches_collection.find_one({"_id": ObjectId(match_id)})
        if not match:
            await websocket.close(code=4004, reason="Combinação não encontrada")
            return
        
        # Security: Check if user is Sender, Carrier OR Admin
        user = await users_collection.find_one({"_id": ObjectId(user_id)})
        is_admin = user and user.get("role") == "admin"

        if not is_admin and user_id not in [match["sender_id"], match["carrier_id"]]:
            await websocket.close(code=4003, reason="Acesso negado")
            return
        
        # Security: Don't allow watching cancelled trips
        if match.get("status") == "cancelled":
            await websocket.close(code=4000, reason="Entrega cancelada")
            return

        # Connect and handle messages
        await manager.connect_watcher(websocket, match_id, user_id)
        await handle_watcher_messages(websocket, user_id, match_id)
        
    except Exception as e:
        logger.error(f"Watcher WebSocket error: {e}")
        try:
            await websocket.close(code=4000, reason=str(e))
        except:
            pass


# ============= LIFECYCLE EVENTS =============
@app.on_event("startup")
async def startup_event():
    """Initialize database indexes on startup."""
    await init_indexes()
    logger.info("Levva API v2.0.0 started successfully")
    logger.info(f"Frontend URL: {settings.frontend_url}")
    logger.info(f"R2 configured: {bool(settings.r2_access_key)}")
    logger.info(f"MercadoPago configured: {bool(settings.mercadopago_access_token)}")


@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on shutdown."""
    logger.info("Levva API shutting down")
