"""
Levva API Tests - Direct Upload Endpoint (POST /api/uploads/direct)
Tests for the proxy upload endpoint that bypasses R2 CORS issues
"""
import pytest
import requests
import os
import io

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://shipmate-122.preview.emergentagent.com')

# Test credentials from review request
TEST_USER_EMAIL = "upload_test@levva.com"
TEST_USER_PASSWORD = "teste123"

# Fallback credentials
FALLBACK_USER_EMAIL = "teste@levva.com"
FALLBACK_USER_PASSWORD = "password123"


@pytest.fixture
def user_token():
    """Get test user token - try upload_test user first, fallback to teste user"""
    # Try upload_test user first
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": TEST_USER_EMAIL,
        "password": TEST_USER_PASSWORD
    })
    if response.status_code == 200:
        return response.json()["token"]
    
    # Fallback to existing test user
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": FALLBACK_USER_EMAIL,
        "password": FALLBACK_USER_PASSWORD
    })
    if response.status_code == 200:
        return response.json()["token"]
    
    pytest.skip("User authentication failed")


def create_test_image(content_type="image/jpeg", size_kb=10):
    """Create a minimal test image file"""
    # Create a minimal valid JPEG header
    if content_type == "image/jpeg":
        # Minimal JPEG (1x1 pixel red)
        jpeg_data = bytes([
            0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01,
            0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xFF, 0xDB, 0x00, 0x43,
            0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09,
            0x09, 0x08, 0x0A, 0x0C, 0x14, 0x0D, 0x0C, 0x0B, 0x0B, 0x0C, 0x19, 0x12,
            0x13, 0x0F, 0x14, 0x1D, 0x1A, 0x1F, 0x1E, 0x1D, 0x1A, 0x1C, 0x1C, 0x20,
            0x24, 0x2E, 0x27, 0x20, 0x22, 0x2C, 0x23, 0x1C, 0x1C, 0x28, 0x37, 0x29,
            0x2C, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1F, 0x27, 0x39, 0x3D, 0x38, 0x32,
            0x3C, 0x2E, 0x33, 0x34, 0x32, 0xFF, 0xC0, 0x00, 0x0B, 0x08, 0x00, 0x01,
            0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xFF, 0xC4, 0x00, 0x1F, 0x00, 0x00,
            0x01, 0x05, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
            0x09, 0x0A, 0x0B, 0xFF, 0xC4, 0x00, 0xB5, 0x10, 0x00, 0x02, 0x01, 0x03,
            0x03, 0x02, 0x04, 0x03, 0x05, 0x05, 0x04, 0x04, 0x00, 0x00, 0x01, 0x7D,
            0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12, 0x21, 0x31, 0x41, 0x06,
            0x13, 0x51, 0x61, 0x07, 0x22, 0x71, 0x14, 0x32, 0x81, 0x91, 0xA1, 0x08,
            0x23, 0x42, 0xB1, 0xC1, 0x15, 0x52, 0xD1, 0xF0, 0x24, 0x33, 0x62, 0x72,
            0x82, 0x09, 0x0A, 0x16, 0x17, 0x18, 0x19, 0x1A, 0x25, 0x26, 0x27, 0x28,
            0x29, 0x2A, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3A, 0x43, 0x44, 0x45,
            0x46, 0x47, 0x48, 0x49, 0x4A, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59,
            0x5A, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69, 0x6A, 0x73, 0x74, 0x75,
            0x76, 0x77, 0x78, 0x79, 0x7A, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89,
            0x8A, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9A, 0xA2, 0xA3,
            0xA4, 0xA5, 0xA6, 0xA7, 0xA8, 0xA9, 0xAA, 0xB2, 0xB3, 0xB4, 0xB5, 0xB6,
            0xB7, 0xB8, 0xB9, 0xBA, 0xC2, 0xC3, 0xC4, 0xC5, 0xC6, 0xC7, 0xC8, 0xC9,
            0xCA, 0xD2, 0xD3, 0xD4, 0xD5, 0xD6, 0xD7, 0xD8, 0xD9, 0xDA, 0xE1, 0xE2,
            0xE3, 0xE4, 0xE5, 0xE6, 0xE7, 0xE8, 0xE9, 0xEA, 0xF1, 0xF2, 0xF3, 0xF4,
            0xF5, 0xF6, 0xF7, 0xF8, 0xF9, 0xFA, 0xFF, 0xDA, 0x00, 0x08, 0x01, 0x01,
            0x00, 0x00, 0x3F, 0x00, 0xFB, 0xD5, 0xDB, 0x20, 0xA8, 0xF1, 0x7E, 0xA9,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0xFF, 0xD9
        ])
        # Pad to desired size
        padding = b'\x00' * max(0, size_kb * 1024 - len(jpeg_data))
        return jpeg_data + padding
    elif content_type == "image/png":
        # Minimal PNG (1x1 pixel)
        png_data = bytes([
            0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D,
            0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
            0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xDE, 0x00, 0x00, 0x00,
            0x0C, 0x49, 0x44, 0x41, 0x54, 0x08, 0xD7, 0x63, 0xF8, 0xFF, 0xFF, 0x3F,
            0x00, 0x05, 0xFE, 0x02, 0xFE, 0xDC, 0xCC, 0x59, 0xE7, 0x00, 0x00, 0x00,
            0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82
        ])
        padding = b'\x00' * max(0, size_kb * 1024 - len(png_data))
        return png_data + padding
    else:
        # Generic binary data
        return b'\x00' * (size_kb * 1024)


