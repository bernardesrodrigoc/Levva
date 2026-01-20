"""Payment routes."""
from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime, timezone
from bson import ObjectId
import os
import logging

try:
    import mercadopago
except ImportError:
    mercadopago = None

from database import matches_collection, payments_collection
from models import PaymentInitiate, PaymentStatus
from auth import get_current_user_id
from core.config import settings

logger = logging.getLogger(__name__)
router = APIRouter()

# Initialize Mercado Pago SDK
mp_sdk = None
if mercadopago and settings.mercadopago_access_token:
    mp_sdk = mercadopago.SDK(settings.mercadopago_access_token)


@router.post("/initiate")
async def initiate_payment(payment_data: PaymentInitiate, user_id: str = Depends(get_current_user_id)):
    """Initiate payment for a match."""
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
                    "success": settings.frontend_url + "/payment/success",
                    "failure": settings.frontend_url + "/payment/failure",
                    "pending": settings.frontend_url + "/payment/pending"
                },
                "auto_return": "approved"
            }
            
            preference = mp_sdk.preference().create(preference_data)
            payment_doc["mercadopago_preference_id"] = preference["response"]["id"]
            payment_doc["checkout_url"] = preference["response"]["init_point"]
        except Exception as e:
            logger.error(f"Erro ao criar preferência Mercado Pago: {e}")
    
    result = await payments_collection.insert_one(payment_doc)
    
    return {
        "id": str(result.inserted_id),
        "match_id": payment_data.match_id,
        "amount": payment_data.amount,
        "status": payment_doc["status"].value if hasattr(payment_doc["status"], 'value') else str(payment_doc["status"]),
        "checkout_url": payment_doc.get("checkout_url"),
        "mercadopago_preference_id": payment_doc.get("mercadopago_preference_id")
    }


@router.get("/{match_id}/status")
async def get_payment_status(match_id: str, user_id: str = Depends(get_current_user_id)):
    """Get payment status for a match."""
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


@router.post("/webhook")
async def mercadopago_webhook(data: dict):
    """Handle Mercado Pago webhook notifications."""
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


# ============ Delivery & Payout Flow ============

from pydantic import BaseModel, Field
from typing import Optional
from datetime import timedelta


class DeliveryConfirmationRequest(BaseModel):
    notes: Optional[str] = None


class DisputeRequest(BaseModel):
    reason: str
    details: Optional[str] = None


# Auto-confirmation timeout (7 days)
AUTO_CONFIRM_DAYS = 7
PLATFORM_FEE_PERCENT = 15  # 15% platform fee


@router.post("/{match_id}/mark-delivered")
async def mark_delivered(match_id: str, user_id: str = Depends(get_current_user_id)):
    """
    Transporter marks shipment as delivered.
    - Changes payment status to DELIVERED_BY_TRANSPORTER
    - Starts 7-day confirmation countdown
    """
    match = await matches_collection.find_one({"_id": ObjectId(match_id)})
    if not match:
        raise HTTPException(status_code=404, detail="Match não encontrado")
    
    if match["carrier_id"] != user_id:
        raise HTTPException(status_code=403, detail="Apenas o transportador pode marcar como entregue")
    
    payment = await payments_collection.find_one({"match_id": match_id})
    if not payment:
        raise HTTPException(status_code=400, detail="Pagamento não encontrado")
    
    current_status = str(payment.get("status", ""))
    if current_status not in ["paid_escrow", "escrowed", "paid", PaymentStatus.PAID_ESCROW.value]:
        raise HTTPException(status_code=400, detail=f"Pagamento não está em escrow. Status atual: {current_status}")
    
    now = datetime.now(timezone.utc)
    auto_confirm_deadline = now + timedelta(days=AUTO_CONFIRM_DAYS)
    
    await payments_collection.update_one(
        {"match_id": match_id},
        {
            "$set": {
                "status": PaymentStatus.DELIVERED_BY_TRANSPORTER.value,
                "delivered_at": now,
                "auto_confirm_deadline": auto_confirm_deadline,
                "delivered_by": user_id
            }
        }
    )
    
    await matches_collection.update_one(
        {"_id": ObjectId(match_id)},
        {"$set": {"status": "delivered", "delivered_at": now}}
    )
    
    return {
        "message": "Entrega marcada com sucesso",
        "status": PaymentStatus.DELIVERED_BY_TRANSPORTER.value,
        "auto_confirm_deadline": auto_confirm_deadline.isoformat()
    }


