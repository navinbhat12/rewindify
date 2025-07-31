from fastapi import FastAPI, UploadFile, File, Body, HTTPException, Depends, BackgroundTasks, Request, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from datetime import datetime, timedelta
from typing import List, Optional
import pandas as pd
import pytz
from io import BytesIO
import os
from dotenv import load_dotenv
import requests
from fastapi import Query, Header
import inspect
import tempfile
import shutil
import atexit
import signal
import asyncio

# Import database modules
from database import init_database, get_session, session_manager, StreamingHistory, DailyStats
from data_loader import SpotifyDataLoader

load_dotenv()
SPOTIFY_CLIENT_ID = os.getenv("SPOTIFY_CLIENT_ID")
SPOTIFY_CLIENT_SECRET = os.getenv("SPOTIFY_CLIENT_SECRET")

# Debug Spotify credentials
if SPOTIFY_CLIENT_ID:
    print(f"🔑 Spotify Client ID loaded: {SPOTIFY_CLIENT_ID[:10]}...")
else:
    print("❌ SPOTIFY_CLIENT_ID not found in environment variables")

if SPOTIFY_CLIENT_SECRET:
    print(f"🗝️ Spotify Client Secret loaded: {SPOTIFY_CLIENT_SECRET[:10]}...")
else:
    print("❌ SPOTIFY_CLIENT_SECRET not found in environment variables")

app = FastAPI(
    title="Spotify Dashboard API",
    description="API for uploading and analyzing Spotify streaming history",
    version="2.0.0"
)

# CORS Configuration - Production ready
def get_cors_origins():
    """Get CORS origins based on environment"""
    if os.getenv('ENVIRONMENT') == 'production':
        # Production origins - Vercel domains
        allowed_origins = [
            "https://spotify-dashboard-phi.vercel.app",
            "https://spotify-dashboard-6li0m9o7b-navin-bhats-projects.vercel.app",
            "https://spotify-dashboard-671jpjnrv-navin-bhats-projects.vercel.app",
            "https://spotify-dashboard-hp1h1tc5i-navin-bhats-projects.vercel.app",
            "https://spotify-dashboard-d4qysvkia-navin-bhats-projects.vercel.app", 
            "https://spotify-dashboard-navin-bhats-projects.vercel.app"
        ]
        
        print(f"🔗 CORS Origins (Production): {allowed_origins}")
        return allowed_origins
    else:
        # Development origins
        return [
            "http://localhost:5173",
            "http://localhost:5174",
            "http://127.0.0.1:5173", 
            "http://127.0.0.1:5174"
        ]

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_cors_origins(),
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["X-Session-ID"]
)

# Initialize database on startup
init_database()

# Session dependency
def get_session_id(x_session_id: Optional[str] = Header(None)) -> str:
    """Extract and validate session ID from headers"""
    if not x_session_id:
        raise HTTPException(
            status_code=400, 
            detail="Session ID required in X-Session-ID header"
        )
    
    if not session_manager.validate_session(x_session_id):
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired session"
        )
    
    # Extend session on each request
    session_manager.extend_session(x_session_id)
    return x_session_id

# Background task for cleanup
async def cleanup_expired_sessions():
    """Background task to clean up expired sessions"""
    while True:
        try:
            session_manager.cleanup_expired_sessions()
            # Run cleanup every 10 minutes
            await asyncio.sleep(600)
        except Exception as e:
            print(f"⚠️ Error in cleanup task: {e}")
            await asyncio.sleep(600)

# Start cleanup task
@app.on_event("startup")
async def startup_event():
    """Start background tasks"""
    asyncio.create_task(cleanup_expired_sessions())
    print("🚀 Spotify Dashboard API started")
    print(f"🌍 Environment: {os.getenv('ENVIRONMENT', 'development')}")
    print(f"🔗 CORS Origins: {get_cors_origins()}")

