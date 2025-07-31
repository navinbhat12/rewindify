import os
import json
import pandas as pd
from datetime import datetime
import time
from typing import List, Dict, Any
from database import (
    init_database, get_session, optimize_dataframe, 
    bulk_insert_streaming_data, update_daily_stats,
    StreamingHistory, DailyStats, session_manager
)

class SpotifyDataLoader:
    """Efficient loader for Spotify streaming history data with session isolation"""
    
    def __init__(self, session_id: str = None):
        self.session = get_session()
        self.session_id = session_id
        self.processed_files = 0
        self.total_records = 0
        self.start_time = None
        
        # Validate session if provided
        if self.session_id and not session_manager.validate_session(self.session_id):
            raise ValueError(f"Invalid or expired session: {self.session_id}")
        
        print(f"🔑 Data loader initialized for session: {self.session_id[:8] if self.session_id else 'None'}...")
    
    def load_json_file(self, file_path: str) -> pd.DataFrame:
        """Load and parse a single JSON file"""
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            if not isinstance(data, list):
                raise ValueError(f"Expected list of records, got {type(data)}")
            
            df = pd.DataFrame(data)
            print(f"✅ Loaded {len(df)} records from {os.path.basename(file_path)}")
            return df
            
        except Exception as e:
            print(f"❌ Error loading {file_path}: {e}")
            return pd.DataFrame()
    
    def process_directory(self, directory_path: str) -> pd.DataFrame:
        """Process all JSON files in a directory"""
        combined_df = pd.DataFrame()
        
        # Find all JSON files that match Spotify pattern
        json_files = []
        for file in os.listdir(directory_path):
            if (file.endswith('.json') and 
                file.startswith('Streaming_History_Audio_')):
                json_files.append(os.path.join(directory_path, file))
        
        print(f"📁 Found {len(json_files)} Spotify history files")
        
        # Process each file
        for file_path in json_files:
            df = self.load_json_file(file_path)
            if not df.empty:
                combined_df = pd.concat([combined_df, df], ignore_index=True)
                self.processed_files += 1
        
        print(f"📊 Combined {len(combined_df)} total records from {self.processed_files} files")
        return combined_df
    
    def clear_existing_data(self):
        """Clear existing data for this session before loading new data"""
        if not self.session_id:
            raise ValueError("Session ID required for data operations")
            
        print(f"🧹 Clearing existing data for session {self.session_id[:8]}...")
        self.session.query(StreamingHistory).filter(
            StreamingHistory.session_id == self.session_id
        ).delete()
        self.session.query(DailyStats).filter(
            DailyStats.session_id == self.session_id
        ).delete()
        self.session.commit()
        print("✅ Existing session data cleared")
    
    def load_data(self, directory_path: str, clear_existing: bool = True) -> Dict[str, Any]:
        """Main method to load Spotify data from directory"""
        if not self.session_id:
            raise ValueError("Session ID required for data loading")
            
        self.start_time = time.time()
        
        if clear_existing:
            print(f"🚀 Starting Spotify data load for session {self.session_id[:8]}...")
            # Clear existing data for this session (first chunk only)
            self.clear_existing_data()
        else:
            print(f"📦 Adding more Spotify data for session {self.session_id[:8]}...")
        
        # Extend session activity
        session_manager.extend_session(self.session_id)
        
        # Process all files
        df = self.process_directory(directory_path)
        
        if df.empty:
            print("⚠️ No valid data found")
            return {"success": False, "message": "No valid data found"}
        
        # Optimize DataFrame for database
        print("🔧 Optimizing data for database...")
        optimized_df = optimize_dataframe(df, self.session_id)
        
        if optimized_df.empty:
            print("⚠️ No data after optimization")
            return {"success": False, "message": "No data after optimization"}
        
        # Debug: Show sample of optimized data
        print(f"📊 Optimized DataFrame shape: {optimized_df.shape}")
        if not optimized_df.empty:
            print("📋 Sample optimized data:")
            sample_data = optimized_df.head(3).to_dict('records')
            for record in sample_data:
                # Don't print full session ID for security
                record_copy = record.copy()
                record_copy['session_id'] = record_copy['session_id'][:8] + '...'
                print(record_copy)
        
        # Bulk insert into database
        print("💾 Inserting data into database...")
        self.total_records = bulk_insert_streaming_data(optimized_df, self.session, self.session_id)
        
        # Update daily statistics
        print("📈 Updating daily statistics...")
        update_daily_stats(self.session, self.session_id)
        
        # Calculate performance metrics
        elapsed_time = time.time() - self.start_time
        records_per_second = self.total_records / elapsed_time if elapsed_time > 0 else 0
        
        print(f"✅ Data load complete!")
        print(f"📊 Processed {self.processed_files} files")
        print(f"📝 Inserted {self.total_records:,} records")
        print(f"⏱️  Time: {elapsed_time:.2f} seconds")
        print(f"🚀 Speed: {records_per_second:.0f} records/second")
        
        return {
            "success": True,
            "files_processed": self.processed_files,
            "records_inserted": self.total_records,
            "elapsed_time": elapsed_time,
            "records_per_second": records_per_second,
            "session_id": self.session_id
        }
    
    def get_daily_stats(self) -> List[Dict]:
        """Get daily statistics for this session"""
        if not self.session_id:
            raise ValueError("Session ID required for data retrieval")
            
        daily_stats = self.session.query(DailyStats).filter(
            DailyStats.session_id == self.session_id
        ).order_by(DailyStats.date).all()
        
        return [
            {
                "date": stat.date,
                "total_seconds": stat.total_seconds
            }
            for stat in daily_stats
        ]
    
    def get_tracks_for_date(self, date: str) -> List[Dict]:
        """Get tracks for a specific date in this session"""
        if not self.session_id:
            raise ValueError("Session ID required for data retrieval")
            
        tracks = self.session.query(StreamingHistory).filter(
            StreamingHistory.session_id == self.session_id,
            StreamingHistory.date == date
        ).all()
        
        return [
            {
                "track_name": track.track_name,
                "artist_name": track.artist_name,
                "ms_played": track.ms_played
            }
            for track in tracks
        ]
    
    def get_all_time_stats(self) -> Dict:
        """Get comprehensive all-time statistics for this session"""
        if not self.session_id:
            raise ValueError("Session ID required for data retrieval")
            
        from sqlalchemy import func
        
        # Check if we have any data for this session
        total_records = self.session.query(StreamingHistory).filter(
            StreamingHistory.session_id == self.session_id
        ).count()
        print(f"📊 Total records for session {self.session_id[:8]}: {total_records}")
        
        if total_records == 0:
            return {
                "artists": {"time": [], "count": []},
                "songs": {"time": [], "count": []},
                "albums": {"time": [], "count": []}
            }
        
        # Base query for this session
        base_query = self.session.query(StreamingHistory).filter(
            StreamingHistory.session_id == self.session_id
        )
        
        # Top artists by time
        top_artists_time = base_query.with_entities(
            StreamingHistory.artist_name,
            func.sum(StreamingHistory.ms_played).label('total_ms')
        ).group_by(StreamingHistory.artist_name).order_by(
            func.sum(StreamingHistory.ms_played).desc()
        ).limit(10).all()
        
        # Top artists by count
        top_artists_count = base_query.with_entities(
            StreamingHistory.artist_name,
            func.count(StreamingHistory.id).label('play_count')
        ).group_by(StreamingHistory.artist_name).order_by(
            func.count(StreamingHistory.id).desc()
        ).limit(10).all()
        
        # Top songs by time
        top_songs_time = base_query.with_entities(
            StreamingHistory.track_name,
            StreamingHistory.artist_name,
            func.sum(StreamingHistory.ms_played).label('total_ms')
        ).group_by(StreamingHistory.track_name, StreamingHistory.artist_name).order_by(
            func.sum(StreamingHistory.ms_played).desc()
        ).limit(10).all()
        
        # Top songs by count
        top_songs_count = base_query.with_entities(
            StreamingHistory.track_name,
            StreamingHistory.artist_name,
            func.count(StreamingHistory.id).label('play_count')
        ).group_by(StreamingHistory.track_name, StreamingHistory.artist_name).order_by(
            func.count(StreamingHistory.id).desc()
        ).limit(10).all()
        
        # Top albums by time
        top_albums_time = base_query.with_entities(
            StreamingHistory.album_name,
            StreamingHistory.artist_name,
            func.sum(StreamingHistory.ms_played).label('total_ms')
        ).group_by(StreamingHistory.album_name, StreamingHistory.artist_name).order_by(
            func.sum(StreamingHistory.ms_played).desc()
        ).limit(10).all()
        
        # Top albums by count
        top_albums_count = base_query.with_entities(
            StreamingHistory.album_name,
            StreamingHistory.artist_name,
            func.count(StreamingHistory.id).label('play_count')
        ).group_by(StreamingHistory.album_name, StreamingHistory.artist_name).order_by(
            func.count(StreamingHistory.id).desc()
        ).limit(10).all()
        
        # Debug: Print first few results
        if top_artists_time:
            print(f"🎵 Sample artist time result: {top_artists_time[0].artist_name} - {top_artists_time[0].total_ms}ms")
        if top_artists_count:
            print(f"🎵 Sample artist count result: {top_artists_count[0].artist_name} - {top_artists_count[0].play_count} plays")
        
        return {
            "artists": {
                "time": [{"name": result.artist_name, "time": round(result.total_ms/1000/60, 1)} for result in top_artists_time],
                "count": [{"name": result.artist_name, "count": int(result.play_count)} for result in top_artists_count]
            },
            "songs": {
                "time": [{"name": result.track_name, "artist_name": result.artist_name, "time": round(result.total_ms/1000/60, 1)} for result in top_songs_time],
                "count": [{"name": result.track_name, "artist_name": result.artist_name, "count": int(result.play_count)} for result in top_songs_count]
            },
            "albums": {
                "time": [{"name": result.album_name, "artist_name": result.artist_name, "time": round(result.total_ms/1000/60, 1)} for result in top_albums_time],
                "count": [{"name": result.album_name, "artist_name": result.artist_name, "count": int(result.play_count)} for result in top_albums_count]
            }
        }
    
    def close(self):
        """Close database session"""
        self.session.close()

def main():
    """Test the data loader"""
    # Initialize database
    init_database()
    
    # Create a test session
    session_id = session_manager.create_session()
    
    # Example usage
    loader = SpotifyDataLoader(session_id)
    
    # Replace with your actual directory path
    directory_path = "path/to/your/spotify/data"
    
    if os.path.exists(directory_path):
        result = loader.load_data(directory_path)
        print(f"Load result: {result}")
    else:
        print(f"Directory not found: {directory_path}")
    
    loader.close()

if __name__ == "__main__":
    main() 