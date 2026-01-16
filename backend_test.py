import requests
import sys
from datetime import datetime, date
import json

class LevvaAPITester:
    def __init__(self, base_url="https://freight-match-12.preview.emergentagent.com/api"):
        self.base_url = base_url
        self.carrier_token = None
        self.sender_token = None
        self.carrier_user_id = None
        self.sender_user_id = None
        self.trip_id = None
        self.shipment_id = None
        self.match_id = None
        self.tests_run = 0
        self.tests_passed = 0

    def run_test(self, name, method, endpoint, expected_status, data=None, token=None):
        """Run a single API test"""
        url = f"{self.base_url}/{endpoint}"
        headers = {'Content-Type': 'application/json'}
        if token:
            headers['Authorization'] = f'Bearer {token}'

        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        print(f"URL: {url}")
        if data:
            print(f"Data: {json.dumps(data, indent=2)}")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=headers)

            print(f"Response Status: {response.status_code}")
            print(f"Response: {response.text[:500]}...")

            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                print(f"✅ Passed - Status: {response.status_code}")
            else:
                print(f"❌ Failed - Expected {expected_status}, got {response.status_code}")

            try:
                response_data = response.json()
            except:
                response_data = {}

            return success, response_data

        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            return False, {}

    def test_carrier_registration(self):
        """Test carrier registration with exact data from requirements"""
        success, response = self.run_test(
            "Carrier Registration",
            "POST",
            "auth/register",
            200,
            data={
                "email": "transportador2@levva.com",
                "password": "teste123",
                "name": "Carlos Silva",
                "phone": "(31) 99999-8888",
                "role": "carrier"
            }
        )
        if success and 'token' in response:
            self.carrier_token = response['token']
            self.carrier_user_id = response.get('user', {}).get('id')
            print(f"✅ Carrier token obtained: {self.carrier_token[:20]}...")
            print(f"✅ Carrier user ID: {self.carrier_user_id}")
            return True
        return False

    def test_carrier_login(self):
        """Test carrier login with exact data from requirements"""
        success, response = self.run_test(
            "Carrier Login",
            "POST",
            "auth/login",
            200,
            data={
                "email": "transportador2@levva.com",
                "password": "teste123"
            }
        )
        if success and 'token' in response:
            self.carrier_token = response['token']
            self.carrier_user_id = response.get('user', {}).get('id')
            print(f"✅ Carrier login token: {self.carrier_token[:20]}...")
            return True
        return False

    def test_auth_me(self):
        """Test GET /api/auth/me with token and verify trust_level"""
        success, response = self.run_test(
            "Get Current User",
            "GET",
            "auth/me",
            200,
            token=self.carrier_token
        )
        if success:
            trust_level = response.get('trust_level')
            print(f"✅ User info: {response.get('name')} - {response.get('role')}")
            print(f"✅ Trust level: {trust_level}")
            if trust_level == "level_1":
                print("✅ Trust level verification passed")
                return True
            else:
                print(f"❌ Expected trust_level 'level_1', got '{trust_level}'")
        return False

    def test_create_trip(self):
        """Create a trip with exact data from requirements"""
        trip_data = {
            "origin": {
                "city": "Belo Horizonte",
                "state": "MG",
                "address": "Belo Horizonte, MG",
                "lat": -19.9191,
                "lng": -43.9386
            },
            "destination": {
                "city": "São Paulo",
                "state": "SP", 
                "address": "São Paulo, SP",
                "lat": -23.5505,
                "lng": -46.6333
            },
            "departure_date": "2025-01-25T08:00:00Z",
            "vehicle_type": "car",
            "cargo_space": {
                "volume_m3": 0.8,
                "max_weight_kg": 30
            },
            "price_per_kg": 7.5
        }
        
        success, response = self.run_test(
            "Create Trip",
            "POST",
            "trips",
            200,
            data=trip_data,
            token=self.carrier_token
        )
        if success and 'id' in response:
            self.trip_id = response['id']
            status = response.get('status')
            print(f"✅ Trip created with ID: {self.trip_id}")
            print(f"✅ Trip status: {status}")
            if status == "published":
                print("✅ Trip status verification passed")
                return True
            else:
                print(f"❌ Expected status 'published', got '{status}'")
        return False

    def test_sender_registration(self):
        """Test sender registration with exact data from requirements"""
        success, response = self.run_test(
            "Sender Registration",
            "POST",
            "auth/register",
            200,
            data={
                "email": "remetente2@levva.com",
                "password": "teste123",
                "name": "Ana Costa",
                "phone": "(11) 98888-7777",
                "role": "sender"
            }
        )
        if success and 'token' in response:
            self.sender_token = response['token']
            self.sender_user_id = response.get('user', {}).get('id')
            print(f"✅ Sender token obtained: {self.sender_token[:20]}...")
            print(f"✅ Sender user ID: {self.sender_user_id}")
            return True
        return False

    def test_sender_login(self):
        """Test sender login with exact data from requirements"""
        success, response = self.run_test(
            "Sender Login",
            "POST",
            "auth/login",
            200,
            data={
                "email": "remetente2@levva.com",
                "password": "teste123"
            }
        )
        if success and 'token' in response:
            self.sender_token = response['token']
            self.sender_user_id = response.get('user', {}).get('id')
            print(f"✅ Sender login token: {self.sender_token[:20]}...")
            return True
        return False

    def test_create_shipment(self):
        """Create a shipment with exact data from requirements"""
        shipment_data = {
            "origin": {
                "city": "Belo Horizonte",
                "state": "MG",
                "lat": -19.9191,
                "lng": -43.9386
            },
            "destination": {
                "city": "São Paulo", 
                "state": "SP",
                "lat": -23.5505,
                "lng": -46.6333
            },
            "package": {
                "length_cm": 35,
                "width_cm": 25,
                "height_cm": 20,
                "weight_kg": 8,
                "category": "Livros",
                "description": "Coleção de livros raros"
            },
            "declared_value": 800.00,
            "photos": {
                "item_visible": "https://example.com/photo1.jpg",
                "packaging_open": "https://example.com/photo2.jpg",
                "packaging_sealed": "https://example.com/photo3.jpg"
            },
            "legal_acceptance": True
        }
        
        success, response = self.run_test(
            "Create Shipment",
            "POST",
            "shipments",
            200,
            data=shipment_data,
            token=self.sender_token
        )
        if success and 'id' in response:
            self.shipment_id = response['id']
            status = response.get('status')
            print(f"✅ Shipment created with ID: {self.shipment_id}")
            print(f"✅ Shipment status: {status}")
            if status == "published":
                print("✅ Shipment status verification passed")
                return True
            else:
                print(f"❌ Expected status 'published', got '{status}'")
        return False

    def test_create_match(self):
        """Create a match between trip and shipment and verify calculations"""
        if not self.trip_id or not self.shipment_id:
            print("❌ Cannot create match - missing trip_id or shipment_id")
            return False
            
        success, response = self.run_test(
            "Create Match",
            "POST",
            f"matches/create?trip_id={self.trip_id}&shipment_id={self.shipment_id}",
            200,
            token=self.carrier_token
        )
        if success and 'id' in response:
            self.match_id = response['id']
            estimated_price = response.get('estimated_price')
            platform_commission = response.get('platform_commission')
            carrier_earnings = response.get('carrier_earnings')
            
            print(f"✅ Match created with ID: {self.match_id}")
            print(f"✅ Estimated price: {estimated_price}")
            print(f"✅ Platform commission (15%): {platform_commission}")
            print(f"✅ Carrier earnings: {carrier_earnings}")
            
            # Verify calculations (8kg * 7.5 = 60, commission = 9, earnings = 51)
            expected_price = 8 * 7.5  # 60
            expected_commission = expected_price * 0.15  # 9
            expected_earnings = expected_price - expected_commission  # 51
            
            if (abs(estimated_price - expected_price) < 0.01 and 
                abs(platform_commission - expected_commission) < 0.01 and
                abs(carrier_earnings - expected_earnings) < 0.01):
                print("✅ Price calculations verified correctly")
                return True
            else:
                print(f"❌ Price calculation mismatch. Expected: {expected_price}, {expected_commission}, {expected_earnings}")
        return False

    def test_verify_trip_status_changed(self):
        """Verify trip status changed to 'matched' after match creation"""
        success, response = self.run_test(
            "Get My Trips",
            "GET",
            "trips/my-trips",
            200,
            token=self.carrier_token
        )
        if success and response:
            for trip in response:
                if trip.get('id') == self.trip_id:
                    status = trip.get('status')
                    print(f"✅ Trip status: {status}")
                    if status == "matched":
                        print("✅ Trip status changed to 'matched' correctly")
                        return True
                    else:
                        print(f"❌ Expected trip status 'matched', got '{status}'")
                        return False
        print("❌ Trip not found in my-trips")
        return False

    def test_verify_shipment_status_changed(self):
        """Verify shipment status changed to 'matched' after match creation"""
        success, response = self.run_test(
            "Get My Shipments",
            "GET",
            "shipments/my-shipments",
            200,
            token=self.sender_token
        )
        if success and response:
            for shipment in response:
                if shipment.get('id') == self.shipment_id:
                    status = shipment.get('status')
                    print(f"✅ Shipment status: {status}")
                    if status == "matched":
                        print("✅ Shipment status changed to 'matched' correctly")
                        return True
                    else:
                        print(f"❌ Expected shipment status 'matched', got '{status}'")
                        return False
        print("❌ Shipment not found in my-shipments")
        return False

    def test_ratings_endpoint(self):
        """Test ratings endpoint structure"""
        # Test getting ratings for a user (should return empty list for new user)
        success, response = self.run_test(
            "Get User Ratings",
            "GET",
            f"ratings/{self.carrier_token[:10]}dummy",  # Using dummy user ID
            200
        )
        return success

    def test_trips_with_filters(self):
        """Test GET /api/trips with Belo Horizonte filter"""
        success, response = self.run_test(
            "List Trips with Origin Filter",
            "GET",
            "trips?origin_city=Belo Horizonte",
            200
        )
        if success:
            print(f"✅ Found {len(response)} trips with origin 'Belo Horizonte'")
            # Verify our trip appears in the list
            trip_found = any(trip.get('id') == self.trip_id for trip in response)
            if trip_found:
                print("✅ Our created trip appears in filtered results")
                return True
            else:
                print("❌ Our created trip not found in filtered results")
        return False

    def test_list_shipments_with_filter(self):
        """Test GET /api/shipments with São Paulo filter"""
        success, response = self.run_test(
            "List Shipments with Destination Filter",
            "GET",
            "shipments?destination_city=São Paulo",
            200
        )
        if success:
            print(f"✅ Found {len(response)} shipments with destination 'São Paulo'")
            # Verify our shipment appears in the list
            shipment_found = any(shipment.get('id') == self.shipment_id for shipment in response)
            if shipment_found:
                print("✅ Our created shipment appears in filtered results")
                return True
            else:
                print("❌ Our created shipment not found in filtered results")
        return False

    def test_health_check(self):
        """Test health check endpoint"""
        success, response = self.run_test(
            "Health Check",
            "GET",
            "health",
            200
        )
        return success