@router.post("/{match_id}/confirm-delivery")
async def confirm_delivery(
    match_id: str, 
    confirmation: DeliveryConfirmationRequest,
    user_id: str = Depends(get_current_user_id)
):
    """
    Sender confirms delivery.
    - Changes status to CONFIRMED_BY_SENDER
    - Then to PAYOUT_READY (if transporter has payout method)
    """
    from database import users_collection
    
    match = await matches_collection.find_one({"_id": ObjectId(match_id)})
    if not match:
        raise HTTPException(status_code=404, detail="Match não encontrado")
    
    if match["sender_id"] != user_id:
        raise HTTPException(status_code=403, detail="Apenas o remetente pode confirmar entrega")
    
    payment = await payments_collection.find_one({"match_id": match_id})
    if not payment:
        raise HTTPException(status_code=400, detail="Pagamento não encontrado")
    
    current_status = str(payment.get("status", ""))
    if current_status != PaymentStatus.DELIVERED_BY_TRANSPORTER.value:
        raise HTTPException(status_code=400, detail=f"Entrega ainda não foi marcada pelo transportador")
    
    now = datetime.now(timezone.utc)
    
    # Check if transporter has payout method
    carrier = await users_collection.find_one({"_id": ObjectId(match["carrier_id"])})
    has_payout_method = carrier and carrier.get("pix_key")
    
    # Calculate payout amounts
    total_amount = payment.get("amount", 0)
    platform_fee = round(total_amount * PLATFORM_FEE_PERCENT / 100, 2)
    carrier_amount = round(total_amount - platform_fee, 2)
    
    if has_payout_method:
        new_status = PaymentStatus.PAYOUT_READY.value
    else:
        new_status = PaymentStatus.PAYOUT_BLOCKED_NO_PAYOUT_METHOD.value
    
    await payments_collection.update_one(
        {"match_id": match_id},
        {
            "$set": {
                "status": new_status,
                "confirmed_at": now,
                "confirmed_by": user_id,
                "confirmation_type": "manual",
                "confirmation_notes": confirmation.notes,
                "platform_fee": platform_fee,
                "carrier_amount": carrier_amount,
                "has_payout_method": has_payout_method
            }
        }
    )
    
    await matches_collection.update_one(
        {"_id": ObjectId(match_id)},
        {"$set": {"status": "completed", "confirmed_at": now}}
    )
    
    # ============================================================
    # UPDATE SHIPMENT AND TRIP STATUS TO HISTORY
    # When match is completed, both entities move to history
    # ============================================================
    from database import shipments_collection, trips_collection
    from models import ShipmentStatus, TripStatus
    
    # Update shipment to "delivered"
    await shipments_collection.update_one(
        {"_id": ObjectId(match["shipment_id"])},
        {"$set": {
            "status": ShipmentStatus.DELIVERED.value,
            "delivered_at": now
        }}
    )
    
    # Update trip to "completed" 
    await trips_collection.update_one(
        {"_id": ObjectId(match["trip_id"])},
        {"$set": {
            "status": TripStatus.COMPLETED.value,
            "completed_at": now
        }}
    )
    
    # Update reputation
    try:
        from services.reputation_service import record_delivery_completed
        await record_delivery_completed(match["sender_id"], match["carrier_id"], match_id)
    except Exception as e:
        logger.warning(f"Failed to update reputation: {e}")
    
    # ============================================================
    # CREATE PAYOUT RECORD
    # ============================================================
    try:
        from services.payout_service import get_payout_service
        from payout_models import PayoutCreate, PayoutTrigger
        
        payout_service = get_payout_service()
        payout_data = PayoutCreate(
            match_id=match_id,
            payment_id=str(payment["_id"]),
            carrier_id=match["carrier_id"],
            sender_id=match["sender_id"],
            gross_amount=total_amount,
            platform_fee=platform_fee,
            net_amount=carrier_amount,
            delivery_confirmed_at=now,
            trigger=PayoutTrigger.SENDER_CONFIRMED
        )
        payout_id = await payout_service.create_payout(payout_data)
        logger.info(f"Created payout {payout_id} for match {match_id}")
    except Exception as e:
        logger.error(f"Failed to create payout record: {e}")
    
    return {
        "message": "Entrega confirmada com sucesso!",
        "status": new_status,
        "total_amount": total_amount,
        "platform_fee": platform_fee,
        "carrier_amount": carrier_amount,
        "payout_blocked": not has_payout_method
    }


