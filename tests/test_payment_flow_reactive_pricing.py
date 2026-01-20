"""
Test Payment Flow and Reactive Pricing - Iteration 7
Tests for:
1. ISSUE 1 - Reactive Pricing: Price updates when weight/location changes
2. ISSUE 3 - Payment Flow: mark-delivered, confirm-delivery, open-dispute endpoints
"""
import pytest
import requests
import os
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://levva-shipping.preview.emergentagent.com')


class TestReactivePricing:
    """Test reactive pricing - price changes with weight/location"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@levva.com",
            "password": "adminpassword"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        self.token = response.json()["token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_price_changes_with_weight_5kg(self):
        """Test price calculation with 5kg weight"""
        response = requests.post(f"{BASE_URL}/api/intelligence/pricing/calculate", 
            headers=self.headers,
            json={
                "origin_lat": -23.5505,
                "origin_lng": -46.6333,
                "dest_lat": -22.9068,
                "dest_lng": -43.1729,
                "weight_kg": 5,
                "length_cm": 30,
                "width_cm": 20,
                "height_cm": 15
            })
        
        assert response.status_code == 200
        data = response.json()
        assert "total_price" in data
        assert "carrier_earnings" in data
        assert data["total_price"] > 0
        # Store for comparison
        self.price_5kg = data["total_price"]
        print(f"Price for 5kg: R$ {data['total_price']:.2f}")
    
    def test_price_changes_with_weight_20kg(self):
        """Test price calculation with 20kg weight - should be higher than 5kg"""
        response = requests.post(f"{BASE_URL}/api/intelligence/pricing/calculate", 
            headers=self.headers,
            json={
                "origin_lat": -23.5505,
                "origin_lng": -46.6333,
                "dest_lat": -22.9068,
                "dest_lng": -43.1729,
                "weight_kg": 20,
                "length_cm": 30,
                "width_cm": 20,
                "height_cm": 15
            })
        
        assert response.status_code == 200
        data = response.json()
        assert "total_price" in data
        assert data["total_price"] > 0
        print(f"Price for 20kg: R$ {data['total_price']:.2f}")
        
        # Get 5kg price for comparison
        response_5kg = requests.post(f"{BASE_URL}/api/intelligence/pricing/calculate", 
            headers=self.headers,
            json={
                "origin_lat": -23.5505,
                "origin_lng": -46.6333,
                "dest_lat": -22.9068,
                "dest_lng": -43.1729,
                "weight_kg": 5,
                "length_cm": 30,
                "width_cm": 20,
                "height_cm": 15
            })
        price_5kg = response_5kg.json()["total_price"]
        
        # 20kg should be more expensive than 5kg
        assert data["total_price"] > price_5kg, f"20kg price ({data['total_price']}) should be > 5kg price ({price_5kg})"
    
    def test_price_changes_with_location(self):
        """Test price changes when destination changes (different distance)"""
        # Short distance: São Paulo to Campinas (~100km)
        response_short = requests.post(f"{BASE_URL}/api/intelligence/pricing/calculate", 
            headers=self.headers,
            json={
                "origin_lat": -23.5505,
                "origin_lng": -46.6333,
                "dest_lat": -22.9099,  # Campinas
                "dest_lng": -47.0626,
                "weight_kg": 5,
                "length_cm": 30,
                "width_cm": 20,
                "height_cm": 15
            })
        
        # Long distance: São Paulo to Rio (~360km)
        response_long = requests.post(f"{BASE_URL}/api/intelligence/pricing/calculate", 
            headers=self.headers,
            json={
                "origin_lat": -23.5505,
                "origin_lng": -46.6333,
                "dest_lat": -22.9068,  # Rio de Janeiro
                "dest_lng": -43.1729,
                "weight_kg": 5,
                "length_cm": 30,
                "width_cm": 20,
                "height_cm": 15
            })
        
        assert response_short.status_code == 200
        assert response_long.status_code == 200
        
        price_short = response_short.json()["total_price"]
        price_long = response_long.json()["total_price"]
        
        print(f"Short distance price: R$ {price_short:.2f}")
        print(f"Long distance price: R$ {price_long:.2f}")
        
        # Longer distance should be more expensive
        assert price_long > price_short, f"Long distance ({price_long}) should be > short distance ({price_short})"
    
    def test_price_estimate_no_auth(self):
        """Test price estimate endpoint (no auth required)"""
        response = requests.get(f"{BASE_URL}/api/intelligence/pricing/estimate", params={
            "origin_lat": -23.5505,
            "origin_lng": -46.6333,
            "dest_lat": -22.9068,
            "dest_lng": -43.1729,
            "weight_kg": 5
        })
        
        assert response.status_code == 200
        data = response.json()
        assert "min_price" in data
        assert "max_price" in data
        assert data["min_price"] > 0
        assert data["max_price"] >= data["min_price"]
        print(f"Price estimate: R$ {data['min_price']:.2f} - R$ {data['max_price']:.2f}")


class TestPaymentFlowEndpoints:
    """Test payment flow endpoints: mark-delivered, confirm-delivery, open-dispute"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test users and tokens"""
        # Login as carrier
        carrier_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "test_carrier_payment@test.com",
            "password": "testpassword123"
        })
        if carrier_response.status_code == 200:
            self.carrier_token = carrier_response.json()["token"]
            self.carrier_headers = {"Authorization": f"Bearer {self.carrier_token}"}
        else:
            pytest.skip("Test carrier user not found - run setup first")
        
        # Login as sender
        sender_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "test_sender_payment@test.com",
            "password": "testpassword123"
        })
        if sender_response.status_code == 200:
            self.sender_token = sender_response.json()["token"]
            self.sender_headers = {"Authorization": f"Bearer {self.sender_token}"}
        else:
            pytest.skip("Test sender user not found - run setup first")
    
    def test_mark_delivered_endpoint_exists(self):
        """Test that mark-delivered endpoint exists and requires auth"""
        # Without auth should fail
        response = requests.post(f"{BASE_URL}/api/payments/test_match_id/mark-delivered")
        assert response.status_code in [401, 403, 422], "Should require authentication"
    
    def test_confirm_delivery_endpoint_exists(self):
        """Test that confirm-delivery endpoint exists and requires auth"""
        response = requests.post(f"{BASE_URL}/api/payments/test_match_id/confirm-delivery", 
            json={"notes": "test"})
        assert response.status_code in [401, 403, 422], "Should require authentication"
    
    def test_open_dispute_endpoint_exists(self):
        """Test that open-dispute endpoint exists and requires auth"""
        response = requests.post(f"{BASE_URL}/api/payments/test_match_id/open-dispute",
            json={"reason": "test"})
        assert response.status_code in [401, 403, 422], "Should require authentication"
    
    def test_delivery_status_endpoint_exists(self):
        """Test that delivery-status endpoint exists and requires auth"""
        response = requests.get(f"{BASE_URL}/api/payments/test_match_id/delivery-status")
        assert response.status_code in [401, 403, 422], "Should require authentication"
    
    def test_mark_delivered_requires_carrier_role(self):
        """Test that only carrier can mark as delivered"""
        # Sender trying to mark as delivered should fail
        response = requests.post(
            f"{BASE_URL}/api/payments/696fccecac1f66556ca704b8/mark-delivered",
            headers=self.sender_headers
        )
        # Should fail because sender is not the carrier
        assert response.status_code in [400, 403], f"Sender should not be able to mark as delivered: {response.text}"
    
    def test_confirm_delivery_requires_sender_role(self):
        """Test that only sender can confirm delivery"""
        # Carrier trying to confirm should fail
        response = requests.post(
            f"{BASE_URL}/api/payments/696fccecac1f66556ca704b8/confirm-delivery",
            headers=self.carrier_headers,
            json={"notes": "test"}
        )
        # Should fail because carrier is not the sender
        assert response.status_code in [400, 403], f"Carrier should not be able to confirm delivery: {response.text}"


