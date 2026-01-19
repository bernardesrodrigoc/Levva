"""
Smart Suggestions Service for Levva Platform

Provides intelligent suggestions for:
- Best dates/times with higher match probability
- Strategic pickup/drop-off locations
- Optimized grouping of nearby shipments
"""

from datetime import datetime, timedelta
from typing import List, Optional, Tuple
import logging
from collections import defaultdict

logger = logging.getLogger(__name__)


# Strategic points in major Brazilian cities (central, accessible locations)
STRATEGIC_POINTS = {
    "São Paulo": [
        {"name": "Terminal Rodoviário Tietê", "lat": -23.5175, "lng": -46.6265, "type": "terminal"},
        {"name": "Shopping Ibirapuera", "lat": -23.6106, "lng": -46.6659, "type": "shopping"},
        {"name": "Av. Paulista (MASP)", "lat": -23.5614, "lng": -46.6558, "type": "central"},
        {"name": "Estação da Luz", "lat": -23.5355, "lng": -46.6350, "type": "station"},
    ],
    "Rio de Janeiro": [
        {"name": "Rodoviária Novo Rio", "lat": -22.8996, "lng": -43.2094, "type": "terminal"},
        {"name": "Central do Brasil", "lat": -22.9027, "lng": -43.1731, "type": "station"},
        {"name": "Shopping Rio Sul", "lat": -22.9485, "lng": -43.1808, "type": "shopping"},
        {"name": "Copacabana (Posto 6)", "lat": -22.9838, "lng": -43.1894, "type": "central"},
    ],
    "Belo Horizonte": [
        {"name": "Rodoviária de BH", "lat": -19.9234, "lng": -43.9301, "type": "terminal"},
        {"name": "Praça Sete", "lat": -19.9192, "lng": -43.9386, "type": "central"},
        {"name": "Shopping Diamond", "lat": -19.8708, "lng": -43.9779, "type": "shopping"},
    ],
    "Curitiba": [
        {"name": "Rodoferroviária de Curitiba", "lat": -25.4410, "lng": -49.2689, "type": "terminal"},
        {"name": "Shopping Estação", "lat": -25.4384, "lng": -49.2679, "type": "shopping"},
        {"name": "Praça Tiradentes", "lat": -25.4296, "lng": -49.2713, "type": "central"},
    ],
    "Porto Alegre": [
        {"name": "Rodoviária de Porto Alegre", "lat": -30.0270, "lng": -51.2265, "type": "terminal"},
        {"name": "Shopping Praia de Belas", "lat": -30.0476, "lng": -51.2269, "type": "shopping"},
        {"name": "Mercado Público", "lat": -30.0284, "lng": -51.2280, "type": "central"},
    ],
    "Salvador": [
        {"name": "Rodoviária de Salvador", "lat": -12.9750, "lng": -38.4748, "type": "terminal"},
        {"name": "Shopping da Bahia", "lat": -12.9818, "lng": -38.4582, "type": "shopping"},
        {"name": "Campo Grande", "lat": -12.9875, "lng": -38.5106, "type": "central"},
    ],
    "Brasília": [
        {"name": "Rodoviária do Plano Piloto", "lat": -15.7941, "lng": -47.8828, "type": "terminal"},
        {"name": "Shopping Conjunto Nacional", "lat": -15.7908, "lng": -47.8829, "type": "shopping"},
        {"name": "Setor Comercial Sul", "lat": -15.7989, "lng": -47.8916, "type": "central"},
    ],
}


