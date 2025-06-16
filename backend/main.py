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
    tracks = filtered[['master_metadata_track_name', 'master_metadata_album_artist_name', 'ms_played']].dropna()

    results = []
    for _, row in tracks.iterrows():
        track_name = row['master_metadata_track_name']
        artist_name = row['master_metadata_album_artist_name']
        ms_played = row['ms_played']
        results.append({
            "track_name": track_name,
            "artist_name": artist_name,
            "ms_played": ms_played,
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

@app.post("/chatbot/query")
def chatbot_query(body: dict = Body(...)):
    global parsed_df
    if parsed_df is None:
        raise HTTPException(status_code=400, detail="Data not yet uploaded")

    df = parsed_df.copy()
    track_name = body.get("track")
    artist_name = body.get("artist")
    album = body.get("album")
    timeframe = body.get("timeframe", "all")
    metric = body.get("metric", "time")
    time_amount = body.get("time_amount", "minutes")

    # Filter by year if specified
    if timeframe != "all":
        try:
            year = int(timeframe)
            df = df[df["ts"].dt.year == year]
        except Exception:
            return {"response": "Invalid year format for timeframe."}

    # Fill missing expected columns if they don't exist
    for col in ["master_metadata_album_artist_name", "master_metadata_track_name", "master_metadata_album_album_name"]:
        if col not in df.columns:
            df[col] = None

    # Add play count column if not present
    if "play" not in df.columns:
        df["play"] = 1

    # SONG PLAY COUNT: match all_time_stats logic
    if metric == "count" and track_name:
        grouped = df.groupby([
            df["master_metadata_track_name"].fillna("").str.strip().str.lower(),
            df["master_metadata_album_artist_name"].fillna("").str.strip().str.lower()
        ])["play"].sum().reset_index()
        grouped.columns = ["track_name", "artist_name", "play_count"]
        if artist_name:
            row = grouped[(grouped["track_name"] == track_name.strip().lower()) & (grouped["artist_name"] == artist_name.strip().lower())]
            play_count = int(row["play_count"].iloc[0]) if not row.empty else 0
        else:
            rows = grouped[grouped["track_name"] == track_name.strip().lower()]
            play_count = int(rows["play_count"].sum()) if not rows.empty else 0
        return {"response": f"{play_count}"}

    # For all other cases, filter for artist, album, song if specified
    if artist_name:
        df = df[df["master_metadata_album_artist_name"].fillna("").str.strip().str.lower() == artist_name.strip().lower()]
    if album:
        df = df[df["master_metadata_album_album_name"].fillna("").str.strip().str.lower() == album.strip().lower()]
    if track_name:
        df = df[df["master_metadata_track_name"].fillna("").str.strip().str.lower() == track_name.strip().lower()]

    # If nothing left after filtering
    if df.empty:
        return {"response": "No listening data found for the specified query."}

    # Return time or count
    if metric == "count":
        play_count = len(df)
        return {"response": f"{play_count}"}
    else:
        total_ms = df["ms_played"].sum()
        if time_amount == "hours":
            total = total_ms / 1000 / 60 / 60
            return {"response": f"{round(total, 1)} hours"}
        else:
            total = total_ms / 1000 / 60
            return {"response": f"{round(total, 1)} minutes"}