class TestPaymentFlowIntegration:
    """Integration test for complete payment flow"""
    
    def test_complete_payment_flow(self):
        """Test the complete flow: mark-delivered -> confirm-delivery"""
        import asyncio
        from motor.motor_asyncio import AsyncIOMotorClient
        from bson import ObjectId
        from datetime import datetime, timezone
        
        async def run_test():
            client = AsyncIOMotorClient("mongodb://localhost:27017")
            db = client["levva_database"]
            
            # Get test users
            carrier = await db.users.find_one({"email": "test_carrier_payment@test.com"})
            sender = await db.users.find_one({"email": "test_sender_payment@test.com"})
            
            if not carrier or not sender:
                pytest.skip("Test users not found")
                return
            
            # Create fresh match for this test
            match_id = ObjectId()
            match = {
                "_id": match_id,
                "trip_id": "test_trip_flow",
                "shipment_id": "test_shipment_flow",
                "carrier_id": str(carrier["_id"]),
                "sender_id": str(sender["_id"]),
                "carrier_name": "Test Carrier Payment",
                "sender_name": "Test Sender Payment",
                "status": "paid",
                "estimated_price": 200.00,
                "platform_commission": 30.00,
                "carrier_earnings": 170.00,
                "created_at": datetime.now(timezone.utc)
            }
            await db.matches.insert_one(match)
            
            # Create payment in escrow
            payment = {
                "_id": ObjectId(),
                "match_id": str(match_id),
                "sender_id": str(sender["_id"]),
                "amount": 200.00,
                "status": "paid_escrow",
                "created_at": datetime.now(timezone.utc)
            }
            await db.payments.insert_one(payment)
            
            client.close()
            return str(match_id)
        
        match_id = asyncio.run(run_test())
        
        # Login as carrier
        carrier_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "test_carrier_payment@test.com",
            "password": "testpassword123"
        })
        carrier_token = carrier_response.json()["token"]
        carrier_headers = {"Authorization": f"Bearer {carrier_token}"}
        
        # Step 1: Carrier marks as delivered
        mark_response = requests.post(
            f"{BASE_URL}/api/payments/{match_id}/mark-delivered",
            headers=carrier_headers
        )
        assert mark_response.status_code == 200, f"Mark delivered failed: {mark_response.text}"
        mark_data = mark_response.json()
        assert mark_data["status"] == "delivered_by_transporter"
        print(f"Step 1 PASSED: Carrier marked as delivered")
        
        # Login as sender
        sender_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "test_sender_payment@test.com",
            "password": "testpassword123"
        })
        sender_token = sender_response.json()["token"]
        sender_headers = {"Authorization": f"Bearer {sender_token}"}
        
        # Step 2: Check delivery status
        status_response = requests.get(
            f"{BASE_URL}/api/payments/{match_id}/delivery-status",
            headers=sender_headers
        )
        assert status_response.status_code == 200, f"Get status failed: {status_response.text}"
        status_data = status_response.json()
        assert status_data["status"] == "delivered_by_transporter"
        print(f"Step 2 PASSED: Delivery status is delivered_by_transporter")
        
        # Step 3: Sender confirms delivery
        confirm_response = requests.post(
            f"{BASE_URL}/api/payments/{match_id}/confirm-delivery",
            headers=sender_headers,
            json={"notes": "Pacote recebido em perfeitas condições"}
        )
        assert confirm_response.status_code == 200, f"Confirm delivery failed: {confirm_response.text}"
        confirm_data = confirm_response.json()
        assert confirm_data["status"] == "payout_ready"
        assert confirm_data["carrier_amount"] > 0
        print(f"Step 3 PASSED: Sender confirmed delivery, payout ready")
        
        print(f"\n✅ Complete payment flow test PASSED!")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