@router.post("/{match_id}/open-dispute")
async def open_dispute(
    match_id: str,
    dispute: DisputeRequest,
    user_id: str = Depends(get_current_user_id)
):
    """
    Sender opens a dispute instead of confirming delivery.
    """
    from database import disputes_collection
    
    match = await matches_collection.find_one({"_id": ObjectId(match_id)})
    if not match:
        raise HTTPException(status_code=404, detail="Match não encontrado")
    
    if match["sender_id"] != user_id:
        raise HTTPException(status_code=403, detail="Apenas o remetente pode abrir disputa")
    
    payment = await payments_collection.find_one({"match_id": match_id})
    if not payment:
        raise HTTPException(status_code=400, detail="Pagamento não encontrado")
    
    now = datetime.now(timezone.utc)
    
    # Create dispute record
    dispute_doc = {
        "match_id": match_id,
        "payment_id": str(payment["_id"]),
        "opened_by": user_id,
        "reason": dispute.reason,
        "details": dispute.details,
        "status": "open",
        "created_at": now
    }
    
    await disputes_collection.insert_one(dispute_doc)
    
    await payments_collection.update_one(
        {"match_id": match_id},
        {
            "$set": {
                "status": PaymentStatus.DISPUTE_OPENED.value,
                "dispute_opened_at": now,
                "dispute_reason": dispute.reason
            }
        }
    )
    
    await matches_collection.update_one(
        {"_id": ObjectId(match_id)},
        {"$set": {"status": "disputed"}}
    )
    
    return {
        "message": "Disputa aberta. Nossa equipe irá analisar.",
        "status": PaymentStatus.DISPUTE_OPENED.value
    }


@router.get("/{match_id}/delivery-status")
async def get_delivery_status(match_id: str, user_id: str = Depends(get_current_user_id)):
    """
    Get delivery and payout status for a match.
    """
    payment = await payments_collection.find_one({"match_id": match_id})
    if not payment:
        return {"status": "not_found"}
    
    now = datetime.now(timezone.utc)
    auto_confirm_deadline = payment.get("auto_confirm_deadline")
    
    time_remaining = None
    if auto_confirm_deadline:
        # Ensure timezone-aware comparison
        if auto_confirm_deadline.tzinfo is None:
            auto_confirm_deadline = auto_confirm_deadline.replace(tzinfo=timezone.utc)
        remaining = auto_confirm_deadline - now
        if remaining.total_seconds() > 0:
            time_remaining = {
                "days": remaining.days,
                "hours": remaining.seconds // 3600
            }
    
    return {
        "match_id": match_id,
        "status": str(payment.get("status")),
        "amount": payment.get("amount"),
        "platform_fee": payment.get("platform_fee"),
        "carrier_amount": payment.get("carrier_amount"),
        "delivered_at": payment.get("delivered_at").isoformat() if payment.get("delivered_at") else None,
        "confirmed_at": payment.get("confirmed_at").isoformat() if payment.get("confirmed_at") else None,
        "confirmation_type": payment.get("confirmation_type"),
        "auto_confirm_deadline": auto_confirm_deadline.isoformat() if auto_confirm_deadline else None,
        "time_remaining": time_remaining,
        "payout_blocked": payment.get("status") == PaymentStatus.PAYOUT_BLOCKED_NO_PAYOUT_METHOD.value,
        "payout_completed_at": payment.get("payout_completed_at").isoformat() if payment.get("payout_completed_at") else None
    }
