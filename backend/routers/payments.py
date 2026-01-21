"""Payment routes with REAL Mercado Pago integration."""
from fastapi import APIRouter, Depends, HTTPException, Request, BackgroundTasks
from fastapi.responses import JSONResponse
from datetime import datetime, timezone, timedelta
from bson import ObjectId
from pydantic import BaseModel, Field
from typing import Optional
import os
import logging
import json

from database import matches_collection, payments_collection, users_collection
from models import PaymentInitiate, PaymentStatus, ShipmentStatus, TripStatus
from auth import get_current_user_id
from core.config import settings
from providers.mercado_pago import get_mercadopago_provider, map_payment_status

logger = logging.getLogger(__name__)
router = APIRouter()

# Platform fee percentage
PLATFORM_FEE_PERCENT = 15  # 15%
AUTO_CONFIRM_DAYS = 7


# ===========================================
# PAYMENT INITIATION
# ===========================================

@router.post("/initiate")
async def initiate_payment(payment_data: PaymentInitiate, user_id: str = Depends(get_current_user_id)):
    """
    Inicia pagamento para um match.
    Cria preferência no Mercado Pago e retorna URL de checkout.
    """
    match = await matches_collection.find_one({"_id": ObjectId(payment_data.match_id)})
    
    if not match:
        raise HTTPException(status_code=404, detail="Combinação não encontrada")
    
    if match["sender_id"] != user_id:
        raise HTTPException(status_code=403, detail="Apenas o remetente pode iniciar pagamento")
    
    # Check if payment already exists
    existing_payment = await payments_collection.find_one({"match_id": payment_data.match_id})
    if existing_payment and existing_payment.get("status") not in ["payment_pending", "pending"]:
        return {
            "id": str(existing_payment["_id"]),
            "match_id": payment_data.match_id,
            "amount": existing_payment.get("amount"),
            "status": str(existing_payment.get("status")),
            "checkout_url": existing_payment.get("checkout_url"),
            "mercadopago_preference_id": existing_payment.get("mercadopago_preference_id")
        }
    
    # Get user info for payer email
    sender = await users_collection.find_one({"_id": ObjectId(user_id)})
    payer_email = sender.get("email", "customer@levva.com") if sender else "customer@levva.com"
    
    # Calculate amounts
    total_amount = float(payment_data.amount)
    platform_fee = round(total_amount * PLATFORM_FEE_PERCENT / 100, 2)
    carrier_amount = round(total_amount - platform_fee, 2)
    
    payment_doc = {
        "match_id": payment_data.match_id,
        "sender_id": user_id,
        "carrier_id": match.get("carrier_id"),
        "shipment_id": match.get("shipment_id"),
        "trip_id": match.get("trip_id"),
        "amount": total_amount,
        "platform_fee": platform_fee,
        "carrier_amount": carrier_amount,
        "status": PaymentStatus.PAYMENT_PENDING.value,
        "mercadopago_preference_id": None,
        "mercadopago_payment_id": None,
        "checkout_url": None,
        "created_at": datetime.now(timezone.utc),
        "payer_email": payer_email
    }
    
    # Create Mercado Pago preference
    mp_provider = get_mercadopago_provider()
    
    if mp_provider.is_configured:
        try:
            # Build webhook URL
            api_base_url = os.environ.get("REACT_APP_BACKEND_URL", settings.frontend_url)
            if not api_base_url.endswith("/api"):
                webhook_url = f"{api_base_url}/api/payments/webhook/mercadopago"
            else:
                webhook_url = f"{api_base_url}/payments/webhook/mercadopago"
            
            preference = mp_provider.create_preference(
                items=[{
                    "title": f"Entrega Levva #{payment_data.match_id[:8]}",
                    "quantity": 1,
                    "unit_price": total_amount,
                    "currency_id": "BRL",
                    "description": f"Transporte de encomenda via Levva"
                }],
                payer_email=payer_email,
                external_reference=payment_data.match_id,
                notification_url=webhook_url,
                back_urls={
                    "success": f"{settings.frontend_url}/payment/success?match_id={payment_data.match_id}",
                    "failure": f"{settings.frontend_url}/payment/failure?match_id={payment_data.match_id}",
                    "pending": f"{settings.frontend_url}/payment/pending?match_id={payment_data.match_id}"
                }
            )
            
            payment_doc["mercadopago_preference_id"] = preference["preference_id"]
            payment_doc["checkout_url"] = preference["init_point"]
            payment_doc["sandbox_checkout_url"] = preference.get("sandbox_init_point")
            
            logger.info(f"[Payment] Created MP preference {preference['preference_id']} for match {payment_data.match_id}")
            
        except Exception as e:
            logger.error(f"[Payment] Error creating MP preference: {e}")
            # Fallback: criar pagamento sem MP (para debug)
            payment_doc["mp_error"] = str(e)
    else:
        logger.warning("[Payment] Mercado Pago not configured - payment created without checkout URL")
    
    # Insert or update payment
    if existing_payment:
        await payments_collection.update_one(
            {"_id": existing_payment["_id"]},
            {"$set": payment_doc}
        )
        payment_id = str(existing_payment["_id"])
    else:
        result = await payments_collection.insert_one(payment_doc)
        payment_id = str(result.inserted_id)
    
    return {
        "id": payment_id,
        "match_id": payment_data.match_id,
        "amount": total_amount,
        "platform_fee": platform_fee,
        "carrier_amount": carrier_amount,
        "status": payment_doc["status"],
        "checkout_url": payment_doc.get("checkout_url"),
        "sandbox_checkout_url": payment_doc.get("sandbox_checkout_url"),
        "mercadopago_preference_id": payment_doc.get("mercadopago_preference_id")
    }


