from fastapi import FastAPI, UploadFile, File, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi import HTTPException
from datetime import datetime, timedelta
from typing import List
import pandas as pd
import pytz
from io import BytesIO
import os
from dotenv import load_dotenv
import requests
from fastapi import Query
import inspect
import tempfile
import shutil
import atexit
import signal

# Import database modules
from database import init_database, get_session, optimize_dataframe, bulk_insert_streaming_data, update_daily_stats
from data_loader import SpotifyDataLoader

load_dotenv()
SPOTIFY_CLIENT_ID = os.getenv("SPOTIFY_CLIENT_ID")
SPOTIFY_CLIENT_SECRET = os.getenv("SPOTIFY_CLIENT_SECRET")

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:5174"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize database on startup
init_database()

# Cleanup function for privacy
def clear_database_on_exit():
    """Clear user data when server shuts down for privacy"""
    try:
        # Use the same path as the database configuration
        from database import get_database_url
        db_url = get_database_url()
        # Extract file path from SQLite URL (sqlite:///path/to/file.db)
        db_path = db_url.replace("sqlite:///", "")
        if os.path.exists(db_path):
            os.remove(db_path)
            print("🗑️ Database cleared for privacy")
    except Exception as e:
        print(f"⚠️ Could not clear database: {e}")

# Signal handler for graceful shutdown
def signal_handler(signum, frame):
    """Handle interrupt signals (Ctrl+C) to ensure database cleanup"""
    print(f"\n🛑 Received signal {signum}, shutting down gracefully...")
    clear_database_on_exit()
    exit(0)

# Register cleanup functions
atexit.register(clear_database_on_exit)
signal.signal(signal.SIGINT, signal_handler)  # Ctrl+C
signal.signal(signal.SIGTERM, signal_handler)  # Termination signal

@app.get("/")
def welcome():
    """Welcome message for the Spotify Dashboard API"""
    return {
        "message": "🎵 Welcome to Spotify Dashboard API!",
        "description": "Upload your Spotify streaming history to visualize your listening habits",
        "endpoints": {
            "upload": "POST /upload - Upload Spotify JSON files",
            "stats": "GET /all_time_stats - Get all-time statistics",
            "tracks": "GET /tracks/{date} - Get tracks for specific date",
            "clear": "POST /clear_data - Clear all user data"
        },
        "status": "Server is running and ready for data uploads!"
    }

@app.post("/upload")
async def upload_streaming_history(files: List[UploadFile] = File(...)):
    """Upload and process Spotify streaming history files"""
    
    # Create temporary directory for uploaded files
    temp_dir = tempfile.mkdtemp()
    
    try:
        # Save uploaded files to temporary directory
        for file in files:
            filename = os.path.basename(file.filename)
            print("➡️ Received:", filename)
            
            if filename.endswith(".json") and filename.startswith("Streaming_History_Audio_"):
                content = await file.read()
                file_path = os.path.join(temp_dir, filename)
                
                with open(file_path, 'wb') as f:
                    f.write(content)
                print(f"📄 Saved {filename}: {len(content)} bytes")
            else:
                print(f"⛔ Skipped {filename} — did not match pattern")
        
        # Use the data loader to process files
        loader = SpotifyDataLoader()
        
        try:
            # Load data into database
            result = loader.load_data(temp_dir)
            
            if result["success"]:
                # Get daily stats for frontend
                daily_stats = loader.get_daily_stats()
                
                # Format for frontend
                formatted_stats = [
                    {
                        "date": stat["date"],
                        "total_seconds": stat["total_seconds"]
                    }
                    for stat in daily_stats
                ]
                
                print("✅ Data successfully loaded into database")
                return formatted_stats
            else:
                raise HTTPException(status_code=400, detail=result.get("message", "Failed to process data"))
                
        finally:
            loader.close()
            
    except Exception as e:
        print(f"❌ Error processing upload: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to process upload: {str(e)}")
        
    finally:
        # Clean up temporary directory
        shutil.rmtree(temp_dir, ignore_errors=True)


