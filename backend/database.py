from sqlalchemy import create_engine, Column, Integer, String, DateTime, Float, Text, Index
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
import os
from datetime import datetime, timedelta
import pandas as pd
import uuid
import redis
from typing import Optional

Base = declarative_base()

class StreamingHistory(Base):
    __tablename__ = "streaming_history"
    
    id = Column(Integer, primary_key=True)
    session_id = Column(String(36), nullable=False, index=True)  # UUID for session isolation
    track_name = Column(String(500), nullable=False)
    artist_name = Column(String(500), nullable=False)
    album_name = Column(String(500))
    played_at = Column(DateTime, nullable=False)
    ms_played = Column(Integer, nullable=False)
    date = Column(String(10), nullable=False)  # YYYY-MM-DD format for quick filtering
    year = Column(Integer, nullable=False)  # For year-based queries
    month = Column(Integer, nullable=False)  # For month-based queries
    day_of_week = Column(Integer, nullable=False)  # 0=Monday, 6=Sunday
    created_at = Column(DateTime, default=datetime.utcnow)  # For cleanup
    
    # Indexes for performance
    __table_args__ = (
        Index('idx_session_date', 'session_id', 'date'),
        Index('idx_session_year', 'session_id', 'year'),
        Index('idx_session_artist_track', 'session_id', 'artist_name', 'track_name'),
        Index('idx_session_played_at', 'session_id', 'played_at'),
        Index('idx_created_at', 'created_at'),  # For cleanup queries
    )

