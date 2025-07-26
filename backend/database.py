from sqlalchemy import create_engine, Column, Integer, String, DateTime, Float, Text, Index
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
import os
from datetime import datetime
import pandas as pd

Base = declarative_base()

class StreamingHistory(Base):
    __tablename__ = "streaming_history"
    
    id = Column(Integer, primary_key=True)
    track_name = Column(String(500), nullable=False)
    artist_name = Column(String(500), nullable=False)
    album_name = Column(String(500))
    played_at = Column(DateTime, nullable=False)
    ms_played = Column(Integer, nullable=False)
    date = Column(String(10), nullable=False)  # YYYY-MM-DD format for quick filtering
    year = Column(Integer, nullable=False)  # For year-based queries
    month = Column(Integer, nullable=False)  # For month-based queries
    day_of_week = Column(Integer, nullable=False)  # 0=Monday, 6=Sunday
    
    # Indexes for performance
    __table_args__ = (
        Index('idx_date', 'date'),
        Index('idx_year', 'year'),
        Index('idx_artist_track', 'artist_name', 'track_name'),
        Index('idx_played_at', 'played_at'),
    )

class DailyStats(Base):
    __tablename__ = "daily_stats"
    
    id = Column(Integer, primary_key=True)
    date = Column(String(10), unique=True, nullable=False)
    total_seconds = Column(Float, nullable=False)
    total_tracks = Column(Integer, nullable=False)
    unique_artists = Column(Integer, nullable=False)
    unique_tracks = Column(Integer, nullable=False)

# Database setup
def get_database_url():
    """Get database URL - SQLite for development"""
    return "sqlite:///./spotify_data.db"

def create_engine_with_optimizations():
    """Create SQLite engine with performance optimizations"""
    engine = create_engine(
        get_database_url(),
        poolclass=StaticPool,  # Better for single-user apps
        connect_args={
            "check_same_thread": False,  # Allow multi-threading
        },
        # SQLite performance optimizations
        echo=False,  # Set to True for debugging SQL queries
    )
    return engine

def init_database():
    """Initialize database and create tables"""
    engine = create_engine_with_optimizations()
    Base.metadata.create_all(engine)
    return engine

def get_session():
    """Get database session"""
    engine = create_engine_with_optimizations()
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    return SessionLocal()

# Data loading utilities
def optimize_dataframe(df):
    """Optimize DataFrame for database insertion"""
    if df.empty:
        return df
    
    # Convert timestamp to datetime and extract components
    df['ts'] = pd.to_datetime(df['ts'], format="%Y-%m-%dT%H:%M:%SZ", utc=True)
    df['played_at'] = df['ts']
    df['date'] = df['ts'].dt.strftime('%Y-%m-%d')
    df['year'] = df['ts'].dt.year
    df['month'] = df['ts'].dt.month
    df['day_of_week'] = df['ts'].dt.dayofweek
    
    # Filter out very short plays (less than 45 seconds)
    df = df[df['ms_played'] >= 45000]
    
    # Clean and standardize column names
    df['track_name'] = df['master_metadata_track_name'].fillna('Unknown Track')
    df['artist_name'] = df['master_metadata_album_artist_name'].fillna('Unknown Artist')
    df['album_name'] = df['master_metadata_album_album_name'].fillna('Unknown Album')
    
    # Select only needed columns
    columns_to_keep = [
        'track_name', 'artist_name', 'album_name', 
        'played_at', 'ms_played', 'date', 'year', 'month', 'day_of_week'
    ]
    
    return df[columns_to_keep]

def bulk_insert_streaming_data(df, session):
    """Efficiently insert large amounts of streaming data"""
    if df.empty:
        return 0
    
    # Convert DataFrame to list of dictionaries for bulk insert
    records = df.to_dict('records')
    
    # Create StreamingHistory objects
    streaming_records = []
    for record in records:
        streaming_records.append(StreamingHistory(**record))
    
    # Bulk insert
    session.bulk_save_objects(streaming_records)
    session.commit()
    
    return len(streaming_records)

def update_daily_stats(session):
    """Update daily statistics table"""
    # Clear existing stats
    session.query(DailyStats).delete()
    
    # Calculate new stats
    from sqlalchemy import func
    
    daily_stats = session.query(
        StreamingHistory.date,
        func.sum(StreamingHistory.ms_played).label('total_ms'),
        func.count(StreamingHistory.id).label('total_tracks'),
        func.count(func.distinct(StreamingHistory.artist_name)).label('unique_artists'),
        func.count(func.distinct(StreamingHistory.track_name)).label('unique_tracks')
    ).group_by(StreamingHistory.date).all()
    
    # Insert new stats
    for stat in daily_stats:
        daily_stat = DailyStats(
            date=stat.date,
            total_seconds=stat.total_ms / 1000,
            total_tracks=stat.total_tracks,
            unique_artists=stat.unique_artists,
            unique_tracks=stat.unique_tracks
        )
        session.add(daily_stat)
    
    session.commit() 