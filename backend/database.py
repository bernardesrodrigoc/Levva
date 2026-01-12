from motor.motor_asyncio import AsyncIOMotorClient
import os
from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
db_name = os.environ['DB_NAME']

client = AsyncIOMotorClient(mongo_url)
db = client[db_name]

# Collections
users_collection = db.users
trips_collection = db.trips
shipments_collection = db.shipments
matches_collection = db.matches
payments_collection = db.payments
ratings_collection = db.ratings
flag_collection = db.flags
disputes_collection = db.disputes
verifications_collection = db.verifications
messages_collection = db.messages
notifications_collection = db.notifications
location_tracking_collection = db.location_tracking
delivery_routes_collection = db.delivery_routes

async def init_indexes():
    """Initialize database indexes"""
    await users_collection.create_index("email", unique=True)
    await users_collection.create_index("phone")
    await trips_collection.create_index("carrier_id")
    await trips_collection.create_index("status")
    await trips_collection.create_index([("origin.city", 1), ("destination.city", 1)])
    await shipments_collection.create_index("sender_id")
    await shipments_collection.create_index("status")
    await shipments_collection.create_index([("origin.city", 1), ("destination.city", 1)])
    await matches_collection.create_index("trip_id")
    await matches_collection.create_index("shipment_id")
    await matches_collection.create_index([("carrier_id", 1), ("sender_id", 1)])
    await payments_collection.create_index("match_id")
    await ratings_collection.create_index("rated_user_id")
    print("Database indexes created successfully")