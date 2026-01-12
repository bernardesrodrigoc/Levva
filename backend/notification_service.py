"""
Notification Service for Levva Platform
Handles in-app notifications and email notifications for critical events
"""
import os
import logging
from datetime import datetime, timezone
from typing import Optional, List
from enum import Enum
from bson import ObjectId

logger = logging.getLogger(__name__)

class NotificationType(str, Enum):
    # Match events
    NEW_MATCH_SUGGESTION = "new_match_suggestion"
    MATCH_CREATED = "match_created"
    MATCH_ACCEPTED = "match_accepted"
    MATCH_REJECTED = "match_rejected"
    
    # Payment events
    PAYMENT_PENDING = "payment_pending"
    PAYMENT_APPROVED = "payment_approved"
    PAYMENT_FAILED = "payment_failed"
    PAYMENT_REFUNDED = "payment_refunded"
    
    # Delivery events
    PICKUP_CONFIRMED = "pickup_confirmed"
    DELIVERY_IN_TRANSIT = "delivery_in_transit"
    DELIVERY_COMPLETED = "delivery_completed"
    DELIVERY_PROBLEM = "delivery_problem"
    
    # Chat events
    NEW_MESSAGE = "new_message"
    
    # Verification events
    VERIFICATION_APPROVED = "verification_approved"
    VERIFICATION_REJECTED = "verification_rejected"
    
    # Dispute events
    DISPUTE_OPENED = "dispute_opened"
    DISPUTE_RESOLVED = "dispute_resolved"
    
    # System events
    TRUST_LEVEL_UP = "trust_level_up"


# Notification templates in Portuguese
NOTIFICATION_TEMPLATES = {
    NotificationType.NEW_MATCH_SUGGESTION: {
        "title": "Nova Sugestão de Match!",
        "body": "Encontramos uma {match_type} compatível com {route}. Confira!",
        "icon": "lightning",
        "priority": "medium",
        "send_email": False
    },
    NotificationType.MATCH_CREATED: {
        "title": "Combinação Criada",
        "body": "Sua combinação para {route} foi criada. Aguardando pagamento.",
        "icon": "package",
        "priority": "high",
        "send_email": True
    },
    NotificationType.PAYMENT_APPROVED: {
        "title": "Pagamento Aprovado!",
        "body": "O pagamento de R$ {amount} para {route} foi confirmado.",
        "icon": "check-circle",
        "priority": "high",
        "send_email": True
    },
    NotificationType.PAYMENT_FAILED: {
        "title": "Pagamento Falhou",
        "body": "Houve um problema com o pagamento para {route}. Tente novamente.",
        "icon": "x-circle",
        "priority": "high",
        "send_email": True
    },
    NotificationType.PICKUP_CONFIRMED: {
        "title": "Coleta Confirmada",
        "body": "O transportador {carrier_name} confirmou a coleta do seu pacote.",
        "icon": "truck",
        "priority": "high",
        "send_email": True
    },
    NotificationType.DELIVERY_IN_TRANSIT: {
        "title": "Entrega em Trânsito",
        "body": "Seu pacote está a caminho! Acompanhe em tempo real.",
        "icon": "navigation",
        "priority": "medium",
        "send_email": False
    },
    NotificationType.DELIVERY_COMPLETED: {
        "title": "Entrega Concluída!",
        "body": "Seu pacote foi entregue com sucesso. Não esqueça de avaliar!",
        "icon": "check-circle",
        "priority": "high",
        "send_email": True
    },
    NotificationType.DELIVERY_PROBLEM: {
        "title": "Problema na Entrega",
        "body": "Houve um problema com sua entrega. Entre em contato conosco.",
        "icon": "alert-triangle",
        "priority": "critical",
        "send_email": True
    },
    NotificationType.NEW_MESSAGE: {
        "title": "Nova Mensagem",
        "body": "{sender_name} enviou uma mensagem sobre {route}.",
        "icon": "message-circle",
        "priority": "medium",
        "send_email": False
    },
    NotificationType.VERIFICATION_APPROVED: {
        "title": "Verificação Aprovada!",
        "body": "Sua identidade foi verificada. Você já pode usar todas as funcionalidades!",
        "icon": "shield-check",
        "priority": "high",
        "send_email": True
    },
    NotificationType.VERIFICATION_REJECTED: {
        "title": "Verificação Rejeitada",
        "body": "Sua verificação foi rejeitada. Motivo: {reason}. Por favor, envie novamente.",
        "icon": "shield-x",
        "priority": "high",
        "send_email": True
    },
    NotificationType.DISPUTE_OPENED: {
        "title": "Disputa Aberta",
        "body": "Uma disputa foi aberta para sua entrega {route}. Nossa equipe irá analisar.",
        "icon": "alert-circle",
        "priority": "high",
        "send_email": True
    },
    NotificationType.DISPUTE_RESOLVED: {
        "title": "Disputa Resolvida",
        "body": "A disputa para {route} foi resolvida. Confira o resultado.",
        "icon": "check-circle",
        "priority": "high",
        "send_email": True
    },
    NotificationType.TRUST_LEVEL_UP: {
        "title": "Nível de Confiança Aumentou!",
        "body": "Parabéns! Você subiu para o nível {new_level}. Novos benefícios desbloqueados!",
        "icon": "trending-up",
        "priority": "medium",
        "send_email": False
    }
}


