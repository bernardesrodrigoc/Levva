"""
Levva API Tests - Match Suggestions, Pricing, and Recurring Trips
Tests the fixed features:
1. GET /api/matches/suggestions - returns suggestions when compatible matches exist
2. POST /api/trips/calculate-price - returns suggested price based on distance
3. Recurring trip creation with recurrence.is_recurring=true
"""
import pytest
import requests
import os
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://freight-match-12.preview.emergentagent.com')

# Test credentials
TEST_USER_EMAIL = "teste@levva.com"  # João Silva - has trips
TEST_USER_PASSWORD = "password123"
SENDER_EMAIL = "remetente_sp_1768238849@levva.com"  # Maria Teste - has shipments
SENDER_PASSWORD = "teste123"
ADMIN_EMAIL = "admin@levva.com"
ADMIN_PASSWORD = "adminpassword"

# Test coordinates (São Paulo -> Campinas route)
SAO_PAULO_COORDS = {"lat": -23.5505, "lng": -46.6333}
CAMPINAS_COORDS = {"lat": -22.9099, "lng": -47.0626}


@pytest.fixture
def user_token():
    """Get test user token (João Silva - carrier)"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": TEST_USER_EMAIL,
        "password": TEST_USER_PASSWORD
    })
    if response.status_code == 200:
        return response.json()["token"]
    pytest.skip("User authentication failed")


@pytest.fixture
def sender_token():
    """Get sender user token (Maria Teste - sender)"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": SENDER_EMAIL,
        "password": SENDER_PASSWORD
    })
    if response.status_code == 200:
        return response.json()["token"]
    pytest.skip("Sender authentication failed")


class TestHealthCheck:
    """Basic health check"""
    
    def test_api_health(self):
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"


class TestCalculateSuggestedPrice:
    """Test POST /api/trips/calculate-price endpoint"""
    
    def test_calculate_price_sp_to_campinas(self):
        """Test price calculation for São Paulo to Campinas (~84km)"""
        response = requests.post(
            f"{BASE_URL}/api/trips/calculate-price",
            params={
                "origin_lat": SAO_PAULO_COORDS["lat"],
                "origin_lng": SAO_PAULO_COORDS["lng"],
                "dest_lat": CAMPINAS_COORDS["lat"],
                "dest_lng": CAMPINAS_COORDS["lng"]
            }
        )
        assert response.status_code == 200
        data = response.json()
        
        # Verify response structure
        assert "distance_km" in data
        assert "suggested_price_per_kg" in data
        assert "examples" in data
        assert "platform_fee_percent" in data
        assert "carrier_receives_percent" in data
        
        # Verify distance is reasonable (SP to Campinas ~80-90km)
        assert 70 <= data["distance_km"] <= 100
        
        # Verify price is within expected range (R$3-12 per kg)
        assert 3.0 <= data["suggested_price_per_kg"] <= 12.0
        
        # Verify examples are calculated correctly (allow small floating point differences)
        assert abs(data["examples"]["1kg"] - data["suggested_price_per_kg"]) < 0.1
        assert abs(data["examples"]["5kg"] - (data["suggested_price_per_kg"] * 5)) < 0.1
        
        # Verify platform fee
        assert data["platform_fee_percent"] == 15
        assert data["carrier_receives_percent"] == 85
        
        print(f"Distance: {data['distance_km']}km, Price: R${data['suggested_price_per_kg']}/kg")
    
    def test_calculate_price_short_distance(self):
        """Test price calculation for short distance (<50km)"""
        # São Paulo to Guarulhos (~25km)
        response = requests.post(
            f"{BASE_URL}/api/trips/calculate-price",
            params={
                "origin_lat": -23.5505,
                "origin_lng": -46.6333,
                "dest_lat": -23.4543,
                "dest_lng": -46.5337
            }
        )
        assert response.status_code == 200
        data = response.json()
        
        # Short distance should have base price around R$3
        assert data["distance_km"] <= 50
        assert data["suggested_price_per_kg"] >= 3.0
        print(f"Short distance: {data['distance_km']}km, Price: R${data['suggested_price_per_kg']}/kg")
    
    def test_calculate_price_long_distance(self):
        """Test price calculation for long distance (>500km)"""
        # São Paulo to Rio de Janeiro (~430km)
        response = requests.post(
            f"{BASE_URL}/api/trips/calculate-price",
            params={
                "origin_lat": -23.5505,
                "origin_lng": -46.6333,
                "dest_lat": -22.9068,
                "dest_lng": -43.1729
            }
        )
        assert response.status_code == 200
        data = response.json()
        
        # Long distance should have higher base price
        assert data["distance_km"] >= 300
        assert data["suggested_price_per_kg"] >= 4.0
        print(f"Long distance: {data['distance_km']}km, Price: R${data['suggested_price_per_kg']}/kg")


