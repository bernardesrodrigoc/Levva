from pydantic import BaseModel, Field, EmailStr, validator
from typing import Optional, List
from datetime import datetime
from enum import Enum

class UserRole(str, Enum):
    SENDER = "sender"
    CARRIER = "carrier"
    BOTH = "both"
    ADMIN = "admin"

class TrustLevel(str, Enum):
    LEVEL_1 = "level_1"
    LEVEL_2 = "level_2"
    LEVEL_3 = "level_3"
    LEVEL_4 = "level_4"
    LEVEL_5 = "level_5"

class VerificationStatus(str, Enum):
    PENDING = "pending"
    VERIFIED = "verified"
    REJECTED = "rejected"

class VehicleType(str, Enum):
    MOTORCYCLE = "motorcycle"
    CAR = "car"
    PICKUP = "pickup"
    VAN = "van"

class ShipmentStatus(str, Enum):
    DRAFT = "draft"
    PUBLISHED = "published"
    MATCHED = "matched"
    IN_TRANSIT = "in_transit"
    DELIVERED = "delivered"
    CANCELLED = "cancelled"

class TripStatus(str, Enum):
    PUBLISHED = "published"
    MATCHED = "matched"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    CANCELLED = "cancelled"

class PaymentStatus(str, Enum):
    PENDING = "pending"
    PAID = "paid"
    ESCROWED = "escrowed"
    RELEASED = "released"
    REFUNDED = "refunded"

# User Models
class UserRegister(BaseModel):
    email: EmailStr
    password: str
    name: str
    phone: str
    role: UserRole = UserRole.BOTH

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserResponse(BaseModel):
    id: str
    email: str
    name: str
    phone: str
    role: UserRole
    trust_level: TrustLevel
    verification_status: VerificationStatus
    profile_photo_url: Optional[str] = None
    rating: float = 0.0
    total_deliveries: int = 0
    created_at: datetime

# Trip Models
class LocationData(BaseModel):
    city: str
    state: str
    address: Optional[str] = None
    lat: float
    lng: float

class CargoSpace(BaseModel):
    volume_m3: float
    max_weight_kg: float

class TripCreate(BaseModel):
    origin: LocationData
    destination: LocationData
    departure_date: datetime
    vehicle_type: VehicleType
    cargo_space: CargoSpace
    corridor_radius_km: float = 10.0  # Default 10km corridor
    price_per_kg: Optional[float] = None

class TripResponse(BaseModel):
    id: str
    carrier_id: str
    carrier_name: str
    carrier_rating: float
    origin: LocationData
    destination: LocationData
    departure_date: datetime
    vehicle_type: VehicleType
    cargo_space: CargoSpace
    corridor_radius_km: float
    route_polyline: Optional[List[List[float]]] = None  # [[lat, lng], ...]
    price_per_kg: Optional[float]
    status: TripStatus
    created_at: datetime

# Shipment Models
class PackageDetails(BaseModel):
    length_cm: float
    width_cm: float
    height_cm: float
    weight_kg: float
    category: str
    description: str

class ShipmentPhotos(BaseModel):
    item_visible: str
    packaging_open: str
    packaging_sealed: str

class ShipmentCreate(BaseModel):
    origin: LocationData
    destination: LocationData
    package: PackageDetails
    declared_value: float
    photos: ShipmentPhotos
    legal_acceptance: bool = True
    pickup_date: Optional[datetime] = None

    @validator('legal_acceptance')
    def validate_legal_acceptance(cls, v):
        if not v:
            raise ValueError('Você deve aceitar a responsabilidade legal pelo conteúdo')
        return v

class ShipmentResponse(BaseModel):
    id: str
    sender_id: str
    sender_name: str
    sender_rating: float
    origin: LocationData
    destination: LocationData
    package: PackageDetails
    declared_value: float
    photos: ShipmentPhotos
    status: ShipmentStatus
    created_at: datetime

# Match Models
class MatchResponse(BaseModel):
    id: str
    trip_id: str
    shipment_id: str
    carrier_id: str
    sender_id: str
    estimated_price: float
    platform_commission: float
    carrier_earnings: float
    status: str
    pickup_confirmed_at: Optional[datetime] = None
    delivery_confirmed_at: Optional[datetime] = None
    created_at: datetime

# Payment Models
class PaymentInitiate(BaseModel):
    match_id: str
    amount: float

class PaymentResponse(BaseModel):
    id: str
    match_id: str
    amount: float
    status: PaymentStatus
    mercadopago_preference_id: Optional[str]
    created_at: datetime

# Rating Models
class RatingCreate(BaseModel):
    match_id: str
    rated_user_id: str
    rating: int = Field(ge=1, le=5)
    comment: Optional[str] = None

    @validator('rating')
    def validate_rating(cls, v):
        if v < 1 or v > 5:
            raise ValueError('Avaliação deve estar entre 1 e 5')
        return v

class RatingResponse(BaseModel):
    id: str
    match_id: str
    rater_id: str
    rater_name: str
    rated_user_id: str
    rating: int
    comment: Optional[str]
    created_at: datetime

# Upload Models
class UploadInitiate(BaseModel):
    file_type: str
    content_type: str

class UploadResponse(BaseModel):
    presigned_url: str
    file_key: str
    upload_id: str

# Admin Models
class AdminStats(BaseModel):
    total_users: int
    active_trips: int
    active_shipments: int
    total_matches: int
    pending_verifications: int
    flagged_items: int

class FlagCreate(BaseModel):
    entity_type: str
    entity_id: str
    reason: str
    description: str

class DisputeCreate(BaseModel):
    match_id: str
    reason: str
    description: str
    evidence_urls: List[str] = []