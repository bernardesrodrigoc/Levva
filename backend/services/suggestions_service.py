"""
Smart Suggestions Service for Levva Platform

Provides intelligent suggestions for:
- Best dates/times with higher match probability
- Strategic pickup/drop-off locations
- Optimized grouping of nearby shipments

MATCHING PRINCIPLE: Geospatial-first approach
- Primary criterion: Coordinates + corridor radius
- Secondary: Route polyline deviation
- Fallback only: City name (when coordinates unavailable)
"""

from datetime import datetime, timedelta
from typing import List, Optional, Tuple
import logging
from collections import defaultdict
import math

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
    R = 6371
    lat1_rad, lat2_rad = math.radians(lat1), math.radians(lat2)
    delta_lat = math.radians(lat2 - lat1)
    delta_lng = math.radians(lng2 - lng1)
    a = math.sin(delta_lat/2)**2 + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(delta_lng/2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))


def point_to_polyline_distance(
    point_lat: float, 
    point_lng: float, 
    polyline: List[List[float]]
) -> float:
    """
    Calculate the minimum distance from a point to a polyline (in kilometers).
    Reused from route_service for consistency.
    """
    if not polyline or len(polyline) < 2:
        return float('inf')
    
    min_distance = float('inf')
    
    for i in range(len(polyline) - 1):
        segment_start = polyline[i]
        segment_end = polyline[i + 1]
        
        # Vector math for point-to-segment distance
        line_vec = (segment_end[0] - segment_start[0], segment_end[1] - segment_start[1])
        point_vec = (point_lat - segment_start[0], point_lng - segment_start[1])
        
        line_len_sq = line_vec[0] ** 2 + line_vec[1] ** 2
        
        if line_len_sq == 0:
            distance = haversine_distance(point_lat, point_lng, segment_start[0], segment_start[1])
        else:
            t = max(0, min(1, (point_vec[0] * line_vec[0] + point_vec[1] * line_vec[1]) / line_len_sq))
            closest_lat = segment_start[0] + t * line_vec[0]
            closest_lng = segment_start[1] + t * line_vec[1]
            distance = haversine_distance(point_lat, point_lng, closest_lat, closest_lng)
        
        min_distance = min(min_distance, distance)
    
    return min_distance


def check_geospatial_match(
    shipment_origin_lat: float,
    shipment_origin_lng: float,
    shipment_dest_lat: float,
    shipment_dest_lng: float,
    trip_origin_lat: float,
    trip_origin_lng: float,
    trip_dest_lat: float,
    trip_dest_lng: float,
    corridor_radius_km: float,
    route_polyline: Optional[List[List[float]]] = None
) -> Tuple[bool, dict]:
    """
    Check if a shipment matches a trip using geospatial criteria.
    
    Primary: Coordinate distance within corridor radius
    Secondary: Route polyline deviation (if available)
    
    Returns (matches, details)
    """
    # If we have a route polyline, use it for precise matching
    if route_polyline and len(route_polyline) >= 2:
        pickup_distance = point_to_polyline_distance(
            shipment_origin_lat, shipment_origin_lng, route_polyline
        )
        dropoff_distance = point_to_polyline_distance(
            shipment_dest_lat, shipment_dest_lng, route_polyline
        )
        
        matches = pickup_distance <= corridor_radius_km and dropoff_distance <= corridor_radius_km
        
        return matches, {
            "match_type": "polyline_corridor",
            "pickup_distance_km": round(pickup_distance, 2),
            "dropoff_distance_km": round(dropoff_distance, 2),
            "total_deviation_km": round(pickup_distance + dropoff_distance, 2),
            "corridor_radius_km": corridor_radius_km
        }
    
    # Fallback: Simple point-to-point distance matching
    # Check if shipment origin is near trip origin AND shipment dest is near trip dest
    origin_distance = haversine_distance(
        shipment_origin_lat, shipment_origin_lng,
        trip_origin_lat, trip_origin_lng
    )
    dest_distance = haversine_distance(
        shipment_dest_lat, shipment_dest_lng,
        trip_dest_lat, trip_dest_lng
    )
    
    matches = origin_distance <= corridor_radius_km and dest_distance <= corridor_radius_km
    
    return matches, {
        "match_type": "point_proximity",
        "pickup_distance_km": round(origin_distance, 2),
        "dropoff_distance_km": round(dest_distance, 2),
        "total_deviation_km": round(origin_distance + dest_distance, 2),
        "corridor_radius_km": corridor_radius_km
    }


