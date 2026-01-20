"""
Cancellation Rules Service
=========================

Implements business rules for cancellation based on entity status.

RULES:
1. Sem match → cancelamento livre
2. Match sem pagamento → cancelamento com motivo obrigatório
3. Aguardando pagamento → não cancela, apenas expira automaticamente
4. Pago → cancelamento restrito (disputa ou suporte)
"""

from typing import Dict, Any, Tuple
from models import ShipmentStatus, TripStatus, MatchStatus


def can_cancel_shipment(
    shipment_status: str,
    has_match: bool,
    match_status: str = None
) -> Tuple[bool, bool, str]:
    """
    Check if a shipment can be cancelled.
    
    Returns:
        Tuple of (can_cancel, requires_reason, message)
    """
    # Published without match - free cancellation
    if shipment_status == ShipmentStatus.PUBLISHED.value and not has_match:
        return (True, False, "Cancelamento livre - envio sem combinação")
    
    # Matched but no payment yet - requires reason
    if shipment_status == ShipmentStatus.MATCHED.value:
        if match_status == MatchStatus.PENDING_PAYMENT.value:
            return (True, True, "Requer motivo - combinação aguardando pagamento")
        elif match_status in [MatchStatus.PAID.value, MatchStatus.IN_TRANSIT.value]:
            return (False, False, "Não é possível cancelar - pagamento já realizado. Use disputa.")
    
    # In transit - cannot cancel
    if shipment_status == ShipmentStatus.IN_TRANSIT.value:
        return (False, False, "Não é possível cancelar - envio em trânsito. Use disputa.")
    
    # Delivered - cannot cancel
    if shipment_status == ShipmentStatus.DELIVERED.value:
        return (False, False, "Não é possível cancelar - envio já entregue")
    
    # Already cancelled or expired
    if shipment_status in [
        ShipmentStatus.CANCELLED.value,
        ShipmentStatus.CANCELLED_BY_SENDER.value,
        ShipmentStatus.CANCELLED_BY_CARRIER.value,
        ShipmentStatus.EXPIRED.value
    ]:
        return (False, False, "Envio já está cancelado ou expirado")
    
    # Default: allow with reason
    return (True, True, "Cancelamento permitido com motivo")


def can_cancel_trip(
    trip_status: str,
    has_matches: bool,
    any_match_paid: bool
) -> Tuple[bool, bool, str]:
    """
    Check if a trip can be cancelled.
    
    Returns:
        Tuple of (can_cancel, requires_reason, message)
    """
    # Published without matches - free cancellation
    if trip_status == TripStatus.PUBLISHED.value and not has_matches:
        return (True, False, "Cancelamento livre - viagem sem combinações")
    
    # Has matches but none paid - requires reason
    if trip_status in [TripStatus.PUBLISHED.value, TripStatus.MATCHED.value]:
        if has_matches and not any_match_paid:
            return (True, True, "Requer motivo - viagem com combinações aguardando pagamento")
        elif any_match_paid:
            return (False, False, "Não é possível cancelar - há pagamentos realizados. Use disputa.")
    
    # In progress - cannot cancel
    if trip_status == TripStatus.IN_PROGRESS.value:
        return (False, False, "Não é possível cancelar - viagem em andamento. Use disputa.")
    
    # Completed - cannot cancel
    if trip_status == TripStatus.COMPLETED.value:
        return (False, False, "Não é possível cancelar - viagem já concluída")
    
    # Already cancelled or expired
    if trip_status in [
        TripStatus.CANCELLED.value,
        TripStatus.CANCELLED_BY_CARRIER.value,
        TripStatus.EXPIRED.value
    ]:
        return (False, False, "Viagem já está cancelada ou expirada")
    
    # Default: allow with reason
    return (True, True, "Cancelamento permitido com motivo")