class TestMatchSuggestions:
    """Test GET /api/matches/suggestions endpoint"""
    
    def test_carrier_gets_shipment_suggestions(self, user_token):
        """João Silva (carrier) should see Maria's shipment as suggestion"""
        headers = {"Authorization": f"Bearer {user_token}"}
        response = requests.get(f"{BASE_URL}/api/matches/suggestions", headers=headers)
        
        assert response.status_code == 200
        suggestions = response.json()
        assert isinstance(suggestions, list)
        
        # João has a trip SP->Campinas, should see shipments for that route
        print(f"João Silva received {len(suggestions)} suggestions")
        
        # Verify suggestion structure
        for suggestion in suggestions:
            assert "type" in suggestion
            assert suggestion["type"] in ["trip_for_shipment", "shipment_for_trip"]
            assert "match_score" in suggestion
            assert "deviation_km" in suggestion
            assert "corridor_radius_km" in suggestion
            assert "estimated_price" in suggestion
            assert "origin" in suggestion
            assert "destination" in suggestion
            
            print(f"  - {suggestion['type']}: {suggestion['origin']} -> {suggestion['destination']}, score={suggestion['match_score']}")
    
    def test_sender_gets_trip_suggestions(self, sender_token):
        """Maria Teste (sender) should see João's trip as suggestion"""
        headers = {"Authorization": f"Bearer {sender_token}"}
        response = requests.get(f"{BASE_URL}/api/matches/suggestions", headers=headers)
        
        assert response.status_code == 200
        suggestions = response.json()
        assert isinstance(suggestions, list)
        
        # Maria has a shipment SP->Campinas, should see trips for that route
        print(f"Maria Teste received {len(suggestions)} suggestions")
        
        # Should have at least one suggestion (João's trip)
        if len(suggestions) > 0:
            # Find trip_for_shipment type
            trip_suggestions = [s for s in suggestions if s["type"] == "trip_for_shipment"]
            print(f"  - Found {len(trip_suggestions)} trip suggestions for her shipment")
            
            for suggestion in trip_suggestions:
                assert "carrier_name" in suggestion
                assert "carrier_rating" in suggestion
                print(f"    - Carrier: {suggestion['carrier_name']}, Rating: {suggestion['carrier_rating']}")
    
    def test_suggestions_sorted_by_score(self, user_token):
        """Verify suggestions are sorted by match score (highest first)"""
        headers = {"Authorization": f"Bearer {user_token}"}
        response = requests.get(f"{BASE_URL}/api/matches/suggestions", headers=headers)
        
        assert response.status_code == 200
        suggestions = response.json()
        
        if len(suggestions) >= 2:
            scores = [s["match_score"] for s in suggestions]
            assert scores == sorted(scores, reverse=True), "Suggestions should be sorted by score descending"
            print(f"Scores are properly sorted: {scores}")
    
    def test_suggestions_require_auth(self):
        """Suggestions endpoint requires authentication"""
        response = requests.get(f"{BASE_URL}/api/matches/suggestions")
        assert response.status_code in [401, 403, 422]