async def create_notification(
    user_id: str,
    notification_type: NotificationType,
    data: dict = None,
    match_id: str = None
) -> dict:
    """
    Create a new notification for a user.
    Returns the created notification document.
    """
    from database import notifications_collection, users_collection
    
    template = NOTIFICATION_TEMPLATES.get(notification_type, {})
    data = data or {}
    
    # Format title and body with data
    title = template.get("title", "Notificação")
    body = template.get("body", "").format(**data) if data else template.get("body", "")
    
    notification_doc = {
        "user_id": user_id,
        "type": notification_type,
        "title": title,
        "body": body,
        "icon": template.get("icon", "bell"),
        "priority": template.get("priority", "medium"),
        "match_id": match_id,
        "data": data,
        "read": False,
        "read_at": None,
        "created_at": datetime.now(timezone.utc)
    }
    
    result = await notifications_collection.insert_one(notification_doc)
    notification_doc["id"] = str(result.inserted_id)
    
    # Send email for critical events
    if template.get("send_email", False):
        user = await users_collection.find_one({"_id": ObjectId(user_id)})
        if user and user.get("email"):
            await send_email_notification(
                to_email=user["email"],
                to_name=user.get("name", "Usuário"),
                subject=title,
                body=body,
                notification_type=notification_type
            )
    
    logger.info(f"Notification created: {notification_type} for user {user_id}")
    return notification_doc


async def get_user_notifications(
    user_id: str,
    unread_only: bool = False,
    limit: int = 50
) -> List[dict]:
    """Get notifications for a user"""
    from database import notifications_collection
    
    query = {"user_id": user_id}
    if unread_only:
        query["read"] = False
    
    notifications = await notifications_collection.find(query)\
        .sort("created_at", -1)\
        .limit(limit)\
        .to_list(limit)
    
    for n in notifications:
        n["id"] = str(n.pop("_id"))
    
    return notifications


async def mark_notification_read(notification_id: str, user_id: str) -> bool:
    """Mark a single notification as read"""
    from database import notifications_collection
    
    result = await notifications_collection.update_one(
        {"_id": ObjectId(notification_id), "user_id": user_id},
        {"$set": {"read": True, "read_at": datetime.now(timezone.utc)}}
    )
    return result.modified_count > 0


async def mark_all_notifications_read(user_id: str) -> int:
    """Mark all notifications as read for a user"""
    from database import notifications_collection
    
    result = await notifications_collection.update_many(
        {"user_id": user_id, "read": False},
        {"$set": {"read": True, "read_at": datetime.now(timezone.utc)}}
    )
    return result.modified_count


async def get_unread_count(user_id: str) -> int:
    """Get count of unread notifications"""
    from database import notifications_collection
    
    return await notifications_collection.count_documents({
        "user_id": user_id,
        "read": False
    })


async def delete_notification(notification_id: str, user_id: str) -> bool:
    """Delete a notification"""
    from database import notifications_collection
    
    result = await notifications_collection.delete_one({
        "_id": ObjectId(notification_id),
        "user_id": user_id
    })
    return result.deleted_count > 0