# ===========================================
# MERCADO PAGO WEBHOOK (REAL)
# ===========================================

@router.post("/webhook/mercadopago")
async def mercadopago_webhook(
    request: Request,
    background_tasks: BackgroundTasks
):
    """
    Webhook REAL do Mercado Pago para notificações de pagamento.
    
    Recebe notificações de:
    - payment: Quando um pagamento é criado/atualizado
    - merchant_order: Quando um pedido muda de status
    """
    try:
        # Get raw body for signature verification
        body = await request.body()
        
        # Get headers for signature verification
        x_signature = request.headers.get("x-signature", "")
        x_request_id = request.headers.get("x-request-id", "")
        
        # Parse payload
        try:
            payload = await request.json()
        except json.JSONDecodeError:
            payload = {}
        
        notification_type = payload.get("type") or request.query_params.get("type")
        data_id = payload.get("data", {}).get("id") or request.query_params.get("data.id")
        
        logger.info(f"[Webhook] Received: type={notification_type}, id={data_id}")
        logger.debug(f"[Webhook] Payload: {json.dumps(payload, default=str)}")
        
        # Verify signature (optional - log warning if fails but continue)
        mp_provider = get_mercadopago_provider()
        if x_signature:
            is_valid = mp_provider.verify_webhook_signature(body, x_signature, request_id=x_request_id)
            if not is_valid:
                logger.warning(f"[Webhook] Signature verification failed, but continuing...")
        
        # Process based on notification type
        if notification_type == "payment":
            if data_id:
                # Process in background to respond quickly
                background_tasks.add_task(process_payment_notification, str(data_id))
                logger.info(f"[Webhook] Queued payment {data_id} for processing")
        
        elif notification_type == "merchant_order":
            if data_id:
                logger.info(f"[Webhook] Merchant order notification: {data_id}")
                # Merchant orders are informational, payments are processed separately
        
        # Always respond 200 OK to acknowledge receipt
        return JSONResponse({"status": "ok", "received": notification_type}, status_code=200)
        
    except Exception as e:
        logger.error(f"[Webhook] Error processing: {str(e)}")
        # Still return 200 to avoid retries for broken notifications
        return JSONResponse({"status": "error", "message": str(e)}, status_code=200)