class TestDirectUploadEndpoint:
    """Tests for POST /api/uploads/direct - Direct file upload through backend proxy"""
    
    def test_direct_upload_jpeg_success(self, user_token):
        """Test direct upload of JPEG image - should succeed"""
        headers = {"Authorization": f"Bearer {user_token}"}
        
        # Create test image
        image_data = create_test_image("image/jpeg", size_kb=5)
        files = {
            'file': ('test_image.jpg', io.BytesIO(image_data), 'image/jpeg')
        }
        data = {'file_type': 'package'}
        
        response = requests.post(
            f"{BASE_URL}/api/uploads/direct",
            headers=headers,
            files=files,
            data=data
        )
        
        print(f"Response status: {response.status_code}")
        print(f"Response body: {response.text[:500]}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        result = response.json()
        # Verify response structure
        assert result.get("success") == True, "Expected success=True"
        assert "file_key" in result, "Missing file_key in response"
        assert "file_url" in result, "Missing file_url in response"
        assert "content_type" in result, "Missing content_type in response"
        assert "size_bytes" in result, "Missing size_bytes in response"
        
        # Verify file_key structure
        assert "package/" in result["file_key"], f"Expected 'package/' in file_key, got {result['file_key']}"
        
        # Verify file_url is valid R2 URL
        assert "r2.cloudflarestorage.com" in result["file_url"], f"Expected R2 URL, got {result['file_url']}"
        
        print(f"✅ Direct upload JPEG success - file_key: {result['file_key']}")
    
    def test_direct_upload_png_success(self, user_token):
        """Test direct upload of PNG image - should succeed"""
        headers = {"Authorization": f"Bearer {user_token}"}
        
        image_data = create_test_image("image/png", size_kb=5)
        files = {
            'file': ('test_image.png', io.BytesIO(image_data), 'image/png')
        }
        data = {'file_type': 'profile'}
        
        response = requests.post(
            f"{BASE_URL}/api/uploads/direct",
            headers=headers,
            files=files,
            data=data
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        result = response.json()
        assert result.get("success") == True
        assert "profile/" in result["file_key"]
        assert result["content_type"] == "image/png"
        
        print(f"✅ Direct upload PNG success - file_key: {result['file_key']}")
    
    def test_direct_upload_webp_success(self, user_token):
        """Test direct upload of WebP image - should succeed"""
        headers = {"Authorization": f"Bearer {user_token}"}
        
        # WebP minimal header
        webp_data = b'RIFF\x00\x00\x00\x00WEBPVP8 ' + b'\x00' * 100
        files = {
            'file': ('test_image.webp', io.BytesIO(webp_data), 'image/webp')
        }
        data = {'file_type': 'id_front'}
        
        response = requests.post(
            f"{BASE_URL}/api/uploads/direct",
            headers=headers,
            files=files,
            data=data
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        result = response.json()
        assert result.get("success") == True
        assert "id_front/" in result["file_key"]
        
        print(f"✅ Direct upload WebP success - file_key: {result['file_key']}")
    
    def test_direct_upload_unauthorized(self):
        """Test direct upload without auth token - should fail with 401/403"""
        image_data = create_test_image("image/jpeg", size_kb=1)
        files = {
            'file': ('test_image.jpg', io.BytesIO(image_data), 'image/jpeg')
        }
        data = {'file_type': 'package'}
        
        response = requests.post(
            f"{BASE_URL}/api/uploads/direct",
            files=files,
            data=data
        )
        
        assert response.status_code in [401, 403, 422], f"Expected 401/403/422, got {response.status_code}"
        print(f"✅ Unauthorized upload correctly rejected with status {response.status_code}")
    
    def test_direct_upload_invalid_content_type(self, user_token):
        """Test direct upload with invalid content type - should fail with 400"""
        headers = {"Authorization": f"Bearer {user_token}"}
        
        # Try to upload a PDF (not allowed)
        files = {
            'file': ('test_file.pdf', io.BytesIO(b'%PDF-1.4 test content'), 'application/pdf')
        }
        data = {'file_type': 'package'}
        
        response = requests.post(
            f"{BASE_URL}/api/uploads/direct",
            headers=headers,
            files=files,
            data=data
        )
        
        assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"
        
        result = response.json()
        assert "detail" in result
        # Should mention unsupported type
        assert "suportado" in result["detail"].lower() or "tipo" in result["detail"].lower()
        
        print(f"✅ Invalid content type correctly rejected: {result['detail']}")
    
    def test_direct_upload_file_too_large(self, user_token):
        """Test direct upload with file exceeding 10MB limit - should fail with 400"""
        headers = {"Authorization": f"Bearer {user_token}"}
        
        # Create a file larger than 10MB (11MB)
        large_data = b'\x00' * (11 * 1024 * 1024)
        files = {
            'file': ('large_image.jpg', io.BytesIO(large_data), 'image/jpeg')
        }
        data = {'file_type': 'package'}
        
        response = requests.post(
            f"{BASE_URL}/api/uploads/direct",
            headers=headers,
            files=files,
            data=data
        )
        
        assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"
        
        result = response.json()
        assert "detail" in result
        # Should mention file size
        assert "grande" in result["detail"].lower() or "10mb" in result["detail"].lower() or "máximo" in result["detail"].lower()
        
        print(f"✅ Large file correctly rejected: {result['detail']}")
    
    def test_direct_upload_different_file_types(self, user_token):
        """Test direct upload with different file_type values"""
        headers = {"Authorization": f"Bearer {user_token}"}
        
        file_types = ['profile', 'id_front', 'id_back', 'selfie', 'license', 'package']
        
        for file_type in file_types:
            image_data = create_test_image("image/jpeg", size_kb=2)
            files = {
                'file': ('test.jpg', io.BytesIO(image_data), 'image/jpeg')
            }
            data = {'file_type': file_type}
            
            response = requests.post(
                f"{BASE_URL}/api/uploads/direct",
                headers=headers,
                files=files,
                data=data
            )
            
            assert response.status_code == 200, f"Failed for file_type={file_type}: {response.text}"
            result = response.json()
            assert f"{file_type}/" in result["file_key"], f"Expected '{file_type}/' in file_key"
            
            print(f"✅ file_type='{file_type}' works correctly")


class TestDirectUploadIntegration:
    """Integration tests for direct upload flow"""
    
    def test_upload_and_verify_url_accessible(self, user_token):
        """Test that uploaded file URL is accessible"""
        headers = {"Authorization": f"Bearer {user_token}"}
        
        # Upload a file
        image_data = create_test_image("image/jpeg", size_kb=5)
        files = {
            'file': ('test_verify.jpg', io.BytesIO(image_data), 'image/jpeg')
        }
        data = {'file_type': 'package'}
        
        response = requests.post(
            f"{BASE_URL}/api/uploads/direct",
            headers=headers,
            files=files,
            data=data
        )
        
        assert response.status_code == 200
        result = response.json()
        file_url = result["file_url"]
        
        # Verify the URL is accessible (should return 200 or redirect)
        url_response = requests.head(file_url, allow_redirects=True)
        assert url_response.status_code in [200, 301, 302, 307], f"File URL not accessible: {url_response.status_code}"
        
        print(f"✅ Uploaded file URL is accessible: {file_url[:100]}...")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
