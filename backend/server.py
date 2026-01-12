from fastapi import FastAPI, APIRouter, Depends, HTTPException, Header
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
    messages_collection, init_indexes
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
    get_current_user_id
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
        raise HTTPException(status_code=400, detail="Email j\u00e1 cadastrado")
    
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
        raise HTTPException(status_code=401, detail="Credenciais inv\u00e1lidas")
    
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
        raise HTTPException(status_code=404, detail="Usu\u00e1rio n\u00e3o encontrado")
    
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
    
    trip_doc = {
        "carrier_id": user_id,
        "carrier_name": user["name"],
        "carrier_rating": user.get("rating", 0.0),
        **trip_data.model_dump(),
        "status": TripStatus.PUBLISHED,
        "created_at": datetime.now(timezone.utc)
    }
    
    result = await trips_collection.insert_one(trip_doc)
    trip_doc["id"] = str(result.inserted_id)
    
    return trip_doc

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
    
    return trips

@api_router.get("/trips/my-trips")
async def get_my_trips(user_id: str = Depends(get_current_user_id)):
    trips = await trips_collection.find({"carrier_id": user_id}).to_list(100)
    
    for trip in trips:
        trip["id"] = str(trip.pop("_id"))
    
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
    Get smart match suggestions based on route overlap, capacity, and timing.
    Returns trips that could carry user's shipments OR shipments that match user's trips.
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
    
    # For each shipment, find matching trips from other users
    for shipment in user_shipments:
        matching_trips = await trips_collection.find({
            "carrier_id": {"$ne": user_id},
            "status": "published",
            "origin.city": shipment["origin"]["city"],
            "destination.city": shipment["destination"]["city"],
            "available_capacity_kg": {"$gte": shipment["package"]["weight_kg"]}
        }).to_list(10)
        
        for trip in matching_trips:
            carrier = await users_collection.find_one({"_id": ObjectId(trip["carrier_id"])})
            price_per_kg = trip.get("price_per_kg") or 5.0
            estimated_price = shipment["package"]["weight_kg"] * price_per_kg
            
            suggestions.append({
                "type": "trip_for_shipment",
                "shipment_id": str(shipment["_id"]),
                "shipment_description": shipment.get("description", "Envio"),
                "trip_id": str(trip["_id"]),
                "carrier_name": carrier["name"] if carrier else "Transportador",
                "carrier_rating": carrier.get("rating", 0) if carrier else 0,
                "origin": shipment["origin"]["city"],
                "destination": shipment["destination"]["city"],
                "departure_time": trip.get("departure_time"),
                "estimated_price": estimated_price,
                "match_score": calculate_match_score(shipment, trip, carrier)
            })
    
    # For each trip, find matching shipments from other users
    for trip in user_trips:
        matching_shipments = await shipments_collection.find({
            "sender_id": {"$ne": user_id},
            "status": "published",
            "origin.city": trip["origin"]["city"],
            "destination.city": trip["destination"]["city"],
            "package.weight_kg": {"$lte": trip.get("available_capacity_kg", 50)}
        }).to_list(10)
        
        for shipment in matching_shipments:
            sender = await users_collection.find_one({"_id": ObjectId(shipment["sender_id"])})
            price_per_kg = trip.get("price_per_kg") or 5.0
            estimated_price = shipment["package"]["weight_kg"] * price_per_kg
            
            suggestions.append({
                "type": "shipment_for_trip",
                "trip_id": str(trip["_id"]),
                "shipment_id": str(shipment["_id"]),
                "shipment_description": shipment.get("description", "Envio"),
                "sender_name": sender["name"] if sender else "Remetente",
                "sender_rating": sender.get("rating", 0) if sender else 0,
                "origin": trip["origin"]["city"],
                "destination": trip["destination"]["city"],
                "departure_time": trip.get("departure_time"),
                "weight_kg": shipment["package"]["weight_kg"],
                "estimated_price": estimated_price,
                "match_score": calculate_match_score(shipment, trip, sender)
            })
    
    # Sort by match score (highest first)
    suggestions.sort(key=lambda x: x["match_score"], reverse=True)
    
    return suggestions[:20]  # Return top 20 suggestions

def calculate_match_score(shipment, trip, other_user):
    """Calculate a match score based on various factors"""
    score = 50  # Base score
    
    # Rating bonus (up to 25 points)
    if other_user:
        score += min(other_user.get("rating", 0) * 5, 25)
    
    # Trust level bonus (up to 15 points)
    if other_user:
        trust_levels = {"level_1": 5, "level_2": 10, "level_3": 15}
        score += trust_levels.get(other_user.get("trust_level", "level_1"), 5)
    
    # Capacity match bonus (up to 10 points)
    weight = shipment["package"]["weight_kg"]
    capacity = trip.get("available_capacity_kg", 50)
    if weight <= capacity * 0.5:
        score += 10  # Perfect fit
    elif weight <= capacity * 0.8:
        score += 5
    
    return min(score, 100)

@api_router.post("/matches/create")
async def create_match(
    trip_id: str,
    shipment_id: str,
    user_id: str = Depends(get_current_user_id)
):
    trip = await trips_collection.find_one({"_id": ObjectId(trip_id)})
    shipment = await shipments_collection.find_one({"_id": ObjectId(shipment_id)})
    
    if not trip or not shipment:
        raise HTTPException(status_code=404, detail="Viagem ou envio n\u00e3o encontrado")
    
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
        raise HTTPException(status_code=404, detail="Combina\u00e7\u00e3o n\u00e3o encontrada")
    
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
        raise HTTPException(status_code=404, detail="Combina\u00e7\u00e3o n\u00e3o encontrada")
    
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
        raise HTTPException(status_code=404, detail="Combina\u00e7\u00e3o n\u00e3o encontrada")
    
    # Check if user is part of this match
    if user_id not in [match["carrier_id"], match["sender_id"]]:
        raise HTTPException(status_code=403, detail="Voc\u00ea n\u00e3o pode avaliar esta transa\u00e7\u00e3o")
    
    # Check if rating already exists
    existing = await ratings_collection.find_one({
        "match_id": rating_data.match_id,
        "rater_id": user_id
    })
    
    if existing:
        raise HTTPException(status_code=400, detail="Voc\u00ea j\u00e1 avaliou esta transa\u00e7\u00e3o")
    
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
    
    return {"message": "Avalia\u00e7\u00e3o criada com sucesso"}

@api_router.get("/ratings/{user_id}")
async def get_user_ratings(user_id: str):
    ratings = await ratings_collection.find({"rated_user_id": user_id}).to_list(100)
    
    for rating in ratings:
        rating["id"] = str(rating.pop("_id"))
    
    return ratings

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

app.include_router(api_router)

@app.on_event("startup")
async def startup_event():
    await init_indexes()
    logger.info("Levva API started successfully")

@app.on_event("shutdown")
async def shutdown_event():
    logger.info("Levva API shutting down")