async def process_payment_notification(payment_id: str):
    """
    Processa notificação de pagamento do Mercado Pago.
    
    1. Busca detalhes do pagamento na API do MP
    2. Atualiza status no banco de dados
    3. Atualiza status do match se aprovado
    """
    try:
        mp_provider = get_mercadopago_provider()
        
        if not mp_provider.is_configured:
            logger.error(f"[Webhook] MP not configured, cannot process payment {payment_id}")
            return
        
        # Get payment details from MP API
        payment_info = mp_provider.get_payment(payment_id)
        
        logger.info(f"[Webhook] Payment {payment_id}: status={payment_info['status']}, amount={payment_info['amount']}")
        
        external_reference = payment_info.get("external_reference")
        if not external_reference:
            logger.warning(f"[Webhook] Payment {payment_id} has no external_reference")
            return
        
        mp_status = payment_info["status"]
        amount = payment_info["amount"]
        net_amount = payment_info.get("net_amount", amount)
        fee_amount = payment_info.get("fee_amount", 0)
        
        now = datetime.now(timezone.utc)
        
        # Build update based on status
        update_data = {
            "mercadopago_payment_id": payment_id,
            "mercadopago_status": mp_status,
            "mercadopago_status_detail": payment_info.get("status_detail"),
            "mercadopago_payment_method": payment_info.get("payment_method"),
            "mercadopago_payment_type": payment_info.get("payment_type"),
            "mercadopago_fee": fee_amount,
            "mercadopago_net_amount": net_amount,
            "mercadopago_updated_at": now,
            "payer_email": payment_info.get("payer_email")
        }
        
        match_status_update = None
        
        if mp_status == "approved":
            # PAGAMENTO APROVADO - Mover para escrow
            update_data["status"] = PaymentStatus.PAID_ESCROW.value
            update_data["paid_at"] = now
            update_data["amount_received"] = amount
            match_status_update = "paid"
            
            logger.info(f"[Webhook] Payment APPROVED for match {external_reference}")
            
        elif mp_status == "pending":
            # Pagamento pendente (PIX aguardando, boleto, etc.)
            update_data["status"] = PaymentStatus.PAYMENT_PENDING.value
            logger.info(f"[Webhook] Payment PENDING for match {external_reference}")
            
        elif mp_status in ["rejected", "cancelled"]:
            # Pagamento rejeitado ou cancelado
            update_data["status"] = PaymentStatus.PAYMENT_PENDING.value  # Volta para pendente
            update_data["last_rejection_reason"] = payment_info.get("status_detail")
            logger.info(f"[Webhook] Payment REJECTED/CANCELLED for match {external_reference}: {payment_info.get('status_detail')}")
            
        elif mp_status == "refunded":
            # Pagamento reembolsado
            update_data["status"] = PaymentStatus.REFUNDED.value
            update_data["refunded_at"] = now
            match_status_update = "cancelled"
            logger.info(f"[Webhook] Payment REFUNDED for match {external_reference}")
            
        elif mp_status == "charged_back":
            # Chargeback
            update_data["status"] = PaymentStatus.DISPUTE_OPENED.value
            update_data["chargeback_at"] = now
            match_status_update = "disputed"
            logger.info(f"[Webhook] Payment CHARGEBACK for match {external_reference}")
        
        # Update payment record
        result = await payments_collection.update_one(
            {"match_id": external_reference},
            {"$set": update_data}
        )
        
        if result.modified_count == 0:
            # Maybe payment doesn't exist yet, create it
            logger.warning(f"[Webhook] No payment found for match {external_reference}, creating...")
            await payments_collection.insert_one({
                "match_id": external_reference,
                **update_data,
                "created_at": now
            })
        
        # Update match status if needed
        if match_status_update:
            await matches_collection.update_one(
                {"_id": ObjectId(external_reference)},
                {"$set": {"status": match_status_update, "payment_updated_at": now}}
            )
            logger.info(f"[Webhook] Match {external_reference} updated to status: {match_status_update}")
        
        # Log financial record
        await log_financial_event(
            event_type="payment_" + mp_status,
            match_id=external_reference,
            payment_id=payment_id,
            amount=amount,
            net_amount=net_amount,
            fee=fee_amount,
            metadata=payment_info
        )
        
    except Exception as e:
        logger.error(f"[Webhook] Error processing payment {payment_id}: {str(e)}")
        raise