def haversine_distance(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Calculate distance between two points in km"""
    import math
    R = 6371
    lat1_rad, lat2_rad = math.radians(lat1), math.radians(lat2)
    delta_lat = math.radians(lat2 - lat1)
    delta_lng = math.radians(lng2 - lng1)
    a = math.sin(delta_lat/2)**2 + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(delta_lng/2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))


def get_strategic_points_for_city(city: str) -> List[dict]:
    """Get strategic meeting points for a city"""
    city_lower = city.lower().strip()
    
    for city_name, points in STRATEGIC_POINTS.items():
        if city_name.lower() in city_lower or city_lower in city_name.lower():
            return points
    
    # Return empty if city not found
    return []


def suggest_meeting_point(
    user_lat: float,
    user_lng: float,
    city: str,
    max_distance_km: float = 10
) -> Optional[dict]:
    """
    Suggest the best strategic meeting point for a user.
    Returns the closest strategic point within max_distance.
    """
    points = get_strategic_points_for_city(city)
    
    if not points:
        return None
    
    best_point = None
    best_distance = float('inf')
    
    for point in points:
        distance = haversine_distance(user_lat, user_lng, point["lat"], point["lng"])
        if distance < best_distance and distance <= max_distance_km:
            best_distance = distance
            best_point = {
                **point,
                "distance_km": round(distance, 1)
            }
    
    return best_point


async def get_date_suggestions(
    origin_city: str,
    destination_city: str,
    preferred_date: datetime = None,
    is_shipment: bool = True,
    days_ahead: int = 7
) -> List[dict]:
    """
    Suggest dates with higher match probability.
    Analyzes existing trips/shipments on similar routes.
    """
    from database import trips_collection, shipments_collection
    
    if preferred_date is None:
        preferred_date = datetime.now()
    
    suggestions = []
    
    # Look at next N days
    for day_offset in range(days_ahead):
        check_date = preferred_date + timedelta(days=day_offset)
        start_of_day = check_date.replace(hour=0, minute=0, second=0, microsecond=0)
        end_of_day = start_of_day + timedelta(days=1)
        
        # Count trips on this route/date
        trips_count = await trips_collection.count_documents({
            "origin.city": {"$regex": origin_city, "$options": "i"},
            "destination.city": {"$regex": destination_city, "$options": "i"},
            "departure_date": {"$gte": start_of_day, "$lt": end_of_day},
            "status": "published"
        })
        
        # Count shipments on this route
        shipments_count = await shipments_collection.count_documents({
            "origin.city": {"$regex": origin_city, "$options": "i"},
            "destination.city": {"$regex": destination_city, "$options": "i"},
            "status": "published"
        })
        
        # Calculate match probability
        if is_shipment:
            # For shipments: more trips = higher probability
            match_score = min(100, trips_count * 25) if trips_count > 0 else 10
            availability = f"{trips_count} transportador(es) disponível(eis)"
        else:
            # For trips: more shipments = higher probability
            match_score = min(100, shipments_count * 20) if shipments_count > 0 else 10
            availability = f"{shipments_count} envio(s) aguardando"
        
        # Day of week bonus (weekdays usually better)
        day_of_week = check_date.weekday()
        if day_of_week < 5:  # Weekday
            match_score = min(100, match_score + 10)
        
        # Determine recommendation level
        if match_score >= 70:
            recommendation = "alta"
            reason = "Alta probabilidade de match nesta data!"
        elif match_score >= 40:
            recommendation = "média"
            reason = "Probabilidade moderada de match."
        else:
            recommendation = "baixa"
            reason = "Poucos transportadores/envios nesta rota."
        
        suggestions.append({
            "date": start_of_day.isoformat(),
            "day_name": ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"][day_of_week],
            "match_probability_score": match_score,
            "recommendation_level": recommendation,
            "reason": reason,
            "availability": availability,
            "trips_available": trips_count,
            "shipments_waiting": shipments_count
        })
    
    # Sort by match probability
    suggestions.sort(key=lambda x: x["match_probability_score"], reverse=True)
    
    return suggestions


async def get_location_suggestions(
    user_lat: float,
    user_lng: float,
    city: str,
    is_origin: bool = True
) -> List[dict]:
    """
    Suggest optimized locations for pickup/dropoff.
    Considers strategic points and existing aggregation opportunities.
    """
    from database import shipments_collection
    
    suggestions = []
    
    # 1. Strategic city points
    strategic_points = get_strategic_points_for_city(city)
    for point in strategic_points:
        distance = haversine_distance(user_lat, user_lng, point["lat"], point["lng"])
        if distance <= 15:  # Within 15km
            suggestions.append({
                "type": "strategic_point",
                "name": point["name"],
                "lat": point["lat"],
                "lng": point["lng"],
                "distance_km": round(distance, 1),
                "reason": f"Ponto estratégico de fácil acesso ({point['type']})",
                "benefit": "Local movimentado com mais opções de transportadores"
            })
    
    # 2. Check for nearby shipments (aggregation opportunity)
    location_field = "origin" if is_origin else "destination"
    nearby_shipments = await shipments_collection.find({
        f"{location_field}.city": {"$regex": city, "$options": "i"},
        "status": "published"
    }).to_list(50)
    
    # Group nearby shipments
    clusters = defaultdict(list)
    for shipment in nearby_shipments:
        loc = shipment[location_field]
        s_lat, s_lng = loc.get("lat", 0), loc.get("lng", 0)
        distance = haversine_distance(user_lat, user_lng, s_lat, s_lng)
        
        if distance <= 5:  # Within 5km
            # Round to create clusters
            cluster_key = (round(s_lat, 2), round(s_lng, 2))
            clusters[cluster_key].append(shipment)
    
    # Add aggregation suggestions for clusters with 2+ shipments
    for (cluster_lat, cluster_lng), cluster_shipments in clusters.items():
        if len(cluster_shipments) >= 2:
            distance = haversine_distance(user_lat, user_lng, cluster_lat, cluster_lng)
            suggestions.append({
                "type": "aggregation_point",
                "name": f"Área com {len(cluster_shipments)} envios próximos",
                "lat": cluster_lat,
                "lng": cluster_lng,
                "distance_km": round(distance, 1),
                "reason": f"Agrupe sua {'coleta' if is_origin else 'entrega'} com outros envios",
                "benefit": f"Transportadores preferem rotas com múltiplas coletas",
                "nearby_shipments_count": len(cluster_shipments)
            })
    
    # Sort by relevance (distance + type priority)
    def sort_key(s):
        type_priority = {"aggregation_point": 0, "strategic_point": 1}
        return (type_priority.get(s["type"], 2), s["distance_km"])
    
    suggestions.sort(key=sort_key)
    
    return suggestions[:5]  # Return top 5


async def get_time_slot_suggestions(
    origin_city: str,
    destination_city: str,
    date: datetime
) -> List[dict]:
    """
    Suggest optimal time slots for a given date.
    """
    from database import trips_collection
    
    start_of_day = date.replace(hour=0, minute=0, second=0, microsecond=0)
    end_of_day = start_of_day + timedelta(days=1)
    
    # Get trips on this day
    trips = await trips_collection.find({
        "origin.city": {"$regex": origin_city, "$options": "i"},
        "destination.city": {"$regex": destination_city, "$options": "i"},
        "departure_date": {"$gte": start_of_day, "$lt": end_of_day},
        "status": "published"
    }).to_list(50)
    
    # Count trips by time slot
    time_slots = defaultdict(int)
    for trip in trips:
        dep_time = trip.get("departure_date")
        if dep_time:
            hour = dep_time.hour
            if 6 <= hour < 10:
                time_slots["morning_early"] += 1
            elif 10 <= hour < 14:
                time_slots["morning_late"] += 1
            elif 14 <= hour < 18:
                time_slots["afternoon"] += 1
            elif 18 <= hour < 22:
                time_slots["evening"] += 1
    
    suggestions = [
        {
            "slot": "morning_early",
            "name": "Manhã cedo (6h-10h)",
            "available_trips": time_slots.get("morning_early", 0),
            "recommendation": "alta" if time_slots.get("morning_early", 0) > 0 else "baixa"
        },
        {
            "slot": "morning_late",
            "name": "Final da manhã (10h-14h)",
            "available_trips": time_slots.get("morning_late", 0),
            "recommendation": "alta" if time_slots.get("morning_late", 0) > 0 else "baixa"
        },
        {
            "slot": "afternoon",
            "name": "Tarde (14h-18h)",
            "available_trips": time_slots.get("afternoon", 0),
            "recommendation": "alta" if time_slots.get("afternoon", 0) > 0 else "baixa"
        },
        {
            "slot": "evening",
            "name": "Noite (18h-22h)",
            "available_trips": time_slots.get("evening", 0),
            "recommendation": "média" if time_slots.get("evening", 0) > 0 else "baixa"
        }
    ]
    
    # Sort by available trips
    suggestions.sort(key=lambda x: x["available_trips"], reverse=True)
    
    return suggestions


async def get_comprehensive_suggestions(
    origin_city: str,
    destination_city: str,
    origin_lat: float,
    origin_lng: float,
    dest_lat: float,
    dest_lng: float,
    preferred_date: datetime = None,
    is_shipment: bool = True
) -> dict:
    """
    Get all suggestions in one call.
    """
    date_suggestions = await get_date_suggestions(
        origin_city, destination_city, preferred_date, is_shipment
    )
    
    origin_location_suggestions = await get_location_suggestions(
        origin_lat, origin_lng, origin_city, is_origin=True
    )
    
    dest_location_suggestions = await get_location_suggestions(
        dest_lat, dest_lng, destination_city, is_origin=False
    )
    
    # Best date for time slots
    best_date = datetime.fromisoformat(date_suggestions[0]["date"]) if date_suggestions else datetime.now()
    time_suggestions = await get_time_slot_suggestions(
        origin_city, destination_city, best_date
    )
    
    return {
        "dates": date_suggestions[:5],
        "origin_locations": origin_location_suggestions,
        "destination_locations": dest_location_suggestions,
        "time_slots": time_suggestions,
        "best_recommendation": {
            "date": date_suggestions[0] if date_suggestions else None,
            "origin": origin_location_suggestions[0] if origin_location_suggestions else None,
            "destination": dest_location_suggestions[0] if dest_location_suggestions else None,
            "time": time_suggestions[0] if time_suggestions else None
        }
    }
