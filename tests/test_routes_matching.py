"""
Levva API Tests - Route Service, Trips with Coordinates, Shipments with Coordinates, and Corridor Matching
Tests the new features: LocationPicker integration, OSRM polyline generation, and corridor-based matching
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://logistic-mvp.preview.emergentagent.com')

# Test credentials
TEST_USER_EMAIL = "teste@levva.com"
TEST_USER_PASSWORD = "password123"
ADMIN_EMAIL = "admin@levva.com"
ADMIN_PASSWORD = "adminpassword"

# Test coordinates (São Paulo -> Campinas route)
SAO_PAULO_COORDS = {"lat": -23.5505, "lng": -46.6333}
CAMPINAS_COORDS = {"lat": -22.9099, "lng": -47.0626}
# Point within corridor (Jundiaí - between SP and Campinas)
JUNDIAI_COORDS = {"lat": -23.1857, "lng": -46.8978}
# Point outside corridor (Rio de Janeiro)
RIO_COORDS = {"lat": -22.9068, "lng": -43.1729}


@pytest.fixture
def user_token():
    """Get test user token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": TEST_USER_EMAIL,
        "password": TEST_USER_PASSWORD
    })
    if response.status_code == 200:
        return response.json()["token"]
    pytest.skip("User authentication failed")


@pytest.fixture
def admin_token():
    """Get admin token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": ADMIN_EMAIL,
        "password": ADMIN_PASSWORD
    })
    if response.status_code == 200:
        return response.json()["token"]
    pytest.skip("Admin authentication failed")


class TestHealthCheck:
    """Basic health check"""
    
    def test_api_health(self):
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"


class TestTripsWithCoordinates:
    """Test trip creation with lat/lng coordinates and polyline generation"""
    
    def test_list_trips(self, user_token):
        """Test listing published trips"""
        headers = {"Authorization": f"Bearer {user_token}"}
        response = requests.get(f"{BASE_URL}/api/trips", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Found {len(data)} published trips")
    
    def test_get_my_trips(self, user_token):
        """Test getting user's trips"""
        headers = {"Authorization": f"Bearer {user_token}"}
        response = requests.get(f"{BASE_URL}/api/trips/my-trips", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"User has {len(data)} trips")
        
        # Check if any trip has route_polyline
        for trip in data:
            if trip.get("route_polyline"):
                print(f"Trip {trip['id']} has polyline with {len(trip['route_polyline'])} points")
                assert isinstance(trip["route_polyline"], list)
                assert len(trip["route_polyline"]) >= 2
                # Verify polyline format [[lat, lng], ...]
                first_point = trip["route_polyline"][0]
                assert isinstance(first_point, list)
                assert len(first_point) == 2
    
    def test_trip_has_coordinates(self, user_token):
        """Verify trips have lat/lng coordinates in origin and destination"""
        headers = {"Authorization": f"Bearer {user_token}"}
        response = requests.get(f"{BASE_URL}/api/trips", headers=headers)
        assert response.status_code == 200
        trips = response.json()
        
        for trip in trips:
            # Check origin coordinates
            origin = trip.get("origin", {})
            if origin.get("lat") and origin.get("lng"):
                print(f"Trip origin: {origin.get('city')} ({origin['lat']}, {origin['lng']})")
                assert isinstance(origin["lat"], (int, float))
                assert isinstance(origin["lng"], (int, float))
            
            # Check destination coordinates
            dest = trip.get("destination", {})
            if dest.get("lat") and dest.get("lng"):
                print(f"Trip destination: {dest.get('city')} ({dest['lat']}, {dest['lng']})")
                assert isinstance(dest["lat"], (int, float))
                assert isinstance(dest["lng"], (int, float))


