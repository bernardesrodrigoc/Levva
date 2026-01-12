from fastapi import FastAPI, APIRouter, Depends, HTTPException, Header, WebSocket, WebSocketDisconnect, Query
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from pathlib import Path
import os
import logging
from datetime import datetime, timezone
from typing import List, Optional
from bson import ObjectId
import boto3
from botocore.config import Config
import uuid
import mercadopago

from database import (
    db, users_collection, trips_collection, shipments_collection,
    matches_collection, payments_collection, ratings_collection,
    flag_collection, disputes_collection, verifications_collection, 
    messages_collection, notifications_collection, location_tracking_collection,
    delivery_routes_collection, init_indexes
)
from models import (
    UserRegister, UserLogin, UserResponse, TripCreate, TripResponse,
    ShipmentCreate, ShipmentResponse, MatchResponse, PaymentInitiate,
    PaymentResponse, RatingCreate, RatingResponse, UploadInitiate,
    UploadResponse, AdminStats, FlagCreate, DisputeCreate,
    UserRole, TrustLevel, VerificationStatus, TripStatus, ShipmentStatus,
    PaymentStatus
)
from auth import (
    hash_password, verify_password, create_access_token,
    get_current_user_id, decode_token
)
from route_service import (
    get_route_polyline, check_shipment_matches_route,
    calculate_corridor_match_score, get_city_coordinates, geocode_address
)
from trust_service import (
    get_trust_level_config, calculate_trust_level, check_shipment_allowed,
    check_trip_allowed, get_next_level_requirements, TRUST_LEVEL_CONFIG
)
from websocket_manager import manager, handle_carrier_messages, handle_watcher_messages
from notification_service import (
    create_notification, get_user_notifications, mark_notification_read,
    mark_all_notifications_read, get_unread_count, delete_notification,
    NotificationType, notify_match_created, notify_payment_approved,
    notify_delivery_completed
)

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# FastAPI app
app = FastAPI(title="Levva API")
api_router = APIRouter(prefix="/api")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Cloudflare R2 setup (optional, for image storage)
def get_r2_client():
    r2_access_key = os.getenv("R2_ACCESS_KEY")
    r2_secret_key = os.getenv("R2_SECRET_KEY")
    r2_endpoint = os.getenv("R2_ENDPOINT_URL")
    
    if r2_access_key and r2_secret_key and r2_endpoint:
        return boto3.client(
            "s3",
            endpoint_url=r2_endpoint,
            aws_access_key_id=r2_access_key,
            aws_secret_access_key=r2_secret_key,
            region_name="auto",
            config=Config(signature_version="s3v4")
        )
    return None

# Mercado Pago setup
mp_access_token = os.getenv("MERCADOPAGO_ACCESS_TOKEN")
mp_sdk = mercadopago.SDK(mp_access_token) if mp_access_token else None

# ============= USER VERIFICATION ROUTES =============
@api_router.post("/users/verify")
async def submit_verification(
    verification_data: dict,
    user_id: str = Depends(get_current_user_id)
):
    """Submit user verification documents"""
    verification_doc = {
        "user_id": user_id,
        "cpf": verification_data.get("cpf"),
        "birth_date": verification_data.get("birth_date"),
        "address": verification_data.get("address"),
        "documents": verification_data.get("documents"),
        "status": "pending",
        "submitted_at": datetime.now(timezone.utc),
        "reviewed_at": None,
        "reviewed_by": None
    }
    
    await verifications_collection.insert_one(verification_doc)
    
    # Update user verification status
    await users_collection.update_one(
        {"_id": ObjectId(user_id)},
        {"$set": {"verification_status": VerificationStatus.PENDING}}
    )
    
    return {"message": "Documentos enviados para verificação", "status": "pending"}

@api_router.get("/users/verification-status")
async def get_verification_status(user_id: str = Depends(get_current_user_id)):
    """Get user verification status"""
    user = await users_collection.find_one({"_id": ObjectId(user_id)})
    verification = await verifications_collection.find_one({"user_id": user_id})
    
    return {
        "verification_status": user.get("verification_status", "pending"),
        "has_submitted": verification is not None,
        "can_create_trips": user.get("verification_status") == "verified",
        "can_create_shipments": user.get("verification_status") == "verified"
    }

