"""
Levva API Tests - Testing auth, matches, chat, and admin endpoints
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://shipmate-122.preview.emergentagent.com')

# Test credentials
TEST_USER_EMAIL = "teste@levva.com"
TEST_USER_PASSWORD = "password123"
ADMIN_EMAIL = "admin@levva.com"
ADMIN_PASSWORD = "adminpassword"
EXISTING_MATCH_ID = "6964eedb7b48485f3a36b05d"


class TestHealthCheck:
    """Health check tests"""
    
    def test_health_endpoint(self):
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert data["service"] == "Levva API"


class TestAuthentication:
    """Authentication endpoint tests"""
    
    def test_login_regular_user(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_USER_EMAIL,
            "password": TEST_USER_PASSWORD
        })
        assert response.status_code == 200
        data = response.json()
        assert "token" in data
        assert "user" in data
        assert data["user"]["email"] == TEST_USER_EMAIL
        assert data["user"]["verification_status"] == "verified"
    
    def test_login_admin_user(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200
        data = response.json()
        assert "token" in data
        assert data["user"]["role"] == "admin"
    
    def test_login_invalid_credentials(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "wrong@example.com",
            "password": "wrongpass"
        })
        assert response.status_code == 401


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


class TestMatches:
    """Match endpoint tests"""
    
    def test_get_my_matches(self, user_token):
        headers = {"Authorization": f"Bearer {user_token}"}
        response = requests.get(f"{BASE_URL}/api/matches/my-matches", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        # Verify match structure
        if len(data) > 0:
            match = data[0]
            assert "id" in match
            assert "trip_id" in match
            assert "shipment_id" in match
            assert "estimated_price" in match
    
    def test_get_match_details(self, user_token):
        """Test match details endpoint - verifies ObjectId serialization fix"""
        headers = {"Authorization": f"Bearer {user_token}"}
        response = requests.get(f"{BASE_URL}/api/matches/{EXISTING_MATCH_ID}", headers=headers)
        assert response.status_code == 200
        data = response.json()
        # Verify match data
        assert data["id"] == EXISTING_MATCH_ID
        assert "trip" in data
        assert "shipment" in data
        assert "carrier_name" in data
        assert "sender_name" in data
        # Verify nested objects don't have _id (ObjectId fix)
        assert "_id" not in data
        if data.get("trip"):
            assert "_id" not in data["trip"]
        if data.get("shipment"):
            assert "_id" not in data["shipment"]
    
    def test_get_match_details_not_found(self, user_token):
        headers = {"Authorization": f"Bearer {user_token}"}
        response = requests.get(f"{BASE_URL}/api/matches/000000000000000000000000", headers=headers)
        assert response.status_code == 404


class TestChat:
    """Chat endpoint tests"""
    
    def test_get_chat_messages(self, user_token):
        headers = {"Authorization": f"Bearer {user_token}"}
        response = requests.get(f"{BASE_URL}/api/chat/{EXISTING_MATCH_ID}/messages", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        # Verify message structure
        if len(data) > 0:
            msg = data[0]
            assert "id" in msg
            assert "message" in msg
            assert "sender_name" in msg
            assert "_id" not in msg  # ObjectId fix
    
    def test_send_chat_message(self, user_token):
        headers = {"Authorization": f"Bearer {user_token}"}
        response = requests.post(
            f"{BASE_URL}/api/chat/{EXISTING_MATCH_ID}/messages",
            headers=headers,
            json={"message": "TEST_Pytest message"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["message"] == "TEST_Pytest message"
        assert "id" in data
        assert "_id" not in data
    
    def test_chat_unauthorized_match(self, admin_token):
        """Admin should not access chat for matches they're not part of"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/chat/{EXISTING_MATCH_ID}/messages", headers=headers)
        assert response.status_code == 403


class TestAdmin:
    """Admin endpoint tests"""
    
    def test_get_admin_stats(self, admin_token):
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/admin/stats", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert "total_users" in data
        assert "active_trips" in data
        assert "pending_verifications" in data
    
    def test_get_pending_verifications(self, admin_token):
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/admin/verifications/pending", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        # Verify verification structure
        if len(data) > 0:
            verification = data[0]
            assert "id" in verification
            assert "user_name" in verification
            assert "documents" in verification
            assert "_id" not in verification
    
    def test_admin_stats_unauthorized(self, user_token):
        """Regular user should not access admin stats"""
        headers = {"Authorization": f"Bearer {user_token}"}
        response = requests.get(f"{BASE_URL}/api/admin/stats", headers=headers)
        assert response.status_code == 403


class TestMatchCreation:
    """Match creation tests - verifies price_per_kg fix"""
    
    def test_create_match(self, user_token):
        """Test creating a match - verifies price_per_kg = None handling"""
        headers = {"Authorization": f"Bearer {user_token}"}
        # Using existing trip and shipment IDs
        response = requests.post(
            f"{BASE_URL}/api/matches/create?trip_id=69644d2515c0dd93e8350159&shipment_id=69644d2f15c0dd93e835015a",
            headers=headers
        )
        assert response.status_code == 200
        data = response.json()
        assert "id" in data
        assert "estimated_price" in data
        assert data["estimated_price"] > 0
        assert "carrier_earnings" in data
        assert "platform_commission" in data


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
