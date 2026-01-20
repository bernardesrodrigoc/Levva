"""
Levva API Tests - Notification and GPS Tracking endpoints
Tests for:
- GET /api/notifications - List user notifications
- GET /api/notifications/unread-count - Get unread count
- POST /api/notifications/{id}/read - Mark notification as read
- POST /api/notifications/read-all - Mark all as read
- DELETE /api/notifications/{id} - Delete notification
- GET /api/tracking/{match_id}/status - Get tracking status
- GET /api/tracking/{match_id}/history - Get route history
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://levva-shipping.preview.emergentagent.com')

# Test credentials
TEST_USER_EMAIL = "teste@levva.com"
TEST_USER_PASSWORD = "password123"
ADMIN_EMAIL = "admin@levva.com"
ADMIN_PASSWORD = "adminpassword"
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


class TestNotifications:
    """Notification endpoint tests"""
    
    def test_get_notifications(self, user_token):
        """GET /api/notifications - Should return list of notifications"""
        headers = {"Authorization": f"Bearer {user_token}"}
        response = requests.get(f"{BASE_URL}/api/notifications", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        # Verify notification structure if any exist
        if len(data) > 0:
            notification = data[0]
            assert "id" in notification
            assert "type" in notification
            assert "title" in notification
            assert "body" in notification
            assert "read" in notification
            assert "created_at" in notification
            assert "_id" not in notification  # ObjectId fix
    
    def test_get_notifications_with_limit(self, user_token):
        """GET /api/notifications?limit=5 - Should respect limit parameter"""
        headers = {"Authorization": f"Bearer {user_token}"}
        response = requests.get(f"{BASE_URL}/api/notifications?limit=5", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) <= 5
    
    def test_get_notifications_unread_only(self, user_token):
        """GET /api/notifications?unread_only=true - Should return only unread"""
        headers = {"Authorization": f"Bearer {user_token}"}
        response = requests.get(f"{BASE_URL}/api/notifications?unread_only=true", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        # All returned notifications should be unread
        for notification in data:
            assert notification["read"] == False
    
    def test_get_unread_count(self, user_token):
        """GET /api/notifications/unread-count - Should return count of unread"""
        headers = {"Authorization": f"Bearer {user_token}"}
        response = requests.get(f"{BASE_URL}/api/notifications/unread-count", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert "count" in data
        assert isinstance(data["count"], int)
        assert data["count"] >= 0
    
    def test_notifications_unauthorized(self):
        """GET /api/notifications without auth - Should return 401"""
        response = requests.get(f"{BASE_URL}/api/notifications")
        assert response.status_code in [401, 403]


class TestNotificationActions:
    """Notification action tests - mark read, delete"""
    
    def test_mark_notification_read(self, user_token):
        """POST /api/notifications/{id}/read - Should mark as read"""
        headers = {"Authorization": f"Bearer {user_token}"}
        
        # First get notifications to find one to mark
        response = requests.get(f"{BASE_URL}/api/notifications", headers=headers)
        assert response.status_code == 200
        notifications = response.json()
        
        if len(notifications) == 0:
            pytest.skip("No notifications to test with")
        
        notification_id = notifications[0]["id"]
        
        # Mark as read
        response = requests.post(
            f"{BASE_URL}/api/notifications/{notification_id}/read",
            headers=headers
        )
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
    
    def test_mark_notification_read_not_found(self, user_token):
        """POST /api/notifications/{id}/read with invalid ID - Should return 404"""
        headers = {"Authorization": f"Bearer {user_token}"}
        response = requests.post(
            f"{BASE_URL}/api/notifications/000000000000000000000000/read",
            headers=headers
        )
        assert response.status_code == 404
    
    def test_mark_all_notifications_read(self, user_token):
        """POST /api/notifications/read-all - Should mark all as read"""
        headers = {"Authorization": f"Bearer {user_token}"}
        response = requests.post(
            f"{BASE_URL}/api/notifications/read-all",
            headers=headers
        )
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        assert "count" in data
        assert isinstance(data["count"], int)
    
    def test_delete_notification(self, user_token):
        """DELETE /api/notifications/{id} - Should delete notification"""
        headers = {"Authorization": f"Bearer {user_token}"}
        
        # First get notifications to find one to delete
        response = requests.get(f"{BASE_URL}/api/notifications", headers=headers)
        assert response.status_code == 200
        notifications = response.json()
        
        if len(notifications) == 0:
            pytest.skip("No notifications to test with")
        
        notification_id = notifications[0]["id"]
        
        # Delete notification
        response = requests.delete(
            f"{BASE_URL}/api/notifications/{notification_id}",
            headers=headers
        )
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
    
    def test_delete_notification_not_found(self, user_token):
        """DELETE /api/notifications/{id} with invalid ID - Should return 404"""
        headers = {"Authorization": f"Bearer {user_token}"}
        response = requests.delete(
            f"{BASE_URL}/api/notifications/000000000000000000000000",
            headers=headers
        )
        assert response.status_code == 404


class TestGPSTracking:
    """GPS Tracking endpoint tests"""
    
    def test_get_tracking_status(self, user_token):
        """GET /api/tracking/{match_id}/status - Should return tracking status"""
        headers = {"Authorization": f"Bearer {user_token}"}
        response = requests.get(
            f"{BASE_URL}/api/tracking/{EXISTING_MATCH_ID}/status",
            headers=headers
        )
        assert response.status_code == 200
        data = response.json()
        assert "match_id" in data
        assert data["match_id"] == EXISTING_MATCH_ID
        assert "is_tracking_active" in data
        assert isinstance(data["is_tracking_active"], bool)
        assert "watchers_count" in data
        assert isinstance(data["watchers_count"], int)
        # last_location can be null if no tracking data
        assert "last_location" in data
    
    def test_get_tracking_status_not_found(self, user_token):
        """GET /api/tracking/{match_id}/status with invalid ID - Should return 404"""
        headers = {"Authorization": f"Bearer {user_token}"}
        response = requests.get(
            f"{BASE_URL}/api/tracking/000000000000000000000000/status",
            headers=headers
        )
        assert response.status_code == 404
    
    def test_get_tracking_history(self, user_token):
        """GET /api/tracking/{match_id}/history - Should return route history"""
        headers = {"Authorization": f"Bearer {user_token}"}
        response = requests.get(
            f"{BASE_URL}/api/tracking/{EXISTING_MATCH_ID}/history",
            headers=headers
        )
        assert response.status_code == 200
        data = response.json()
        assert "match_id" in data
        assert data["match_id"] == EXISTING_MATCH_ID
        assert "route_points" in data
        assert isinstance(data["route_points"], list)
        # Verify route point structure if any exist
        if len(data["route_points"]) > 0:
            point = data["route_points"][0]
            assert "lat" in point
            assert "lng" in point
    
    def test_get_tracking_history_with_limit(self, user_token):
        """GET /api/tracking/{match_id}/history?limit=10 - Should respect limit"""
        headers = {"Authorization": f"Bearer {user_token}"}
        response = requests.get(
            f"{BASE_URL}/api/tracking/{EXISTING_MATCH_ID}/history?limit=10",
            headers=headers
        )
        assert response.status_code == 200
        data = response.json()
        assert "route_points" in data
        assert len(data["route_points"]) <= 10
    
    def test_get_tracking_history_not_found(self, user_token):
        """GET /api/tracking/{match_id}/history with invalid ID - Should return 404"""
        headers = {"Authorization": f"Bearer {user_token}"}
        response = requests.get(
            f"{BASE_URL}/api/tracking/000000000000000000000000/history",
            headers=headers
        )
        assert response.status_code == 404
    
    def test_tracking_unauthorized(self):
        """GET /api/tracking/{match_id}/status without auth - Should return 401"""
        response = requests.get(f"{BASE_URL}/api/tracking/{EXISTING_MATCH_ID}/status")
        assert response.status_code in [401, 403]


class TestTrackingAccessControl:
    """Test tracking access control - only match participants can access"""
    
    def test_tracking_access_denied_for_non_participant(self, admin_token):
        """Admin (not part of match) should not access tracking"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(
            f"{BASE_URL}/api/tracking/{EXISTING_MATCH_ID}/status",
            headers=headers
        )
        # Admin is not part of this match, should be denied
        assert response.status_code == 403


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
