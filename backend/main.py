from fastapi import FastAPI, UploadFile, File
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

# 🔁 Global variable to persist parsed DataFrame in memory
parsed_df = None

@app.post("/upload")
async def upload_streaming_history(files: List[UploadFile] = File(...)):
    global parsed_df

    df = pd.DataFrame()

    for file in files:
        filename = os.path.basename(file.filename)
        print("➡️ Received:", filename)

        if filename.endswith(".json") and filename.startswith("Streaming_History_Audio_"):
            content = await file.read()
            print(f"📄 {filename}: {len(content)} bytes")

            try:
                temp = pd.read_json(BytesIO(content))
                print(f"✅ Loaded {len(temp)} rows from {filename}")
                df = pd.concat([df, temp])
            except Exception as e:
                print(f"❌ Failed to parse {filename}: {e}")
        else:
            print(f"⛔ Skipped {filename} — did not match pattern")

    print("📊 Total combined rows:", len(df))
    if df.empty:
        print("⚠️ DataFrame is empty. Nothing to return.")
        parsed_df = None
        return []

    # 🧹 Clean & process
    df['ts'] = pd.to_datetime(df['ts'], format="%Y-%m-%dT%H:%M:%SZ", utc=True)
    df['ts'] = df['ts'].dt.tz_convert(pytz.timezone("America/Los_Angeles"))
    df = df[df['ms_played'] >= 45000]
    df['date'] = df['ts'].dt.date
    df['seconds'] = df['ms_played'] / 1000

    # Save the full cleaned DataFrame in memory
    parsed_df = df.copy()
    print("🧠 Stored parsed DataFrame in memory:", parsed_df.shape)

    # Daily summary
    daily = df.groupby('date')['seconds'].sum().round(2).reset_index()
    daily.columns = ['date', 'total_seconds']

    print("✅ Returning daily totals:", daily.shape)
    return daily.to_dict(orient='records')