async def send_email_notification(
    to_email: str,
    to_name: str,
    subject: str,
    body: str,
    notification_type: NotificationType
):
    """
    Send email notification using configured email provider.
    Falls back to logging if email is not configured.
    """
    try:
        # Check if Resend API key is configured
        resend_api_key = os.getenv("RESEND_API_KEY")
        
        if resend_api_key:
            import httpx
            
            # Using Resend API
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    "https://api.resend.com/emails",
                    headers={
                        "Authorization": f"Bearer {resend_api_key}",
                        "Content-Type": "application/json"
                    },
                    json={
                        "from": "Levva <noreply@levva.com.br>",
                        "to": [to_email],
                        "subject": f"[Levva] {subject}",
                        "html": generate_email_html(to_name, subject, body, notification_type)
                    }
                )
                
                if response.status_code == 200:
                    logger.info(f"Email sent to {to_email}: {subject}")
                else:
                    logger.warning(f"Failed to send email: {response.status_code} - {response.text}")
        else:
            # Log email content when not configured
            logger.info(f"[EMAIL NOT CONFIGURED] Would send to {to_email}: {subject} - {body}")
            
    except Exception as e:
        logger.error(f"Error sending email to {to_email}: {e}")


def generate_email_html(name: str, subject: str, body: str, notification_type: NotificationType) -> str:
    """Generate HTML email template"""
    
    # Color based on notification type
    colors = {
        "critical": "#ef4444",
        "high": "#f59e0b",
        "medium": "#10b981",
        "low": "#6b7280"
    }
    
    priority = NOTIFICATION_TEMPLATES.get(notification_type, {}).get("priority", "medium")
    accent_color = colors.get(priority, "#10b981")
    
    return f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f4f4f5; margin: 0; padding: 20px;">
        <div style="max-width: 600px; margin: 0 auto; background-color: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
            <div style="background: linear-gradient(135deg, #166534 0%, #15803d 100%); padding: 30px; text-align: center;">
                <h1 style="color: white; margin: 0; font-size: 28px;">Levva</h1>
                <p style="color: rgba(255,255,255,0.8); margin: 5px 0 0 0; font-size: 14px;">Crowdshipping inteligente</p>
            </div>
            
            <div style="padding: 30px;">
                <p style="color: #374151; font-size: 16px; margin: 0 0 20px 0;">Olá, <strong>{name}</strong>!</p>
                
                <div style="background-color: #f9fafb; border-left: 4px solid {accent_color}; padding: 20px; border-radius: 0 8px 8px 0; margin: 20px 0;">
                    <h2 style="color: #111827; margin: 0 0 10px 0; font-size: 18px;">{subject}</h2>
                    <p style="color: #4b5563; margin: 0; font-size: 15px; line-height: 1.6;">{body}</p>
                </div>
                
                <div style="text-align: center; margin-top: 30px;">
                    <a href="https://levva.com.br/dashboard" style="display: inline-block; background-color: #166534; color: white; text-decoration: none; padding: 12px 30px; border-radius: 8px; font-weight: 600; font-size: 14px;">
                        Acessar Levva
                    </a>
                </div>
            </div>
            
            <div style="background-color: #f9fafb; padding: 20px; text-align: center; border-top: 1px solid #e5e7eb;">
                <p style="color: #9ca3af; font-size: 12px; margin: 0;">
                    © 2026 Levva. Todos os direitos reservados.<br>
                    Você recebeu este email porque possui uma conta na plataforma Levva.
                </p>
            </div>
        </div>
    </body>
    </html>
    """


# Convenience functions for common notification events
async def notify_match_created(sender_id: str, carrier_id: str, match_id: str, route: str, amount: float):
    """Notify both parties when a match is created"""
    await create_notification(
        sender_id,
        NotificationType.MATCH_CREATED,
        {"route": route, "amount": f"{amount:.2f}"},
        match_id
    )
    await create_notification(
        carrier_id,
        NotificationType.MATCH_CREATED,
        {"route": route, "amount": f"{amount:.2f}"},
        match_id
    )


async def notify_payment_approved(sender_id: str, carrier_id: str, match_id: str, route: str, amount: float):
    """Notify both parties when payment is approved"""
    await create_notification(
        sender_id,
        NotificationType.PAYMENT_APPROVED,
        {"route": route, "amount": f"{amount:.2f}"},
        match_id
    )
    await create_notification(
        carrier_id,
        NotificationType.PAYMENT_APPROVED,
        {"route": route, "amount": f"{amount:.2f}"},
        match_id
    )


async def notify_delivery_completed(sender_id: str, carrier_id: str, match_id: str, route: str):
    """Notify both parties when delivery is completed"""
    await create_notification(
        sender_id,
        NotificationType.DELIVERY_COMPLETED,
        {"route": route},
        match_id
    )
    await create_notification(
        carrier_id,
        NotificationType.DELIVERY_COMPLETED,
        {"route": route},
        match_id
    )