def main():
    print("🚀 Starting Levva API Complete End-to-End Testing...")
    tester = LevvaAPITester()

    # Test sequence matching the exact requirements
    tests = [
        ("Health Check", tester.test_health_check),
        ("1. Carrier Registration", tester.test_carrier_registration),
        ("2. Verify Registration Token", lambda: tester.carrier_token is not None),
        ("3. Carrier Login", tester.test_carrier_login),
        ("4. Verify GET /api/auth/me", tester.test_auth_me),
        ("5. Create Trip", tester.test_create_trip),
        ("6. Verify Trip in List", tester.test_trips_with_filters),
        ("7. Sender Registration", tester.test_sender_registration),
        ("8. Sender Login", tester.test_sender_login),
        ("9. Create Shipment", tester.test_create_shipment),
        ("10. Verify Shipment in List", tester.test_list_shipments_with_filter),
        ("11. Create Match", tester.test_create_match),
        ("12. Verify Trip Status Changed", tester.test_verify_trip_status_changed),
        ("13. Verify Shipment Status Changed", tester.test_verify_shipment_status_changed),
    ]

    for test_name, test_func in tests:
        print(f"\n{'='*60}")
        print(f"Running: {test_name}")
        print('='*60)
        try:
            if callable(test_func):
                result = test_func()
            else:
                result = test_func
            if not result:
                print(f"❌ Test {test_name} failed")
        except Exception as e:
            print(f"❌ Test {test_name} failed with exception: {str(e)}")

    # Print final results
    print(f"\n{'='*60}")
    print(f"📊 FINAL BACKEND API RESULTS")
    print(f"{'='*60}")
    print(f"Tests passed: {tester.tests_passed}/{tester.tests_run}")
    print(f"Success rate: {(tester.tests_passed/tester.tests_run)*100:.1f}%" if tester.tests_run > 0 else "No tests run")
    
    # Print summary of created entities
    print(f"\n📋 CREATED ENTITIES:")
    print(f"Carrier User ID: {tester.carrier_user_id}")
    print(f"Sender User ID: {tester.sender_user_id}")
    print(f"Trip ID: {tester.trip_id}")
    print(f"Shipment ID: {tester.shipment_id}")
    print(f"Match ID: {tester.match_id}")
    
    if tester.tests_passed == tester.tests_run:
        print("🎉 All backend API tests passed!")
        return 0
    else:
        print("⚠️  Some backend API tests failed - check logs above")
        return 1

if __name__ == "__main__":
    sys.exit(main())