@app.get("/tracks/{date}")
def get_tracks_for_date(date: str):
    global parsed_df
    if parsed_df is None:
        raise HTTPException(status_code=400, detail="Data not yet uploaded")

    try:
        query_date = datetime.strptime(date, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format")

    filtered = parsed_df[parsed_df['date'] == query_date]

    if filtered.empty:
        return []

    # Extract relevant metadata per track
    tracks = filtered[['master_metadata_track_name', 'master_metadata_album_artist_name']].dropna()

    results = []
    for _, row in tracks.iterrows():
        track_name = row['master_metadata_track_name']
        artist_name = row['master_metadata_album_artist_name']
        results.append({
            "track_name": track_name,
            "artist_name": artist_name
        })

    return results




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
    global parsed_df
    if parsed_df is None:
        raise HTTPException(status_code=400, detail="Data not yet uploaded")

    print("📊 Columns available in parsed_df:", parsed_df.columns.tolist())

    # Fill missing expected columns if they don't exist
    required = [
        "master_metadata_album_artist_name",
        "master_metadata_track_name",
        "master_metadata_album_album_name",
    ]
    for col in required:
        if col not in parsed_df.columns:
            print(f"⚠️ Column {col} not found in parsed_df. Filling with None.")
            parsed_df[col] = None

    # Add play count column
    parsed_df["play"] = 1

    def top_by(col, metric, include_artist=False):
        if include_artist:
            # For songs and albums, include artist name in the result
            grouped = parsed_df.groupby([col, "master_metadata_album_artist_name"])[metric].sum()
            grouped = grouped.sort_values(ascending=False).head(10)
            return [
                {
                    "name": idx[0],
                    "artist_name": idx[1],
                    metric: val
                }
                for idx, val in grouped.items()
            ]
        else:
            return (
            parsed_df.groupby(col)[metric]
            .sum()
            .sort_values(ascending=False)
            .head(10)
            .reset_index()
            .rename(columns={col: "name", metric: metric})
            .to_dict(orient="records")
        )

    return {
        "artists": {
            "time": top_by("master_metadata_album_artist_name", "ms_played"),
            "count": top_by("master_metadata_album_artist_name", "play"),
        },
        "songs": {
            "time": top_by("master_metadata_track_name", "ms_played", include_artist=True),
            "count": top_by("master_metadata_track_name", "play", include_artist=True),
        },
        "albums": {
            "time": top_by("master_metadata_album_album_name", "ms_played", include_artist=True),
            "count": top_by("master_metadata_album_album_name", "play", include_artist=True),
        },
    }

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

@app.get("/chatbot/query")
def chatbot_query(
    entity_type: str = Query(..., description="artist, song, or album"),
    name: str = Query(..., description="Name of the artist, song, or album"),
    timeframe: str = Query("all", description="all or a year, e.g. 2020"),
    metric: str = Query("time", description="time or count"),
    time_amount: str = Query("minutes", description="minutes or hours"),
    artist: str = Query(None, description="Artist name (optional, for song queries)")
):
    global parsed_df
    if parsed_df is None:
        raise HTTPException(status_code=400, detail="Data not yet uploaded")

    df = parsed_df.copy()
    # Filter by timeframe
    if timeframe != "all":
        try:
            year = int(timeframe)
            df = df[df['ts'].dt.year == year]
        except Exception:
            return {"response": "Invalid year format for timeframe."}

    if entity_type == "artist" and metric == "time":
        mask = df["master_metadata_album_artist_name"].str.strip().str.lower() == name.strip().lower()
        total_ms = df.loc[mask, "ms_played"].sum()
        if time_amount == "hours":
            total = total_ms / 1000 / 60 / 60
            response = f"You have listened to {name} for {round(total, 1)} hours."
        else:
            total = total_ms / 1000 / 60
            response = f"You have listened to {name} for {round(total, 1)} minutes."
        return {"response": response}

    elif entity_type == "album" and metric == "time":
        df["album_clean"] = df["master_metadata_album_album_name"].fillna("").str.strip().str.lower()
        df["artist_clean"] = df["master_metadata_album_artist_name"].fillna("").str.strip().str.lower()
        album_name_clean = name.strip().lower()
        filtered_df = df[df["album_clean"] == album_name_clean]
        total_ms = filtered_df["ms_played"].sum()
        if total_ms == 0:
            return {"response": f"No listening data found for album '{name}'."}
        if time_amount == "hours":
            total = total_ms / 1000 / 60 / 60
            response = f"You have listened to the album {name} for {round(total, 1)} hours."
        else:
            total = total_ms / 1000 / 60
            response = f"You have listened to the album {name} for {round(total, 1)} minutes."
        return {"response": response}

    elif entity_type == "song" and metric == "count":
        song_name_clean = name.strip().lower()
        df["song_clean"] = df["master_metadata_track_name"].fillna("").str.strip().str.lower()
        if artist:
            artist_clean = artist.strip().lower()
            df["artist_clean"] = df["master_metadata_album_artist_name"].fillna("").str.strip().str.lower()
            filtered_df = df[(df["song_clean"] == song_name_clean) & (df["artist_clean"] == artist_clean)]
        else:
            filtered_df = df[df["song_clean"] == song_name_clean]
        play_count = len(filtered_df)
        if play_count == 0:
            return {"response": f"No listening data found for song '{name}'" + (f" by '{artist}'" if artist else "") + "."}
        if artist:
            response = f"You have listened to the song {name} by {artist} {play_count} times."
        else:
            response = f"You have listened to the song {name} {play_count} times."
        return {"response": response}

    elif entity_type == "song" and metric == "time":
        song_name_clean = name.strip().lower()
        df["song_clean"] = df["master_metadata_track_name"].fillna("").str.strip().str.lower()
        filtered_df = df[df["song_clean"] == song_name_clean]
        total_ms = filtered_df["ms_played"].sum()
        if total_ms == 0:
            return {"response": f"No listening data found for song '{name}'."}
        if time_amount == "hours":
            total = total_ms / 1000 / 60 / 60
            response = f"You have listened to the song {name} for {round(total, 1)} hours."
        else:
            total = total_ms / 1000 / 60
            response = f"You have listened to the song {name} for {round(total, 1)} minutes."
        return {"response": response}

    else:
        return {"response": "Sorry, I can only answer artist, album, or song listening time for all time right now."}