@app.get("/tracks/{date}")
def get_tracks_for_date(date: str):
    """Get tracks for a specific date from database"""
    
    try:
        # Validate date format
        datetime.strptime(date, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format")
    
    # Get tracks from database
    loader = SpotifyDataLoader()
    try:
        tracks = loader.get_tracks_for_date(date)
        return tracks
    finally:
        loader.close()




spotify_token = None
token_expiry = None

def get_spotify_token():
    global spotify_token, token_expiry
    if spotify_token and token_expiry and datetime.now() < token_expiry:
        return spotify_token

    response = requests.post(
        "https://accounts.spotify.com/api/token",
        data={"grant_type": "client_credentials"},
        auth=(SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET),
    )

    if response.status_code == 200:
        data = response.json()
        spotify_token = data["access_token"]
        token_expiry = datetime.now() + timedelta(seconds=data["expires_in"] - 60)
        return spotify_token
    else:
        raise Exception("Failed to get Spotify token")
    

@app.get("/track_image")
def get_album_image(
    track_name: str = Query(..., alias="track_name"),
    artist_name: str = Query(..., alias="artist_name")
):
    token = get_spotify_token()
    headers = {"Authorization": f"Bearer {token}"}
    query = f"track:{track_name} artist:{artist_name}"

    response = requests.get(
        "https://api.spotify.com/v1/search",
        headers=headers,
        params={"q": query, "type": "track", "limit": 1},
    )

    if response.status_code == 200:
        results = response.json()
        items = results.get("tracks", {}).get("items", [])
        if items and "album" in items[0] and "images" in items[0]["album"]:
            return {"image_url": items[0]["album"]["images"][0]["url"]}
    return {"image_url": None}


@app.get("/all_time_stats")
def get_all_time_stats():
    """Get all-time statistics from database"""
    
    loader = SpotifyDataLoader()
    try:
        stats = loader.get_all_time_stats()
        return stats
    finally:
        loader.close()

@app.get("/album_image")
def get_album_image(
    album_name: str = Query(..., alias="album_name"),
    artist_name: str = Query(..., alias="artist_name")
):
    token = get_spotify_token()
    headers = {"Authorization": f"Bearer {token}"}
    query = f"album:{album_name} artist:{artist_name}"

    response = requests.get(
        "https://api.spotify.com/v1/search",
        headers=headers,
        params={"q": query, "type": "track", "limit": 1},
    )

    if response.status_code == 200:
        results = response.json()
        items = results.get("tracks", {}).get("items", [])
        if items and "album" in items[0] and "images" in items[0]["album"]:
            return {"image_url": items[0]["album"]["images"][0]["url"]}
    return {"image_url": None}

@app.get("/artist_image")
def get_artist_image(
    artist_name: str = Query(..., alias="artist_name")
):
    token = get_spotify_token()
    headers = {"Authorization": f"Bearer {token}"}
    
    # Search directly for the artist
    search_response = requests.get(
        "https://api.spotify.com/v1/search",
        headers=headers,
        params={"q": artist_name, "type": "artist", "limit": 1},
    )

    if search_response.status_code == 200:
        results = search_response.json()
        items = results.get("artists", {}).get("items", [])
        if items and "images" in items[0] and len(items[0]["images"]) > 0:
            return {"image_url": items[0]["images"][0]["url"]}
    
    return {"image_url": None}

@app.post("/chatbot/query")
def chatbot_query(body: dict = Body(...)):
    """Handle chatbot queries using database"""
    
    from sqlalchemy import func, and_
    from database import StreamingHistory
    
    session = get_session()
    
    try:
        track_name = body.get("track")
        artist_name = body.get("artist")
        album = body.get("album")
        timeframe = body.get("timeframe", "all")
        metric = body.get("metric", "time")
        time_amount = body.get("time_amount", "minutes")

        # Build query
        query = session.query(StreamingHistory)
        
        # Filter by year if specified
        if timeframe != "all":
            try:
                year = int(timeframe)
                query = query.filter(StreamingHistory.year == year)
            except Exception:
                return {"response": "Invalid year format for timeframe."}

        # Filter by artist, album, song if specified
        if artist_name:
            query = query.filter(
                func.lower(StreamingHistory.artist_name) == artist_name.strip().lower()
            )
        if album:
            query = query.filter(
                func.lower(StreamingHistory.album_name) == album.strip().lower()
            )
        if track_name:
            query = query.filter(
                func.lower(StreamingHistory.track_name) == track_name.strip().lower()
            )

        # SONG PLAY COUNT: special case for counting plays
        if metric == "count" and track_name:
            count_query = session.query(func.count(StreamingHistory.id))
            
            if artist_name:
                count_query = count_query.filter(
                    and_(
                        func.lower(StreamingHistory.track_name) == track_name.strip().lower(),
                        func.lower(StreamingHistory.artist_name) == artist_name.strip().lower()
                    )
                )
            else:
                count_query = count_query.filter(
                    func.lower(StreamingHistory.track_name) == track_name.strip().lower()
                )
            
            play_count = count_query.scalar()
            return {"response": f"{play_count}"}

        # Get filtered results
        results = query.all()
        
        if not results:
            return {"response": "No listening data found for the specified query."}

        # Return time or count
        if metric == "count":
            play_count = len(results)
            return {"response": f"{play_count}"}
        else:
            total_ms = sum(result.ms_played for result in results)
            if time_amount == "hours":
                total = total_ms / 1000 / 60 / 60
                return {"response": f"{round(total, 1)} hours"}
            else:
                total = total_ms / 1000 / 60
                return {"response": f"{round(total, 1)} minutes"}
                
    finally:
        session.close()

@app.post("/clear_data")
def clear_user_data():
    """Clear all user data from database for privacy"""
    from database import StreamingHistory, DailyStats
    session = get_session()
    try:
        # Clear all data
        session.query(StreamingHistory).delete()
        session.query(DailyStats).delete()
        session.commit()
        print("🗑️ User data cleared manually")
        return {"message": "All data cleared successfully", "success": True}
    except Exception as e:
        session.rollback()
        print(f"❌ Error clearing data: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to clear data: {str(e)}")
    finally:
        session.close()





