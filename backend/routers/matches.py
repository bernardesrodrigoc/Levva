"""Match management routes."""
from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime, timezone
from bson import ObjectId

from database import (
    users_collection, trips_collection, shipments_collection,
    matches_collection, payments_collection
)
from models import TripStatus, ShipmentStatus, PaymentStatus
from auth import get_current_user_id
from route_service import check_shipment_matches_route, calculate_corridor_match_score, haversine_distance
from notification_service import create_notification, NotificationType
from services.pricing_service import calculate_intelligent_price
from services.capacity_service import (
    can_add_shipment_to_trip, 
    update_trip_available_capacity,
    calculate_volume_liters
)

router = APIRouter()


@router.get("/suggestions")
async def get_match_suggestions(user_id: str = Depends(get_current_user_id)):
    """
    Get smart match suggestions based on route corridor matching.
    Uses polyline corridors to find shipments that can be picked up along a route.
    """
    user = await users_collection.find_one({"_id": ObjectId(user_id)})
    suggestions = []
    
    # Get user's published shipments
    user_shipments = await shipments_collection.find({
        "sender_id": user_id,
        "status": "published"
    }).to_list(100)
    
    # Get user's published trips  
    user_trips = await trips_collection.find({
        "carrier_id": user_id,
        "status": "published"
    }).to_list(100)
    
    # For each shipment, find trips whose corridor includes both pickup and dropoff
    for shipment in user_shipments:
        pickup_lat = shipment["origin"].get("lat", 0)
        pickup_lng = shipment["origin"].get("lng", 0)
        dropoff_lat = shipment["destination"].get("lat", 0)
        dropoff_lng = shipment["destination"].get("lng", 0)
        shipment_weight = shipment["package"]["weight_kg"]
        
        potential_trips = await trips_collection.find({
            "carrier_id": {"$ne": user_id},
            "status": "published",
            "$or": [
                {"available_capacity_kg": {"$gte": shipment_weight}},
                {"cargo_space.max_weight_kg": {"$gte": shipment_weight}},
                {"available_capacity_kg": {"$exists": False}, "cargo_space": {"$exists": False}}
            ]
        }).to_list(50)
        
        for trip in potential_trips:
            route_polyline = trip.get("route_polyline")
            corridor_radius = trip.get("corridor_radius_km", 10.0)
            
            trip_capacity = trip.get("available_capacity_kg") or trip.get("cargo_space", {}).get("max_weight_kg", 50)
            if trip_capacity < shipment_weight:
                continue
            
            # Match logic
            if not route_polyline:
                origin_city_match = trip["origin"]["city"].lower() == shipment["origin"]["city"].lower()
                dest_city_match = trip["destination"]["city"].lower() == shipment["destination"]["city"].lower()
                
                if origin_city_match and dest_city_match:
                    matches = True
                    match_details = {"pickup_distance_km": 0, "dropoff_distance_km": 0, "total_deviation_km": 0}
                else:
                    trip_origin_lat = trip["origin"].get("lat", 0)
                    trip_origin_lng = trip["origin"].get("lng", 0)
                    trip_dest_lat = trip["destination"].get("lat", 0)
                    trip_dest_lng = trip["destination"].get("lng", 0)
                    
                    pickup_distance = haversine_distance(pickup_lat, pickup_lng, trip_origin_lat, trip_origin_lng)
                    dropoff_distance = haversine_distance(dropoff_lat, dropoff_lng, trip_dest_lat, trip_dest_lng)
                    
                    if pickup_distance <= corridor_radius and dropoff_distance <= corridor_radius:
                        matches = True
                        match_details = {
                            "pickup_distance_km": round(pickup_distance, 2),
                            "dropoff_distance_km": round(dropoff_distance, 2),
                            "total_deviation_km": round(pickup_distance + dropoff_distance, 2)
                        }
                    else:
                        continue
            else:
                matches, match_details = check_shipment_matches_route(
                    pickup_lat, pickup_lng,
                    dropoff_lat, dropoff_lng,
                    route_polyline,
                    corridor_radius
                )
            
            if matches:
                carrier = await users_collection.find_one({"_id": ObjectId(trip["carrier_id"])})
                
                # Use intelligent pricing
                distance_km = haversine_distance(pickup_lat, pickup_lng, dropoff_lat, dropoff_lng)
                package = shipment["package"]
                
                from services.pricing_service import calculate_simple_price
                total_price, carrier_earnings, _ = calculate_simple_price(
                    distance_km,
                    package["weight_kg"],
                    package.get("category", "medium")
                )
                
                match_score = calculate_corridor_match_score(
                    match_details.get("pickup_distance_km", 0),
                    match_details.get("dropoff_distance_km", 0),
                    corridor_radius,
                    carrier.get("rating", 0) if carrier else 0,
                    shipment["package"]["weight_kg"],
                    trip.get("cargo_space", {}).get("max_weight_kg", 50)
                )
                
                # Get capacity info
                cargo_space = trip.get("cargo_space", {})
                max_weight = cargo_space.get("max_weight_kg", 50)
                available_weight = trip.get("available_weight_kg", max_weight)
                capacity_percent = round((1 - available_weight / max_weight) * 100, 1) if max_weight > 0 else 0
                
                suggestions.append({
                    "type": "trip_for_shipment",
                    "shipment_id": str(shipment["_id"]),
                    "shipment_description": shipment["package"].get("description", "Envio"),
                    "trip_id": str(trip["_id"]),
                    "carrier_name": carrier["name"] if carrier else "Transportador",
                    "carrier_rating": carrier.get("rating", 0) if carrier else 0,
                    "origin": shipment["origin"]["city"],
                    "destination": shipment["destination"]["city"],
                    "pickup_address": shipment["origin"].get("address"),
                    "dropoff_address": shipment["destination"].get("address"),
                    "departure_date": trip.get("departure_date"),
                    "estimated_price": total_price,
                    "carrier_earnings": carrier_earnings,
                    "match_score": match_score,
                    "deviation_km": match_details.get("total_deviation_km", 0),
                    "corridor_radius_km": corridor_radius,
                    "trip_capacity_used_percent": capacity_percent,
                    "trip_available_weight_kg": available_weight
                })
    
    # For each trip, find shipments within the route corridor
    for trip in user_trips:
        route_polyline = trip.get("route_polyline")
        corridor_radius = trip.get("corridor_radius_km", 10.0)
        trip_capacity = trip.get("available_capacity_kg") or trip.get("cargo_space", {}).get("max_weight_kg", 50)
        
        trip_origin_lat = trip["origin"].get("lat", 0)
        trip_origin_lng = trip["origin"].get("lng", 0)
        trip_dest_lat = trip["destination"].get("lat", 0)
        trip_dest_lng = trip["destination"].get("lng", 0)
        
        potential_shipments = await shipments_collection.find({
            "sender_id": {"$ne": user_id},
            "status": "published",
            "package.weight_kg": {"$lte": trip_capacity}
        }).to_list(50)
        
        for shipment in potential_shipments:
            pickup_lat = shipment["origin"].get("lat", 0)
            pickup_lng = shipment["origin"].get("lng", 0)
            dropoff_lat = shipment["destination"].get("lat", 0)
            dropoff_lng = shipment["destination"].get("lng", 0)
            
            if not route_polyline:
                origin_city_match = trip["origin"]["city"].lower() == shipment["origin"]["city"].lower()
                dest_city_match = trip["destination"]["city"].lower() == shipment["destination"]["city"].lower()
                
                if origin_city_match and dest_city_match:
                    matches = True
                    match_details = {"pickup_distance_km": 0, "dropoff_distance_km": 0, "total_deviation_km": 0}
                else:
                    pickup_distance = haversine_distance(pickup_lat, pickup_lng, trip_origin_lat, trip_origin_lng)
                    dropoff_distance = haversine_distance(dropoff_lat, dropoff_lng, trip_dest_lat, trip_dest_lng)
                    
                    if pickup_distance <= corridor_radius and dropoff_distance <= corridor_radius:
                        matches = True
                        match_details = {
                            "pickup_distance_km": round(pickup_distance, 2),
                            "dropoff_distance_km": round(dropoff_distance, 2),
                            "total_deviation_km": round(pickup_distance + dropoff_distance, 2)
                        }
                    else:
                        continue
            else:
                matches, match_details = check_shipment_matches_route(
                    pickup_lat, pickup_lng,
                    dropoff_lat, dropoff_lng,
                    route_polyline,
                    corridor_radius
                )
            
            if matches:
                sender = await users_collection.find_one({"_id": ObjectId(shipment["sender_id"])})
                
                # Use intelligent pricing
                distance_km = haversine_distance(pickup_lat, pickup_lng, dropoff_lat, dropoff_lng)
                package = shipment["package"]
                
                from services.pricing_service import calculate_simple_price
                total_price, carrier_earnings, _ = calculate_simple_price(
                    distance_km,
                    package["weight_kg"],
                    package.get("category", "medium")
                )
                
                match_score = calculate_corridor_match_score(
                    match_details.get("pickup_distance_km", 0),
                    match_details.get("dropoff_distance_km", 0),
                    corridor_radius,
                    sender.get("rating", 0) if sender else 0,
                    shipment["package"]["weight_kg"],
                    trip.get("cargo_space", {}).get("max_weight_kg", 50)
                )
                
                # Get capacity info
                cargo_space = trip.get("cargo_space", {})
                max_weight = cargo_space.get("max_weight_kg", 50)
                available_weight = trip.get("available_weight_kg", max_weight)
                capacity_percent = round((1 - available_weight / max_weight) * 100, 1) if max_weight > 0 else 0
                
                suggestions.append({
                    "type": "shipment_for_trip",
                    "trip_id": str(trip["_id"]),
                    "shipment_id": str(shipment["_id"]),
                    "shipment_description": shipment["package"].get("description", "Envio"),
                    "sender_name": sender["name"] if sender else "Remetente",
                    "sender_rating": sender.get("rating", 0) if sender else 0,
                    "origin": trip["origin"]["city"],
                    "destination": trip["destination"]["city"],
                    "pickup_address": shipment["origin"].get("address"),
                    "dropoff_address": shipment["destination"].get("address"),
                    "departure_date": trip.get("departure_date"),
                    "weight_kg": shipment["package"]["weight_kg"],
                    "estimated_price": total_price,
                    "carrier_earnings": carrier_earnings,
                    "match_score": match_score,
                    "deviation_km": match_details.get("total_deviation_km", 0),
                    "corridor_radius_km": corridor_radius,
                    "trip_capacity_used_percent": capacity_percent,
                    "trip_available_weight_kg": available_weight
                })
    
    # Sort by match score (highest first)
    suggestions.sort(key=lambda x: x["match_score"], reverse=True)
    
    return suggestions[:20]


