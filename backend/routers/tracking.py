"""GPS Tracking routes."""
from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime, timezone
from bson import ObjectId

from database import matches_collection, location_tracking_collection, delivery_routes_collection
from auth import get_current_user_id
from websocket_manager import manager
from notification_service import create_notification, NotificationType

router = APIRouter()


@router.get("/{match_id}/status")
async def get_tracking_status(match_id: str, user_id: str = Depends(get_current_user_id)):
    """Get tracking status for a delivery."""
    match = await matches_collection.find_one({"_id": ObjectId(match_id)})
    if not match:
        raise HTTPException(status_code=404, detail="Combinação não encontrada")
    
    if user_id not in [match["carrier_id"], match["sender_id"]]:
        raise HTTPException(status_code=403, detail="Acesso negado")
    
    is_active = manager.is_tracking_active(match_id)
    watchers_count = manager.get_active_watchers_count(match_id)
    
    last_location = await location_tracking_collection.find_one(
        {"match_id": match_id},
        sort=[("timestamp", -1)]
    )
    
    return {
        "match_id": match_id,
        "is_tracking_active": is_active,
        "watchers_count": watchers_count,
        "last_location": {
            "lat": last_location["lat"],
            "lng": last_location["lng"],
            "accuracy": last_location.get("accuracy", 0),
            "speed": last_location.get("speed", 0),
            "timestamp": last_location["timestamp"].isoformat()
        } if last_location else None
    }


@router.get("/{match_id}/history")
async def get_tracking_history(
    match_id: str,
    limit: int = 100,
    user_id: str = Depends(get_current_user_id)
):
    """Get tracking history for a delivery."""
    match = await matches_collection.find_one({"_id": ObjectId(match_id)})
    if not match:
        raise HTTPException(status_code=404, detail="Combinação não encontrada")
    
    if user_id not in [match["carrier_id"], match["sender_id"]]:
        raise HTTPException(status_code=403, detail="Acesso negado")
    
    route = await delivery_routes_collection.find_one({"match_id": match_id})
    
    if route and route.get("route_points"):
        points = route["route_points"][-limit:]
        return {
            "match_id": match_id,
            "route_points": [
                {
                    "lat": p["lat"],
                    "lng": p["lng"],
                    "timestamp": p.get("timestamp", "").isoformat() if hasattr(p.get("timestamp", ""), "isoformat") else str(p.get("timestamp", ""))
                }
                for p in points
            ],
            "total_points": len(route["route_points"]),
            "carrier_id": route.get("carrier_id"),
            "created_at": route.get("created_at").isoformat() if route.get("created_at") else None
        }
    
    return {
        "match_id": match_id,
        "route_points": [],
        "total_points": 0
    }


@router.post("/{match_id}/start")
async def start_tracking(
    match_id: str,
    interval_seconds: int = 15,
    user_id: str = Depends(get_current_user_id)
):
    """Start tracking for a delivery (carrier only)."""
    match = await matches_collection.find_one({"_id": ObjectId(match_id)})
    if not match:
        raise HTTPException(status_code=404, detail="Combinação não encontrada")
    
    if user_id != match["carrier_id"]:
        raise HTTPException(status_code=403, detail="Apenas o transportador pode iniciar o rastreamento")
    
    if match.get("status") not in ["paid", "in_transit"]:
        raise HTTPException(status_code=400, detail="O rastreamento só pode ser iniciado para entregas pagas ou em trânsito")
    
    if match.get("status") == "paid":
        await matches_collection.update_one(
            {"_id": ObjectId(match_id)},
            {"$set": {"status": "in_transit", "tracking_started_at": datetime.now(timezone.utc)}}
        )
        
        await create_notification(
            match["sender_id"],
            NotificationType.DELIVERY_IN_TRANSIT,
            {"route": f"{match.get('origin_city', 'Origem')} → {match.get('destination_city', 'Destino')}"},
            match_id
        )
    
    return {
        "message": "Rastreamento iniciado. Conecte via WebSocket para enviar atualizações.",
        "websocket_url": f"/ws/tracking/{match_id}/carrier",
        "interval_seconds": max(10, min(30, interval_seconds))
    }


@router.post("/{match_id}/stop")
async def stop_tracking(match_id: str, user_id: str = Depends(get_current_user_id)):
    """Stop tracking for a delivery (carrier only)."""
    match = await matches_collection.find_one({"_id": ObjectId(match_id)})
    if not match:
        raise HTTPException(status_code=404, detail="Combinação não encontrada")
    
    if user_id != match["carrier_id"]:
        raise HTTPException(status_code=403, detail="Apenas o transportador pode parar o rastreamento")
    
    if manager.is_tracking_active(match_id):
        await manager.disconnect_carrier(user_id, match_id)
    
    return {"message": "Rastreamento parado"}
