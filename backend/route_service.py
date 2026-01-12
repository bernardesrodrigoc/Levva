"""
Route service for generating polylines and corridor-based matching.
Uses OSRM (Open Source Routing Machine) for free route calculations.
"""
import httpx
import math
from typing import List, Tuple, Optional
import logging

logger = logging.getLogger(__name__)

# OSRM public server (for demo purposes - consider self-hosting for production)
OSRM_BASE_URL = "https://router.project-osrm.org"

async def get_route_polyline(
    origin_lat: float, 
    origin_lng: float, 
    dest_lat: float, 
    dest_lng: float
) -> Optional[List[List[float]]]:
    """
    Get route polyline from OSRM.
    Returns list of [lat, lng] coordinates representing the route.
    """
    try:
        url = f"{OSRM_BASE_URL}/route/v1/driving/{origin_lng},{origin_lat};{dest_lng},{dest_lat}"
        params = {
            "overview": "full",
            "geometries": "geojson"
        }
        
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(url, params=params)
            
            if response.status_code == 200:
                data = response.json()
                if data.get("code") == "Ok" and data.get("routes"):
                    # Extract coordinates from GeoJSON geometry
                    coords = data["routes"][0]["geometry"]["coordinates"]
                    # Convert from [lng, lat] to [lat, lng] format
                    return [[coord[1], coord[0]] for coord in coords]
            
            logger.warning(f"OSRM returned non-OK response: {response.status_code}")
            return None
            
    except Exception as e:
        logger.error(f"Error getting route polyline: {e}")
        # Fallback: return simple straight line
        return [[origin_lat, origin_lng], [dest_lat, dest_lng]]


