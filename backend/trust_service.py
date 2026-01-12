"""
Trust Level Service - Manages progressive trust levels for users.

Trust Levels:
- Level 1: New user (unverified) - Max R$100 shipment value
- Level 2: Verified identity - Max R$500 shipment value  
- Level 3: 5+ successful deliveries - Max R$2000 shipment value
- Level 4: 20+ successful deliveries, rating >= 4.5 - Max R$5000 shipment value
- Level 5: 50+ successful deliveries, rating >= 4.8 - Unlimited value
"""

from models import TrustLevel, VerificationStatus

# Trust level configurations
TRUST_LEVEL_CONFIG = {
    TrustLevel.LEVEL_1: {
        "name": "Iniciante",
        "description": "Conta nova - verificação pendente",
        "max_shipment_value": 100.0,
        "max_weight_kg": 5.0,
        "can_create_trips": False,
        "can_create_shipments": True,
        "min_deliveries": 0,
        "min_rating": 0.0,
        "badge_color": "gray"
    },
    TrustLevel.LEVEL_2: {
        "name": "Verificado",
        "description": "Identidade verificada",
        "max_shipment_value": 500.0,
        "max_weight_kg": 20.0,
        "can_create_trips": True,
        "can_create_shipments": True,
        "min_deliveries": 0,
        "min_rating": 0.0,
        "badge_color": "blue"
    },
    TrustLevel.LEVEL_3: {
        "name": "Confiável",
        "description": "5+ entregas bem-sucedidas",
        "max_shipment_value": 2000.0,
        "max_weight_kg": 50.0,
        "can_create_trips": True,
        "can_create_shipments": True,
        "min_deliveries": 5,
        "min_rating": 3.5,
        "badge_color": "green"
    },
    TrustLevel.LEVEL_4: {
        "name": "Experiente",
        "description": "20+ entregas, avaliação ≥ 4.5",
        "max_shipment_value": 5000.0,
        "max_weight_kg": 100.0,
        "can_create_trips": True,
        "can_create_shipments": True,
        "min_deliveries": 20,
        "min_rating": 4.5,
        "badge_color": "purple"
    },
    TrustLevel.LEVEL_5: {
        "name": "Elite",
        "description": "50+ entregas, avaliação ≥ 4.8",
        "max_shipment_value": float('inf'),
        "max_weight_kg": float('inf'),
        "can_create_trips": True,
        "can_create_shipments": True,
        "min_deliveries": 50,
        "min_rating": 4.8,
        "badge_color": "gold"
    }
}


def get_trust_level_config(level: TrustLevel) -> dict:
    """Get configuration for a trust level"""
    return TRUST_LEVEL_CONFIG.get(level, TRUST_LEVEL_CONFIG[TrustLevel.LEVEL_1])


def calculate_trust_level(
    verification_status: str,
    total_deliveries: int,
    rating: float
) -> TrustLevel:
    """
    Calculate the appropriate trust level based on user stats.
    """
    # Must be verified to be above level 1
    if verification_status != VerificationStatus.VERIFIED:
        return TrustLevel.LEVEL_1
    
    # Check from highest to lowest level
    if total_deliveries >= 50 and rating >= 4.8:
        return TrustLevel.LEVEL_5
    elif total_deliveries >= 20 and rating >= 4.5:
        return TrustLevel.LEVEL_4
    elif total_deliveries >= 5 and rating >= 3.5:
        return TrustLevel.LEVEL_3
    else:
        return TrustLevel.LEVEL_2


def check_shipment_allowed(
    trust_level: TrustLevel,
    shipment_value: float,
    weight_kg: float
) -> tuple[bool, str]:
    """
    Check if a shipment is allowed based on user's trust level.
    Returns (allowed, reason).
    """
    config = get_trust_level_config(trust_level)
    
    if shipment_value > config["max_shipment_value"]:
        return (
            False, 
            f"Seu nível de confiança ({config['name']}) permite envios de até R${config['max_shipment_value']:.2f}. "
            f"Complete mais entregas para aumentar seu limite."
        )
    
    if weight_kg > config["max_weight_kg"]:
        return (
            False,
            f"Seu nível de confiança ({config['name']}) permite envios de até {config['max_weight_kg']}kg. "
            f"Complete mais entregas para aumentar seu limite."
        )
    
    return (True, "")


def check_trip_allowed(trust_level: TrustLevel) -> tuple[bool, str]:
    """
    Check if user can create trips based on trust level.
    Returns (allowed, reason).
    """
    config = get_trust_level_config(trust_level)
    
    if not config["can_create_trips"]:
        return (
            False,
            "Você precisa verificar sua identidade antes de criar viagens."
        )
    
    return (True, "")


def get_next_level_requirements(current_level: TrustLevel, current_deliveries: int, current_rating: float) -> dict:
    """
    Get requirements to reach the next trust level.
    """
    levels = list(TrustLevel)
    current_idx = levels.index(current_level)
    
    if current_idx >= len(levels) - 1:
        return {
            "at_max_level": True,
            "message": "Você já está no nível máximo!"
        }
    
    next_level = levels[current_idx + 1]
    next_config = get_trust_level_config(next_level)
    
    deliveries_needed = max(0, next_config["min_deliveries"] - current_deliveries)
    rating_needed = next_config["min_rating"]
    
    requirements = []
    if deliveries_needed > 0:
        requirements.append(f"{deliveries_needed} entregas restantes")
    if current_rating < rating_needed:
        requirements.append(f"Avaliação mínima: {rating_needed}")
    
    return {
        "at_max_level": False,
        "next_level": next_level.value,
        "next_level_name": next_config["name"],
        "deliveries_needed": deliveries_needed,
        "rating_needed": rating_needed,
        "current_deliveries": current_deliveries,
        "current_rating": current_rating,
        "requirements": requirements,
        "benefits": {
            "max_shipment_value": next_config["max_shipment_value"],
            "max_weight_kg": next_config["max_weight_kg"]
        }
    }
