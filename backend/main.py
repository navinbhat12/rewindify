from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from typing import List
import pandas as pd
import pytz
from io import BytesIO
import os

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

@app.post("/upload")
async def upload_streaming_history(files: List[UploadFile] = File(...)):
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
        return []

    df['ts'] = pd.to_datetime(df['ts'], format="%Y-%m-%dT%H:%M:%SZ", utc=True)
    df['ts'] = df['ts'].dt.tz_convert(pytz.timezone("America/Los_Angeles"))
    df = df[df['ms_played'] >= 45000]
    df['date'] = df['ts'].dt.date
    df['seconds'] = df['ms_played'] / 1000

    daily = df.groupby('date')['seconds'].sum().round(2).reset_index()
    daily.columns = ['date', 'total_seconds']

    print("✅ Returning daily totals:", daily.shape)
    return daily.to_dict(orient='records')