def can_cancel_match(match_status: str, requester_role: str) -> Tuple[bool, bool, str]:
    """
    Check if a match can be cancelled.
    
    Returns:
        Tuple of (can_cancel, requires_reason, message)
    """
    # Pending payment - will expire automatically, but can request cancellation
    if match_status == MatchStatus.PENDING_PAYMENT.value:
        return (True, True, "Requer motivo - combinação aguardando pagamento")
    
    # Paid - cannot cancel, must dispute
    if match_status == MatchStatus.PAID.value:
        return (False, False, "Não é possível cancelar - pagamento realizado. Abra uma disputa.")
    
    # In transit - cannot cancel, must dispute
    if match_status == MatchStatus.IN_TRANSIT.value:
        return (False, False, "Não é possível cancelar - entrega em andamento. Abra uma disputa.")
    
    # Final states
    if match_status in [
        MatchStatus.DELIVERED.value,
        MatchStatus.COMPLETED.value,
        MatchStatus.CANCELLED.value,
        MatchStatus.EXPIRED.value,
        MatchStatus.DISPUTED.value
    ]:
        return (False, False, "Combinação já está finalizada")
    
    return (False, False, "Estado inválido para cancelamento")


def get_cancellation_impact(
    entity_type: str,
    status: str,
    has_payment: bool
) -> Dict[str, Any]:
    """
    Get the reputation impact of a cancellation.
    
    Returns:
        Dict with impact details
    """
    if has_payment:
        return {
            "reputation_impact": "negative",
            "points": -2.0,
            "description": "Cancelamento após pagamento afeta negativamente sua reputação"
        }
    else:
        return {
            "reputation_impact": "neutral",
            "points": 0.0,
            "description": "Cancelamento registrado, sem impacto na reputação"
        }


# ============================================================
# ALLOWED ACTIONS BY STATUS
# ============================================================

SHIPMENT_ALLOWED_ACTIONS = {
    ShipmentStatus.DRAFT.value: ["edit", "publish", "delete"],
    ShipmentStatus.PUBLISHED.value: ["edit", "cancel", "view_suggestions"],
    ShipmentStatus.MATCHED.value: ["view_match", "cancel", "chat"],
    ShipmentStatus.IN_TRANSIT.value: ["track", "chat", "dispute"],
    ShipmentStatus.DELIVERED.value: ["rate", "view_history"],
    ShipmentStatus.CANCELLED.value: ["view_history"],
    ShipmentStatus.EXPIRED.value: ["view_history", "republish"]
}

TRIP_ALLOWED_ACTIONS = {
    TripStatus.DRAFT.value: ["edit", "publish", "delete"],
    TripStatus.PUBLISHED.value: ["edit", "cancel", "view_suggestions", "browse_shipments"],
    TripStatus.MATCHED.value: ["view_matches", "cancel", "start_trip", "chat"],
    TripStatus.IN_PROGRESS.value: ["update_location", "complete", "chat"],
    TripStatus.COMPLETED.value: ["rate", "view_history"],
    TripStatus.CANCELLED.value: ["view_history"],
    TripStatus.EXPIRED.value: ["view_history", "republish"]
}

MATCH_ALLOWED_ACTIONS = {
    MatchStatus.PENDING_PAYMENT.value: ["pay", "cancel", "chat"],
    MatchStatus.PAID.value: ["confirm_pickup", "chat", "dispute"],
    MatchStatus.IN_TRANSIT.value: ["track", "confirm_delivery", "chat", "dispute"],
    MatchStatus.DELIVERED.value: ["confirm_receipt", "rate", "dispute"],
    MatchStatus.COMPLETED.value: ["view_history"],
    MatchStatus.CANCELLED.value: ["view_history"],
    MatchStatus.EXPIRED.value: ["view_history"],
    MatchStatus.DISPUTED.value: ["view_dispute", "chat_support"]
}


def get_allowed_actions(entity_type: str, status: str) -> list:
    """
    Get allowed actions for an entity based on its status.
    """
    action_maps = {
        "shipment": SHIPMENT_ALLOWED_ACTIONS,
        "trip": TRIP_ALLOWED_ACTIONS,
        "match": MATCH_ALLOWED_ACTIONS
    }
    
    action_map = action_maps.get(entity_type, {})
    return action_map.get(status, [])