# Cleanup function for privacy (updated for sessions)
def clear_database_on_exit():
    """Clear user data when server shuts down for privacy"""
    try:
        # In production, we don't clear the entire database
        # Sessions will expire naturally
        if os.getenv('ENVIRONMENT') != 'production':
            from database import get_database_url
            db_url = get_database_url()
            if db_url.startswith("sqlite"):
                # Only for SQLite development
                db_path = db_url.replace("sqlite:///", "")
                if os.path.exists(db_path):
                    os.remove(db_path)
                    print("🗑️ Development database cleared for privacy")
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
        "message": "🎵 Welcome to Spotify Dashboard API v2.0!",
        "description": "Upload your Spotify streaming history to visualize your listening habits",
        "features": [
            "Session-based isolation",
            "Automatic data cleanup after 45 minutes",
            "No user login required",
            "PostgreSQL support for production"
        ],
        "endpoints": {
            "create_session": "POST /session - Create new user session",
            "upload": "POST /upload - Upload Spotify JSON files",
            "stats": "GET /all_time_stats - Get all-time statistics",
            "tracks": "GET /tracks/{date} - Get tracks for specific date",
            "clear": "POST /clear_data - Clear session data"
        },
        "status": "Server is running and ready for data uploads!"
    }

@app.post("/session")
def create_session():
    """Create a new user session"""
    print("🆕 Session creation request received")
    try:
        session_id = session_manager.create_session()
        print(f"✅ Session created: {session_id[:8]}...")
        return {
            "session_id": session_id,
            "expires_in_minutes": 45,
            "message": "Session created successfully"
        }
    except Exception as e:
        print(f"❌ Error creating session: {e}")
        raise HTTPException(status_code=500, detail="Failed to create session")

@app.get("/session/status")
def get_session_status(session_id: str = Depends(get_session_id)):
    """Check session status"""
    return {
        "session_id": session_id[:8] + "...",
        "status": "active",
        "message": "Session is valid and active"
    }

@app.post("/upload")
async def upload_streaming_history(
    files: List[UploadFile] = File(...),
    session_id: str = Depends(get_session_id),
    x_chunk_index: Optional[str] = Header(None, alias="X-Chunk-Index"),
    x_total_chunks: Optional[str] = Header(None, alias="X-Total-Chunks"),
    x_original_filename: Optional[str] = Header(None, alias="X-Original-Filename"),
    x_file_chunk_index: Optional[str] = Header(None, alias="X-File-Chunk-Index"),
    x_file_total_chunks: Optional[str] = Header(None, alias="X-File-Total-Chunks")
):
    """Upload and process Spotify streaming history files"""
    
    # Handle chunked uploads
    chunk_index = int(x_chunk_index) if x_chunk_index else 0
    total_chunks = int(x_total_chunks) if x_total_chunks else 1
    is_first_chunk = chunk_index == 0
    
    # Handle file-level chunking info
    original_filename = x_original_filename or "unknown"
    file_chunk_index = int(x_file_chunk_index) if x_file_chunk_index else 0
    file_total_chunks = int(x_file_total_chunks) if x_file_total_chunks else 1
    
    print(f"📥 Upload request received!")
    print(f"🔑 Session ID: {session_id[:8]}...")
    print(f"📦 Upload chunk {chunk_index + 1}/{total_chunks}")
    
    if file_total_chunks > 1:
        print(f"📄 File: {original_filename} - part {file_chunk_index + 1}/{file_total_chunks}")
    else:
        print(f"📄 File: {original_filename} (single part)")
        
    print(f"📁 Files in this chunk: {len(files)}")
    
    if is_first_chunk:
        print(f"🆕 First chunk - will clear existing data")
    else:
        print(f"➕ Additional chunk - will append to existing data")
    
    # Create temporary directory for uploaded files
    temp_dir = tempfile.mkdtemp()
    print(f"📁 Created temp directory: {temp_dir}")
    
    try:
        # Save uploaded files to temporary directory
        valid_files = 0
        total_files = len(files)
        print(f"🔍 Processing {total_files} uploaded files...")
        
        for i, file in enumerate(files, 1):
            filename = os.path.basename(file.filename)
            print(f"📄 [{i}/{total_files}] Processing: {filename}")
            
            if filename.endswith(".json") and filename.startswith("Streaming_History_Audio_"):
                content = await file.read()
                file_path = os.path.join(temp_dir, filename)
                
                with open(file_path, 'wb') as f:
                    f.write(content)
                print(f"✅ [{i}/{total_files}] Saved {filename}: {len(content)} bytes")
                valid_files += 1
            else:
                print(f"⛔ [{i}/{total_files}] Skipped {filename} — did not match pattern")
        
        print(f"📊 Summary: {valid_files}/{total_files} files were valid Spotify data files")
        
        if valid_files == 0:
            raise HTTPException(
                status_code=400, 
                detail="No valid Spotify streaming history files found. Files must start with 'Streaming_History_Audio_' and end with '.json'"
            )
        
        # Use the data loader to process files
        loader = SpotifyDataLoader(session_id)
        
        try:
            # Load data into database (clear existing data only on first chunk)
            result = loader.load_data(temp_dir, clear_existing=is_first_chunk)
            
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
                
                print(f"✅ Data successfully loaded for session {session_id[:8]}")
                return {
                    "data": formatted_stats,
                    "session_info": {
                        "session_id": session_id[:8] + "...",
                        "files_processed": result["files_processed"],
                        "records_inserted": result["records_inserted"]
                    }
                }
            else:
                raise HTTPException(status_code=400, detail=result.get("message", "Failed to process data"))
                
        finally:
            loader.close()
            
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Error processing upload for session {session_id[:8]}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to process upload: {str(e)}")
        
    finally:
        # Clean up temporary directory
        shutil.rmtree(temp_dir, ignore_errors=True)