# ============= AUTH ROUTES =============
@api_router.post("/auth/register")
async def register(user_data: UserRegister):
    existing = await users_collection.find_one({"email": user_data.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email já cadastrado")
    
    user_doc = {
        "email": user_data.email,
        "password_hash": hash_password(user_data.password),
        "name": user_data.name,
        "phone": user_data.phone,
        "role": user_data.role,
        "trust_level": TrustLevel.LEVEL_1,
        "verification_status": VerificationStatus.PENDING,
        "profile_photo_url": None,
        "rating": 0.0,
        "total_deliveries": 0,
        "created_at": datetime.now(timezone.utc),
        "email_verified": False
    }
    
    result = await users_collection.insert_one(user_doc)
    token = create_access_token({"user_id": str(result.inserted_id)})
    
    return {
        "token": token,
        "user": {
            "id": str(result.inserted_id),
            "email": user_data.email,
            "name": user_data.name,
            "role": user_data.role
        }
    }

@api_router.post("/auth/login")
async def login(credentials: UserLogin):
    user = await users_collection.find_one({"email": credentials.email})
    if not user or not verify_password(credentials.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Credenciais inválidas")
    
    token = create_access_token({"user_id": str(user["_id"])})
    
    return {
        "token": token,
        "user": {
            "id": str(user["_id"]),
            "email": user["email"],
            "name": user["name"],
            "role": user["role"],
            "trust_level": user["trust_level"],
            "verification_status": user["verification_status"]
        }
    }

@api_router.get("/auth/me")
async def get_current_user(user_id: str = Depends(get_current_user_id)):
    user = await users_collection.find_one({"_id": ObjectId(user_id)})
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    
    return {
        "id": str(user["_id"]),
        "email": user["email"],
        "name": user["name"],
        "phone": user["phone"],
        "role": user["role"],
        "trust_level": user["trust_level"],
        "verification_status": user["verification_status"],
        "profile_photo_url": user.get("profile_photo_url"),
        "rating": user.get("rating", 0.0),
        "total_deliveries": user.get("total_deliveries", 0)
    }

# ============= TRUST LEVEL ROUTES =============
@api_router.get("/users/trust-level")
async def get_user_trust_level(user_id: str = Depends(get_current_user_id)):
    """Get user's trust level details and next level requirements"""
    user = await users_collection.find_one({"_id": ObjectId(user_id)})
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    
    current_level = user.get("trust_level", TrustLevel.LEVEL_1)
    config = get_trust_level_config(current_level)
    next_level_info = get_next_level_requirements(
        current_level,
        user.get("total_deliveries", 0),
        user.get("rating", 0.0)
    )
    
    return {
        "current_level": current_level,
        "level_name": config["name"],
        "level_description": config["description"],
        "badge_color": config["badge_color"],
        "limits": {
            "max_shipment_value": config["max_shipment_value"] if config["max_shipment_value"] != float('inf') else None,
            "max_weight_kg": config["max_weight_kg"] if config["max_weight_kg"] != float('inf') else None,
            "can_create_trips": config["can_create_trips"],
            "can_create_shipments": config["can_create_shipments"]
        },
        "stats": {
            "total_deliveries": user.get("total_deliveries", 0),
            "rating": user.get("rating", 0.0)
        },
        "next_level": next_level_info
    }

@api_router.post("/users/update-trust-level")
async def update_user_trust_level(user_id: str = Depends(get_current_user_id)):
    """Recalculate and update user's trust level based on current stats"""
    user = await users_collection.find_one({"_id": ObjectId(user_id)})
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    
    new_level = calculate_trust_level(
        user.get("verification_status", "pending"),
        user.get("total_deliveries", 0),
        user.get("rating", 0.0)
    )
    
    old_level = user.get("trust_level", TrustLevel.LEVEL_1)
    
    if new_level != old_level:
        await users_collection.update_one(
            {"_id": ObjectId(user_id)},
            {"$set": {"trust_level": new_level}}
        )
        
        return {
            "updated": True,
            "old_level": old_level,
            "new_level": new_level,
            "message": f"Parabéns! Você subiu para o nível {get_trust_level_config(new_level)['name']}!"
        }
    
    return {
        "updated": False,
        "current_level": old_level,
        "message": "Seu nível de confiança permanece o mesmo."
    }

# ============= TRIP ROUTES =============
@api_router.post("/trips", response_model=TripResponse)
async def create_trip(trip_data: TripCreate, user_id: str = Depends(get_current_user_id)):
    user = await users_collection.find_one({"_id": ObjectId(user_id)})
    if user["role"] not in [UserRole.CARRIER, UserRole.BOTH]:
        raise HTTPException(status_code=403, detail="Apenas transportadores podem criar viagens")
    
    # Check verification status
    if user.get("verification_status") != VerificationStatus.VERIFIED:
        raise HTTPException(
            status_code=403, 
            detail="Você precisa verificar sua identidade antes de criar viagens"
        )
    
    # Generate route polyline
    route_polyline = await get_route_polyline(
        trip_data.origin.lat, trip_data.origin.lng,
        trip_data.destination.lat, trip_data.destination.lng
    )
    
    # Calculate suggested price if not provided
    suggested_price = trip_data.price_per_kg
    if not suggested_price:
        # Base price calculation: R$3-8 per kg depending on distance
        from route_service import haversine_distance
        distance_km = haversine_distance(
            trip_data.origin.lat, trip_data.origin.lng,
            trip_data.destination.lat, trip_data.destination.lng
        )
        # Price formula: base R$3 + R$0.01 per km (max R$8)
        suggested_price = min(8.0, max(3.0, 3.0 + (distance_km * 0.01)))
    
    trip_doc = {
        "carrier_id": user_id,
        "carrier_name": user["name"],
        "carrier_rating": user.get("rating", 0.0),
        **trip_data.model_dump(),
        "route_polyline": route_polyline,
        "available_capacity_kg": trip_data.cargo_space.max_weight_kg,
        "price_per_kg": suggested_price,
        "is_recurring": trip_data.recurrence.is_recurring if trip_data.recurrence else False,
        "status": TripStatus.PUBLISHED,
        "created_at": datetime.now(timezone.utc)
    }
    
    result = await trips_collection.insert_one(trip_doc)
    trip_doc["id"] = str(result.inserted_id)
    
    return trip_doc

@api_router.post("/trips/calculate-price")
async def calculate_suggested_price(
    origin_lat: float,
    origin_lng: float,
    dest_lat: float,
    dest_lng: float
):
    """Calculate suggested price per kg based on distance"""
    from route_service import haversine_distance
    
    distance_km = haversine_distance(origin_lat, origin_lng, dest_lat, dest_lng)
    
    # Price tiers based on distance
    if distance_km <= 50:
        base_price = 3.0
        per_km = 0.02
    elif distance_km <= 200:
        base_price = 3.5
        per_km = 0.015
    elif distance_km <= 500:
        base_price = 4.0
        per_km = 0.01
    else:
        base_price = 5.0
        per_km = 0.008
    
    suggested_price = min(12.0, base_price + (distance_km * per_km))
    
    # Calculate example prices for different weights
    return {
        "distance_km": round(distance_km, 1),
        "suggested_price_per_kg": round(suggested_price, 2),
        "examples": {
            "1kg": round(suggested_price * 1, 2),
            "5kg": round(suggested_price * 5, 2),
            "10kg": round(suggested_price * 10, 2),
            "20kg": round(suggested_price * 20, 2)
        },
        "platform_fee_percent": 15,
        "carrier_receives_percent": 85
    }

@api_router.get("/trips", response_model=List[TripResponse])
async def list_trips(
    origin_city: Optional[str] = None,
    destination_city: Optional[str] = None,
    status: Optional[TripStatus] = TripStatus.PUBLISHED
):
    query = {"status": status}
    if origin_city:
        query["origin.city"] = {"$regex": origin_city, "$options": "i"}
    if destination_city:
        query["destination.city"] = {"$regex": destination_city, "$options": "i"}
    
    trips = await trips_collection.find(query).to_list(100)
    
    for trip in trips:
        trip["id"] = str(trip.pop("_id"))
        # Backward compatibility: use max_deviation_km if corridor_radius_km not set
        if "corridor_radius_km" not in trip:
            trip["corridor_radius_km"] = trip.get("max_deviation_km", 10.0)
    
    return trips

@api_router.get("/trips/my-trips")
async def get_my_trips(user_id: str = Depends(get_current_user_id)):
    trips = await trips_collection.find({"carrier_id": user_id}).to_list(100)
    
    for trip in trips:
        trip["id"] = str(trip.pop("_id"))
        # Backward compatibility: use max_deviation_km if corridor_radius_km not set
        if "corridor_radius_km" not in trip:
            trip["corridor_radius_km"] = trip.get("max_deviation_km", 10.0)
    
    return trips

# ============= SHIPMENT ROUTES =============
@api_router.post("/shipments", response_model=ShipmentResponse)
async def create_shipment(shipment_data: ShipmentCreate, user_id: str = Depends(get_current_user_id)):
    user = await users_collection.find_one({"_id": ObjectId(user_id)})
    if user["role"] not in [UserRole.SENDER, UserRole.BOTH]:
        raise HTTPException(status_code=403, detail="Apenas remetentes podem criar envios")
    
    # Check verification status
    if user.get("verification_status") != VerificationStatus.VERIFIED:
        raise HTTPException(
            status_code=403, 
            detail="Você precisa verificar sua identidade antes de criar envios"
        )
    
    # Check trust level limits
    trust_level = user.get("trust_level", TrustLevel.LEVEL_1)
    allowed, reason = check_shipment_allowed(
        trust_level,
        shipment_data.declared_value,
        shipment_data.package.weight_kg
    )
    
    if not allowed:
        raise HTTPException(status_code=403, detail=reason)
    
    shipment_doc = {
        "sender_id": user_id,
        "sender_name": user["name"],
        "sender_rating": user.get("rating", 0.0),
        **shipment_data.model_dump(),
        "status": ShipmentStatus.PUBLISHED,
        "created_at": datetime.now(timezone.utc)
    }
    
    result = await shipments_collection.insert_one(shipment_doc)
    shipment_doc["id"] = str(result.inserted_id)
    
    return shipment_doc

@api_router.get("/shipments", response_model=List[ShipmentResponse])
async def list_shipments(
    origin_city: Optional[str] = None,
    destination_city: Optional[str] = None,
    status: Optional[ShipmentStatus] = ShipmentStatus.PUBLISHED
):
    query = {"status": status}
    if origin_city:
        query["origin.city"] = {"$regex": origin_city, "$options": "i"}
    if destination_city:
        query["destination.city"] = {"$regex": destination_city, "$options": "i"}
    
    shipments = await shipments_collection.find(query).to_list(100)
    
    for shipment in shipments:
        shipment["id"] = str(shipment.pop("_id"))
    
    return shipments

@api_router.get("/shipments/my-shipments")
async def get_my_shipments(user_id: str = Depends(get_current_user_id)):
    shipments = await shipments_collection.find({"sender_id": user_id}).to_list(100)
    
    for shipment in shipments:
        shipment["id"] = str(shipment.pop("_id"))
    
    return shipments

# ============= MATCHING ROUTES =============
@api_router.get("/matches/suggestions")
async def get_match_suggestions(user_id: str = Depends(get_current_user_id)):
    """
    Get smart match suggestions based on route corridor matching.
    Uses polyline corridors to find shipments that can be picked up and dropped off along a route.
    """
    user = await users_collection.find_one({"_id": ObjectId(user_id)})
    suggestions = []
    
    # Get user's published shipments
    user_shipments = await shipments_collection.find({
        "sender_id": user_id,
        "status": "published"
    }).to_list(100)
    
    # Get user's published trips  
    user_trips = await trips_collection.find({
        "carrier_id": user_id,
        "status": "published"
    }).to_list(100)
    
    # For each shipment, find trips whose corridor includes both pickup and dropoff
    for shipment in user_shipments:
        pickup_lat = shipment["origin"].get("lat", 0)
        pickup_lng = shipment["origin"].get("lng", 0)
        dropoff_lat = shipment["destination"].get("lat", 0)
        dropoff_lng = shipment["destination"].get("lng", 0)
        shipment_weight = shipment["package"]["weight_kg"]
        
        # Find all published trips from other users with sufficient capacity
        # Use $or to handle both available_capacity_kg and cargo_space.max_weight_kg
        potential_trips = await trips_collection.find({
            "carrier_id": {"$ne": user_id},
            "status": "published",
            "$or": [
                {"available_capacity_kg": {"$gte": shipment_weight}},
                {"cargo_space.max_weight_kg": {"$gte": shipment_weight}},
                # Include trips without capacity info for legacy data
                {"available_capacity_kg": {"$exists": False}, "cargo_space": {"$exists": False}}
            ]
        }).to_list(50)
        
        for trip in potential_trips:
            route_polyline = trip.get("route_polyline")
            corridor_radius = trip.get("corridor_radius_km", 10.0)
            
            # Check capacity (with fallback)
            trip_capacity = trip.get("available_capacity_kg") or trip.get("cargo_space", {}).get("max_weight_kg", 50)
            if trip_capacity < shipment_weight:
                continue
            
            # If no polyline, use distance-based matching
            if not route_polyline:
                from route_service import haversine_distance
                
                # Check if origin/destination cities match (case-insensitive)
                origin_city_match = trip["origin"]["city"].lower() == shipment["origin"]["city"].lower()
                dest_city_match = trip["destination"]["city"].lower() == shipment["destination"]["city"].lower()
                
                if origin_city_match and dest_city_match:
                    matches = True
                    match_details = {"pickup_distance_km": 0, "dropoff_distance_km": 0, "total_deviation_km": 0}
                else:
                    # Fallback: check coordinate proximity
                    trip_origin_lat = trip["origin"].get("lat", 0)
                    trip_origin_lng = trip["origin"].get("lng", 0)
                    trip_dest_lat = trip["destination"].get("lat", 0)
                    trip_dest_lng = trip["destination"].get("lng", 0)
                    
                    # Check if pickup is near trip origin and dropoff is near trip destination
                    pickup_distance = haversine_distance(pickup_lat, pickup_lng, trip_origin_lat, trip_origin_lng)
                    dropoff_distance = haversine_distance(dropoff_lat, dropoff_lng, trip_dest_lat, trip_dest_lng)
                    
                    if pickup_distance <= corridor_radius and dropoff_distance <= corridor_radius:
                        matches = True
                        match_details = {
                            "pickup_distance_km": round(pickup_distance, 2),
                            "dropoff_distance_km": round(dropoff_distance, 2),
                            "total_deviation_km": round(pickup_distance + dropoff_distance, 2)
                        }
                    else:
                        continue
            else:
                # Check corridor matching using polyline
                matches, match_details = check_shipment_matches_route(
                    pickup_lat, pickup_lng,
                    dropoff_lat, dropoff_lng,
                    route_polyline,
                    corridor_radius
                )
            
            if matches:
                carrier = await users_collection.find_one({"_id": ObjectId(trip["carrier_id"])})
                price_per_kg = trip.get("price_per_kg") or 5.0
                estimated_price = shipment["package"]["weight_kg"] * price_per_kg
                
                match_score = calculate_corridor_match_score(
                    match_details.get("pickup_distance_km", 0),
                    match_details.get("dropoff_distance_km", 0),
                    corridor_radius,
                    carrier.get("rating", 0) if carrier else 0,
                    shipment["package"]["weight_kg"],
                    trip.get("cargo_space", {}).get("max_weight_kg", 50)
                )
                
                suggestions.append({
                    "type": "trip_for_shipment",
                    "shipment_id": str(shipment["_id"]),
                    "shipment_description": shipment["package"].get("description", "Envio"),
                    "trip_id": str(trip["_id"]),
                    "carrier_name": carrier["name"] if carrier else "Transportador",
                    "carrier_rating": carrier.get("rating", 0) if carrier else 0,
                    "origin": shipment["origin"]["city"],
                    "destination": shipment["destination"]["city"],
                    "pickup_address": shipment["origin"].get("address"),
                    "dropoff_address": shipment["destination"].get("address"),
                    "departure_date": trip.get("departure_date"),
                    "estimated_price": estimated_price,
                    "match_score": match_score,
                    "deviation_km": match_details.get("total_deviation_km", 0),
                    "corridor_radius_km": corridor_radius
                })
    
    # For each trip, find shipments within the route corridor
    for trip in user_trips:
        route_polyline = trip.get("route_polyline")
        corridor_radius = trip.get("corridor_radius_km", 10.0)
        trip_capacity = trip.get("available_capacity_kg") or trip.get("cargo_space", {}).get("max_weight_kg", 50)
        
        trip_origin_lat = trip["origin"].get("lat", 0)
        trip_origin_lng = trip["origin"].get("lng", 0)
        trip_dest_lat = trip["destination"].get("lat", 0)
        trip_dest_lng = trip["destination"].get("lng", 0)
        
        # Find potential shipments from other users
        potential_shipments = await shipments_collection.find({
            "sender_id": {"$ne": user_id},
            "status": "published",
            "package.weight_kg": {"$lte": trip_capacity}
        }).to_list(50)
        
        for shipment in potential_shipments:
            pickup_lat = shipment["origin"].get("lat", 0)
            pickup_lng = shipment["origin"].get("lng", 0)
            dropoff_lat = shipment["destination"].get("lat", 0)
            dropoff_lng = shipment["destination"].get("lng", 0)
            
            if not route_polyline:
                from route_service import haversine_distance
                
                # Check if origin/destination cities match (case-insensitive)
                origin_city_match = trip["origin"]["city"].lower() == shipment["origin"]["city"].lower()
                dest_city_match = trip["destination"]["city"].lower() == shipment["destination"]["city"].lower()
                
                if origin_city_match and dest_city_match:
                    matches = True
                    match_details = {"pickup_distance_km": 0, "dropoff_distance_km": 0, "total_deviation_km": 0}
                else:
                    # Fallback: check coordinate proximity
                    pickup_distance = haversine_distance(pickup_lat, pickup_lng, trip_origin_lat, trip_origin_lng)
                    dropoff_distance = haversine_distance(dropoff_lat, dropoff_lng, trip_dest_lat, trip_dest_lng)
                    
                    if pickup_distance <= corridor_radius and dropoff_distance <= corridor_radius:
                        matches = True
                        match_details = {
                            "pickup_distance_km": round(pickup_distance, 2),
                            "dropoff_distance_km": round(dropoff_distance, 2),
                            "total_deviation_km": round(pickup_distance + dropoff_distance, 2)
                        }
                    else:
                        continue
            else:
                matches, match_details = check_shipment_matches_route(
                    pickup_lat, pickup_lng,
                    dropoff_lat, dropoff_lng,
                    route_polyline,
                    corridor_radius
                )
            
            if matches:
                sender = await users_collection.find_one({"_id": ObjectId(shipment["sender_id"])})
                price_per_kg = trip.get("price_per_kg") or 5.0
                estimated_price = shipment["package"]["weight_kg"] * price_per_kg
                
                match_score = calculate_corridor_match_score(
                    match_details.get("pickup_distance_km", 0),
                    match_details.get("dropoff_distance_km", 0),
                    corridor_radius,
                    sender.get("rating", 0) if sender else 0,
                    shipment["package"]["weight_kg"],
                    trip.get("cargo_space", {}).get("max_weight_kg", 50)
                )
                
                suggestions.append({
                    "type": "shipment_for_trip",
                    "trip_id": str(trip["_id"]),
                    "shipment_id": str(shipment["_id"]),
                    "shipment_description": shipment["package"].get("description", "Envio"),
                    "sender_name": sender["name"] if sender else "Remetente",
                    "sender_rating": sender.get("rating", 0) if sender else 0,
                    "origin": trip["origin"]["city"],
                    "destination": trip["destination"]["city"],
                    "pickup_address": shipment["origin"].get("address"),
                    "dropoff_address": shipment["destination"].get("address"),
                    "departure_date": trip.get("departure_date"),
                    "weight_kg": shipment["package"]["weight_kg"],
                    "estimated_price": estimated_price,
                    "match_score": match_score,
                    "deviation_km": match_details.get("total_deviation_km", 0),
                    "corridor_radius_km": corridor_radius
                })
    
    # Sort by match score (highest first)
    suggestions.sort(key=lambda x: x["match_score"], reverse=True)
    
    return suggestions[:20]  # Return top 20 suggestions

@api_router.post("/matches/create")
async def create_match(
    trip_id: str,
    shipment_id: str,
    user_id: str = Depends(get_current_user_id)
):
    trip = await trips_collection.find_one({"_id": ObjectId(trip_id)})
    shipment = await shipments_collection.find_one({"_id": ObjectId(shipment_id)})
    
    if not trip or not shipment:
        raise HTTPException(status_code=404, detail="Viagem ou envio não encontrado")
    
    # Calculate price (simple algorithm)
    price_per_kg = trip.get("price_per_kg") or 5.0
    base_price = shipment["package"]["weight_kg"] * price_per_kg
    platform_commission = base_price * 0.15
    carrier_earnings = base_price - platform_commission
    
    match_doc = {
        "trip_id": trip_id,
        "shipment_id": shipment_id,
        "carrier_id": trip["carrier_id"],
        "sender_id": shipment["sender_id"],
        "estimated_price": base_price,
        "platform_commission": platform_commission,
        "carrier_earnings": carrier_earnings,
        "status": "pending_payment",
        "pickup_confirmed_at": None,
        "delivery_confirmed_at": None,
        "created_at": datetime.now(timezone.utc)
    }
    
    result = await matches_collection.insert_one(match_doc)
    
    # Update statuses
    await trips_collection.update_one(
        {"_id": ObjectId(trip_id)},
        {"$set": {"status": TripStatus.MATCHED}}
    )
    await shipments_collection.update_one(
        {"_id": ObjectId(shipment_id)},
        {"$set": {"status": ShipmentStatus.MATCHED}}
    )
    
    return {
        "id": str(result.inserted_id),
        "estimated_price": base_price,
        "carrier_earnings": carrier_earnings,
        "platform_commission": platform_commission
    }

@api_router.get("/matches/my-matches")
async def get_my_matches(user_id: str = Depends(get_current_user_id)):
    matches = await matches_collection.find({
        "$or": [
            {"carrier_id": user_id},
            {"sender_id": user_id}
        ]
    }).to_list(100)
    
    for match in matches:
        match["id"] = str(match.pop("_id"))
    
    return matches

@api_router.get("/matches/{match_id}")
async def get_match_details(match_id: str, user_id: str = Depends(get_current_user_id)):
    match = await matches_collection.find_one({"_id": ObjectId(match_id)})
    
    if not match:
        raise HTTPException(status_code=404, detail="Combinação não encontrada")
    
    # Check if user is part of this match
    if user_id not in [match["carrier_id"], match["sender_id"]]:
        raise HTTPException(status_code=403, detail="Você não tem acesso a esta combinação")
    
    # Enrich with trip and shipment data
    trip = await trips_collection.find_one({"_id": ObjectId(match["trip_id"])})
    shipment = await shipments_collection.find_one({"_id": ObjectId(match["shipment_id"])})
    
    # Get user names and ratings
    carrier = await users_collection.find_one({"_id": ObjectId(match["carrier_id"])})
    sender = await users_collection.find_one({"_id": ObjectId(match["sender_id"])})
    
    # Remove _id from nested objects
    if trip:
        trip.pop("_id", None)
    if shipment:
        shipment.pop("_id", None)
    
    match["id"] = str(match.pop("_id"))
    match["trip"] = trip
    match["shipment"] = shipment
    match["carrier_name"] = carrier["name"] if carrier else "Unknown"
    match["carrier_rating"] = carrier.get("rating", 0.0) if carrier else 0.0
    match["sender_name"] = sender["name"] if sender else "Unknown"
    match["sender_rating"] = sender.get("rating", 0.0) if sender else 0.0
    
    return match

@api_router.post("/matches/{match_id}/confirm-pickup")
async def confirm_pickup(match_id: str, photo_url: str, user_id: str = Depends(get_current_user_id)):
    match = await matches_collection.find_one({"_id": ObjectId(match_id)})
    
    if not match:
        raise HTTPException(status_code=404, detail="Combinação não encontrada")
    
    if match["carrier_id"] != user_id:
        raise HTTPException(status_code=403, detail="Apenas o transportador pode confirmar coleta")
    
    await matches_collection.update_one(
        {"_id": ObjectId(match_id)},
        {
            "$set": {
                "pickup_confirmed_at": datetime.now(timezone.utc),
                "pickup_photo_url": photo_url,
                "status": "in_transit"
            }
        }
    )
    
    return {"message": "Coleta confirmada com sucesso"}

@api_router.post("/matches/{match_id}/confirm-delivery")
async def confirm_delivery(match_id: str, photo_url: str, user_id: str = Depends(get_current_user_id)):
    match = await matches_collection.find_one({"_id": ObjectId(match_id)})
    
    if not match:
        raise HTTPException(status_code=404, detail="Combinação não encontrada")
    
    if match["carrier_id"] != user_id:
        raise HTTPException(status_code=403, detail="Apenas o transportador pode confirmar entrega")
    
    await matches_collection.update_one(
        {"_id": ObjectId(match_id)},
        {
            "$set": {
                "delivery_confirmed_at": datetime.now(timezone.utc),
                "delivery_photo_url": photo_url,
                "status": "delivered"
            }
        }
    )
    
    # Release payment from escrow
    payment = await payments_collection.find_one({"match_id": match_id})
    if payment:
        await payments_collection.update_one(
            {"match_id": match_id},
            {"$set": {"status": PaymentStatus.RELEASED}}
        )
    
    return {"message": "Entrega confirmada com sucesso"}

# ============= PAYMENT ROUTES =============
@api_router.post("/payments/initiate")
async def initiate_payment(payment_data: PaymentInitiate, user_id: str = Depends(get_current_user_id)):
    match = await matches_collection.find_one({"_id": ObjectId(payment_data.match_id)})
    
    if not match:
        raise HTTPException(status_code=404, detail="Combinação não encontrada")
    
    if match["sender_id"] != user_id:
        raise HTTPException(status_code=403, detail="Apenas o remetente pode iniciar pagamento")
    
    payment_doc = {
        "match_id": payment_data.match_id,
        "sender_id": user_id,
        "amount": payment_data.amount,
        "status": PaymentStatus.PENDING,
        "mercadopago_preference_id": None,
        "checkout_url": None,
        "created_at": datetime.now(timezone.utc)
    }
    
    # Create Mercado Pago preference if SDK is configured
    if mp_sdk:
        try:
            preference_data = {
                "items": [{
                    "title": f"Entrega Levva - {match['shipment_id']}",
                    "quantity": 1,
                    "unit_price": float(payment_data.amount),
                    "currency_id": "BRL"
                }],
                "external_reference": payment_data.match_id,
                "back_urls": {
                    "success": os.getenv("FRONTEND_URL", "") + "/payment/success",
                    "failure": os.getenv("FRONTEND_URL", "") + "/payment/failure",
                    "pending": os.getenv("FRONTEND_URL", "") + "/payment/pending"
                },
                "auto_return": "approved"
            }
            
            preference = mp_sdk.preference().create(preference_data)
            payment_doc["mercadopago_preference_id"] = preference["response"]["id"]
            payment_doc["checkout_url"] = preference["response"]["init_point"]
        except Exception as e:
            logger.error(f"Erro ao criar preferência Mercado Pago: {e}")
    
    result = await payments_collection.insert_one(payment_doc)
    
    # Return serializable response
    return {
        "id": str(result.inserted_id),
        "match_id": payment_data.match_id,
        "amount": payment_data.amount,
        "status": payment_doc["status"].value if hasattr(payment_doc["status"], 'value') else str(payment_doc["status"]),
        "checkout_url": payment_doc.get("checkout_url"),
        "mercadopago_preference_id": payment_doc.get("mercadopago_preference_id")
    }

@api_router.get("/payments/{match_id}/status")
async def get_payment_status(match_id: str, user_id: str = Depends(get_current_user_id)):
    """Get payment status for a match"""
    payment = await payments_collection.find_one({"match_id": match_id})
    
    if not payment:
        return {"status": "not_initiated", "match_id": match_id}
    
    return {
        "id": str(payment["_id"]),
        "match_id": match_id,
        "amount": payment.get("amount"),
        "status": str(payment.get("status")),
        "checkout_url": payment.get("checkout_url"),
        "created_at": payment.get("created_at").isoformat() if payment.get("created_at") else None
    }
    
@api_router.post("/payments/webhook")
async def mercadopago_webhook(data: dict):
    if data.get("type") == "payment":
        payment_id = data.get("data", {}).get("id")
        
        if mp_sdk and payment_id:
            try:
                payment_info = mp_sdk.payment().get(payment_id)
                if payment_info["response"]["status"] == "approved":
                    external_ref = payment_info["response"]["external_reference"]
                    
                    await payments_collection.update_one(
                        {"match_id": external_ref},
                        {"$set": {"status": PaymentStatus.ESCROWED}}
                    )
                    
                    await matches_collection.update_one(
                        {"_id": ObjectId(external_ref)},
                        {"$set": {"status": "paid"}}
                    )
            except Exception as e:
                logger.error(f"Erro ao processar webhook: {e}")
    
    return {"status": "ok"}

# ============= RATING ROUTES =============
@api_router.post("/ratings")
async def create_rating(rating_data: RatingCreate, user_id: str = Depends(get_current_user_id)):
    match = await matches_collection.find_one({"_id": ObjectId(rating_data.match_id)})
    
    if not match:
        raise HTTPException(status_code=404, detail="Combinação não encontrada")
    
    # Check if user is part of this match
    if user_id not in [match["carrier_id"], match["sender_id"]]:
        raise HTTPException(status_code=403, detail="Você não pode avaliar esta transação")
    
    # Check if rating already exists
    existing = await ratings_collection.find_one({
        "match_id": rating_data.match_id,
        "rater_id": user_id
    })
    
    if existing:
        raise HTTPException(status_code=400, detail="Você já avaliou esta transação")
    
    user = await users_collection.find_one({"_id": ObjectId(user_id)})
    
    rating_doc = {
        **rating_data.model_dump(),
        "rater_id": user_id,
        "rater_name": user["name"],
        "created_at": datetime.now(timezone.utc)
    }
    
    await ratings_collection.insert_one(rating_doc)
    
    # Update user rating
    user_ratings = await ratings_collection.find({"rated_user_id": rating_data.rated_user_id}).to_list(1000)
    avg_rating = sum(r["rating"] for r in user_ratings) / len(user_ratings) if user_ratings else 0
    
    await users_collection.update_one(
        {"_id": ObjectId(rating_data.rated_user_id)},
        {"$set": {"rating": round(avg_rating, 2)}}
    )
    
    return {"message": "Avaliação criada com sucesso"}

@api_router.get("/ratings/{user_id}")
async def get_user_ratings(user_id: str):
    ratings = await ratings_collection.find({"rated_user_id": user_id}).to_list(100)
    
    for rating in ratings:
        rating["id"] = str(rating.pop("_id"))
    
    return ratings

# ============= DISPUTE ROUTES =============
class DisputeStatus(str):
    OPEN = "open"
    UNDER_REVIEW = "under_review"
    RESOLVED_SENDER = "resolved_sender"
    RESOLVED_CARRIER = "resolved_carrier"
    RESOLVED_SPLIT = "resolved_split"
    CLOSED = "closed"

@api_router.post("/disputes")
async def create_dispute(dispute_data: DisputeCreate, user_id: str = Depends(get_current_user_id)):
    """Create a new dispute for a match"""
    match = await matches_collection.find_one({"_id": ObjectId(dispute_data.match_id)})
    
    if not match:
        raise HTTPException(status_code=404, detail="Combinação não encontrada")
    
    # Check if user is part of the match
    if user_id not in [match["sender_id"], match["carrier_id"]]:
        raise HTTPException(status_code=403, detail="Você não faz parte desta combinação")
    
    # Check if dispute already exists
    existing = await disputes_collection.find_one({"match_id": dispute_data.match_id, "status": {"$ne": "closed"}})
    if existing:
        raise HTTPException(status_code=400, detail="Já existe uma disputa aberta para esta combinação")
    
    user = await users_collection.find_one({"_id": ObjectId(user_id)})
    
    dispute_doc = {
        "match_id": dispute_data.match_id,
        "opened_by": user_id,
        "opened_by_name": user["name"],
        "opened_by_role": "sender" if user_id == match["sender_id"] else "carrier",
        "reason": dispute_data.reason,
        "description": dispute_data.description,
        "evidence_urls": dispute_data.evidence_urls if hasattr(dispute_data, 'evidence_urls') else [],
        "status": DisputeStatus.OPEN,
        "admin_notes": [],
        "resolution": None,
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc)
    }
    
    result = await disputes_collection.insert_one(dispute_doc)
    
    # Update match status
    await matches_collection.update_one(
        {"_id": ObjectId(dispute_data.match_id)},
        {"$set": {"status": "disputed", "dispute_id": str(result.inserted_id)}}
    )
    
    return {
        "id": str(result.inserted_id),
        "match_id": dispute_data.match_id,
        "status": DisputeStatus.OPEN,
        "message": "Disputa aberta com sucesso. Nossa equipe irá analisar."
    }

@api_router.get("/disputes/my-disputes")
async def get_my_disputes(user_id: str = Depends(get_current_user_id)):
    """Get disputes for current user"""
    disputes = await disputes_collection.find({
        "$or": [
            {"opened_by": user_id},
            {"match_id": {"$in": await get_user_match_ids(user_id)}}
        ]
    }).sort("created_at", -1).to_list(50)
    
    for dispute in disputes:
        dispute["id"] = str(dispute.pop("_id"))
    
    return disputes

async def get_user_match_ids(user_id: str) -> list:
    """Helper to get all match IDs for a user"""
    matches = await matches_collection.find({
        "$or": [{"sender_id": user_id}, {"carrier_id": user_id}]
    }).to_list(100)
    return [str(m["_id"]) for m in matches]

@api_router.get("/admin/disputes")
async def get_all_disputes(user_id: str = Depends(get_current_user_id)):
    """Admin: Get all disputes"""
    user = await users_collection.find_one({"_id": ObjectId(user_id)})
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Acesso negado")
    
    disputes = await disputes_collection.find().sort("created_at", -1).to_list(100)
    
    result = []
    for dispute in disputes:
        match = await matches_collection.find_one({"_id": ObjectId(dispute["match_id"])})
        sender = await users_collection.find_one({"_id": ObjectId(match["sender_id"])}) if match else None
        carrier = await users_collection.find_one({"_id": ObjectId(match["carrier_id"])}) if match else None
        
        result.append({
            "id": str(dispute["_id"]),
            "match_id": dispute["match_id"],
            "opened_by_name": dispute["opened_by_name"],
            "opened_by_role": dispute["opened_by_role"],
            "reason": dispute["reason"],
            "description": dispute["description"],
            "status": dispute["status"],
            "sender_name": sender["name"] if sender else "N/A",
            "carrier_name": carrier["name"] if carrier else "N/A",
            "match_value": match.get("estimated_price", 0) if match else 0,
            "created_at": dispute["created_at"].isoformat() if dispute.get("created_at") else None,
            "admin_notes": dispute.get("admin_notes", []),
            "resolution": dispute.get("resolution")
        })
    
    return result

@api_router.get("/admin/disputes/{dispute_id}")
async def get_dispute_details(dispute_id: str, user_id: str = Depends(get_current_user_id)):
    """Admin: Get detailed dispute info"""
    user = await users_collection.find_one({"_id": ObjectId(user_id)})
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Acesso negado")
    
    dispute = await disputes_collection.find_one({"_id": ObjectId(dispute_id)})
    if not dispute:
        raise HTTPException(status_code=404, detail="Disputa não encontrada")
    
    match = await matches_collection.find_one({"_id": ObjectId(dispute["match_id"])})
    sender = await users_collection.find_one({"_id": ObjectId(match["sender_id"])}) if match else None
    carrier = await users_collection.find_one({"_id": ObjectId(match["carrier_id"])}) if match else None
    
    # Get chat messages for context
    messages = await messages_collection.find({"match_id": dispute["match_id"]}).sort("timestamp", 1).to_list(100)
    
    return {
        "id": str(dispute["_id"]),
        "match_id": dispute["match_id"],
        "opened_by": dispute["opened_by"],
        "opened_by_name": dispute["opened_by_name"],
        "opened_by_role": dispute["opened_by_role"],
        "reason": dispute["reason"],
        "description": dispute["description"],
        "evidence_urls": dispute.get("evidence_urls", []),
        "status": dispute["status"],
        "admin_notes": dispute.get("admin_notes", []),
        "resolution": dispute.get("resolution"),
        "created_at": dispute["created_at"].isoformat() if dispute.get("created_at") else None,
        "match": {
            "id": str(match["_id"]) if match else None,
            "estimated_price": match.get("estimated_price") if match else 0,
            "status": match.get("status") if match else None,
            "origin": match.get("trip", {}).get("origin", {}).get("city") if match else None,
            "destination": match.get("trip", {}).get("destination", {}).get("city") if match else None
        },
        "sender": {
            "id": str(sender["_id"]) if sender else None,
            "name": sender["name"] if sender else "N/A",
            "email": sender["email"] if sender else "N/A",
            "rating": sender.get("rating", 0) if sender else 0,
            "total_deliveries": sender.get("total_deliveries", 0) if sender else 0
        },
        "carrier": {
            "id": str(carrier["_id"]) if carrier else None,
            "name": carrier["name"] if carrier else "N/A",
            "email": carrier["email"] if carrier else "N/A",
            "rating": carrier.get("rating", 0) if carrier else 0,
            "total_deliveries": carrier.get("total_deliveries", 0) if carrier else 0
        },
        "chat_messages": [
            {
                "sender_name": m.get("sender_name", "Unknown"),
                "content": m["content"],
                "timestamp": m["timestamp"].isoformat() if m.get("timestamp") else None
            }
            for m in messages
        ]
    }

@api_router.post("/admin/disputes/{dispute_id}/add-note")
async def add_dispute_note(dispute_id: str, note_data: dict, user_id: str = Depends(get_current_user_id)):
    """Admin: Add a note to dispute"""
    user = await users_collection.find_one({"_id": ObjectId(user_id)})
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Acesso negado")
    
    note = {
        "admin_id": user_id,
        "admin_name": user["name"],
        "content": note_data.get("content", ""),
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
    
    await disputes_collection.update_one(
        {"_id": ObjectId(dispute_id)},
        {
            "$push": {"admin_notes": note},
            "$set": {"updated_at": datetime.now(timezone.utc)}
        }
    )
    
    return {"message": "Nota adicionada", "note": note}

@api_router.post("/admin/disputes/{dispute_id}/resolve")
async def resolve_dispute(dispute_id: str, resolution_data: dict, user_id: str = Depends(get_current_user_id)):
    """Admin: Resolve a dispute"""
    user = await users_collection.find_one({"_id": ObjectId(user_id)})
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Acesso negado")
    
    dispute = await disputes_collection.find_one({"_id": ObjectId(dispute_id)})
    if not dispute:
        raise HTTPException(status_code=404, detail="Disputa não encontrada")
    
    resolution_type = resolution_data.get("resolution_type")  # sender, carrier, split, dismissed
    resolution_notes = resolution_data.get("notes", "")
    refund_amount = resolution_data.get("refund_amount", 0)
    
    resolution = {
        "type": resolution_type,
        "notes": resolution_notes,
        "refund_amount": refund_amount,
        "resolved_by": user_id,
        "resolved_by_name": user["name"],
        "resolved_at": datetime.now(timezone.utc).isoformat()
    }
    
    status_map = {
        "sender": DisputeStatus.RESOLVED_SENDER,
        "carrier": DisputeStatus.RESOLVED_CARRIER,
        "split": DisputeStatus.RESOLVED_SPLIT,
        "dismissed": DisputeStatus.CLOSED
    }
    
    new_status = status_map.get(resolution_type, DisputeStatus.CLOSED)
    
    await disputes_collection.update_one(
        {"_id": ObjectId(dispute_id)},
        {
            "$set": {
                "status": new_status,
                "resolution": resolution,
                "updated_at": datetime.now(timezone.utc)
            }
        }
    )
    
    # Update match status
    match_status = "cancelled" if resolution_type == "dismissed" else "dispute_resolved"
    await matches_collection.update_one(
        {"_id": ObjectId(dispute["match_id"])},
        {"$set": {"status": match_status}}
    )
    
    return {
        "message": "Disputa resolvida",
        "resolution": resolution,
        "new_status": new_status
    }

# ============= UPLOAD ROUTES =============
@api_router.post("/uploads/presigned-url")
async def get_presigned_url(upload_data: UploadInitiate, user_id: str = Depends(get_current_user_id)):
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
                "Bucket": os.getenv("R2_BUCKET_NAME"),
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

@api_router.post("/uploads/confirm")
async def confirm_upload(
    upload_data: dict,
    user_id: str = Depends(get_current_user_id)
):
    """Confirma upload e retorna URL pública do arquivo"""
    file_key = upload_data.get("file_key")
    file_type = upload_data.get("file_type")  # profile, id_front, id_back, selfie, license
    
    if not file_key:
        raise HTTPException(status_code=400, detail="file_key é obrigatório")
    
    # Gerar URL pública para acesso ao arquivo
    # Usando presigned URL para GET com longa validade
    r2_client = get_r2_client()
    if not r2_client:
        raise HTTPException(status_code=503, detail="Serviço de upload não configurado")
    
    try:
        # Generate a presigned URL for reading (valid for 7 days)
        public_url = r2_client.generate_presigned_url(
            ClientMethod="get_object",
            Params={
                "Bucket": os.getenv("R2_BUCKET_NAME"),
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

@api_router.get("/uploads/file-url/{file_key:path}")
async def get_file_url(file_key: str, user_id: str = Depends(get_current_user_id)):
    """Gera URL temporária para visualizar um arquivo"""
    r2_client = get_r2_client()
    if not r2_client:
        raise HTTPException(status_code=503, detail="Serviço de upload não configurado")
    
    try:
        presigned_url = r2_client.generate_presigned_url(
            ClientMethod="get_object",
            Params={
                "Bucket": os.getenv("R2_BUCKET_NAME"),
                "Key": file_key
            },
            ExpiresIn=3600  # 1 hour
        )
        return {"url": presigned_url}
    except Exception as e:
        logger.error(f"Erro ao gerar URL de visualização: {e}")
        raise HTTPException(status_code=500, detail="Erro ao gerar URL")

# ============= ADMIN ROUTES =============
@api_router.get("/admin/stats")
async def get_admin_stats(user_id: str = Depends(get_current_user_id)):
    user = await users_collection.find_one({"_id": ObjectId(user_id)})
    
    if user.get("role") != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Acesso negado")
    
    total_users = await users_collection.count_documents({})
    active_trips = await trips_collection.count_documents({"status": TripStatus.PUBLISHED})
    active_shipments = await shipments_collection.count_documents({"status": ShipmentStatus.PUBLISHED})
    total_matches = await matches_collection.count_documents({})
    pending_verifications = await verifications_collection.count_documents({"status": "pending"})
    flagged_items = await flag_collection.count_documents({"status": "pending"})
    
    return {
        "total_users": total_users,
        "active_trips": active_trips,
        "active_shipments": active_shipments,
        "total_matches": total_matches,
        "pending_verifications": pending_verifications,
        "flagged_items": flagged_items
    }

@api_router.get("/admin/verifications/pending")
async def get_pending_verifications(user_id: str = Depends(get_current_user_id)):
    user = await users_collection.find_one({"_id": ObjectId(user_id)})
    
    if user.get("role") != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Acesso negado")
    
    verifications = await verifications_collection.find({"status": "pending"}).to_list(100)
    
    # Enrich with user data
    result = []
    for verification in verifications:
        user_data = await users_collection.find_one({"_id": ObjectId(verification["user_id"])})
        if user_data:
            verification["id"] = str(verification.pop("_id"))
            verification["user_name"] = user_data["name"]
            verification["user_email"] = user_data["email"]
            verification["user_role"] = user_data["role"]
            result.append(verification)
    
    return result

@api_router.post("/admin/verifications/{verification_id}/review")
async def review_verification(
    verification_id: str,
    review_data: dict,
    user_id: str = Depends(get_current_user_id)
):
    user = await users_collection.find_one({"_id": ObjectId(user_id)})
    
    if user.get("role") != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Acesso negado")
    
    verification = await verifications_collection.find_one({"_id": ObjectId(verification_id)})
    if not verification:
        raise HTTPException(status_code=404, detail="Verificação não encontrada")
    
    action = review_data.get("action")
    notes = review_data.get("notes", "")
    
    if action == "approve":
        # Update verification
        await verifications_collection.update_one(
            {"_id": ObjectId(verification_id)},
            {
                "$set": {
                    "status": "approved",
                    "reviewed_at": datetime.now(timezone.utc),
                    "reviewed_by": user_id,
                    "notes": notes
                }
            }
        )
        
        # Update user status
        await users_collection.update_one(
            {"_id": ObjectId(verification["user_id"])},
            {"$set": {"verification_status": VerificationStatus.VERIFIED}}
        )
        
        return {"message": "Verificação aprovada"}
    
    elif action == "reject":
        # Update verification
        await verifications_collection.update_one(
            {"_id": ObjectId(verification_id)},
            {
                "$set": {
                    "status": "rejected",
                    "reviewed_at": datetime.now(timezone.utc),
                    "reviewed_by": user_id,
                    "notes": notes
                }
            }
        )
        
        # Update user status
        await users_collection.update_one(
            {"_id": ObjectId(verification["user_id"])},
            {"$set": {"verification_status": VerificationStatus.REJECTED}}
        )
        
        return {"message": "Verificação rejeitada"}
    
    raise HTTPException(status_code=400, detail="Ação inválida")

@api_router.post("/admin/flags")
async def create_flag(flag_data: FlagCreate, user_id: str = Depends(get_current_user_id)):
    flag_doc = {
        **flag_data.model_dump(),
        "reporter_id": user_id,
        "status": "pending",
        "created_at": datetime.now(timezone.utc)
    }
    
    await flag_collection.insert_one(flag_doc)
    
    return {"message": "Denúncia criada com sucesso"}

# ============= HEALTH CHECK =============
@api_router.get("/health")
async def health_check():
    return {"status": "healthy", "service": "Levva API"}

# ============= CHAT ROUTES =============
@api_router.post("/chat/{match_id}/messages")
async def send_message(match_id: str, message_data: dict, user_id: str = Depends(get_current_user_id)):
    """Send a message in a match chat"""
    match = await matches_collection.find_one({"_id": ObjectId(match_id)})
    
    if not match:
        raise HTTPException(status_code=404, detail="Combinação não encontrada")
    
    if user_id not in [match["carrier_id"], match["sender_id"]]:
        raise HTTPException(status_code=403, detail="Você não tem acesso a este chat")
    
    user = await users_collection.find_one({"_id": ObjectId(user_id)})
    
    message_doc = {
        "match_id": match_id,
        "sender_id": user_id,
        "sender_name": user["name"],
        "message": message_data.get("message"),
        "created_at": datetime.now(timezone.utc),
        "read": False
    }
    
    result = await messages_collection.insert_one(message_doc)
    message_doc["id"] = str(result.inserted_id)
    message_doc.pop("_id", None)
    
    return message_doc

@api_router.get("/chat/{match_id}/messages")
async def get_messages(match_id: str, user_id: str = Depends(get_current_user_id)):
    """Get all messages for a match"""
    match = await matches_collection.find_one({"_id": ObjectId(match_id)})
    
    if not match:
        raise HTTPException(status_code=404, detail="Combinação não encontrada")
    
    if user_id not in [match["carrier_id"], match["sender_id"]]:
        raise HTTPException(status_code=403, detail="Você não tem acesso a este chat")
    
    messages = await messages_collection.find({"match_id": match_id}).sort("created_at", 1).to_list(500)
    
    # Mark as read
    await messages_collection.update_many(
        {"match_id": match_id, "sender_id": {"$ne": user_id}},
        {"$set": {"read": True}}
    )
    
    for msg in messages:
        msg["id"] = str(msg.pop("_id"))
    
    return messages

# ============= NOTIFICATION ROUTES =============
@api_router.get("/notifications")
async def get_notifications(
    unread_only: bool = False,
    limit: int = 50,
    user_id: str = Depends(get_current_user_id)
):
    """Get user notifications"""
    notifications = await get_user_notifications(user_id, unread_only, limit)
    return notifications

@api_router.get("/notifications/unread-count")
async def get_notifications_unread_count(user_id: str = Depends(get_current_user_id)):
    """Get count of unread notifications"""
    count = await get_unread_count(user_id)
    return {"count": count}

@api_router.post("/notifications/{notification_id}/read")
async def mark_notification_as_read(notification_id: str, user_id: str = Depends(get_current_user_id)):
    """Mark a notification as read"""
    success = await mark_notification_read(notification_id, user_id)
    if not success:
        raise HTTPException(status_code=404, detail="Notificação não encontrada")
    return {"message": "Notificação marcada como lida"}

@api_router.post("/notifications/read-all")
async def mark_all_as_read(user_id: str = Depends(get_current_user_id)):
    """Mark all notifications as read"""
    count = await mark_all_notifications_read(user_id)
    return {"message": f"{count} notificações marcadas como lidas", "count": count}

@api_router.delete("/notifications/{notification_id}")
async def delete_user_notification(notification_id: str, user_id: str = Depends(get_current_user_id)):
    """Delete a notification"""
    success = await delete_notification(notification_id, user_id)
    if not success:
        raise HTTPException(status_code=404, detail="Notificação não encontrada")
    return {"message": "Notificação excluída"}

# ============= GPS TRACKING ROUTES =============
@api_router.get("/tracking/{match_id}/status")
async def get_tracking_status(match_id: str, user_id: str = Depends(get_current_user_id)):
    """Get tracking status for a delivery"""
    match = await matches_collection.find_one({"_id": ObjectId(match_id)})
    if not match:
        raise HTTPException(status_code=404, detail="Combinação não encontrada")
    
    if user_id not in [match["carrier_id"], match["sender_id"]]:
        raise HTTPException(status_code=403, detail="Acesso negado")
    
    is_active = manager.is_tracking_active(match_id)
    watchers_count = manager.get_active_watchers_count(match_id)
    
    # Get last location
    last_location = await location_tracking_collection.find_one(
        {"match_id": match_id},
        sort=[("timestamp", -1)]
    )
    
    return {
        "match_id": match_id,
        "is_tracking_active": is_active,
        "watchers_count": watchers_count,
        "last_location": {
            "lat": last_location["lat"],
            "lng": last_location["lng"],
            "accuracy": last_location.get("accuracy", 0),
            "speed": last_location.get("speed", 0),
            "timestamp": last_location["timestamp"].isoformat()
        } if last_location else None
    }

@api_router.get("/tracking/{match_id}/history")
async def get_tracking_history(
    match_id: str,
    limit: int = 100,
    user_id: str = Depends(get_current_user_id)
):
    """Get tracking history (route points) for a delivery"""
    match = await matches_collection.find_one({"_id": ObjectId(match_id)})
    if not match:
        raise HTTPException(status_code=404, detail="Combinação não encontrada")
    
    if user_id not in [match["carrier_id"], match["sender_id"]]:
        raise HTTPException(status_code=403, detail="Acesso negado")
    
    # Get route from delivery_routes collection
    route = await delivery_routes_collection.find_one({"match_id": match_id})
    
    if route and route.get("route_points"):
        points = route["route_points"][-limit:]
        return {
            "match_id": match_id,
            "route_points": [
                {"lat": p["lat"], "lng": p["lng"], "timestamp": p.get("timestamp", "").isoformat() if hasattr(p.get("timestamp", ""), "isoformat") else str(p.get("timestamp", ""))}
                for p in points
            ],
            "total_points": len(route["route_points"]),
            "carrier_id": route.get("carrier_id"),
            "created_at": route.get("created_at").isoformat() if route.get("created_at") else None
        }
    
    return {
        "match_id": match_id,
        "route_points": [],
        "total_points": 0
    }

@api_router.post("/tracking/{match_id}/start")
async def start_tracking(
    match_id: str,
    interval_seconds: int = 15,
    user_id: str = Depends(get_current_user_id)
):
    """Start tracking for a delivery (carrier only)"""
    match = await matches_collection.find_one({"_id": ObjectId(match_id)})
    if not match:
        raise HTTPException(status_code=404, detail="Combinação não encontrada")
    
    if user_id != match["carrier_id"]:
        raise HTTPException(status_code=403, detail="Apenas o transportador pode iniciar o rastreamento")
    
    # Check if delivery is in correct status
    if match.get("status") not in ["paid", "in_transit"]:
        raise HTTPException(status_code=400, detail="O rastreamento só pode ser iniciado para entregas pagas ou em trânsito")
    
    # Update match status to in_transit if paid
    if match.get("status") == "paid":
        await matches_collection.update_one(
            {"_id": ObjectId(match_id)},
            {"$set": {"status": "in_transit", "tracking_started_at": datetime.now(timezone.utc)}}
        )
        
        # Notify sender
        await create_notification(
            match["sender_id"],
            NotificationType.DELIVERY_IN_TRANSIT,
            {"route": f"{match.get('origin_city', 'Origem')} → {match.get('destination_city', 'Destino')}"},
            match_id
        )
    
    return {
        "message": "Rastreamento iniciado. Conecte via WebSocket para enviar atualizações.",
        "websocket_url": f"/ws/tracking/{match_id}/carrier",
        "interval_seconds": max(10, min(30, interval_seconds))
    }

@api_router.post("/tracking/{match_id}/stop")
async def stop_tracking(match_id: str, user_id: str = Depends(get_current_user_id)):
    """Stop tracking for a delivery (carrier only)"""
    match = await matches_collection.find_one({"_id": ObjectId(match_id)})
    if not match:
        raise HTTPException(status_code=404, detail="Combinação não encontrada")
    
    if user_id != match["carrier_id"]:
        raise HTTPException(status_code=403, detail="Apenas o transportador pode parar o rastreamento")
    
    # Disconnect carrier if connected
    if manager.is_tracking_active(match_id):
        await manager.disconnect_carrier(user_id, match_id)
    
    return {"message": "Rastreamento parado"}

app.include_router(api_router)

# ============= WEBSOCKET ENDPOINTS =============
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
        
        # Enforce status check (Optimization: Battery & Data)
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

@app.on_event("startup")
async def startup_event():
    await init_indexes()
    logger.info("Levva API started successfully")

@app.on_event("shutdown")
async def shutdown_event():
    logger.info("Levva API shutting down")