def haversine_distance(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """
    Calculate the great circle distance between two points on Earth (in kilometers).
    """
    R = 6371  # Earth's radius in kilometers
    
    lat1_rad = math.radians(lat1)
    lat2_rad = math.radians(lat2)
    delta_lat = math.radians(lat2 - lat1)
    delta_lng = math.radians(lng2 - lng1)
    
    a = math.sin(delta_lat / 2) ** 2 + \
        math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(delta_lng / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    
    return R * c


def point_to_line_distance(
    point_lat: float, 
    point_lng: float, 
    line_start_lat: float, 
    line_start_lng: float,
    line_end_lat: float, 
    line_end_lng: float
) -> float:
    """
    Calculate the minimum distance from a point to a line segment (in kilometers).
    """
    # Vector from line start to end
    line_vec = (line_end_lat - line_start_lat, line_end_lng - line_start_lng)
    # Vector from line start to point
    point_vec = (point_lat - line_start_lat, point_lng - line_start_lng)
    
    line_len_sq = line_vec[0] ** 2 + line_vec[1] ** 2
    
    if line_len_sq == 0:
        # Line start and end are the same point
        return haversine_distance(point_lat, point_lng, line_start_lat, line_start_lng)
    
    # Project point onto line, clamped to [0, 1]
    t = max(0, min(1, (point_vec[0] * line_vec[0] + point_vec[1] * line_vec[1]) / line_len_sq))
    
    # Find the closest point on the line segment
    closest_lat = line_start_lat + t * line_vec[0]
    closest_lng = line_start_lng + t * line_vec[1]
    
    return haversine_distance(point_lat, point_lng, closest_lat, closest_lng)


def point_to_polyline_distance(
    point_lat: float, 
    point_lng: float, 
    polyline: List[List[float]]
) -> float:
    """
    Calculate the minimum distance from a point to a polyline (in kilometers).
    """
    if not polyline or len(polyline) < 2:
        return float('inf')
    
    min_distance = float('inf')
    
    for i in range(len(polyline) - 1):
        segment_start = polyline[i]
        segment_end = polyline[i + 1]
        
        distance = point_to_line_distance(
            point_lat, point_lng,
            segment_start[0], segment_start[1],
            segment_end[0], segment_end[1]
        )
        
        min_distance = min(min_distance, distance)
    
    return min_distance


def is_point_in_corridor(
    point_lat: float, 
    point_lng: float, 
    polyline: List[List[float]], 
    corridor_radius_km: float
) -> Tuple[bool, float]:
    """
    Check if a point is within the corridor around a polyline.
    Returns (is_inside, distance_to_route_km).
    """
    distance = point_to_polyline_distance(point_lat, point_lng, polyline)
    return (distance <= corridor_radius_km, distance)


def check_shipment_matches_route(
    pickup_lat: float,
    pickup_lng: float,
    dropoff_lat: float,
    dropoff_lng: float,
    route_polyline: List[List[float]],
    corridor_radius_km: float
) -> Tuple[bool, dict]:
    """
    Check if a shipment (pickup and dropoff points) matches a route corridor.
    Returns (matches, details).
    """
    pickup_in_corridor, pickup_distance = is_point_in_corridor(
        pickup_lat, pickup_lng, route_polyline, corridor_radius_km
    )
    
    dropoff_in_corridor, dropoff_distance = is_point_in_corridor(
        dropoff_lat, dropoff_lng, route_polyline, corridor_radius_km
    )
    
    # Both points must be in the corridor
    matches = pickup_in_corridor and dropoff_in_corridor
    
    # Also check that dropoff is generally "after" pickup along the route
    # (simplified: just check if pickup is closer to start of route)
    if matches and len(route_polyline) >= 2:
        route_start = route_polyline[0]
        pickup_to_start = haversine_distance(pickup_lat, pickup_lng, route_start[0], route_start[1])
        dropoff_to_start = haversine_distance(dropoff_lat, dropoff_lng, route_start[0], route_start[1])
        
        # Pickup should be closer to route start than dropoff
        if pickup_to_start > dropoff_to_start:
            # This might be a reverse direction request - still valid in many cases
            pass  # Allow it for now, could add flag
    
    return (matches, {
        "pickup_in_corridor": pickup_in_corridor,
        "pickup_distance_km": round(pickup_distance, 2),
        "dropoff_in_corridor": dropoff_in_corridor,
        "dropoff_distance_km": round(dropoff_distance, 2),
        "total_deviation_km": round(pickup_distance + dropoff_distance, 2)
    })


def calculate_corridor_match_score(
    pickup_distance_km: float,
    dropoff_distance_km: float,
    corridor_radius_km: float,
    carrier_rating: float,
    weight_kg: float,
    max_weight_kg: float
) -> float:
    """
    Calculate a match score (0-100) based on various factors.
    Higher is better.
    """
    score = 0.0
    
    # Distance score (40 points max) - closer to route is better
    avg_distance = (pickup_distance_km + dropoff_distance_km) / 2
    distance_ratio = 1 - (avg_distance / corridor_radius_km)
    score += distance_ratio * 40
    
    # Rating score (30 points max)
    score += (carrier_rating / 5.0) * 30
    
    # Capacity fit score (20 points max) - optimal is 50-80% of capacity
    if max_weight_kg > 0:
        capacity_ratio = weight_kg / max_weight_kg
        if 0.3 <= capacity_ratio <= 0.8:
            score += 20  # Optimal range
        elif capacity_ratio < 0.3:
            score += 10  # Underutilized
        else:
            score += 15  # Near capacity but ok
    
    # Base score (10 points)
    score += 10
    
    return min(100, max(0, round(score, 1)))


# Brazilian cities coordinates for geocoding fallback
BRAZIL_CITIES = {
    "são paulo": (-23.5505, -46.6333),
    "sao paulo": (-23.5505, -46.6333),
    "rio de janeiro": (-22.9068, -43.1729),
    "belo horizonte": (-19.9167, -43.9345),
    "brasília": (-15.7801, -47.9292),
    "brasilia": (-15.7801, -47.9292),
    "salvador": (-12.9714, -38.5014),
    "fortaleza": (-3.7172, -38.5433),
    "curitiba": (-25.4284, -49.2733),
    "recife": (-8.0476, -34.8770),
    "porto alegre": (-30.0346, -51.2177),
    "manaus": (-3.1190, -60.0217),
    "campinas": (-22.9099, -47.0626),
    "goiânia": (-16.6869, -49.2648),
    "goiania": (-16.6869, -49.2648),
    "santos": (-23.9608, -46.3336),
    "florianópolis": (-27.5954, -48.5480),
    "florianopolis": (-27.5954, -48.5480),
    "vitória": (-20.2976, -40.2958),
    "vitoria": (-20.2976, -40.2958),
    "natal": (-5.7945, -35.2110),
    "joão pessoa": (-7.1195, -34.8450),
    "joao pessoa": (-7.1195, -34.8450),
    "maceió": (-9.6498, -35.7089),
    "maceio": (-9.6498, -35.7089),
    "aracaju": (-10.9472, -37.0731),
    "teresina": (-5.0892, -42.8019),
    "campo grande": (-20.4697, -54.6201),
    "cuiabá": (-15.6014, -56.0979),
    "cuiaba": (-15.6014, -56.0979),
    "belém": (-1.4558, -48.4902),
    "belem": (-1.4558, -48.4902),
    "são luís": (-2.5307, -44.3068),
    "sao luis": (-2.5307, -44.3068),
    "londrina": (-23.3045, -51.1696),
    "ribeirão preto": (-21.1775, -47.8103),
    "ribeirao preto": (-21.1775, -47.8103),
    "uberlândia": (-18.9186, -48.2772),
    "uberlandia": (-18.9186, -48.2772),
    "sorocaba": (-23.5015, -47.4526),
    "niterói": (-22.8833, -43.1033),
    "niteroi": (-22.8833, -43.1033),
}


def get_city_coordinates(city: str) -> Tuple[float, float]:
    """
    Get approximate coordinates for a Brazilian city.
    Returns (lat, lng) or default São Paulo coordinates.
    """
    city_lower = city.lower().strip()
    
    if city_lower in BRAZIL_CITIES:
        return BRAZIL_CITIES[city_lower]
    
    # Try partial match
    for name, coords in BRAZIL_CITIES.items():
        if name in city_lower or city_lower in name:
            return coords
    
    # Default to São Paulo
    return (-23.5505, -46.6333)


async def geocode_address(address: str) -> Optional[Tuple[float, float]]:
    """
    Geocode an address using Nominatim (OpenStreetMap).
    Returns (lat, lng) or None.
    """
    try:
        url = "https://nominatim.openstreetmap.org/search"
        params = {
            "q": f"{address}, Brasil",
            "format": "json",
            "limit": 1
        }
        headers = {
            "User-Agent": "LevvaApp/1.0"
        }
        
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(url, params=params, headers=headers)
            
            if response.status_code == 200:
                data = response.json()
                if data:
                    return (float(data[0]["lat"]), float(data[0]["lon"]))
        
        return None
        
    except Exception as e:
        logger.error(f"Geocoding error: {e}")
        return None