@app.get("/tracks/{date}")
def get_tracks_for_date(date: str, session_id: str = Depends(get_session_id)):
    """Get tracks for a specific date from user's session"""
    
    try:
        # Validate date format
        datetime.strptime(date, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
    
    # Get tracks from database for this session
    loader = SpotifyDataLoader(session_id)
    try:
        tracks = loader.get_tracks_for_date(date)
        print(f"📅 Retrieved {len(tracks)} tracks for {date} in session {session_id[:8]}")
        return tracks
    except Exception as e:
        print(f"❌ Error getting tracks for session {session_id[:8]}: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve tracks")
    finally:
        loader.close()

# Spotify API token management (unchanged)
spotify_token = None
token_expiry = None

def get_spotify_token():
    global spotify_token, token_expiry
    
    # Check if credentials are configured
    if not SPOTIFY_CLIENT_ID or not SPOTIFY_CLIENT_SECRET:
        raise Exception("Spotify API credentials not configured")
    
    if spotify_token and token_expiry and datetime.now() < token_expiry:
        return spotify_token

    try:
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
            raise Exception(f"Spotify API returned {response.status_code}: {response.text}")
    except Exception as e:
        raise Exception(f"Failed to get Spotify token: {str(e)}")

@app.get("/track_image")
def get_album_image(
    track_name: str = Query(..., alias="track_name"),
    artist_name: str = Query(..., alias="artist_name")
):
    """Get album image for a track"""
    print(f"🖼️ Fetching image for track: '{track_name}' by '{artist_name}'")
    
    try:
        token = get_spotify_token()
        print(f"🎵 Got Spotify token: {token[:20]}...")
        
        headers = {"Authorization": f"Bearer {token}"}
        query = f"track:{track_name} artist:{artist_name}"
        
        print(f"🔍 Searching Spotify with query: '{query}'")

        response = requests.get(
            "https://api.spotify.com/v1/search",
            headers=headers,
            params={"q": query, "type": "track", "limit": 1},
        )
        
        print(f"📡 Spotify API response status: {response.status_code}")

        if response.status_code == 200:
            results = response.json()
            items = results.get("tracks", {}).get("items", [])
            print(f"📊 Found {len(items)} tracks")
            
            if items and "album" in items[0] and "images" in items[0]["album"]:
                image_url = items[0]["album"]["images"][0]["url"]
                print(f"✅ Found image URL: {image_url}")
                return {"image_url": image_url}
            else:
                print("❌ No album images found in response")
        else:
            print(f"❌ Spotify API error: {response.status_code} - {response.text}")
            
        print("🚫 Returning None for image_url")
        return {"image_url": None}
    except Exception as e:
        print(f"💥 Exception getting track image: {e}")
        return {"image_url": None}

@app.get("/all_time_stats")
def get_all_time_stats(session_id: str = Depends(get_session_id)):
    """Get all-time statistics from user's session"""
    
    loader = SpotifyDataLoader(session_id)
    try:
        stats = loader.get_all_time_stats()
        print(f"📊 Retrieved all-time stats for session {session_id[:8]}")
        return stats
    except Exception as e:
        print(f"❌ Error getting stats for session {session_id[:8]}: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve statistics")
    finally:
        loader.close()

@app.get("/album_image")
def get_album_image(
    album_name: str = Query(..., alias="album_name"),
    artist_name: str = Query(..., alias="artist_name")
):
    """Get album image"""
    print(f"💽 Fetching image for album: '{album_name}' by '{artist_name}'")
    
    try:
        token = get_spotify_token()
        print(f"🎵 Got Spotify token: {token[:20]}...")
        
        headers = {"Authorization": f"Bearer {token}"}
        query = f"album:{album_name} artist:{artist_name}"
        
        print(f"🔍 Searching Spotify with query: '{query}'")

        response = requests.get(
            "https://api.spotify.com/v1/search",
            headers=headers,
            params={"q": query, "type": "track", "limit": 1},
        )
        
        print(f"📡 Spotify API response status: {response.status_code}")

        if response.status_code == 200:
            results = response.json()
            items = results.get("tracks", {}).get("items", [])
            print(f"📊 Found {len(items)} tracks")
            
            if items and "album" in items[0] and "images" in items[0]["album"]:
                image_url = items[0]["album"]["images"][0]["url"]
                print(f"✅ Found album image URL: {image_url}")
                return {"image_url": image_url}
            else:
                print("❌ No album images found in response")
        else:
            print(f"❌ Spotify API error: {response.status_code} - {response.text}")
            
        print("🚫 Returning None for album image_url")
        return {"image_url": None}
    except Exception as e:
        print(f"💥 Exception getting album image: {e}")
        return {"image_url": None}

@app.get("/artist_image")
def get_artist_image(
    artist_name: str = Query(..., alias="artist_name")
):
    """Get artist image"""
    print(f"👤 Fetching image for artist: '{artist_name}'")
    
    try:
        token = get_spotify_token()
        print(f"🎵 Got Spotify token: {token[:20]}...")
        
        headers = {"Authorization": f"Bearer {token}"}
        
        print(f"🔍 Searching Spotify for artist: '{artist_name}'")
        
        # Search directly for the artist
        search_response = requests.get(
            "https://api.spotify.com/v1/search",
            headers=headers,
            params={"q": artist_name, "type": "artist", "limit": 1},
        )
        
        print(f"📡 Spotify API response status: {search_response.status_code}")

        if search_response.status_code == 200:
            results = search_response.json()
            items = results.get("artists", {}).get("items", [])
            print(f"👥 Found {len(items)} artists")
            
            if items and "images" in items[0] and len(items[0]["images"]) > 0:
                image_url = items[0]["images"][0]["url"]
                print(f"✅ Found artist image URL: {image_url}")
                return {"image_url": image_url}
            else:
                print("❌ No artist images found in response")
        else:
            print(f"❌ Spotify API error: {search_response.status_code} - {search_response.text}")
        
        print("🚫 Returning None for artist image_url")
        return {"image_url": None}
    except Exception as e:
        print(f"💥 Exception getting artist image: {e}")
        return {"image_url": None}

@app.post("/chatbot/query")
def chatbot_query(
    body: dict = Body(...),
    session_id: str = Depends(get_session_id)
):
    """Handle chatbot queries using session data"""
    
    from sqlalchemy import func, and_
    
    session = get_session()
    
    try:
        track_name = body.get("track")
        artist_name = body.get("artist")
        album = body.get("album")
        timeframe = body.get("timeframe", "all")
        metric = body.get("metric", "time")
        time_amount = body.get("time_amount", "minutes")

        # Build query for this session
        query = session.query(StreamingHistory).filter(
            StreamingHistory.session_id == session_id
        )
        
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
            count_query = session.query(func.count(StreamingHistory.id)).filter(
                StreamingHistory.session_id == session_id
            )
            
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
                
    except Exception as e:
        print(f"❌ Chatbot error for session {session_id[:8]}: {e}")
        return {"response": "Sorry, I encountered an error processing your request."}
    finally:
        session.close()

@app.post("/clear_data")
def clear_user_data(session_id: str = Depends(get_session_id)):
    """Clear all data for user's session"""
    session = get_session()
    try:
        # Clear data for this session only
        deleted_history = session.query(StreamingHistory).filter(
            StreamingHistory.session_id == session_id
        ).delete()
        deleted_stats = session.query(DailyStats).filter(
            DailyStats.session_id == session_id
        ).delete()
        session.commit()
        
        print(f"🗑️ Cleared {deleted_history} history records and {deleted_stats} daily stats for session {session_id[:8]}")
        return {
            "message": "Session data cleared successfully", 
            "success": True,
            "records_deleted": {
                "history": deleted_history,
                "stats": deleted_stats
            }
        }
    except Exception as e:
        session.rollback()
        print(f"❌ Error clearing data for session {session_id[:8]}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to clear data: {str(e)}")
    finally:
        session.close()

# Health check endpoint for Cloud Run
@app.get("/health")
def health_check():
    """Health check endpoint for cloud deployment"""
    return {"status": "healthy", "timestamp": datetime.utcnow().isoformat()}



if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)