@router.post("/create")
async def create_match(
    trip_id: str,
    shipment_id: str,
    user_id: str = Depends(get_current_user_id)
):
    """Create a match between a trip and shipment with intelligent pricing."""
    trip = await trips_collection.find_one({"_id": ObjectId(trip_id)})
    shipment = await shipments_collection.find_one({"_id": ObjectId(shipment_id)})
    
    if not trip or not shipment:
        raise HTTPException(status_code=404, detail="Viagem ou envio não encontrado")
    
    # Check capacity
    package = shipment.get("package", {})
    weight_kg = package.get("weight_kg", 1)
    length_cm = package.get("length_cm", 20)
    width_cm = package.get("width_cm", 20)
    height_cm = package.get("height_cm", 20)
    
    can_fit, reason, _ = await can_add_shipment_to_trip(
        trip_id, weight_kg, length_cm, width_cm, height_cm
    )
    
    if not can_fit:
        raise HTTPException(status_code=400, detail=reason)
    
    # ============================================================
    # USE PERSISTED PRICE FROM SHIPMENT (Single Source of Truth)
    # ============================================================
    # Price was calculated at shipment creation and stored.
    # Match uses this immutable price - NO recalculation.
    # ============================================================
    
    shipment_price = shipment.get("price")
    
    if shipment_price:
        # Use persisted price (new unified pricing architecture)
        total_price = shipment_price.get("final_price")
        carrier_earnings = shipment_price.get("base_price")
        platform_commission = shipment_price.get("platform_fee")
        pricing_breakdown = {
            "distance_km": shipment_price.get("distance_km"),
            "weight_kg": shipment_price.get("weight_kg"),
            "category": shipment_price.get("category"),
            "platform_fee_percentage": shipment_price.get("platform_fee_percentage"),
            "source": "shipment_persisted"  # Indicates price came from shipment
        }
    else:
        # Legacy: Calculate price for old shipments without persisted price
        # This branch will be removed once all shipments have persisted prices
        from services.pricing_service import calculate_intelligent_price as legacy_calculate_price
        
        distance_km = haversine_distance(
            shipment["origin"].get("lat", 0), shipment["origin"].get("lng", 0),
            shipment["destination"].get("lat", 0), shipment["destination"].get("lng", 0)
        )
        
        deviation_km = 0
        if trip.get("route_polyline"):
            pickup_dist = haversine_distance(
                shipment["origin"].get("lat", 0), shipment["origin"].get("lng", 0),
                trip["origin"].get("lat", 0), trip["origin"].get("lng", 0)
            )
            dropoff_dist = haversine_distance(
                shipment["destination"].get("lat", 0), shipment["destination"].get("lng", 0),
                trip["destination"].get("lat", 0), trip["destination"].get("lng", 0)
            )
            deviation_km = pickup_dist + dropoff_dist
        
        cargo_space = trip.get("cargo_space", {})
        max_weight = cargo_space.get("max_weight_kg", 50)
        used_weight = max_weight - trip.get("available_weight_kg", max_weight)
        capacity_percent = (used_weight / max_weight * 100) if max_weight > 0 else 0
        
        price_result = await legacy_calculate_price(
            distance_km=distance_km,
            deviation_km=deviation_km,
            corridor_radius_km=trip.get("corridor_radius_km", 10),
            weight_kg=weight_kg,
            length_cm=length_cm,
            width_cm=width_cm,
            height_cm=height_cm,
            category=package.get("category"),
            trip_used_capacity_percent=capacity_percent,
            origin_city=shipment["origin"].get("city", ""),
            destination_city=shipment["destination"].get("city", ""),
            departure_date=trip.get("departure_date", datetime.now(timezone.utc))
        )
        
        total_price = price_result["total_price"]
        carrier_earnings = price_result["carrier_earnings"]
        platform_commission = price_result["_breakdown"]["platform_commission"]
        pricing_breakdown = {
            **price_result["_breakdown"],
            "source": "legacy_calculated"  # Indicates legacy calculation
        }
    
    match_doc = {
        "trip_id": trip_id,
        "shipment_id": shipment_id,
        "carrier_id": trip["carrier_id"],
        "sender_id": shipment["sender_id"],
        "estimated_price": total_price,
        "platform_commission": platform_commission,
        "carrier_earnings": carrier_earnings,
        "pricing_breakdown": pricing_breakdown,
        "status": "pending_payment",
        "pickup_confirmed_at": None,
        "delivery_confirmed_at": None,
        "created_at": datetime.now(timezone.utc)
    }
    
    result = await matches_collection.insert_one(match_doc)
    
    # Update trip status (keep as published to allow multiple shipments)
    # Only update to MATCHED if this is significant capacity usage
    await update_trip_available_capacity(trip_id)
    
    # Update shipment status
    await shipments_collection.update_one(
        {"_id": ObjectId(shipment_id)},
        {"$set": {"status": ShipmentStatus.MATCHED}}
    )
    
    # Notify both parties
    route = f"{shipment['origin'].get('city', '')} → {shipment['destination'].get('city', '')}"
    await create_notification(
        shipment["sender_id"],
        NotificationType.MATCH_CREATED,
        {"route": route, "amount": f"{total_price:.2f}"},
        str(result.inserted_id)
    )
    await create_notification(
        trip["carrier_id"],
        NotificationType.MATCH_CREATED,
        {"route": route, "amount": f"{total_price:.2f}"},
        str(result.inserted_id)
    )
    
    return {
        "id": str(result.inserted_id),
        "estimated_price": total_price,
        "carrier_earnings": carrier_earnings,
        "platform_commission": platform_commission,
        "pricing_details": {
            "distance_km": price_result["_breakdown"]["distance_km"],
            "category": price_result["_breakdown"]["category_name"],
            "deviation_km": price_result["_breakdown"]["deviation_km"]
        }
    }


