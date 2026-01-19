import requests
import sys
from datetime import datetime, date
import json

class LevvaModularAPITester:
    def __init__(self, base_url="https://smart-logistics-25.preview.emergentagent.com/api"):
        self.base_url = base_url
        self.carrier_token = None
        self.sender_token = None
        self.admin_token = None
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

    def test_health_check(self):
        """Test health check endpoint"""
        success, response = self.run_test(
            "Health Check",
            "GET",
            "health",
            200
        )
        return success

    def test_admin_login(self):
        """Test admin login"""
        success, response = self.run_test(
            "Admin Login",
            "POST",
            "auth/login",
            200,
            data={
                "email": "admin@levva.com",
                "password": "adminpassword"
            }
        )
        if success and 'token' in response:
            self.admin_token = response['token']
            print(f"✅ Admin login token: {self.admin_token[:20]}...")
            return True
        return False

    def test_carrier_login(self):
        """Test carrier login with verified user"""
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

    def test_sender_login(self):
        """Test sender login with verified user"""
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

    def test_auth_me_carrier(self):
        """Test GET /api/auth/me with carrier token"""
        success, response = self.run_test(
            "Get Current User (Carrier)",
            "GET",
            "auth/me",
            200,
            token=self.carrier_token
        )
        if success:
            verification_status = response.get('verification_status')
            print(f"✅ Carrier info: {response.get('name')} - {response.get('role')}")
            print(f"✅ Verification status: {verification_status}")
            return True
        return False

    def test_auth_me_sender(self):
        """Test GET /api/auth/me with sender token"""
        success, response = self.run_test(
            "Get Current User (Sender)",
            "GET",
            "auth/me",
            200,
            token=self.sender_token
        )
        if success:
            verification_status = response.get('verification_status')
            print(f"✅ Sender info: {response.get('name')} - {response.get('role')}")
            print(f"✅ Verification status: {verification_status}")
            return True
        return False

    def test_create_trip(self):
        """Create a trip with verified carrier"""
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
            return True
        return False

    def test_create_shipment(self):
        """Create a shipment with verified sender"""
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
                "weight_kg": 4,  # Reduced to fit level_1 trust limit (5kg max)
                "category": "Livros",
                "description": "Coleção de livros raros"
            },
            "declared_value": 80.00,  # Reduced to fit level_1 trust limit
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
            return True
        return False

    def test_list_trips(self):
        """Test GET /api/trips"""
        success, response = self.run_test(
            "List All Trips",
            "GET",
            "trips",
            200
        )
        if success:
            print(f"✅ Found {len(response)} trips")
            return True
        return False

    def test_list_shipments(self):
        """Test GET /api/shipments"""
        success, response = self.run_test(
            "List All Shipments",
            "GET",
            "shipments",
            200
        )
        if success:
            print(f"✅ Found {len(response)} shipments")
            return True
        return False

    def test_my_trips(self):
        """Test GET /api/trips/my-trips"""
        success, response = self.run_test(
            "Get My Trips",
            "GET",
            "trips/my-trips",
            200,
            token=self.carrier_token
        )
        if success:
            print(f"✅ Found {len(response)} trips for carrier")
            return True
        return False

    def test_my_shipments(self):
        """Test GET /api/shipments/my-shipments"""
        success, response = self.run_test(
            "Get My Shipments",
            "GET",
            "shipments/my-shipments",
            200,
            token=self.sender_token
        )
        if success:
            print(f"✅ Found {len(response)} shipments for sender")
            return True
        return False

    def test_match_suggestions(self):
        """Test GET /api/matches/suggestions"""
        success, response = self.run_test(
            "Get Match Suggestions",
            "GET",
            "matches/suggestions",
            200,
            token=self.carrier_token
        )
        if success:
            print(f"✅ Found {len(response)} match suggestions")
            return True
        return False

    def test_create_match(self):
        """Create a match between trip and shipment"""
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
            return True
        return False

def main():
    print("🚀 Starting Levva Modular API Testing...")
    tester = LevvaModularAPITester()

    # Test sequence for modular backend
    tests = [
        ("Health Check", tester.test_health_check),
        ("Admin Login", tester.test_admin_login),
        ("Carrier Login", tester.test_carrier_login),
        ("Sender Login", tester.test_sender_login),
        ("Auth Me - Carrier", tester.test_auth_me_carrier),
        ("Auth Me - Sender", tester.test_auth_me_sender),
        ("Create Trip", tester.test_create_trip),
        ("Create Shipment", tester.test_create_shipment),
        ("List All Trips", tester.test_list_trips),
        ("List All Shipments", tester.test_list_shipments),
        ("Get My Trips", tester.test_my_trips),
        ("Get My Shipments", tester.test_my_shipments),
        ("Get Match Suggestions", tester.test_match_suggestions),
        ("Create Match", tester.test_create_match),
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
    print(f"📊 FINAL MODULAR BACKEND API RESULTS")
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
        print("🎉 All modular backend API tests passed!")
        return 0
    else:
        print("⚠️  Some modular backend API tests failed - check logs above")
        return 1

if __name__ == "__main__":
    sys.exit(main())