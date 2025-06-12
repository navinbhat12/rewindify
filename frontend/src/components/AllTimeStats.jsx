import React, { useState, useEffect } from "react";
import "./AllTimeStats.css";

const AllTimeStats = ({ data, metrics, setMetrics }) => {
  const [enrichedSongs, setEnrichedSongs] = useState([]);
  const [enrichedAlbums, setEnrichedAlbums] = useState([]);
  const [enrichedArtists, setEnrichedArtists] = useState([]);
  const [loadingSongs, setLoadingSongs] = useState(true);
  const [loadingAlbums, setLoadingAlbums] = useState(true);
  const [loadingArtists, setLoadingArtists] = useState(true);

  useEffect(() => {
    const fetchImages = async () => {
      setLoadingSongs(true);
      try {
        const enriched = await Promise.all(
          data.songs[metrics.songs].map(async (song) => {
            const imageRes = await fetch(
              `http://localhost:8000/track_image?track_name=${encodeURIComponent(
                song.name
              )}&artist_name=${encodeURIComponent(song.artist_name || "")}`
            );
            const imgData = await imageRes.json();
            return {
              ...song,
              image_url: imgData.image_url,
            };
          })
        );

        // Wait for all images to finish loading
        await Promise.all(
          enriched.map(
            (track) =>
              new Promise((resolve) => {
                if (!track.image_url) return resolve(); // Skip if no image
                const img = new Image();
                img.src = track.image_url;
                img.onload = resolve;
                img.onerror = resolve; // Prevent hanging
              })
          )
        );

        setEnrichedSongs(enriched);
      } catch (err) {
        console.error("Failed to fetch track images:", err);
        setEnrichedSongs(data.songs[metrics.songs]);
      }
      setLoadingSongs(false);
    };

    fetchImages();
  }, [data.songs, metrics.songs]);

  useEffect(() => {
    const fetchAlbumImages = async () => {
      setLoadingAlbums(true);
      try {
        const enriched = await Promise.all(
          data.albums[metrics.albums].map(async (album) => {
            const imageRes = await fetch(
              `http://localhost:8000/album_image?album_name=${encodeURIComponent(
                album.name
              )}&artist_name=${encodeURIComponent(album.artist_name || "")}`
            );
            const imgData = await imageRes.json();
            return {
              ...album,
              image_url: imgData.image_url,
            };
          })
        );

        // Wait for all images to finish loading
        await Promise.all(
          enriched.map(
            (album) =>
              new Promise((resolve) => {
                if (!album.image_url) return resolve(); // Skip if no image
                const img = new Image();
                img.src = album.image_url;
                img.onload = resolve;
                img.onerror = resolve; // Prevent hanging
              })
          )
        );

        setEnrichedAlbums(enriched);
      } catch (err) {
        console.error("Failed to fetch album images:", err);
        setEnrichedAlbums(data.albums[metrics.albums]);
      }
      setLoadingAlbums(false);
    };

    fetchAlbumImages();
  }, [data.albums, metrics.albums]);

  useEffect(() => {
    const fetchArtistImages = async () => {
      setLoadingArtists(true);
      try {
        const enriched = await Promise.all(
          data.artists[metrics.artists].map(async (artist) => {
            const imageRes = await fetch(
              `http://localhost:8000/artist_image?artist_name=${encodeURIComponent(
                artist.name
              )}`
            );
            const imgData = await imageRes.json();
            return {
              ...artist,
              image_url: imgData.image_url,
            };
          })
        );

        // Wait for all images to finish loading
        await Promise.all(
          enriched.map(
            (artist) =>
              new Promise((resolve) => {
                if (!artist.image_url) return resolve(); // Skip if no image
                const img = new Image();
                img.src = artist.image_url;
                img.onload = resolve;
                img.onerror = resolve; // Prevent hanging
              })
          )
        );

        setEnrichedArtists(enriched);
      } catch (err) {
        console.error("Failed to fetch artist images:", err);
        setEnrichedArtists(data.artists[metrics.artists]);
      }
      setLoadingArtists(false);
    };

    fetchArtistImages();
  }, [data.artists, metrics.artists]);

  const formatValue = (item, metric) => {
    if (metric === "time") {
      return `${(item.ms_played / 1000 / 60 / 60).toFixed(1)} hrs`;
    }
    return `${item.play} plays`;
  };

  return (
    <div className="stats-container">
      {/* Artists Card */}
      <div className="stat-card songs-card">
        <div className="stat-header">
          <h3>Top Artists</h3>
          <div className="metric-toggle">
            <button
              className={metrics.artists === "time" ? "active" : ""}
              onClick={() =>
                setMetrics((prev) => ({ ...prev, artists: "time" }))
              }
            >
              Time
            </button>
            <button
              className={metrics.artists === "count" ? "active" : ""}
              onClick={() =>
                setMetrics((prev) => ({ ...prev, artists: "count" }))
              }
            >
              Count
            </button>
          </div>
        </div>

        <div className="track-list">
          {loadingArtists ? (
            <div className="loading-container">
              <div className="spinner" />
              <p>Loading your favorite artists...</p>
            </div>
          ) : (
            enrichedArtists.map((artist, idx) => (
              <div key={idx} className="track-card">
                {artist.image_url && (
                  <img
                    src={artist.image_url}
                    alt="artist"
                    className="track-image"
                  />
                )}
                <div className="track-info">
                  <div className="track-title">{artist.name}</div>
                  <div className="track-value">
                    {formatValue(artist, metrics.artists)}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Songs Card */}
      <div className="stat-card songs-card">
        <div className="stat-header">
          <h3>Top Songs</h3>
          <div className="metric-toggle">
            <button
              className={metrics.songs === "time" ? "active" : ""}
              onClick={() => setMetrics((prev) => ({ ...prev, songs: "time" }))}
            >
              Time
            </button>
            <button
              className={metrics.songs === "count" ? "active" : ""}
              onClick={() =>
                setMetrics((prev) => ({ ...prev, songs: "count" }))
              }
            >
              Count
            </button>
          </div>
        </div>

        <div className="track-list">
          {loadingSongs ? (
            <div className="loading-container">
              <div className="spinner" />
              <p>Loading your favorite tracks...</p>
            </div>
          ) : (
            enrichedSongs.map((song, idx) => (
              <div key={idx} className="track-card">
                {song.image_url && (
                  <img
                    src={song.image_url}
                    alt="album"
                    className="track-image"
                  />
                )}
                <div className="track-info">
                  <div className="track-title">{song.name}</div>
                  <div className="track-artist">{song.artist_name}</div>
                  <div className="track-value">
                    {formatValue(song, metrics.songs)}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Albums Card */}
      <div className="stat-card songs-card">
        <div className="stat-header">
          <h3>Top Albums</h3>
          <div className="metric-toggle">
            <button
              className={metrics.albums === "time" ? "active" : ""}
              onClick={() =>
                setMetrics((prev) => ({ ...prev, albums: "time" }))
              }
            >
              Time
            </button>
            <button
              className={metrics.albums === "count" ? "active" : ""}
              onClick={() =>
                setMetrics((prev) => ({ ...prev, albums: "count" }))
              }
            >
              Count
            </button>
          </div>
        </div>

        <div className="track-list">
          {loadingAlbums ? (
            <div className="loading-container">
              <div className="spinner" />
              <p>Loading your favorite albums...</p>
            </div>
          ) : (
            enrichedAlbums.map((album, idx) => (
              <div key={idx} className="track-card">
                {album.image_url && (
                  <img
                    src={album.image_url}
                    alt="album"
                    className="track-image"
                  />
                )}
                <div className="track-info">
                  <div className="track-title">{album.name}</div>
                  <div className="track-artist">{album.artist_name}</div>
                  <div className="track-value">
                    {formatValue(album, metrics.albums)}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default AllTimeStats;
