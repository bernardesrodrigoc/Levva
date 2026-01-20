"""
Expiration Service - Automatic timeout handling
==============================================

Handles automatic expiration of entities based on business rules:
- Match: PENDING_PAYMENT → EXPIRED after 48 hours
- Trip: PUBLISHED → EXPIRED after departure date + 24h
- Shipment: PUBLISHED → EXPIRED after 30 days

This service should be run periodically (e.g., every hour via cron/scheduler).
"""

from datetime import datetime, timezone, timedelta
from typing import Dict, List, Any
from database import (
    matches_collection, trips_collection, shipments_collection
)
from models import MatchStatus, TripStatus, ShipmentStatus
import logging

logger = logging.getLogger(__name__)

# Timeout configurations
MATCH_PAYMENT_TIMEOUT_HOURS = 48
TRIP_POST_DEPARTURE_TIMEOUT_HOURS = 24
SHIPMENT_PUBLISHED_TIMEOUT_DAYS = 30


async def expire_pending_payment_matches() -> Dict[str, Any]:
    """
    Expire matches that have been waiting for payment for too long.
    
    Rule: PENDING_PAYMENT → EXPIRED after 48 hours
    """
    cutoff_time = datetime.now(timezone.utc) - timedelta(hours=MATCH_PAYMENT_TIMEOUT_HOURS)
    
    # Find matches pending payment that are past the cutoff
    result = await matches_collection.update_many(
        {
            "status": "pending_payment",
            "created_at": {"$lt": cutoff_time}
        },
        {
            "$set": {
                "status": MatchStatus.EXPIRED.value,
                "expired_at": datetime.now(timezone.utc),
                "expiration_reason": "payment_timeout"
            }
        }
    )
    
    if result.modified_count > 0:
        logger.info(f"Expired {result.modified_count} matches due to payment timeout")
        
        # Also update corresponding shipments back to PUBLISHED
        expired_matches = await matches_collection.find(
            {"status": MatchStatus.EXPIRED.value, "expiration_reason": "payment_timeout"}
        ).to_list(length=None)
        
        for match in expired_matches:
            await shipments_collection.update_one(
                {"_id": match["shipment_id"]},
                {"$set": {"status": ShipmentStatus.PUBLISHED.value}}
            )
    
    return {
        "type": "match_payment_timeout",
        "expired_count": result.modified_count
    }


async def expire_past_trips() -> Dict[str, Any]:
    """
    Expire trips that are past their departure date without activity.
    
    Rule: PUBLISHED trip → EXPIRED 24 hours after departure_date
    """
    cutoff_time = datetime.now(timezone.utc) - timedelta(hours=TRIP_POST_DEPARTURE_TIMEOUT_HOURS)
    
    result = await trips_collection.update_many(
        {
            "status": TripStatus.PUBLISHED.value,
            "departure_date": {"$lt": cutoff_time}
        },
        {
            "$set": {
                "status": TripStatus.EXPIRED.value,
                "expired_at": datetime.now(timezone.utc),
                "expiration_reason": "past_departure_date"
            }
        }
    )
    
    if result.modified_count > 0:
        logger.info(f"Expired {result.modified_count} trips past departure date")
    
    return {
        "type": "trip_past_departure",
        "expired_count": result.modified_count
    }


async def expire_old_shipments() -> Dict[str, Any]:
    """
    Expire shipments that have been published for too long without a match.
    
    Rule: PUBLISHED shipment → EXPIRED after 30 days
    """
    cutoff_time = datetime.now(timezone.utc) - timedelta(days=SHIPMENT_PUBLISHED_TIMEOUT_DAYS)
    
    result = await shipments_collection.update_many(
        {
            "status": ShipmentStatus.PUBLISHED.value,
            "created_at": {"$lt": cutoff_time}
        },
        {
            "$set": {
                "status": ShipmentStatus.EXPIRED.value,
                "expired_at": datetime.now(timezone.utc),
                "expiration_reason": "no_match_timeout"
            }
        }
    )
    
    if result.modified_count > 0:
        logger.info(f"Expired {result.modified_count} shipments due to age")
    
    return {
        "type": "shipment_age_timeout",
        "expired_count": result.modified_count
    }