@router.get("/my-matches")
async def get_my_matches(user_id: str = Depends(get_current_user_id)):
    """Get matches for current user."""
    matches = await matches_collection.find({
        "$or": [
            {"carrier_id": user_id},
            {"sender_id": user_id}
        ]
    }).to_list(100)
    
    for match in matches:
        match["id"] = str(match.pop("_id"))
    
    return matches


@router.get("/{match_id}")
async def get_match_details(match_id: str, user_id: str = Depends(get_current_user_id)):
    """Get detailed match information."""
    match = await matches_collection.find_one({"_id": ObjectId(match_id)})
    
    if not match:
        raise HTTPException(status_code=404, detail="Combinação não encontrada")
    
    if user_id not in [match["carrier_id"], match["sender_id"]]:
        raise HTTPException(status_code=403, detail="Você não tem acesso a esta combinação")
    
    # Enrich with trip and shipment data
    trip = await trips_collection.find_one({"_id": ObjectId(match["trip_id"])})
    shipment = await shipments_collection.find_one({"_id": ObjectId(match["shipment_id"])})
    
    carrier = await users_collection.find_one({"_id": ObjectId(match["carrier_id"])})
    sender = await users_collection.find_one({"_id": ObjectId(match["sender_id"])})
    
    if trip:
        trip.pop("_id", None)
    if shipment:
        shipment.pop("_id", None)
    
    match["id"] = str(match.pop("_id"))
    match["trip"] = trip
    match["shipment"] = shipment
    match["carrier_name"] = carrier["name"] if carrier else "Unknown"
    match["carrier_rating"] = carrier.get("rating", 0.0) if carrier else 0.0
    match["sender_name"] = sender["name"] if sender else "Unknown"
    match["sender_rating"] = sender.get("rating", 0.0) if sender else 0.0
    
    return match


