"""
Payment Provider Interface - Abstração para gateways de pagamento.

Este módulo define a interface que qualquer provedor de pagamento deve implementar.
O objetivo é evitar vendor lock-in e permitir troca de gateway sem alterar o core.
"""
from abc import ABC, abstractmethod
from typing import Optional, Dict, Any
from dataclasses import dataclass
from datetime import datetime
from enum import Enum


class ProviderStatus(str, Enum):
    """Status de uma operação no provider."""
    SUCCESS = "success"
    PENDING = "pending"
    FAILED = "failed"
    CANCELLED = "cancelled"


@dataclass
class PayoutRequest:
    """Requisição de payout para o provider."""
    payout_id: str
    amount: float
    recipient_pix_key: str
    recipient_pix_type: str  # cpf, cnpj, email, phone, random
    recipient_name: str
    description: str
    reference_id: str  # ID interno para reconciliação
    
    currency: str = "BRL"
    metadata: Optional[Dict[str, Any]] = None


@dataclass
class PayoutResponse:
    """Resposta do provider após tentativa de payout."""
    success: bool
    status: ProviderStatus
    
    provider_id: Optional[str] = None  # ID da transação no provider
    provider_reference: Optional[str] = None
    
    processed_at: Optional[datetime] = None
    
    error_code: Optional[str] = None
    error_message: Optional[str] = None
    
    raw_response: Optional[Dict[str, Any]] = None


@dataclass
class PayoutStatusCheck:
    """Resultado de consulta de status de payout."""
    payout_id: str
    provider_id: str
    status: ProviderStatus
    
    amount: float
    paid_at: Optional[datetime] = None
    
    recipient_confirmed: bool = False


class PaymentProvider(ABC):
    """
    Interface abstrata para provedores de pagamento.
    
    Qualquer gateway (Mercado Pago, PagSeguro, Stripe, etc.) deve implementar
    esta interface para ser usado no sistema.
    """
    
    @property
    @abstractmethod
    def name(self) -> str:
        """Nome do provider para logs e identificação."""
        pass
    
    @property
    @abstractmethod
    def supports_pix(self) -> bool:
        """Indica se o provider suporta Pix."""
        pass
    
    @abstractmethod
    async def execute_payout(self, request: PayoutRequest) -> PayoutResponse:
        """
        Executa um payout para o destinatário.
        
        Args:
            request: Dados do payout a ser executado
            
        Returns:
            PayoutResponse com resultado da operação
        """
        pass
    
    @abstractmethod
    async def check_payout_status(self, provider_id: str) -> PayoutStatusCheck:
        """
        Consulta o status de um payout no provider.
        
        Args:
            provider_id: ID da transação no provider
            
        Returns:
            PayoutStatusCheck com status atual
        """
        pass
    
    @abstractmethod
    async def validate_pix_key(self, pix_key: str, pix_type: str) -> bool:
        """
        Valida se uma chave Pix é válida.
        
        Args:
            pix_key: Chave Pix
            pix_type: Tipo da chave (cpf, cnpj, email, phone, random)
            
        Returns:
            True se a chave é válida
        """
        pass
    
    @abstractmethod
    async def get_balance(self) -> float:
        """
        Retorna o saldo disponível na conta do provider.
        
        Returns:
            Saldo em BRL
        """
        pass
    
    async def health_check(self) -> bool:
        """
        Verifica se o provider está operacional.
        
        Returns:
            True se o provider está funcionando
        """
        try:
            await self.get_balance()
            return True
        except Exception:
            return False
