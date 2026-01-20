"""
Payout Models - Entidade central para controle de pagamentos aos transportadores.

Este módulo define os estados e estruturas de dados para o sistema de payout híbrido.
O design prioriza auditabilidade, segurança e preparação para automação futura.
"""
from enum import Enum
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime


class PayoutStatus(str, Enum):
    """
    Estados do ciclo de vida de um payout.
    
    Fluxo normal:
    PENDING → ELIGIBLE → READY_FOR_PAYOUT → PROCESSING → PAID_OUT
    
    Fluxos alternativos:
    PENDING → BLOCKED_NO_PIX (transportador sem Pix)
    PENDING → CANCELLED (match cancelado)
    PROCESSING → FAILED (erro no gateway)
    """
    # Aguardando confirmação de entrega ou expiração do prazo
    PENDING = "pending"
    
    # Entrega confirmada, aguardando validação de Pix
    ELIGIBLE = "eligible"
    
    # Pronto para payout (Pix válido, entrega confirmada)
    READY_FOR_PAYOUT = "ready_for_payout"
    
    # Bloqueado - transportador sem método de pagamento
    BLOCKED_NO_PIX = "blocked_no_pix"
    
    # Em processamento no gateway
    PROCESSING = "processing"
    
    # Payout executado com sucesso
    PAID_OUT = "paid_out"
    
    # Falha no processamento
    FAILED = "failed"
    
    # Cancelado (match cancelado, disputa, etc)
    CANCELLED = "cancelled"


class PayoutTrigger(str, Enum):
    """Motivo que tornou o payout elegível."""
    SENDER_CONFIRMED = "sender_confirmed"
    AUTO_TIMEOUT = "auto_timeout"
    ADMIN_OVERRIDE = "admin_override"


class PayoutLogEntry(BaseModel):
    """Entrada no log de auditoria do payout."""
    timestamp: datetime
    action: str
    actor: str  # "system", "admin:{id}", "carrier:{id}", "sender:{id}"
    details: Optional[dict] = None
    ip_address: Optional[str] = None


class PayoutCreate(BaseModel):
    """Dados para criar um novo payout."""
    match_id: str
    payment_id: str
    carrier_id: str
    sender_id: str
    
    gross_amount: float = Field(..., description="Valor total pago pelo sender")
    platform_fee: float = Field(..., description="Taxa da plataforma")
    net_amount: float = Field(..., description="Valor líquido para o transportador")
    
    delivery_confirmed_at: Optional[datetime] = None
    trigger: PayoutTrigger = PayoutTrigger.SENDER_CONFIRMED


class PayoutResponse(BaseModel):
    """Resposta da API para um payout."""
    id: str
    match_id: str
    carrier_id: str
    carrier_name: str
    carrier_pix: Optional[str]
    
    gross_amount: float
    platform_fee: float
    net_amount: float
    
    status: PayoutStatus
    trigger: Optional[PayoutTrigger]
    
    created_at: datetime
    eligible_at: Optional[datetime]
    processed_at: Optional[datetime]
    
    trip_origin: Optional[str]
    trip_destination: Optional[str]


class PayoutExecutionResult(BaseModel):
    """Resultado da execução de um payout."""
    payout_id: str
    success: bool
    status: PayoutStatus
    gateway_reference: Optional[str] = None
    error_message: Optional[str] = None
    processed_at: datetime


class DailyPayoutReport(BaseModel):
    """Relatório de execução diária de payouts."""
    execution_date: datetime
    executed_by: str
    
    total_processed: int
    successful: int
    failed: int
    blocked: int
    
    total_amount_paid: float
    total_platform_fees: float
    
    results: List[PayoutExecutionResult]
    errors: List[str]
