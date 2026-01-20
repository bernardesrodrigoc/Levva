"""
Payout Service - Serviço central para gestão de payouts.

Este serviço gerencia todo o ciclo de vida dos payouts, desde a criação
até a execução. Prioriza auditabilidade, segurança e controle manual.

O design permite automação futura sem mudanças na interface.
"""
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any
from bson import ObjectId

from database import db
from providers import PaymentProvider, PayoutRequest, ProviderStatus
from payout_models import (
    PayoutStatus, 
    PayoutTrigger, 
    PayoutCreate,
    PayoutExecutionResult,
    DailyPayoutReport
)

logger = logging.getLogger(__name__)

# Collections
payouts_collection = db["payouts"]
payments_collection = db["payments"]
matches_collection = db["matches"]
users_collection = db["users"]


class PayoutService:
    """
    Serviço para gestão de payouts aos transportadores.
    
    Responsabilidades:
    - Criar payouts quando entrega é confirmada
    - Verificar elegibilidade de payouts
    - Executar payouts (manual via admin)
    - Manter log de auditoria completo
    """
    
    def __init__(self, provider: PaymentProvider):
        self.provider = provider
        logger.info(f"PayoutService initialized with provider: {provider.name}")
    
    async def create_payout(self, data: PayoutCreate) -> str:
        """
        Cria um novo payout pendente.
        
        Chamado quando:
        - Sender confirma entrega
        - Auto-confirmação por timeout
        
        Returns:
            ID do payout criado
        """
        # Verificar se já existe payout para este match
        existing = await payouts_collection.find_one({"match_id": data.match_id})
        if existing:
            logger.warning(f"Payout already exists for match {data.match_id}")
            return str(existing["_id"])
        
        # Buscar dados do transportador
        carrier = await users_collection.find_one({"_id": ObjectId(data.carrier_id)})
        has_pix = carrier and carrier.get("pix_key")
        
        # Determinar status inicial
        initial_status = PayoutStatus.ELIGIBLE if has_pix else PayoutStatus.BLOCKED_NO_PIX
        
        now = datetime.now(timezone.utc)
        
        payout_doc = {
            "match_id": data.match_id,
            "payment_id": data.payment_id,
            "carrier_id": data.carrier_id,
            "sender_id": data.sender_id,
            
            "gross_amount": data.gross_amount,
            "platform_fee": data.platform_fee,
            "net_amount": data.net_amount,
            
            "status": initial_status.value,
            "trigger": data.trigger.value,
            
            "carrier_pix_key": carrier.get("pix_key") if carrier else None,
            "carrier_pix_type": carrier.get("pix_type") if carrier else None,
            
            "created_at": now,
            "eligible_at": now if has_pix else None,
            "processed_at": None,
            "failed_at": None,
            
            "provider_id": None,
            "provider_reference": None,
            "provider_response": None,
            
            "audit_log": [
                {
                    "timestamp": now,
                    "action": "created",
                    "actor": "system",
                    "details": {
                        "trigger": data.trigger.value,
                        "has_pix": has_pix,
                        "initial_status": initial_status.value
                    }
                }
            ]
        }
        
        result = await payouts_collection.insert_one(payout_doc)
        payout_id = str(result.inserted_id)
        
        logger.info(f"Created payout {payout_id} for match {data.match_id}")
        logger.info(f"Status: {initial_status.value}, Amount: R$ {data.net_amount:.2f}")
        
        return payout_id
    
    async def check_and_update_eligibility(self, payout_id: str) -> PayoutStatus:
        """
        Verifica e atualiza elegibilidade de um payout.
        
        Chamado quando transportador atualiza dados de Pix.
        """
        payout = await payouts_collection.find_one({"_id": ObjectId(payout_id)})
        if not payout:
            raise ValueError(f"Payout {payout_id} not found")
        
        carrier = await users_collection.find_one({"_id": ObjectId(payout["carrier_id"])})
        has_pix = carrier and carrier.get("pix_key")
        
        current_status = payout["status"]
        new_status = current_status
        
        # Se estava bloqueado e agora tem Pix, tornar elegível
        if current_status == PayoutStatus.BLOCKED_NO_PIX.value and has_pix:
            new_status = PayoutStatus.ELIGIBLE.value
            
            await payouts_collection.update_one(
                {"_id": ObjectId(payout_id)},
                {
                    "$set": {
                        "status": new_status,
                        "eligible_at": datetime.now(timezone.utc),
                        "carrier_pix_key": carrier.get("pix_key"),
                        "carrier_pix_type": carrier.get("pix_type")
                    },
                    "$push": {
                        "audit_log": {
                            "timestamp": datetime.now(timezone.utc),
                            "action": "unblocked",
                            "actor": f"carrier:{payout['carrier_id']}",
                            "details": {"pix_key": carrier.get("pix_key")}
                        }
                    }
                }
            )
            
            logger.info(f"Payout {payout_id} unblocked - now eligible")
        
        return PayoutStatus(new_status)
    
    async def get_ready_for_payout(self) -> List[Dict[str, Any]]:
        """
        Retorna todos os payouts prontos para execução.
        
        Critérios:
        - Status: ELIGIBLE ou READY_FOR_PAYOUT
        - Transportador tem Pix válido
        """
        payouts = await payouts_collection.find({
            "status": {"$in": [PayoutStatus.ELIGIBLE.value, PayoutStatus.READY_FOR_PAYOUT.value]}
        }).to_list(500)
        
        result = []
        for payout in payouts:
            # Verificar Pix atualizado
            carrier = await users_collection.find_one({"_id": ObjectId(payout["carrier_id"])})
            
            if carrier and carrier.get("pix_key"):
                payout["id"] = str(payout.pop("_id"))
                payout["carrier_name"] = carrier.get("name", "N/A")
                payout["carrier_email"] = carrier.get("email", "N/A")
                payout["carrier_pix_key"] = carrier.get("pix_key")
                payout["carrier_pix_type"] = carrier.get("pix_type")
                result.append(payout)
        
        return result
    
    async def execute_payout(
        self, 
        payout_id: str, 
        admin_id: str
    ) -> PayoutExecutionResult:
        """
        Executa um único payout.
        
        Args:
            payout_id: ID do payout
            admin_id: ID do admin que autorizou
            
        Returns:
            Resultado da execução
        """
        payout = await payouts_collection.find_one({"_id": ObjectId(payout_id)})
        if not payout:
            raise ValueError(f"Payout {payout_id} not found")
        
        # Validar status
        if payout["status"] not in [PayoutStatus.ELIGIBLE.value, PayoutStatus.READY_FOR_PAYOUT.value]:
            return PayoutExecutionResult(
                payout_id=payout_id,
                success=False,
                status=PayoutStatus(payout["status"]),
                error_message=f"Invalid status: {payout['status']}",
                processed_at=datetime.now(timezone.utc)
            )
        
        # Buscar dados atualizados do carrier
        carrier = await users_collection.find_one({"_id": ObjectId(payout["carrier_id"])})
        if not carrier or not carrier.get("pix_key"):
            await self._mark_blocked(payout_id, admin_id, "Transportador sem Pix cadastrado")
            return PayoutExecutionResult(
                payout_id=payout_id,
                success=False,
                status=PayoutStatus.BLOCKED_NO_PIX,
                error_message="Carrier has no Pix key",
                processed_at=datetime.now(timezone.utc)
            )
        
        # Marcar como processando
        await payouts_collection.update_one(
            {"_id": ObjectId(payout_id)},
            {
                "$set": {"status": PayoutStatus.PROCESSING.value},
                "$push": {
                    "audit_log": {
                        "timestamp": datetime.now(timezone.utc),
                        "action": "processing_started",
                        "actor": f"admin:{admin_id}",
                        "details": {}
                    }
                }
            }
        )
        
        # Executar via provider
        request = PayoutRequest(
            payout_id=payout_id,
            amount=payout["net_amount"],
            recipient_pix_key=carrier["pix_key"],
            recipient_pix_type=carrier.get("pix_type", "email"),
            recipient_name=carrier.get("name", ""),
            description=f"Payout Levva - Match {payout['match_id'][-8:]}",
            reference_id=payout_id
        )
        
        try:
            response = await self.provider.execute_payout(request)
            
            now = datetime.now(timezone.utc)
            
            if response.success:
                # Sucesso
                await payouts_collection.update_one(
                    {"_id": ObjectId(payout_id)},
                    {
                        "$set": {
                            "status": PayoutStatus.PAID_OUT.value,
                            "processed_at": now,
                            "provider_id": response.provider_id,
                            "provider_reference": response.provider_reference,
                            "provider_response": response.raw_response
                        },
                        "$push": {
                            "audit_log": {
                                "timestamp": now,
                                "action": "paid_out",
                                "actor": f"admin:{admin_id}",
                                "details": {
                                    "provider": self.provider.name,
                                    "provider_id": response.provider_id,
                                    "amount": payout["net_amount"]
                                }
                            }
                        }
                    }
                )
                
                logger.info(f"Payout {payout_id} executed successfully")
                
                return PayoutExecutionResult(
                    payout_id=payout_id,
                    success=True,
                    status=PayoutStatus.PAID_OUT,
                    gateway_reference=response.provider_id,
                    processed_at=now
                )
            else:
                # Falha
                await self._mark_failed(payout_id, admin_id, response.error_message)
                
                return PayoutExecutionResult(
                    payout_id=payout_id,
                    success=False,
                    status=PayoutStatus.FAILED,
                    error_message=response.error_message,
                    processed_at=now
                )
                
        except Exception as e:
            logger.error(f"Error executing payout {payout_id}: {e}")
            await self._mark_failed(payout_id, admin_id, str(e))
            
            return PayoutExecutionResult(
                payout_id=payout_id,
                success=False,
                status=PayoutStatus.FAILED,
                error_message=str(e),
                processed_at=datetime.now(timezone.utc)
            )
    
    async def execute_daily_payouts(self, admin_id: str) -> DailyPayoutReport:
        """
        Executa todos os payouts elegíveis do dia.
        
        Este é o método principal chamado pelo admin para processar payouts.
        Processa um por um, logando tudo.
        
        Args:
            admin_id: ID do admin executando
            
        Returns:
            Relatório completo da execução
        """
        logger.info(f"Starting daily payout execution by admin {admin_id}")
        
        # Buscar payouts prontos
        ready_payouts = await self.get_ready_for_payout()
        
        results = []
        errors = []
        successful = 0
        failed = 0
        blocked = 0
        total_paid = 0.0
        total_fees = 0.0
        
        for payout in ready_payouts:
            try:
                result = await self.execute_payout(payout["id"], admin_id)
                results.append(result)
                
                if result.success:
                    successful += 1
                    total_paid += payout["net_amount"]
                    total_fees += payout["platform_fee"]
                elif result.status == PayoutStatus.BLOCKED_NO_PIX:
                    blocked += 1
                else:
                    failed += 1
                    
            except Exception as e:
                logger.error(f"Error processing payout {payout['id']}: {e}")
                errors.append(f"Payout {payout['id']}: {str(e)}")
                failed += 1
        
        report = DailyPayoutReport(
            execution_date=datetime.now(timezone.utc),
            executed_by=admin_id,
            total_processed=len(ready_payouts),
            successful=successful,
            failed=failed,
            blocked=blocked,
            total_amount_paid=total_paid,
            total_platform_fees=total_fees,
            results=results,
            errors=errors
        )
        
        logger.info(f"Daily payout execution complete: {successful}/{len(ready_payouts)} successful")
        logger.info(f"Total paid: R$ {total_paid:.2f}")
        
        return report
    
    async def _mark_blocked(self, payout_id: str, admin_id: str, reason: str):
        """Marca payout como bloqueado."""
        await payouts_collection.update_one(
            {"_id": ObjectId(payout_id)},
            {
                "$set": {"status": PayoutStatus.BLOCKED_NO_PIX.value},
                "$push": {
                    "audit_log": {
                        "timestamp": datetime.now(timezone.utc),
                        "action": "blocked",
                        "actor": f"admin:{admin_id}",
                        "details": {"reason": reason}
                    }
                }
            }
        )
    
    async def _mark_failed(self, payout_id: str, admin_id: str, reason: str):
        """Marca payout como falhou."""
        await payouts_collection.update_one(
            {"_id": ObjectId(payout_id)},
            {
                "$set": {
                    "status": PayoutStatus.FAILED.value,
                    "failed_at": datetime.now(timezone.utc)
                },
                "$push": {
                    "audit_log": {
                        "timestamp": datetime.now(timezone.utc),
                        "action": "failed",
                        "actor": f"admin:{admin_id}",
                        "details": {"reason": reason}
                    }
                }
            }
        )
    
    async def get_carrier_pending_balance(self, carrier_id: str) -> Dict[str, Any]:
        """
        Retorna saldo pendente de um transportador.
        
        Usado no dashboard do transportador.
        """
        # Payouts pendentes (não pagos)
        pending = await payouts_collection.find({
            "carrier_id": carrier_id,
            "status": {"$in": [
                PayoutStatus.PENDING.value,
                PayoutStatus.ELIGIBLE.value,
                PayoutStatus.READY_FOR_PAYOUT.value,
                PayoutStatus.BLOCKED_NO_PIX.value
            ]}
        }).to_list(100)
        
        pending_amount = sum(p["net_amount"] for p in pending)
        blocked_amount = sum(p["net_amount"] for p in pending if p["status"] == PayoutStatus.BLOCKED_NO_PIX.value)
        
        # Payouts já pagos
        paid = await payouts_collection.find({
            "carrier_id": carrier_id,
            "status": PayoutStatus.PAID_OUT.value
        }).to_list(100)
        
        total_received = sum(p["net_amount"] for p in paid)
        
        # Verificar se tem Pix
        carrier = await users_collection.find_one({"_id": ObjectId(carrier_id)})
        has_pix = carrier and carrier.get("pix_key")
        
        return {
            "pending_amount": pending_amount,
            "blocked_amount": blocked_amount,
            "total_received": total_received,
            "pending_count": len(pending),
            "has_pix": has_pix,
            "pix_key": carrier.get("pix_key") if carrier else None
        }
    
    async def get_payout_stats(self) -> Dict[str, Any]:
        """Retorna estatísticas gerais de payouts para admin."""
        pipeline = [
            {
                "$group": {
                    "_id": "$status",
                    "count": {"$sum": 1},
                    "total_net": {"$sum": "$net_amount"},
                    "total_fees": {"$sum": "$platform_fee"}
                }
            }
        ]
        
        stats = await payouts_collection.aggregate(pipeline).to_list(20)
        
        by_status = {s["_id"]: {"count": s["count"], "amount": s["total_net"]} for s in stats}
        
        total_pending = sum(
            s["total_net"] for s in stats 
            if s["_id"] in [PayoutStatus.PENDING.value, PayoutStatus.ELIGIBLE.value, PayoutStatus.READY_FOR_PAYOUT.value]
        )
        total_blocked = sum(s["total_net"] for s in stats if s["_id"] == PayoutStatus.BLOCKED_NO_PIX.value)
        total_paid = sum(s["total_net"] for s in stats if s["_id"] == PayoutStatus.PAID_OUT.value)
        total_fees = sum(s["total_fees"] for s in stats if s["_id"] == PayoutStatus.PAID_OUT.value)
        
        return {
            "by_status": by_status,
            "total_pending": total_pending,
            "total_blocked": total_blocked,
            "total_paid_out": total_paid,
            "total_platform_fees_collected": total_fees,
            "provider": self.provider.name
        }


# Singleton instance
_payout_service: Optional[PayoutService] = None


def get_payout_service() -> PayoutService:
    """Retorna instância singleton do PayoutService."""
    global _payout_service
    if _payout_service is None:
        from providers import MockPaymentProvider
        # MVP: usar provider simulado
        provider = MockPaymentProvider()
        _payout_service = PayoutService(provider)
    return _payout_service