async def log_financial_event(
    event_type: str,
    match_id: str,
    payment_id: str,
    amount: float,
    net_amount: float = None,
    fee: float = 0,
    metadata: dict = None
):
    """Log financial event for auditing."""
    from database import db
    
    event = {
        "event_type": event_type,
        "match_id": match_id,
        "mercadopago_payment_id": payment_id,
        "amount": amount,
        "net_amount": net_amount or amount,
        "mercadopago_fee": fee,
        "timestamp": datetime.now(timezone.utc),
        "metadata": metadata or {}
    }
    
    try:
        await db.financial_events.insert_one(event)
    except Exception as e:
        logger.error(f"[Financial] Error logging event: {e}")


# ===========================================
# PAYMENT STATUS
# ===========================================

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
        "platform_fee": payment.get("platform_fee"),
        "carrier_amount": payment.get("carrier_amount"),
        "status": str(payment.get("status")),
        "mercadopago_status": payment.get("mercadopago_status"),
        "checkout_url": payment.get("checkout_url"),
        "paid_at": payment.get("paid_at").isoformat() if payment.get("paid_at") else None,
        "created_at": payment.get("created_at").isoformat() if payment.get("created_at") else None
    }


@router.get("/{match_id}/refresh-status")
async def refresh_payment_status(match_id: str, user_id: str = Depends(get_current_user_id)):
    """
    Força atualização do status de pagamento consultando o Mercado Pago.
    Útil quando o webhook não chegou ou para debug.
    """
    payment = await payments_collection.find_one({"match_id": match_id})
    
    if not payment:
        raise HTTPException(status_code=404, detail="Pagamento não encontrado")
    
    mp_payment_id = payment.get("mercadopago_payment_id")
    
    if not mp_payment_id:
        return {
            "message": "Pagamento ainda não foi processado pelo Mercado Pago",
            "status": str(payment.get("status")),
            "match_id": match_id
        }
    
    # Query MP API
    mp_provider = get_mercadopago_provider()
    
    if not mp_provider.is_configured:
        raise HTTPException(status_code=500, detail="Mercado Pago não configurado")
    
    try:
        payment_info = mp_provider.get_payment(mp_payment_id)
        
        # Process as if it was a webhook
        await process_payment_notification(mp_payment_id)
        
        return {
            "message": "Status atualizado",
            "mercadopago_status": payment_info["status"],
            "match_id": match_id
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao consultar Mercado Pago: {str(e)}")


# ===========================================
# SIMULATE PAYMENT (DEV ONLY)
# ===========================================

@router.post("/{match_id}/simulate-approved")
async def simulate_payment_approved(match_id: str, user_id: str = Depends(get_current_user_id)):
    """
    [DEV ONLY] Simula aprovação de pagamento para testes.
    Remove em produção!
    """
    # Check if admin
    user = await users_collection.find_one({"_id": ObjectId(user_id)})
    if not user or user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Apenas admins podem simular pagamentos")
    
    payment = await payments_collection.find_one({"match_id": match_id})
    
    if not payment:
        raise HTTPException(status_code=404, detail="Pagamento não encontrado")
    
    now = datetime.now(timezone.utc)
    
    await payments_collection.update_one(
        {"match_id": match_id},
        {
            "$set": {
                "status": PaymentStatus.PAID_ESCROW.value,
                "mercadopago_status": "approved",
                "mercadopago_payment_id": f"SIM_{match_id[:8]}",
                "paid_at": now,
                "amount_received": payment.get("amount"),
                "simulated": True
            }
        }
    )
    
    await matches_collection.update_one(
        {"_id": ObjectId(match_id)},
        {"$set": {"status": "paid"}}
    )
    
    logger.warning(f"[DEV] Simulated payment approval for match {match_id}")
    
    return {
        "message": "Pagamento simulado como aprovado",
        "status": PaymentStatus.PAID_ESCROW.value,
        "match_id": match_id
    }


# ===========================================
# DELIVERY & PAYOUT FLOW
# ===========================================

class DeliveryConfirmationRequest(BaseModel):
    notes: Optional[str] = None


class DisputeRequest(BaseModel):
    reason: str
    details: Optional[str] = None


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
    valid_statuses = ["paid_escrow", "escrowed", "paid", PaymentStatus.PAID_ESCROW.value]
    
    if current_status not in valid_statuses:
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
    from database import shipments_collection, trips_collection
    
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
        raise HTTPException(status_code=400, detail="Entrega ainda não foi marcada pelo transportador")
    
    now = datetime.now(timezone.utc)
    
    # Check if transporter has payout method
    carrier = await users_collection.find_one({"_id": ObjectId(match["carrier_id"])})
    has_payout_method = carrier and carrier.get("pix_key")
    
    # Get amounts from payment record
    total_amount = payment.get("amount", 0)
    platform_fee = payment.get("platform_fee") or round(total_amount * PLATFORM_FEE_PERCENT / 100, 2)
    carrier_amount = payment.get("carrier_amount") or round(total_amount - platform_fee, 2)
    
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
    
    # Update shipment and trip to history
    await shipments_collection.update_one(
        {"_id": ObjectId(match["shipment_id"])},
        {"$set": {"status": ShipmentStatus.DELIVERED.value, "delivered_at": now}}
    )
    
    await trips_collection.update_one(
        {"_id": ObjectId(match["trip_id"])},
        {"$set": {"status": TripStatus.COMPLETED.value, "completed_at": now}}
    )
    
    # Update reputation
    try:
        from services.reputation_service import record_delivery_completed
        await record_delivery_completed(match["sender_id"], match["carrier_id"], match_id)
    except Exception as e:
        logger.warning(f"Failed to update reputation: {e}")
    
    # Create payout record
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
    
    # Log financial event
    await log_financial_event(
        event_type="delivery_confirmed",
        match_id=match_id,
        payment_id=str(payment["_id"]),
        amount=total_amount,
        net_amount=carrier_amount,
        fee=platform_fee,
        metadata={"confirmed_by": user_id, "has_payout_method": has_payout_method}
    )
    
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
    """Sender opens a dispute instead of confirming delivery."""
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
    """Get delivery and payout status for a match."""
    payment = await payments_collection.find_one({"match_id": match_id})
    if not payment:
        return {"status": "not_found"}
    
    now = datetime.now(timezone.utc)
    auto_confirm_deadline = payment.get("auto_confirm_deadline")
    
    time_remaining = None
    if auto_confirm_deadline:
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
        "mercadopago_status": payment.get("mercadopago_status"),
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


# ===========================================
# REFUND
# ===========================================

@router.post("/{match_id}/refund")
async def refund_payment(match_id: str, user_id: str = Depends(get_current_user_id)):
    """
    [ADMIN ONLY] Realiza reembolso de um pagamento.
    """
    # Check admin
    user = await users_collection.find_one({"_id": ObjectId(user_id)})
    if not user or user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Apenas admins podem reembolsar")
    
    payment = await payments_collection.find_one({"match_id": match_id})
    if not payment:
        raise HTTPException(status_code=404, detail="Pagamento não encontrado")
    
    mp_payment_id = payment.get("mercadopago_payment_id")
    if not mp_payment_id:
        raise HTTPException(status_code=400, detail="Pagamento não tem ID do Mercado Pago")
    
    mp_provider = get_mercadopago_provider()
    
    if not mp_provider.is_configured:
        raise HTTPException(status_code=500, detail="Mercado Pago não configurado")
    
    try:
        result = mp_provider.refund_payment(mp_payment_id)
        
        now = datetime.now(timezone.utc)
        
        await payments_collection.update_one(
            {"match_id": match_id},
            {
                "$set": {
                    "status": PaymentStatus.REFUNDED.value,
                    "refunded_at": now,
                    "refund_id": result.get("refund_id"),
                    "refunded_by": user_id
                }
            }
        )
        
        await matches_collection.update_one(
            {"_id": ObjectId(match_id)},
            {"$set": {"status": "cancelled"}}
        )
        
        logger.info(f"[Refund] Payment {mp_payment_id} refunded for match {match_id}")
        
        return {
            "message": "Pagamento reembolsado com sucesso",
            "refund_id": result.get("refund_id"),
            "status": PaymentStatus.REFUNDED.value
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao reembolsar: {str(e)}")
