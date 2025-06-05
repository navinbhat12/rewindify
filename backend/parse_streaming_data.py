import glob
import pandas as pd
import json

# Folder where JSON files are stored
data_folder = "backend/data/Spotify Extended Streaming History"
file_name = "Streaming_History_Audio_*.json"

df = pd.DataFrame()

for file in glob.glob(data_folder + '/' + file_name):
    temp = pd.read_json(file)
    df = pd.concat([df, temp])

print(df.shape)
df

#convert to datetime
df['ts'] = pd.to_datetime(df['ts'], format="%Y-%m-%dT%H:%M:%SZ", utc=True)

#localise
import pytz
my_tz = pytz.timezone("America/Los_Angeles")

#convert timezone
df['ts'] = df['ts'].dt.tz_convert(my_tz)

#sort data in chronological order
df.sort_values(by='ts', inplace=True)

df['year'] = df['ts'].dt.year

df = df[df['ms_played'] >= 45000]
print(df.shape)

df['date'] = df['ts'].dt.date

# Convert milliseconds to seconds
df['seconds'] = df['ms_played'] / 1000

# Group by date and sum total seconds
daily_seconds = df.groupby('date')['seconds'].sum().reset_index()

# Rename for clarity
daily_seconds.columns = ['date', 'total_seconds']

# Optional: round to 2 decimals
daily_seconds['total_seconds'] = daily_seconds['total_seconds'].round(2)

daily_seconds['date'] = daily_seconds['date'].astype(str)


# Convert to list of dictionaries for export
data_to_export = daily_seconds.to_dict(orient='records')

# Save to backend
with open("backend/data/daily_seconds.json", "w") as f:
    json.dump(data_to_export, f, indent=2)

print("✅ Exported daily_seconds.json")
