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
