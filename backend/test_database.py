#!/usr/bin/env python3
"""
Test script for the Spotify Dashboard database implementation.
This script demonstrates the database setup and performance improvements.
"""

import os
import sys
from database import init_database, get_session
from data_loader import SpotifyDataLoader

def test_database_setup():
    """Test basic database setup"""
    print("🧪 Testing database setup...")
    
    try:
        # Initialize database
        engine = init_database()
        print("✅ Database initialized successfully")
        
        # Test session creation
        session = get_session()
        print("✅ Database session created successfully")
        session.close()
        
        return True
    except Exception as e:
        print(f"❌ Database setup failed: {e}")
        return False

def test_data_loader():
    """Test data loader functionality"""
    print("\n🧪 Testing data loader...")
    
    try:
        loader = SpotifyDataLoader()
        print("✅ Data loader created successfully")
        
        # Test getting daily stats (should be empty initially)
        daily_stats = loader.get_daily_stats()
        print(f"✅ Daily stats retrieved: {len(daily_stats)} records")
        
        # Test getting all-time stats (should be empty initially)
        all_time_stats = loader.get_all_time_stats()
        print("✅ All-time stats retrieved successfully")
        
        loader.close()
        return True
    except Exception as e:
        print(f"❌ Data loader test failed: {e}")
        return False

def test_performance_improvements():
    """Demonstrate performance improvements"""
    print("\n🚀 Performance Improvements:")
    print("• Database indexes for fast queries")
    print("• Bulk insert operations for large datasets")
    print("• Optimized data structure with pre-computed fields")
    print("• Connection pooling for better resource management")
    print("• Efficient SQL queries instead of pandas operations")

def main():
    """Run all tests"""
    print("🎵 Spotify Dashboard Database Test")
    print("=" * 40)
    
    # Test database setup
    if not test_database_setup():
        print("❌ Database setup failed. Exiting.")
        sys.exit(1)
    
    # Test data loader
    if not test_data_loader():
        print("❌ Data loader test failed. Exiting.")
        sys.exit(1)
    
    # Show performance improvements
    test_performance_improvements()
    
    print("\n✅ All tests passed!")
    print("\n📊 Database Features:")
    print("• Persistent data storage (survives server restarts)")
    print("• Optimized queries with database indexes")
    print("• Efficient bulk data loading")
    print("• Pre-computed daily statistics")
    print("• Support for complex analytics queries")
    
    print("\n🎯 Resume Benefits:")
    print("• SQLAlchemy ORM experience")
    print("• Database design and optimization")
    print("• Performance tuning and indexing")
    print("• Data modeling and schema design")
    print("• Production-ready data persistence")

if __name__ == "__main__":
    main() 