async def run_all_expirations() -> Dict[str, Any]:
    """
    Run all expiration checks.
    
    Should be called periodically (e.g., every hour).
    """
    results = {
        "executed_at": datetime.now(timezone.utc).isoformat(),
        "expirations": []
    }
    
    # Run all expiration checks
    results["expirations"].append(await expire_pending_payment_matches())
    results["expirations"].append(await expire_past_trips())
    results["expirations"].append(await expire_old_shipments())
    
    total_expired = sum(r["expired_count"] for r in results["expirations"])
    results["total_expired"] = total_expired
    
    logger.info(f"Expiration run complete. Total expired: {total_expired}")
    
    return results


# ============================================================
# HELPER FUNCTIONS FOR STATUS CHECKS
# ============================================================

def is_active_status(status: str, entity_type: str) -> bool:
    """
    Check if a status is considered "active" (not in history).
    """
    history_statuses = {
        "shipment": [
            ShipmentStatus.DELIVERED.value,
            ShipmentStatus.CANCELLED.value,
            ShipmentStatus.CANCELLED_BY_SENDER.value,
            ShipmentStatus.CANCELLED_BY_CARRIER.value,
            ShipmentStatus.EXPIRED.value
        ],
        "trip": [
            TripStatus.COMPLETED.value,
            TripStatus.CANCELLED.value,
            TripStatus.CANCELLED_BY_CARRIER.value,
            TripStatus.EXPIRED.value
        ],
        "match": [
            MatchStatus.DELIVERED.value,
            MatchStatus.COMPLETED.value,
            MatchStatus.CANCELLED.value,
            MatchStatus.CANCELLED_BY_SENDER.value,
            MatchStatus.CANCELLED_BY_CARRIER.value,
            MatchStatus.EXPIRED.value,
            MatchStatus.DISPUTED.value
        ]
    }
    
    return status not in history_statuses.get(entity_type, [])


def get_active_statuses(entity_type: str) -> List[str]:
    """
    Get list of active statuses for an entity type.
    """
    active_statuses = {
        "shipment": [
            ShipmentStatus.DRAFT.value,
            ShipmentStatus.PUBLISHED.value,
            ShipmentStatus.MATCHED.value,
            ShipmentStatus.IN_TRANSIT.value
        ],
        "trip": [
            TripStatus.DRAFT.value,
            TripStatus.PUBLISHED.value,
            TripStatus.MATCHED.value,
            TripStatus.IN_PROGRESS.value
        ],
        "match": [
            MatchStatus.PENDING_PAYMENT.value,
            MatchStatus.PAID.value,
            MatchStatus.IN_TRANSIT.value
        ]
    }
    
    return active_statuses.get(entity_type, [])


def get_history_statuses(entity_type: str) -> List[str]:
    """
    Get list of history statuses for an entity type.
    """
    history_statuses = {
        "shipment": [
            ShipmentStatus.DELIVERED.value,
            ShipmentStatus.CANCELLED.value,
            ShipmentStatus.CANCELLED_BY_SENDER.value,
            ShipmentStatus.CANCELLED_BY_CARRIER.value,
            ShipmentStatus.EXPIRED.value
        ],
        "trip": [
            TripStatus.COMPLETED.value,
            TripStatus.CANCELLED.value,
            TripStatus.CANCELLED_BY_CARRIER.value,
            TripStatus.EXPIRED.value
        ],
        "match": [
            MatchStatus.DELIVERED.value,
            MatchStatus.COMPLETED.value,
            MatchStatus.CANCELLED.value,
            MatchStatus.CANCELLED_BY_SENDER.value,
            MatchStatus.CANCELLED_BY_CARRIER.value,
            MatchStatus.EXPIRED.value,
            MatchStatus.DISPUTED.value
        ]
    }
    
    return history_statuses.get(entity_type, [])
