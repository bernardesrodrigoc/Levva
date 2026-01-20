"""
Auto-confirmation service for deliveries.

This service handles automatic confirmation of deliveries
after the timeout period (7 days) if sender doesn't confirm or dispute.
"""

from datetime import datetime, timezone
from database import payments_collection, matches_collection, users_collection
from models import PaymentStatus
from bson import ObjectId
import logging

logger = logging.getLogger(__name__)


PLATFORM_FEE_PERCENT = 15


async def process_auto_confirmations():
    """
    Process auto-confirmations for deliveries that exceeded the timeout.
    
    Should be called periodically (e.g., every hour via cron or scheduler).
    """
    now = datetime.now(timezone.utc)
    
    # Find payments where:
    # - Status is DELIVERED_BY_TRANSPORTER
    # - auto_confirm_deadline has passed
    query = {
        "status": PaymentStatus.DELIVERED_BY_TRANSPORTER.value,
        "auto_confirm_deadline": {"$lt": now}
    }
    
    pending_confirmations = await payments_collection.find(query).to_list(100)
    
    confirmed_count = 0
    blocked_count = 0
    
    for payment in pending_confirmations:
        match_id = payment.get("match_id")
        
        try:
            # Get match to find carrier
            match = await matches_collection.find_one({"_id": ObjectId(match_id)})
            if not match:
                logger.warning(f"Match not found for payment {payment['_id']}")
                continue
            
            # Check if carrier has payout method
            carrier = await users_collection.find_one({"_id": ObjectId(match["carrier_id"])})
            has_payout_method = carrier and carrier.get("pix_key")
            
            # Calculate amounts
            total_amount = payment.get("amount", 0)
            platform_fee = round(total_amount * PLATFORM_FEE_PERCENT / 100, 2)
            carrier_amount = round(total_amount - platform_fee, 2)
            
            if has_payout_method:
                new_status = PaymentStatus.PAYOUT_READY.value
                confirmed_count += 1
            else:
                new_status = PaymentStatus.PAYOUT_BLOCKED_NO_PAYOUT_METHOD.value
                blocked_count += 1
            
            # Update payment
            await payments_collection.update_one(
                {"_id": payment["_id"]},
                {
                    "$set": {
                        "status": new_status,
                        "confirmed_at": now,
                        "confirmation_type": "auto_timeout",
                        "platform_fee": platform_fee,
                        "carrier_amount": carrier_amount,
                        "has_payout_method": has_payout_method
                    }
                }
            )
            
            # Update match
            await matches_collection.update_one(
                {"_id": ObjectId(match_id)},
                {"$set": {"status": "completed", "confirmed_at": now, "auto_confirmed": True}}
            )
            
            logger.info(f"Auto-confirmed payment {payment['_id']} -> {new_status}")
            
        except Exception as e:
            logger.error(f"Error processing auto-confirmation for payment {payment['_id']}: {e}")
    
    return {
        "processed": len(pending_confirmations),
        "confirmed": confirmed_count,
        "blocked": blocked_count
    }


# Endpoint to trigger manually (for testing or cron)
async def run_auto_confirmation_job():
    """Run the auto-confirmation job and return results."""
    result = await process_auto_confirmations()
    return result
