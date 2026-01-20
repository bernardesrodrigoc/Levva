"""
Mock Payment Provider - Provider simulado para testes e MVP.

Este provider simula operações de payout sem fazer chamadas reais.
Útil para desenvolvimento, testes e fase inicial do MVP.
"""
import logging
from datetime import datetime, timezone
from typing import Optional, Dict, Any
import uuid

from .base import (
    PaymentProvider, 
    PayoutRequest, 
    PayoutResponse, 
    PayoutStatusCheck,
    ProviderStatus
)

logger = logging.getLogger(__name__)


class MockPaymentProvider(PaymentProvider):
    """
    Provider simulado para desenvolvimento e testes.
    
    Simula todas as operações com sucesso, logando as ações.
    Pode ser configurado para simular falhas em cenários específicos.
    """
    
    def __init__(self, simulate_failures: bool = False, failure_rate: float = 0.0):
        self.simulate_failures = simulate_failures
        self.failure_rate = failure_rate
        self._transactions: Dict[str, Dict[str, Any]] = {}
        self._balance = 100000.0  # Saldo simulado de R$ 100.000
    
    @property
    def name(self) -> str:
        return "MockProvider"
    
    @property
    def supports_pix(self) -> bool:
        return True
    
    async def execute_payout(self, request: PayoutRequest) -> PayoutResponse:
        """Simula execução de payout."""
        logger.info(f"[MOCK] Executing payout: {request.payout_id} -> {request.recipient_pix_key}")
        logger.info(f"[MOCK] Amount: R$ {request.amount:.2f}")
        
        # Simular falha se configurado
        if self.simulate_failures:
            import random
            if random.random() < self.failure_rate:
                logger.warning(f"[MOCK] Simulated failure for payout {request.payout_id}")
                return PayoutResponse(
                    success=False,
                    status=ProviderStatus.FAILED,
                    error_code="SIMULATED_FAILURE",
                    error_message="Falha simulada para teste",
                    processed_at=datetime.now(timezone.utc)
                )
        
        # Gerar ID de transação simulado
        provider_id = f"MOCK_{uuid.uuid4().hex[:12].upper()}"
        
        # Armazenar transação
        self._transactions[provider_id] = {
            "payout_id": request.payout_id,
            "amount": request.amount,
            "recipient": request.recipient_pix_key,
            "status": ProviderStatus.SUCCESS,
            "created_at": datetime.now(timezone.utc)
        }
        
        # Atualizar saldo simulado
        self._balance -= request.amount
        
        logger.info(f"[MOCK] Payout successful: {provider_id}")
        logger.info(f"[MOCK] New balance: R$ {self._balance:.2f}")
        
        return PayoutResponse(
            success=True,
            status=ProviderStatus.SUCCESS,
            provider_id=provider_id,
            provider_reference=f"REF_{request.reference_id}",
            processed_at=datetime.now(timezone.utc),
            raw_response={
                "mock": True,
                "transaction_id": provider_id,
                "amount": request.amount
            }
        )
    
    async def check_payout_status(self, provider_id: str) -> PayoutStatusCheck:
        """Consulta status de payout simulado."""
        transaction = self._transactions.get(provider_id)
        
        if not transaction:
            return PayoutStatusCheck(
                payout_id="unknown",
                provider_id=provider_id,
                status=ProviderStatus.FAILED,
                amount=0,
                recipient_confirmed=False
            )
        
        return PayoutStatusCheck(
            payout_id=transaction["payout_id"],
            provider_id=provider_id,
            status=transaction["status"],
            amount=transaction["amount"],
            paid_at=transaction["created_at"],
            recipient_confirmed=True
        )
    
    async def validate_pix_key(self, pix_key: str, pix_type: str) -> bool:
        """Valida chave Pix (sempre retorna True no mock)."""
        logger.info(f"[MOCK] Validating Pix key: {pix_key} ({pix_type})")
        
        # Validação básica de formato
        if not pix_key:
            return False
        
        if pix_type == "cpf" and len(pix_key.replace(".", "").replace("-", "")) != 11:
            return False
        
        if pix_type == "cnpj" and len(pix_key.replace(".", "").replace("-", "").replace("/", "")) != 14:
            return False
        
        if pix_type == "email" and "@" not in pix_key:
            return False
        
        return True
    
    async def get_balance(self) -> float:
        """Retorna saldo simulado."""
        return self._balance
    
    def reset_balance(self, amount: float = 100000.0):
        """Reseta o saldo para testes."""
        self._balance = amount
        self._transactions.clear()