def get_strategic_points_for_location(lat: float, lng: float, max_distance_km: float = 20) -> List[dict]:
    """
    Get strategic meeting points near a given location.
    Uses coordinates, not city names.
    """
    nearby_points = []
    
    for city_name, points in STRATEGIC_POINTS.items():
        for point in points:
            distance = haversine_distance(lat, lng, point["lat"], point["lng"])
            if distance <= max_distance_km:
                nearby_points.append({
                    **point,
                    "city": city_name,
                    "distance_km": round(distance, 1)
                })
    
    # Sort by distance
    nearby_points.sort(key=lambda x: x["distance_km"])
    return nearby_points


async def get_date_suggestions(
    origin_lat: float,
    origin_lng: float,
    dest_lat: float,
    dest_lng: float,
    preferred_date: datetime = None,
    is_shipment: bool = True,
    days_ahead: int = 7,
    max_corridor_km: float = 50.0
) -> List[dict]:
    """
    Suggest dates with higher match probability.
    
    GEOSPATIAL-FIRST: Analyzes existing trips/shipments based on
    coordinate proximity, not city names.
    
    Args:
        origin_lat, origin_lng: Shipment origin coordinates
        dest_lat, dest_lng: Shipment destination coordinates
        preferred_date: Starting date for suggestions
        is_shipment: True if looking for trips, False if looking for shipments
        days_ahead: Number of days to analyze
        max_corridor_km: Maximum corridor radius to consider for matching
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
        
        if is_shipment:
            # Looking for trips that can carry this shipment
            # Get all published trips for this date
            trips = await trips_collection.find({
                "departure_date": {"$gte": start_of_day, "$lt": end_of_day},
                "status": "published"
            }).to_list(100)
            
            # Filter by geospatial match
            matching_trips = []
            for trip in trips:
                trip_origin_lat = trip.get("origin", {}).get("lat", 0)
                trip_origin_lng = trip.get("origin", {}).get("lng", 0)
                trip_dest_lat = trip.get("destination", {}).get("lat", 0)
                trip_dest_lng = trip.get("destination", {}).get("lng", 0)
                
                # Skip trips without valid coordinates
                if not all([trip_origin_lat, trip_origin_lng, trip_dest_lat, trip_dest_lng]):
                    continue
                
                corridor_radius = trip.get("corridor_radius_km", 10.0)
                route_polyline = trip.get("route_polyline")
                
                matches, details = check_geospatial_match(
                    origin_lat, origin_lng, dest_lat, dest_lng,
                    trip_origin_lat, trip_origin_lng, trip_dest_lat, trip_dest_lng,
                    corridor_radius, route_polyline
                )
                
                if matches:
                    matching_trips.append({
                        "trip": trip,
                        "details": details
                    })
            
            trips_count = len(matching_trips)
            match_score = min(100, trips_count * 25) if trips_count > 0 else 10
            availability = f"{trips_count} transportador(es) disponível(eis)"
            
        else:
            # Looking for shipments for this trip
            shipments = await shipments_collection.find({
                "status": "published"
            }).to_list(100)
            
            # Filter by geospatial match (treating input coords as trip coords)
            matching_shipments = []
            for shipment in shipments:
                shipment_origin_lat = shipment.get("origin", {}).get("lat", 0)
                shipment_origin_lng = shipment.get("origin", {}).get("lng", 0)
                shipment_dest_lat = shipment.get("destination", {}).get("lat", 0)
                shipment_dest_lng = shipment.get("destination", {}).get("lng", 0)
                
                if not all([shipment_origin_lat, shipment_origin_lng, shipment_dest_lat, shipment_dest_lng]):
                    continue
                
                matches, details = check_geospatial_match(
                    shipment_origin_lat, shipment_origin_lng, shipment_dest_lat, shipment_dest_lng,
                    origin_lat, origin_lng, dest_lat, dest_lng,
                    max_corridor_km, None
                )
                
                if matches:
                    matching_shipments.append({
                        "shipment": shipment,
                        "details": details
                    })
            
            shipments_count = len(matching_shipments)
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
            "trips_available": trips_count if is_shipment else 0,
            "shipments_waiting": shipments_count if not is_shipment else 0
        })
    
    # Sort by match probability
    suggestions.sort(key=lambda x: x["match_probability_score"], reverse=True)
    
    return suggestions


async def get_matching_trips_for_shipment(
    origin_lat: float,
    origin_lng: float,
    dest_lat: float,
    dest_lng: float,
    weight_kg: float = 1.0,
    preferred_date: datetime = None,
    days_ahead: int = 14
) -> List[dict]:
    """
    Get trips that can carry a shipment based on geospatial matching.
    
    This is the core function for showing "compatible trips" during shipment creation.
    Uses coordinate-based matching as primary criterion.
    
    Returns list of matching trips with match details.
    """
    from database import trips_collection, users_collection
    
    if preferred_date is None:
        preferred_date = datetime.now()
    
    start_date = preferred_date.replace(hour=0, minute=0, second=0, microsecond=0)
    end_date = start_date + timedelta(days=days_ahead)
    
    # Get all published trips in date range with sufficient capacity
    trips = await trips_collection.find({
        "departure_date": {"$gte": start_date, "$lt": end_date},
        "status": "published",
        "$or": [
            {"available_capacity_kg": {"$gte": weight_kg}},
            {"cargo_space.max_weight_kg": {"$gte": weight_kg}},
            {"available_capacity_kg": {"$exists": False}}
        ]
    }).to_list(100)
    
    matching_trips = []
    
    for trip in trips:
        trip_origin_lat = trip.get("origin", {}).get("lat", 0)
        trip_origin_lng = trip.get("origin", {}).get("lng", 0)
        trip_dest_lat = trip.get("destination", {}).get("lat", 0)
        trip_dest_lng = trip.get("destination", {}).get("lng", 0)
        
        # Skip trips without valid coordinates
        if not all([trip_origin_lat, trip_origin_lng, trip_dest_lat, trip_dest_lng]):
            logger.debug(f"Skipping trip {trip.get('_id')} - missing coordinates")
            continue
        
        corridor_radius = trip.get("corridor_radius_km", 10.0)
        route_polyline = trip.get("route_polyline")
        
        matches, details = check_geospatial_match(
            origin_lat, origin_lng, dest_lat, dest_lng,
            trip_origin_lat, trip_origin_lng, trip_dest_lat, trip_dest_lng,
            corridor_radius, route_polyline
        )
        
        if matches:
            # Get carrier info
            carrier = await users_collection.find_one({"_id": trip.get("carrier_id")})
            if not carrier:
                try:
                    from bson import ObjectId
                    carrier = await users_collection.find_one({"_id": ObjectId(trip.get("carrier_id"))})
                except:
                    carrier = None
            
            # Calculate match score
            avg_deviation = details["total_deviation_km"] / 2
            deviation_score = max(0, 40 * (1 - avg_deviation / corridor_radius))
            rating_score = (carrier.get("rating", 0) / 5.0 * 30) if carrier else 0
            
            cargo_space = trip.get("cargo_space", {})
            max_weight = cargo_space.get("max_weight_kg", 50)
            available_weight = trip.get("available_capacity_kg", max_weight)
            
            if max_weight > 0:
                capacity_ratio = weight_kg / max_weight
                if 0.3 <= capacity_ratio <= 0.8:
                    capacity_score = 20
                elif capacity_ratio < 0.3:
                    capacity_score = 10
                else:
                    capacity_score = 15
            else:
                capacity_score = 10
            
            match_score = min(100, deviation_score + rating_score + capacity_score + 10)
            
            matching_trips.append({
                "trip_id": str(trip["_id"]),
                "carrier_id": trip.get("carrier_id"),
                "carrier_name": carrier.get("name", "Transportador") if carrier else "Transportador",
                "carrier_rating": carrier.get("rating", 0) if carrier else 0,
                "origin_city": trip.get("origin", {}).get("city", ""),
                "destination_city": trip.get("destination", {}).get("city", ""),
                "departure_date": trip.get("departure_date"),
                "vehicle_type": trip.get("vehicle_type"),
                "corridor_radius_km": corridor_radius,
                "available_capacity_kg": available_weight,
                "max_capacity_kg": max_weight,
                "match_score": round(match_score, 1),
                "match_details": details,
                "price_per_kg": trip.get("price_per_kg")
            })
    
    # Sort by match score (highest first)
    matching_trips.sort(key=lambda x: x["match_score"], reverse=True)
    
    return matching_trips


async def get_location_suggestions(
    user_lat: float,
    user_lng: float,
    is_origin: bool = True
) -> List[dict]:
    """
    Suggest optimized locations for pickup/dropoff.
    
    Uses COORDINATES to find nearby strategic points and aggregation opportunities.
    No city name dependency.
    """
    from database import shipments_collection
    
    suggestions = []
    
    # 1. Strategic points near the user's location
    strategic_points = get_strategic_points_for_location(user_lat, user_lng, max_distance_km=15)
    for point in strategic_points[:5]:  # Limit to 5 nearest
        suggestions.append({
            "type": "strategic_point",
            "name": point["name"],
            "city": point.get("city", ""),
            "lat": point["lat"],
            "lng": point["lng"],
            "distance_km": point["distance_km"],
            "reason": f"Ponto estratégico de fácil acesso ({point['type']})",
            "benefit": "Local movimentado com mais opções de transportadores"
        })
    
    # 2. Check for nearby shipments (aggregation opportunity)
    location_field = "origin" if is_origin else "destination"
    
    # Get all published shipments and filter by proximity
    all_shipments = await shipments_collection.find({
        "status": "published"
    }).to_list(100)
    
    # Group nearby shipments by proximity clusters
    clusters = defaultdict(list)
    for shipment in all_shipments:
        loc = shipment.get(location_field, {})
        s_lat, s_lng = loc.get("lat", 0), loc.get("lng", 0)
        
        if not s_lat or not s_lng:
            continue
        
        distance = haversine_distance(user_lat, user_lng, s_lat, s_lng)
        
        if distance <= 5:  # Within 5km
            # Round to create clusters
            cluster_key = (round(s_lat, 2), round(s_lng, 2))
            clusters[cluster_key].append({
                "shipment": shipment,
                "distance": distance
            })
    
    # Add aggregation suggestions for clusters with 2+ shipments
    for (cluster_lat, cluster_lng), cluster_shipments in clusters.items():
        if len(cluster_shipments) >= 2:
            avg_distance = sum(s["distance"] for s in cluster_shipments) / len(cluster_shipments)
            suggestions.append({
                "type": "aggregation_point",
                "name": f"Área com {len(cluster_shipments)} envios próximos",
                "lat": cluster_lat,
                "lng": cluster_lng,
                "distance_km": round(avg_distance, 1),
                "reason": f"Agrupe sua {'coleta' if is_origin else 'entrega'} com outros envios",
                "benefit": "Transportadores preferem rotas com múltiplas coletas",
                "nearby_shipments_count": len(cluster_shipments)
            })
    
    # Sort by relevance (distance + type priority)
    def sort_key(s):
        type_priority = {"aggregation_point": 0, "strategic_point": 1}
        return (type_priority.get(s["type"], 2), s["distance_km"])
    
    suggestions.sort(key=sort_key)
    
    return suggestions[:5]  # Return top 5


async def get_time_slot_suggestions(
    origin_lat: float,
    origin_lng: float,
    dest_lat: float,
    dest_lng: float,
    date: datetime,
    corridor_radius_km: float = 50.0
) -> List[dict]:
    """
    Suggest optimal time slots for a given date.
    
    Uses GEOSPATIAL matching to find trips, not city names.
    """
    from database import trips_collection
    
    start_of_day = date.replace(hour=0, minute=0, second=0, microsecond=0)
    end_of_day = start_of_day + timedelta(days=1)
    
    # Get all trips on this day
    trips = await trips_collection.find({
        "departure_date": {"$gte": start_of_day, "$lt": end_of_day},
        "status": "published"
    }).to_list(100)
    
    # Filter by geospatial match and count by time slot
    time_slots = defaultdict(int)
    
    for trip in trips:
        trip_origin_lat = trip.get("origin", {}).get("lat", 0)
        trip_origin_lng = trip.get("origin", {}).get("lng", 0)
        trip_dest_lat = trip.get("destination", {}).get("lat", 0)
        trip_dest_lng = trip.get("destination", {}).get("lng", 0)
        
        if not all([trip_origin_lat, trip_origin_lng, trip_dest_lat, trip_dest_lng]):
            continue
        
        trip_corridor = trip.get("corridor_radius_km", corridor_radius_km)
        route_polyline = trip.get("route_polyline")
        
        matches, _ = check_geospatial_match(
            origin_lat, origin_lng, dest_lat, dest_lng,
            trip_origin_lat, trip_origin_lng, trip_dest_lat, trip_dest_lng,
            trip_corridor, route_polyline
        )
        
        if matches:
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
    origin_lat: float,
    origin_lng: float,
    dest_lat: float,
    dest_lng: float,
    weight_kg: float = 1.0,
    preferred_date: datetime = None,
    is_shipment: bool = True
) -> dict:
    """
    Get all suggestions in one call.
    
    Fully geospatial-based - no city name dependencies.
    """
    if preferred_date is None:
        preferred_date = datetime.now()
    
    # Date suggestions
    date_suggestions = await get_date_suggestions(
        origin_lat, origin_lng, dest_lat, dest_lng,
        preferred_date, is_shipment
    )
    
    # Matching trips (for shipments)
    matching_trips = []
    if is_shipment:
        matching_trips = await get_matching_trips_for_shipment(
            origin_lat, origin_lng, dest_lat, dest_lng,
            weight_kg, preferred_date
        )
    
    # Location suggestions
    origin_location_suggestions = await get_location_suggestions(
        origin_lat, origin_lng, is_origin=True
    )
    
    dest_location_suggestions = await get_location_suggestions(
        dest_lat, dest_lng, is_origin=False
    )
    
    # Best date for time slots
    best_date = datetime.fromisoformat(date_suggestions[0]["date"]) if date_suggestions else preferred_date
    time_suggestions = await get_time_slot_suggestions(
        origin_lat, origin_lng, dest_lat, dest_lng, best_date
    )
    
    return {
        "dates": date_suggestions[:5],
        "matching_trips": matching_trips[:10],
        "origin_locations": origin_location_suggestions,
        "destination_locations": dest_location_suggestions,
        "time_slots": time_suggestions,
        "best_recommendation": {
            "date": date_suggestions[0] if date_suggestions else None,
            "trip": matching_trips[0] if matching_trips else None,
            "origin": origin_location_suggestions[0] if origin_location_suggestions else None,
            "destination": dest_location_suggestions[0] if dest_location_suggestions else None,
            "time": time_suggestions[0] if time_suggestions else None
        },
        "match_summary": {
            "total_matching_trips": len(matching_trips),
            "best_match_score": matching_trips[0]["match_score"] if matching_trips else 0
        }
    }