class TestShipmentsWithCoordinates:
    """Test shipment creation with lat/lng coordinates"""
    
    def test_list_shipments(self, user_token):
        """Test listing published shipments"""
        headers = {"Authorization": f"Bearer {user_token}"}
        response = requests.get(f"{BASE_URL}/api/shipments", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Found {len(data)} published shipments")
    
    def test_get_my_shipments(self, user_token):
        """Test getting user's shipments"""
        headers = {"Authorization": f"Bearer {user_token}"}
        response = requests.get(f"{BASE_URL}/api/shipments/my-shipments", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"User has {len(data)} shipments")
    
    def test_shipment_has_coordinates(self, user_token):
        """Verify shipments have lat/lng coordinates in origin and destination"""
        headers = {"Authorization": f"Bearer {user_token}"}
        response = requests.get(f"{BASE_URL}/api/shipments", headers=headers)
        assert response.status_code == 200
        shipments = response.json()
        
        for shipment in shipments:
            # Check origin (pickup) coordinates
            origin = shipment.get("origin", {})
            if origin.get("lat") and origin.get("lng"):
                print(f"Shipment pickup: {origin.get('city')} ({origin['lat']}, {origin['lng']})")
                assert isinstance(origin["lat"], (int, float))
                assert isinstance(origin["lng"], (int, float))
            
            # Check destination (dropoff) coordinates
            dest = shipment.get("destination", {})
            if dest.get("lat") and dest.get("lng"):
                print(f"Shipment dropoff: {dest.get('city')} ({dest['lat']}, {dest['lng']})")
                assert isinstance(dest["lat"], (int, float))
                assert isinstance(dest["lng"], (int, float))


class TestMatchSuggestions:
    """Test corridor-based matching suggestions"""
    
    def test_get_match_suggestions(self, user_token):
        """Test getting match suggestions based on corridor matching"""
        headers = {"Authorization": f"Bearer {user_token}"}
        response = requests.get(f"{BASE_URL}/api/matches/suggestions", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Found {len(data)} match suggestions")
        
        # Verify suggestion structure
        for suggestion in data:
            assert "type" in suggestion
            assert suggestion["type"] in ["trip_for_shipment", "shipment_for_trip"]
            assert "match_score" in suggestion
            assert "deviation_km" in suggestion
            assert "corridor_radius_km" in suggestion
            
            print(f"Suggestion: {suggestion['type']}, score={suggestion['match_score']}, deviation={suggestion['deviation_km']}km")
    
    def test_match_suggestions_sorted_by_score(self, user_token):
        """Verify suggestions are sorted by match score (highest first)"""
        headers = {"Authorization": f"Bearer {user_token}"}
        response = requests.get(f"{BASE_URL}/api/matches/suggestions", headers=headers)
        assert response.status_code == 200
        suggestions = response.json()
        
        if len(suggestions) >= 2:
            scores = [s["match_score"] for s in suggestions]
            assert scores == sorted(scores, reverse=True), "Suggestions should be sorted by score descending"
            print(f"Scores are properly sorted: {scores[:5]}...")


class TestExistingTripsAndShipments:
    """Test existing trips and shipments have proper data"""
    
    def test_existing_trip_with_polyline(self, user_token):
        """Check if existing trips have polyline data"""
        headers = {"Authorization": f"Bearer {user_token}"}
        response = requests.get(f"{BASE_URL}/api/trips", headers=headers)
        assert response.status_code == 200
        trips = response.json()
        
        trips_with_polyline = [t for t in trips if t.get("route_polyline")]
        print(f"Trips with polyline: {len(trips_with_polyline)}/{len(trips)}")
        
        if trips_with_polyline:
            trip = trips_with_polyline[0]
            polyline = trip["route_polyline"]
            print(f"Sample polyline has {len(polyline)} points")
            print(f"First point: {polyline[0]}")
            print(f"Last point: {polyline[-1]}")
            
            # Verify polyline is valid
            assert len(polyline) >= 2
            for point in polyline[:5]:  # Check first 5 points
                assert len(point) == 2
                assert -90 <= point[0] <= 90  # lat
                assert -180 <= point[1] <= 180  # lng
    
    def test_trip_corridor_radius(self, user_token):
        """Check if trips have corridor_radius_km field"""
        headers = {"Authorization": f"Bearer {user_token}"}
        response = requests.get(f"{BASE_URL}/api/trips", headers=headers)
        assert response.status_code == 200
        trips = response.json()
        
        for trip in trips:
            corridor = trip.get("corridor_radius_km")
            if corridor:
                print(f"Trip {trip['id']}: corridor_radius_km = {corridor}")
                assert isinstance(corridor, (int, float))
                assert corridor > 0


class TestMatchDetails:
    """Test match details with route information"""
    
    def test_match_has_trip_with_polyline(self, user_token):
        """Verify match details include trip with polyline"""
        headers = {"Authorization": f"Bearer {user_token}"}
        
        # First get user's matches
        response = requests.get(f"{BASE_URL}/api/matches/my-matches", headers=headers)
        assert response.status_code == 200
        matches = response.json()
        
        if not matches:
            pytest.skip("No matches found for user")
        
        # Get details of first match
        match_id = matches[0]["id"]
        response = requests.get(f"{BASE_URL}/api/matches/{match_id}", headers=headers)
        assert response.status_code == 200
        match_data = response.json()
        
        # Verify match has trip data
        assert "trip" in match_data
        trip = match_data["trip"]
        
        if trip:
            print(f"Match trip origin: {trip.get('origin', {}).get('city')}")
            print(f"Match trip destination: {trip.get('destination', {}).get('city')}")
            
            if trip.get("route_polyline"):
                print(f"Trip has polyline with {len(trip['route_polyline'])} points")
        
        # Verify match has shipment data
        assert "shipment" in match_data
        shipment = match_data["shipment"]
        
        if shipment:
            print(f"Match shipment origin: {shipment.get('origin', {}).get('city')}")
            print(f"Match shipment destination: {shipment.get('destination', {}).get('city')}")


class TestRouteServiceIntegration:
    """Test OSRM route service integration"""
    
    def test_osrm_service_available(self):
        """Test that OSRM public service is accessible"""
        # Direct test to OSRM
        url = "https://router.project-osrm.org/route/v1/driving/-46.6333,-23.5505;-47.0626,-22.9099"
        params = {"overview": "full", "geometries": "geojson"}
        
        response = requests.get(url, params=params, timeout=10)
        assert response.status_code == 200
        data = response.json()
        assert data.get("code") == "Ok"
        assert "routes" in data
        print(f"OSRM returned route with {len(data['routes'][0]['geometry']['coordinates'])} points")


class TestNominatimGeocodingIntegration:
    """Test Nominatim geocoding service integration"""
    
    def test_nominatim_search(self):
        """Test that Nominatim search is accessible"""
        url = "https://nominatim.openstreetmap.org/search"
        params = {
            "q": "São Paulo, Brasil",
            "format": "json",
            "limit": 1
        }
        headers = {"User-Agent": "LevvaApp/1.0"}
        
        response = requests.get(url, params=params, headers=headers, timeout=10)
        assert response.status_code == 200
        data = response.json()
        assert len(data) > 0
        assert "lat" in data[0]
        assert "lon" in data[0]
        print(f"Nominatim found São Paulo at ({data[0]['lat']}, {data[0]['lon']})")
    
    def test_nominatim_reverse_geocode(self):
        """Test that Nominatim reverse geocoding is accessible"""
        url = "https://nominatim.openstreetmap.org/reverse"
        params = {
            "lat": -23.5505,
            "lon": -46.6333,
            "format": "json",
            "addressdetails": 1
        }
        headers = {"User-Agent": "LevvaApp/1.0"}
        
        response = requests.get(url, params=params, headers=headers, timeout=10)
        assert response.status_code == 200
        data = response.json()
        assert "address" in data
        print(f"Reverse geocode result: {data.get('display_name', '')[:100]}...")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
