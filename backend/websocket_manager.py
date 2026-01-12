"""
WebSocket Manager for Real-time GPS Tracking
Handles connections, location broadcasts, and delivery tracking
"""
import asyncio
import json
import logging
from typing import Dict, Set, Optional
from datetime import datetime, timezone
from fastapi import WebSocket, WebSocketDisconnect
from bson import ObjectId

logger = logging.getLogger(__name__)

class ConnectionManager:
    """
    Manages WebSocket connections for real-time GPS tracking.
    - Carriers send their location updates
    - Senders receive location updates for their active deliveries
    """
    
    def __init__(self):
        # match_id -> set of connected WebSockets (senders watching)
        self.delivery_watchers: Dict[str, Set[WebSocket]] = {}
        # carrier_id -> WebSocket (carrier sending location)
        self.carrier_connections: Dict[str, WebSocket] = {}
        # match_id -> carrier_id (mapping for broadcasts)
        self.active_deliveries: Dict[str, str] = {}
        # Tracking interval in seconds (configurable per delivery)
        self.tracking_intervals: Dict[str, int] = {}
        
    async def connect_watcher(self, websocket: WebSocket, match_id: str, user_id: str):
        """Connect a sender to watch a delivery"""
        await websocket.accept()
        
        if match_id not in self.delivery_watchers:
            self.delivery_watchers[match_id] = set()
        self.delivery_watchers[match_id].add(websocket)
        
        logger.info(f"Watcher connected: user {user_id} watching match {match_id}")
        
        # Send current tracking status
        await websocket.send_json({
            "type": "connection_status",
            "status": "connected",
            "match_id": match_id,
            "is_tracking_active": match_id in self.active_deliveries
        })
    
    async def connect_carrier(self, websocket: WebSocket, carrier_id: str, match_id: str):
        """Connect a carrier to send location updates"""
        await websocket.accept()
        
        self.carrier_connections[carrier_id] = websocket
        self.active_deliveries[match_id] = carrier_id
        self.tracking_intervals[match_id] = 15  # Default 15 seconds
        
        logger.info(f"Carrier connected: {carrier_id} for match {match_id}")
        
        # Notify watchers that tracking started
        await self.broadcast_to_watchers(match_id, {
            "type": "tracking_started",
            "match_id": match_id,
            "carrier_id": carrier_id,
            "interval_seconds": self.tracking_intervals[match_id]
        })
        
        await websocket.send_json({
            "type": "connection_status",
            "status": "connected",
            "match_id": match_id,
            "tracking_interval": self.tracking_intervals[match_id]
        })
    
    def disconnect_watcher(self, websocket: WebSocket, match_id: str):
        """Disconnect a watcher"""
        if match_id in self.delivery_watchers:
            self.delivery_watchers[match_id].discard(websocket)
            if not self.delivery_watchers[match_id]:
                del self.delivery_watchers[match_id]
        logger.info(f"Watcher disconnected from match {match_id}")
    
    async def disconnect_carrier(self, carrier_id: str, match_id: str):
        """Disconnect a carrier and notify watchers"""
        if carrier_id in self.carrier_connections:
            del self.carrier_connections[carrier_id]
        
        if match_id in self.active_deliveries:
            del self.active_deliveries[match_id]
        
        if match_id in self.tracking_intervals:
            del self.tracking_intervals[match_id]
        
        # Notify watchers that tracking stopped
        await self.broadcast_to_watchers(match_id, {
            "type": "tracking_stopped",
            "match_id": match_id,
            "reason": "carrier_disconnected"
        })
        
        logger.info(f"Carrier {carrier_id} disconnected from match {match_id}")
    
    async def broadcast_location(self, match_id: str, location_data: dict):
        """Broadcast carrier location to all watchers of a delivery"""
        message = {
            "type": "location_update",
            "match_id": match_id,
            "location": location_data,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
        await self.broadcast_to_watchers(match_id, message)
    
    async def broadcast_to_watchers(self, match_id: str, message: dict):
        """Send a message to all watchers of a delivery"""
        if match_id not in self.delivery_watchers:
            return
        
        disconnected = set()
        for websocket in self.delivery_watchers[match_id]:
            try:
                await websocket.send_json(message)
            except Exception as e:
                logger.error(f"Error sending to watcher: {e}")
                disconnected.add(websocket)
        
        # Clean up disconnected watchers
        for ws in disconnected:
            self.delivery_watchers[match_id].discard(ws)
    
    def set_tracking_interval(self, match_id: str, interval_seconds: int):
        """Update tracking interval for a delivery (10-30 seconds)"""
        interval = max(10, min(30, interval_seconds))
        self.tracking_intervals[match_id] = interval
        return interval
    
    def is_tracking_active(self, match_id: str) -> bool:
        """Check if tracking is active for a delivery"""
        return match_id in self.active_deliveries
    
    def get_active_watchers_count(self, match_id: str) -> int:
        """Get number of watchers for a delivery"""
        return len(self.delivery_watchers.get(match_id, set()))


# Global connection manager instance
manager = ConnectionManager()


async def handle_carrier_messages(websocket: WebSocket, carrier_id: str, match_id: str, db_collections: dict):
    """
    Handle incoming messages from carrier WebSocket.
    Expected message types:
    - location_update: {lat, lng, accuracy, speed, heading}
    - pause_tracking: Stop sending updates
    - resume_tracking: Resume sending updates
    - set_interval: Change update frequency
    """
    from database import location_tracking_collection, delivery_routes_collection
    
    try:
        while True:
            data = await websocket.receive_json()
            msg_type = data.get("type")
            
            if msg_type == "location_update":
                location = {
                    "lat": data.get("lat"),
                    "lng": data.get("lng"),
                    "accuracy": data.get("accuracy", 0),
                    "speed": data.get("speed", 0),
                    "heading": data.get("heading", 0),
                    "battery_level": data.get("battery_level"),
                    "timestamp": datetime.now(timezone.utc)
                }
                
                # Store location in database
                await location_tracking_collection.insert_one({
                    "match_id": match_id,
                    "carrier_id": carrier_id,
                    **location
                })
                
                # Update delivery route history
                await delivery_routes_collection.update_one(
                    {"match_id": match_id},
                    {
                        "$push": {"route_points": {"lat": location["lat"], "lng": location["lng"], "timestamp": location["timestamp"]}},
                        "$set": {"last_location": location, "updated_at": datetime.now(timezone.utc)},
                        "$setOnInsert": {"created_at": datetime.now(timezone.utc), "carrier_id": carrier_id}
                    },
                    upsert=True
                )
                
                # Broadcast to watchers
                await manager.broadcast_location(match_id, location)
                
                # Acknowledge receipt
                await websocket.send_json({
                    "type": "location_ack",
                    "timestamp": location["timestamp"].isoformat()
                })
            
            elif msg_type == "pause_tracking":
                await manager.broadcast_to_watchers(match_id, {
                    "type": "tracking_paused",
                    "match_id": match_id,
                    "reason": data.get("reason", "carrier_paused")
                })
                await websocket.send_json({"type": "pause_ack", "status": "paused"})
            
            elif msg_type == "resume_tracking":
                await manager.broadcast_to_watchers(match_id, {
                    "type": "tracking_resumed",
                    "match_id": match_id
                })
                await websocket.send_json({"type": "resume_ack", "status": "resumed"})
            
            elif msg_type == "set_interval":
                new_interval = manager.set_tracking_interval(match_id, data.get("interval", 15))
                await websocket.send_json({
                    "type": "interval_updated",
                    "interval_seconds": new_interval
                })
            
            elif msg_type == "ping":
                await websocket.send_json({"type": "pong"})
                
    except WebSocketDisconnect:
        logger.info(f"Carrier {carrier_id} WebSocket disconnected")
    except Exception as e:
        logger.error(f"Error handling carrier message: {e}")
    finally:
        await manager.disconnect_carrier(carrier_id, match_id)


async def handle_watcher_messages(websocket: WebSocket, user_id: str, match_id: str):
    """
    Handle incoming messages from watcher WebSocket.
    Expected message types:
    - ping: Keep-alive
    - get_last_location: Request current carrier location
    """
    from database import location_tracking_collection
    
    try:
        while True:
            data = await websocket.receive_json()
            msg_type = data.get("type")
            
            if msg_type == "ping":
                await websocket.send_json({"type": "pong"})
            
            elif msg_type == "get_last_location":
                # Get last known location from database
                last_location = await location_tracking_collection.find_one(
                    {"match_id": match_id},
                    sort=[("timestamp", -1)]
                )
                
                if last_location:
                    await websocket.send_json({
                        "type": "last_location",
                        "location": {
                            "lat": last_location["lat"],
                            "lng": last_location["lng"],
                            "accuracy": last_location.get("accuracy", 0),
                            "speed": last_location.get("speed", 0),
                            "timestamp": last_location["timestamp"].isoformat()
                        }
                    })
                else:
                    await websocket.send_json({
                        "type": "last_location",
                        "location": None,
                        "message": "Nenhuma localização disponível"
                    })
            
            elif msg_type == "get_route_history":
                # Get route history for the delivery
                from database import delivery_routes_collection
                route = await delivery_routes_collection.find_one({"match_id": match_id})
                
                if route and route.get("route_points"):
                    await websocket.send_json({
                        "type": "route_history",
                        "route_points": [
                            {"lat": p["lat"], "lng": p["lng"]}
                            for p in route["route_points"][-100:]  # Last 100 points
                        ]
                    })
                else:
                    await websocket.send_json({
                        "type": "route_history",
                        "route_points": []
                    })
                    
    except WebSocketDisconnect:
        logger.info(f"Watcher {user_id} WebSocket disconnected")
    except Exception as e:
        logger.error(f"Error handling watcher message: {e}")
    finally:
        manager.disconnect_watcher(websocket, match_id)
