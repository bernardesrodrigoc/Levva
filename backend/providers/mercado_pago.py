"""
Mercado Pago Payment Provider - Integração com Mercado Pago.

Este provider implementa a interface PaymentProvider para o Mercado Pago.
Atualmente em modo simulado para o MVP.
"""
import logging
from datetime import datetime, timezone
from typing import Optional, Dict, Any
import os

from .base import (
    PaymentProvider, 
    PayoutRequest, 
    PayoutResponse, 
    PayoutStatusCheck,
    ProviderStatus
)

logger = logging.getLogger(__name__)


class MercadoPagoProvider(PaymentProvider):
    """
    Provider para Mercado Pago.
    
    No MVP, opera em modo simulado. Para produção, descomentar
    a integração real com o SDK do Mercado Pago.
    """
    
    def __init__(self, access_token: Optional[str] = None):
        self.access_token = access_token or os.environ.get("MERCADO_PAGO_ACCESS_TOKEN")
        self._simulation_mode = True  # MVP: sempre simulado
        
        if not self.access_token:
            logger.warning("[MP] No access token provided - running in simulation mode")
    
    @property
    def name(self) -> str:
        return "MercadoPago"
    
    @property
    def supports_pix(self) -> bool:
        return True
    
    async def execute_payout(self, request: PayoutRequest) -> PayoutResponse:
        """
        Executa payout via Mercado Pago.
        
        MVP: Modo simulado - loga a operação mas não executa.
        """
        logger.info(f"[MP] Payout request: {request.payout_id}")
        logger.info(f"[MP] Recipient: {request.recipient_pix_key} ({request.recipient_pix_type})")
        logger.info(f"[MP] Amount: R$ {request.amount:.2f}")
        
        if self._simulation_mode:
            logger.info("[MP] SIMULATION MODE - Payout not executed")
            
            # Simular sucesso
            return PayoutResponse(
                success=True,
                status=ProviderStatus.SUCCESS,
                provider_id=f"MP_SIM_{request.payout_id[:8]}",
                provider_reference=request.reference_id,
                processed_at=datetime.now(timezone.utc),
                raw_response={
                    "simulation": True,
                    "message": "Payout simulado com sucesso",
                    "would_pay": {
                        "amount": request.amount,
                        "recipient": request.recipient_pix_key
                    }
                }
            )
        
        # TODO: Implementar integração real com Mercado Pago
        # import mercadopago
        # sdk = mercadopago.SDK(self.access_token)
        # payment_data = {
        #     "transaction_amount": request.amount,
        #     "description": request.description,
        #     "payment_method_id": "pix",
        #     ...
        # }
        # result = sdk.payment().create(payment_data)
        
        raise NotImplementedError("Integração real com Mercado Pago não implementada")
    
    async def check_payout_status(self, provider_id: str) -> PayoutStatusCheck:
        """Consulta status de payout no Mercado Pago."""
        logger.info(f"[MP] Checking payout status: {provider_id}")
        
        if self._simulation_mode:
            return PayoutStatusCheck(
                payout_id="simulated",
                provider_id=provider_id,
                status=ProviderStatus.SUCCESS,
                amount=0,
                paid_at=datetime.now(timezone.utc),
                recipient_confirmed=True
            )
        
        raise NotImplementedError("Integração real não implementada")
    
    async def validate_pix_key(self, pix_key: str, pix_type: str) -> bool:
        """Valida chave Pix."""
        # Validação básica de formato
        if not pix_key:
            return False
        
        if pix_type == "email" and "@" not in pix_key:
            return False
        
        # TODO: Validação real via API do BACEN/Mercado Pago
        return True
    
    async def get_balance(self) -> float:
        """Retorna saldo da conta Mercado Pago."""
        if self._simulation_mode:
            return 50000.0  # Saldo simulado
        
        raise NotImplementedError("Integração real não implementada")