@router.post("/{match_id}/confirm-pickup")
async def confirm_pickup(match_id: str, photo_url: str, user_id: str = Depends(get_current_user_id)):
    """Confirm package pickup with photo evidence."""
    match = await matches_collection.find_one({"_id": ObjectId(match_id)})
    
    if not match:
        raise HTTPException(status_code=404, detail="Combinação não encontrada")
    
    if match["carrier_id"] != user_id:
        raise HTTPException(status_code=403, detail="Apenas o transportador pode confirmar coleta")
    
    await matches_collection.update_one(
        {"_id": ObjectId(match_id)},
        {
            "$set": {
                "pickup_confirmed_at": datetime.now(timezone.utc),
                "pickup_photo_url": photo_url,
                "status": "in_transit"
            }
        }
    )
    
    # Notify sender
    await create_notification(
        match["sender_id"],
        NotificationType.PICKUP_CONFIRMED,
        {"carrier_name": "Transportador"},
        match_id
    )
    
    return {"message": "Coleta confirmada com sucesso"}


@router.post("/{match_id}/confirm-delivery")
async def confirm_delivery(match_id: str, photo_url: str, user_id: str = Depends(get_current_user_id)):
    """Confirm package delivery with photo evidence."""
    match = await matches_collection.find_one({"_id": ObjectId(match_id)})
    
    if not match:
        raise HTTPException(status_code=404, detail="Combinação não encontrada")
    
    if match["carrier_id"] != user_id:
        raise HTTPException(status_code=403, detail="Apenas o transportador pode confirmar entrega")
    
    await matches_collection.update_one(
        {"_id": ObjectId(match_id)},
        {
            "$set": {
                "delivery_confirmed_at": datetime.now(timezone.utc),
                "delivery_photo_url": photo_url,
                "status": "delivered"
            }
        }
    )
    
    # Release payment from escrow
    payment = await payments_collection.find_one({"match_id": match_id})
    if payment:
        await payments_collection.update_one(
            {"match_id": match_id},
            {"$set": {"status": PaymentStatus.RELEASED}}
        )
    
    # Notify sender
    await create_notification(
        match["sender_id"],
        NotificationType.DELIVERY_COMPLETED,
        {"carrier_name": "Transportador"},
        match_id
    )
    
    return {"message": "Entrega confirmada com sucesso"}