class DailyStats(Base):
    __tablename__ = "daily_stats"
    
    id = Column(Integer, primary_key=True)
    session_id = Column(String(36), nullable=False, index=True)  # Session isolation
    date = Column(String(10), nullable=False)
    total_seconds = Column(Float, nullable=False)
    total_tracks = Column(Integer, nullable=False)
    unique_artists = Column(Integer, nullable=False)
    unique_tracks = Column(Integer, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    __table_args__ = (
        Index('idx_session_stats_date', 'session_id', 'date'),
        Index('idx_stats_created_at', 'created_at'),
    )

class UserSession(Base):
    __tablename__ = "user_sessions"
    
    id = Column(String(36), primary_key=True)  # UUID
    created_at = Column(DateTime, default=datetime.utcnow)
    last_activity = Column(DateTime, default=datetime.utcnow)
    expires_at = Column(DateTime, nullable=False)
    is_active = Column(Integer, default=1)  # SQLite compatible boolean
    
    __table_args__ = (
        Index('idx_session_expires', 'expires_at'),
        Index('idx_session_active', 'is_active'),
    )

# Session Management
class SessionManager:
    def __init__(self):
        self.redis_client = None
        self.use_redis = False
        
        # Try to connect to Redis (for production)
        try:
            redis_url = os.getenv('REDIS_URL', 'redis://localhost:6379')
            self.redis_client = redis.from_url(redis_url)
            self.redis_client.ping()
            self.use_redis = True
            print("✅ Connected to Redis for session management")
        except Exception as e:
            print(f"⚠️ Redis not available, using database sessions: {e}")
    
    def create_session(self) -> str:
        """Create a new user session"""
        session_id = str(uuid.uuid4())
        expires_at = datetime.utcnow() + timedelta(minutes=45)
        
        if self.use_redis:
            # Store in Redis with TTL
            self.redis_client.setex(
                f"session:{session_id}", 
                timedelta(minutes=45).total_seconds(),
                "active"
            )
        else:
            # Store in database
            session = get_session()
            try:
                user_session = UserSession(
                    id=session_id,
                    expires_at=expires_at
                )
                session.add(user_session)
                session.commit()
            finally:
                session.close()
        
        print(f"🔑 Created session: {session_id[:8]}... (expires in 45 min)")
        return session_id
    
    def validate_session(self, session_id: str) -> bool:
        """Check if session is valid and active"""
        if not session_id:
            return False
            
        if self.use_redis:
            return self.redis_client.exists(f"session:{session_id}")
        else:
            session = get_session()
            try:
                user_session = session.query(UserSession).filter(
                    UserSession.id == session_id,
                    UserSession.expires_at > datetime.utcnow(),
                    UserSession.is_active == 1
                ).first()
                return user_session is not None
            finally:
                session.close()
    
    def extend_session(self, session_id: str):
        """Extend session by updating last activity"""
        if self.use_redis:
            self.redis_client.expire(f"session:{session_id}", int(timedelta(minutes=45).total_seconds()))
        else:
            session = get_session()
            try:
                session.query(UserSession).filter(
                    UserSession.id == session_id
                ).update({
                    'last_activity': datetime.utcnow(),
                    'expires_at': datetime.utcnow() + timedelta(minutes=45)
                })
                session.commit()
            finally:
                session.close()
    
    def cleanup_expired_sessions(self):
        """Clean up expired sessions and associated data"""
        if not self.use_redis:  # Redis handles TTL automatically
            session = get_session()
            try:
                # Find expired sessions
                expired_sessions = session.query(UserSession).filter(
                    UserSession.expires_at < datetime.utcnow()
                ).all()
                
                for expired_session in expired_sessions:
                    session_id = expired_session.id
                    print(f"🧹 Cleaning up expired session: {session_id[:8]}...")
                    
                    # Delete streaming history
                    session.query(StreamingHistory).filter(
                        StreamingHistory.session_id == session_id
                    ).delete()
                    
                    # Delete daily stats
                    session.query(DailyStats).filter(
                        DailyStats.session_id == session_id
                    ).delete()
                    
                    # Delete session record
                    session.delete(expired_session)
                
                session.commit()
                if expired_sessions:
                    print(f"🗑️ Cleaned up {len(expired_sessions)} expired sessions")
            finally:
                session.close()

# Global session manager instance
session_manager = SessionManager()

# Database setup
def get_database_url():
    """Get database URL - PostgreSQL for production, SQLite for development"""
    # Check for Google Cloud SQL environment
    if os.getenv('GOOGLE_CLOUD_PROJECT'):
        # Production: Google Cloud SQL PostgreSQL
        db_user = os.getenv('DB_USER', 'postgres')
        db_password = os.getenv('DB_PASSWORD')
        db_name = os.getenv('DB_NAME', 'spotify_dashboard')
        db_host = os.getenv('DB_HOST', '127.0.0.1')
        db_port = os.getenv('DB_PORT', '5432')
        
        return f"postgresql://{db_user}:{db_password}@{db_host}:{db_port}/{db_name}"
    
    elif os.getenv('DATABASE_URL'):
        # Use provided DATABASE_URL (for other cloud providers)
        return os.getenv('DATABASE_URL')
    
    else:
        # Development: SQLite
        current_dir = os.path.dirname(os.path.abspath(__file__))
        db_path = os.path.join(current_dir, "spotify_data.db")
        return f"sqlite:///{db_path}"

def create_engine_with_optimizations():
    """Create database engine with appropriate optimizations"""
    db_url = get_database_url()
    
    if db_url.startswith('postgresql'):
        # PostgreSQL optimizations
        engine = create_engine(
            db_url,
            pool_size=20,
            max_overflow=30,
            pool_pre_ping=True,
            pool_recycle=3600,
            echo=False,
        )
    else:
        # SQLite optimizations (development)
        engine = create_engine(
            db_url,
            poolclass=StaticPool,
            connect_args={"check_same_thread": False},
            echo=False,
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

# Data loading utilities (updated for session support)
def optimize_dataframe(df, session_id: str):
    """Optimize DataFrame for database insertion with session ID"""
    if df.empty:
        return df
    
    # Convert timestamp to datetime and extract components
    df['ts'] = pd.to_datetime(df['ts'], format="%Y-%m-%dT%H:%M:%SZ", utc=True)
    df['played_at'] = df['ts']
    df['date'] = df['ts'].dt.strftime('%Y-%m-%d')
    df['year'] = df['ts'].dt.year
    df['month'] = df['ts'].dt.month
    df['day_of_week'] = df['ts'].dt.dayofweek
    
    # Add session ID to all records
    df['session_id'] = session_id
    
    # Filter out very short plays (less than 45 seconds)
    df = df[df['ms_played'] >= 45000]
    
    # Clean and standardize column names
    df['track_name'] = df['master_metadata_track_name'].fillna('Unknown Track')
    df['artist_name'] = df['master_metadata_album_artist_name'].fillna('Unknown Artist')
    df['album_name'] = df['master_metadata_album_album_name'].fillna('Unknown Album')
    
    # Select only needed columns
    columns_to_keep = [
        'session_id', 'track_name', 'artist_name', 'album_name', 
        'played_at', 'ms_played', 'date', 'year', 'month', 'day_of_week'
    ]
    
    return df[columns_to_keep]

def bulk_insert_streaming_data(df, session, session_id: str):
    """Efficiently insert large amounts of streaming data with session isolation"""
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

def update_daily_stats(session, session_id: str):
    """Update daily statistics table for specific session"""
    # Clear existing stats for this session
    session.query(DailyStats).filter(DailyStats.session_id == session_id).delete()
    
    # Calculate new stats for this session
    from sqlalchemy import func
    
    daily_stats = session.query(
        StreamingHistory.date,
        func.sum(StreamingHistory.ms_played).label('total_ms'),
        func.count(StreamingHistory.id).label('total_tracks'),
        func.count(func.distinct(StreamingHistory.artist_name)).label('unique_artists'),
        func.count(func.distinct(StreamingHistory.track_name)).label('unique_tracks')
    ).filter(StreamingHistory.session_id == session_id).group_by(StreamingHistory.date).all()
    
    # Insert new stats
    for stat in daily_stats:
        daily_stat = DailyStats(
            session_id=session_id,
            date=stat.date,
            total_seconds=stat.total_ms / 1000,
            total_tracks=stat.total_tracks,
            unique_artists=stat.unique_artists,
            unique_tracks=stat.unique_tracks
        )
        session.add(daily_stat)
    
    session.commit() 