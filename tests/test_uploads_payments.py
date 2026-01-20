"""
Levva API Tests - Upload (Cloudflare R2) and Payment (Mercado Pago) endpoints
Tests for presigned URL generation, upload confirmation, and payment initiation
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://logistic-mvp.preview.emergentagent.com')

# Test credentials
TEST_USER_EMAIL = "teste@levva.com"
TEST_USER_PASSWORD = "password123"
EXISTING_MATCH_ID = "6964eedb7b48485f3a36b05d"


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


class TestUploadPresignedUrl:
    """Tests for POST /api/uploads/presigned-url - Generate presigned URL for R2 upload"""
    
    def test_generate_presigned_url_profile_photo(self, user_token):
        """Test generating presigned URL for profile photo upload"""
        headers = {"Authorization": f"Bearer {user_token}"}
        response = requests.post(
            f"{BASE_URL}/api/uploads/presigned-url",
            headers=headers,
            json={
                "file_type": "profile",
                "content_type": "image/jpeg"
            }
        )
        assert response.status_code == 200
        data = response.json()
        # Verify response structure
        assert "presigned_url" in data
        assert "file_key" in data
        assert "upload_id" in data
        assert "content_type" in data
        # Verify presigned URL is valid R2 URL
        assert "r2.cloudflarestorage.com" in data["presigned_url"]
        # Verify file_key structure
        assert "profile/" in data["file_key"]
        assert data["content_type"] == "image/jpeg"
    
    def test_generate_presigned_url_id_document(self, user_token):
        """Test generating presigned URL for ID document upload"""
        headers = {"Authorization": f"Bearer {user_token}"}
        response = requests.post(
            f"{BASE_URL}/api/uploads/presigned-url",
            headers=headers,
            json={
                "file_type": "id_front",
                "content_type": "image/png"
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert "presigned_url" in data
        assert "id_front/" in data["file_key"]
        assert data["content_type"] == "image/png"
    
    def test_generate_presigned_url_selfie(self, user_token):
        """Test generating presigned URL for selfie upload"""
        headers = {"Authorization": f"Bearer {user_token}"}
        response = requests.post(
            f"{BASE_URL}/api/uploads/presigned-url",
            headers=headers,
            json={
                "file_type": "selfie",
                "content_type": "image/webp"
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert "presigned_url" in data
        assert "selfie/" in data["file_key"]
    
    def test_generate_presigned_url_unauthorized(self):
        """Test presigned URL without auth token"""
        response = requests.post(
            f"{BASE_URL}/api/uploads/presigned-url",
            json={
                "file_type": "profile",
                "content_type": "image/jpeg"
            }
        )
        assert response.status_code in [401, 403, 422]


class TestUploadConfirm:
    """Tests for POST /api/uploads/confirm - Confirm upload and get public URL"""
    
    def test_confirm_upload_success(self, user_token):
        """Test confirming upload and getting public URL"""
        headers = {"Authorization": f"Bearer {user_token}"}
        
        # First generate a presigned URL
        presigned_response = requests.post(
            f"{BASE_URL}/api/uploads/presigned-url",
            headers=headers,
            json={
                "file_type": "profile",
                "content_type": "image/jpeg"
            }
        )
        assert presigned_response.status_code == 200
        file_key = presigned_response.json()["file_key"]
        
        # Now confirm the upload (even without actual upload, we can test the endpoint)
        confirm_response = requests.post(
            f"{BASE_URL}/api/uploads/confirm",
            headers=headers,
            json={
                "file_key": file_key,
                "file_type": "profile"
            }
        )
        assert confirm_response.status_code == 200
        data = confirm_response.json()
        # Verify response structure
        assert "file_key" in data
        assert "file_url" in data
        assert "file_type" in data
        assert data["file_key"] == file_key
        # Verify file_url is a presigned GET URL
        assert "r2.cloudflarestorage.com" in data["file_url"]
    
    def test_confirm_upload_missing_file_key(self, user_token):
        """Test confirm upload without file_key"""
        headers = {"Authorization": f"Bearer {user_token}"}
        response = requests.post(
            f"{BASE_URL}/api/uploads/confirm",
            headers=headers,
            json={
                "file_type": "profile"
            }
        )
        assert response.status_code == 400
        data = response.json()
        assert "file_key" in data.get("detail", "").lower()


class TestPaymentInitiate:
    """Tests for POST /api/payments/initiate - Create Mercado Pago preference"""
    
    def test_initiate_payment_success(self, user_token):
        """Test initiating payment for a match"""
        headers = {"Authorization": f"Bearer {user_token}"}
        
        # First get match details to get the price
        match_response = requests.get(
            f"{BASE_URL}/api/matches/{EXISTING_MATCH_ID}",
            headers=headers
        )
        assert match_response.status_code == 200
        match_data = match_response.json()
        amount = match_data.get("estimated_price", 50.0)
        
        # Initiate payment
        response = requests.post(
            f"{BASE_URL}/api/payments/initiate",
            headers=headers,
            json={
                "match_id": EXISTING_MATCH_ID,
                "amount": amount
            }
        )
        assert response.status_code == 200
        data = response.json()
        # Verify response structure
        assert "id" in data
        assert "match_id" in data
        assert "amount" in data
        assert "status" in data
        assert data["match_id"] == EXISTING_MATCH_ID
        # Verify Mercado Pago integration
        assert "checkout_url" in data
        assert "mercadopago_preference_id" in data
        # Verify checkout URL is valid Mercado Pago URL
        if data["checkout_url"]:
            assert "mercadopago.com" in data["checkout_url"]
    
    def test_initiate_payment_invalid_match(self, user_token):
        """Test initiating payment for non-existent match"""
        headers = {"Authorization": f"Bearer {user_token}"}
        response = requests.post(
            f"{BASE_URL}/api/payments/initiate",
            headers=headers,
            json={
                "match_id": "000000000000000000000000",
                "amount": 50.0
            }
        )
        assert response.status_code == 404
    
    def test_initiate_payment_unauthorized(self):
        """Test initiating payment without auth"""
        response = requests.post(
            f"{BASE_URL}/api/payments/initiate",
            json={
                "match_id": EXISTING_MATCH_ID,
                "amount": 50.0
            }
        )
        assert response.status_code in [401, 403, 422]


class TestPaymentStatus:
    """Tests for GET /api/payments/{match_id}/status - Get payment status"""
    
    def test_get_payment_status_existing(self, user_token):
        """Test getting payment status for a match with payment"""
        headers = {"Authorization": f"Bearer {user_token}"}
        response = requests.get(
            f"{BASE_URL}/api/payments/{EXISTING_MATCH_ID}/status",
            headers=headers
        )
        assert response.status_code == 200
        data = response.json()
        # Verify response structure
        assert "match_id" in data
        assert "status" in data
        assert data["match_id"] == EXISTING_MATCH_ID
        # Status should be one of: not_initiated, pending, escrowed, released
        valid_statuses = ["not_initiated", "pending", "escrowed", "released", "PaymentStatus.PENDING", "PaymentStatus.ESCROWED", "PaymentStatus.RELEASED"]
        assert data["status"] in valid_statuses or "pending" in data["status"].lower() or "not_initiated" in data["status"]
    
    def test_get_payment_status_not_initiated(self, user_token):
        """Test getting payment status for match without payment"""
        headers = {"Authorization": f"Bearer {user_token}"}
        # Use a match ID that likely doesn't have payment
        response = requests.get(
            f"{BASE_URL}/api/payments/000000000000000000000001/status",
            headers=headers
        )
        # Should return 200 with status "not_initiated" or 404
        assert response.status_code in [200, 404]
        if response.status_code == 200:
            data = response.json()
            assert data["status"] == "not_initiated"
    
    def test_get_payment_status_unauthorized(self):
        """Test getting payment status without auth"""
        response = requests.get(
            f"{BASE_URL}/api/payments/{EXISTING_MATCH_ID}/status"
        )
        assert response.status_code in [401, 403, 422]


class TestUploadFileUrl:
    """Tests for GET /api/uploads/file-url/{file_key} - Get temporary URL for file"""
    
    def test_get_file_url(self, user_token):
        """Test getting temporary URL for a file"""
        headers = {"Authorization": f"Bearer {user_token}"}
        
        # First generate a presigned URL to get a valid file_key
        presigned_response = requests.post(
            f"{BASE_URL}/api/uploads/presigned-url",
            headers=headers,
            json={
                "file_type": "profile",
                "content_type": "image/jpeg"
            }
        )
        assert presigned_response.status_code == 200
        file_key = presigned_response.json()["file_key"]
        
        # Get file URL
        response = requests.get(
            f"{BASE_URL}/api/uploads/file-url/{file_key}",
            headers=headers
        )
        assert response.status_code == 200
        data = response.json()
        assert "url" in data
        assert "r2.cloudflarestorage.com" in data["url"]


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
