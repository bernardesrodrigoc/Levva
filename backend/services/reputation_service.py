"""
Reputation Service - MVP Implementation
=======================================

Tracks user reputation based on their actions on the platform.

POSITIVE EVENTS:
- Delivery completed: +1 point
- 5-star rating: +0.5 point
- 4-star rating: +0.25 point

NEGATIVE EVENTS:
- Cancellation after payment: -2 points
- Dispute lost: -3 points
- 1-2 star rating: -0.5 point

NEUTRAL EVENTS (Logged only):
- Cancellation before payment
- Automatic expiration
- 3-star rating
"""

from datetime import datetime, timezone
from typing import Optional, Dict, Any
from database import users_collection
from bson import ObjectId
import logging

logger = logging.getLogger(__name__)

# Point values
POINTS = {
    "delivery_completed": 1.0,
    "rating_5_star": 0.5,
    "rating_4_star": 0.25,
    "rating_3_star": 0.0,  # Neutral
    "rating_2_star": -0.25,
    "rating_1_star": -0.5,
    "cancellation_after_payment": -2.0,
    "dispute_lost": -3.0,
    "cancellation_before_payment": 0.0,  # Neutral but logged
    "expiration": 0.0  # Neutral
}


async def record_reputation_event(
    user_id: str,
    event_type: str,
    details: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Record a reputation event for a user.
    
    Args:
        user_id: The user's ID
        event_type: Type of event (see POINTS dict)
        details: Optional details about the event
    
    Returns:
        Updated reputation info
    """
    points = POINTS.get(event_type, 0.0)
    
    event = {
        "type": event_type,
        "points": points,
        "timestamp": datetime.now(timezone.utc),
        "details": details or {}
    }
    
    # Update user's reputation
    result = await users_collection.update_one(
        {"_id": ObjectId(user_id)},
        {
            "$inc": {"reputation_score": points},
            "$push": {
                "reputation_history": {
                    "$each": [event],
                    "$slice": -100  # Keep last 100 events
                }
            }
        }
    )
    
    if result.modified_count > 0:
        logger.info(f"Recorded reputation event for user {user_id}: {event_type} ({points:+.2f})")
    
    return {
        "user_id": user_id,
        "event_type": event_type,
        "points_changed": points,
        "recorded": result.modified_count > 0
    }


async def record_delivery_completed(user_id: str, match_id: str) -> Dict[str, Any]:
    """Record a successful delivery."""
    return await record_reputation_event(
        user_id,
        "delivery_completed",
        {"match_id": match_id}
    )


async def record_rating_received(user_id: str, rating: int, from_user_id: str) -> Dict[str, Any]:
    """Record a rating received."""
    event_type = f"rating_{rating}_star"
    return await record_reputation_event(
        user_id,
        event_type,
        {"from_user_id": from_user_id, "rating": rating}
    )


async def record_cancellation(
    user_id: str,
    entity_type: str,
    entity_id: str,
    after_payment: bool,
    reason: str
) -> Dict[str, Any]:
    """Record a cancellation event."""
    event_type = "cancellation_after_payment" if after_payment else "cancellation_before_payment"
    return await record_reputation_event(
        user_id,
        event_type,
        {
            "entity_type": entity_type,
            "entity_id": entity_id,
            "reason": reason
        }
    )


async def record_dispute_outcome(
    user_id: str,
    dispute_id: str,
    won: bool
) -> Dict[str, Any]:
    """Record dispute outcome."""
    if not won:
        return await record_reputation_event(
            user_id,
            "dispute_lost",
            {"dispute_id": dispute_id}
        )
    return {"user_id": user_id, "event_type": "dispute_won", "points_changed": 0}


async def get_user_reputation(user_id: str) -> Dict[str, Any]:
    """
    Get user's reputation summary.
    """
    user = await users_collection.find_one(
        {"_id": ObjectId(user_id)},
        {"reputation_score": 1, "reputation_history": 1, "rating": 1}
    )
    
    if not user:
        return {"error": "User not found"}
    
    history = user.get("reputation_history", [])
    
    # Calculate stats
    positive_events = sum(1 for e in history if e.get("points", 0) > 0)
    negative_events = sum(1 for e in history if e.get("points", 0) < 0)
    neutral_events = sum(1 for e in history if e.get("points", 0) == 0)
    
    return {
        "user_id": user_id,
        "reputation_score": user.get("reputation_score", 0),
        "rating": user.get("rating", 0),
        "total_events": len(history),
        "positive_events": positive_events,
        "negative_events": negative_events,
        "neutral_events": neutral_events,
        "recent_events": history[-10:] if history else []
    }


def get_reputation_level(score: float) -> str:
    """
    Get reputation level based on score.
    """
    if score >= 50:
        return "excellent"
    elif score >= 20:
        return "good"
    elif score >= 5:
        return "regular"
    elif score >= 0:
        return "new"
    else:
        return "poor"