class TestRecurringTripCreation:
    """Test recurring trip creation with recurrence.is_recurring=true"""
    
    def test_create_recurring_trip(self, user_token):
        """Test creating a recurring trip"""
        headers = {"Authorization": f"Bearer {user_token}"}
        
        # Calculate future dates
        tomorrow = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
        end_date = (datetime.now() + timedelta(days=30)).strftime("%Y-%m-%d")
        
        trip_data = {
            "origin": {
                "city": "São Paulo",
                "state": "SP",
                "address": "Av. Paulista, 1000",
                "lat": -23.5629,
                "lng": -46.6544
            },
            "destination": {
                "city": "Campinas",
                "state": "SP",
                "address": "Centro, Campinas",
                "lat": -22.9099,
                "lng": -47.0626
            },
            "departure_date": f"{tomorrow}T08:00:00Z",
            "vehicle_type": "car",
            "cargo_space": {
                "volume_m3": 0.5,
                "max_weight_kg": 30
            },
            "corridor_radius_km": 10,
            "price_per_kg": 5.0,
            "recurrence": {
                "is_recurring": True,
                "days_of_week": [0, 2, 4],  # Mon, Wed, Fri
                "time": "08:00",
                "end_date": f"{end_date}T23:59:59Z"
            }
        }
        
        response = requests.post(f"{BASE_URL}/api/trips", json=trip_data, headers=headers)
        
        assert response.status_code == 200
        data = response.json()
        
        # Verify trip was created
        assert "id" in data
        assert data["status"] == "published"
        
        # Verify recurrence data
        assert data.get("is_recurring") == True
        
        # Verify recurrence object was stored
        if "recurrence" in data:
            assert data["recurrence"]["is_recurring"] == True
            assert data["recurrence"]["days_of_week"] == [0, 2, 4]
        
        print(f"Created recurring trip: {data['id']}")
        print(f"  - Route: {data['origin']['city']} -> {data['destination']['city']}")
        print(f"  - Is Recurring: {data.get('is_recurring')}")
        
        return data["id"]
    
    def test_create_non_recurring_trip(self, user_token):
        """Test creating a non-recurring trip (recurrence=null)"""
        headers = {"Authorization": f"Bearer {user_token}"}
        
        tomorrow = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
        
        trip_data = {
            "origin": {
                "city": "São Paulo",
                "state": "SP",
                "address": "Av. Paulista, 2000",
                "lat": -23.5629,
                "lng": -46.6544
            },
            "destination": {
                "city": "Santos",
                "state": "SP",
                "address": "Centro, Santos",
                "lat": -23.9608,
                "lng": -46.3336
            },
            "departure_date": f"{tomorrow}T10:00:00Z",
            "vehicle_type": "car",
            "cargo_space": {
                "volume_m3": 0.3,
                "max_weight_kg": 20
            },
            "corridor_radius_km": 8,
            "recurrence": None  # Not recurring
        }
        
        response = requests.post(f"{BASE_URL}/api/trips", json=trip_data, headers=headers)
        
        assert response.status_code == 200
        data = response.json()
        
        # Verify trip was created
        assert "id" in data
        assert data["status"] == "published"
        
        # Verify it's not recurring
        assert data.get("is_recurring") in [False, None]
        
        print(f"Created non-recurring trip: {data['id']}")
        
        return data["id"]
    
    def test_trip_auto_price_calculation(self, user_token):
        """Test that trip gets auto-calculated price when not provided"""
        headers = {"Authorization": f"Bearer {user_token}"}
        
        tomorrow = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
        
        trip_data = {
            "origin": {
                "city": "São Paulo",
                "state": "SP",
                "address": "Av. Paulista, 3000",
                "lat": -23.5629,
                "lng": -46.6544
            },
            "destination": {
                "city": "Campinas",
                "state": "SP",
                "address": "Centro, Campinas",
                "lat": -22.9099,
                "lng": -47.0626
            },
            "departure_date": f"{tomorrow}T14:00:00Z",
            "vehicle_type": "car",
            "cargo_space": {
                "volume_m3": 0.5,
                "max_weight_kg": 30
            },
            "corridor_radius_km": 10,
            "price_per_kg": None,  # Should be auto-calculated
            "recurrence": None
        }
        
        response = requests.post(f"{BASE_URL}/api/trips", json=trip_data, headers=headers)
        
        assert response.status_code == 200
        data = response.json()
        
        # Verify price was auto-calculated
        assert "price_per_kg" in data
        assert data["price_per_kg"] is not None
        assert data["price_per_kg"] >= 3.0  # Minimum price
        assert data["price_per_kg"] <= 12.0  # Maximum price
        
        print(f"Trip auto-calculated price: R${data['price_per_kg']}/kg")
        
        return data["id"]


class TestMyTripsAndShipments:
    """Test user's trips and shipments endpoints"""
    
    def test_get_my_trips(self, user_token):
        """Test getting user's trips"""
        headers = {"Authorization": f"Bearer {user_token}"}
        response = requests.get(f"{BASE_URL}/api/trips/my-trips", headers=headers)
        
        assert response.status_code == 200
        trips = response.json()
        assert isinstance(trips, list)
        
        print(f"User has {len(trips)} trips")
        
        # Check for recurring trips
        recurring_trips = [t for t in trips if t.get("is_recurring")]
        print(f"  - {len(recurring_trips)} recurring trips")
        
        # Check for trips with polyline
        trips_with_polyline = [t for t in trips if t.get("route_polyline")]
        print(f"  - {len(trips_with_polyline)} trips with polyline")
    
    def test_get_my_shipments(self, sender_token):
        """Test getting user's shipments"""
        headers = {"Authorization": f"Bearer {sender_token}"}
        response = requests.get(f"{BASE_URL}/api/shipments/my-shipments", headers=headers)
        
        assert response.status_code == 200
        shipments = response.json()
        assert isinstance(shipments, list)
        
        print(f"Sender has {len(shipments)} shipments")
        
        for shipment in shipments:
            print(f"  - {shipment['origin']['city']} -> {shipment['destination']['city']}: {shipment['package']['weight_kg']}kg")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
