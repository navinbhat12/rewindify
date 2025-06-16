import React, { useEffect, useState } from "react";
import "./TrackListModal.css";

const TrackListModal = ({ date, onClose, onChatbotQuery }) => {
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTracks = async () => {
      setLoading(true);
      try {
        const res = await fetch(`http://localhost:8000/tracks/${date}`);
        const data = await res.json();

        const enriched = await Promise.all(
          data.map(async ({ track_name, artist_name, ms_played }) => {
            const imageRes = await fetch(
              `http://localhost:8000/track_image?track_name=${encodeURIComponent(
                track_name
              )}&artist_name=${encodeURIComponent(artist_name)}`
            );
            const imgData = await imageRes.json();
            return {
              track_name,
              artist_name,
              image_url: imgData.image_url,
              ms_played,
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

        setTracks(enriched);
      } catch (err) {
        console.error("Failed to fetch track data:", err);
        setTracks([]);
      }
      setLoading(false);
    };

    fetchTracks();
  }, [date]);

  const handleCopyAndQuery = async (trackName) => {
    try {
      await navigator.clipboard.writeText(trackName);
    } catch {}
    if (onChatbotQuery) {
      onChatbotQuery(`How many times have I listened to the song ${trackName}`);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-content">
          <div className="modal-header">
            <h2>
              Tracks from{" "}
              {new Date(date).toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            </h2>
          </div>
          {!loading && (
            <div style={{ marginBottom: "1rem", color: "#a0a0a0" }}>
              Total listening time:{" "}
              {Math.round(
                tracks.reduce((acc, track) => acc + track.ms_played / 60000, 0)
              )}{" "}
              minutes
            </div>
          )}

          <div className="track-list">
            {loading ? (
              <div className="loading-container">
                <div className="spinner" />
                <p>Going back in time....</p>
              </div>
            ) : (
              tracks.map((track, idx) => (
                <div
                  key={idx}
                  className="track-card"
                  style={{ position: "relative" }}
                >
                  {track.image_url && (
                    <img
                      src={track.image_url}
                      alt="album"
                      className="track-image"
                    />
                  )}
                  <div className="track-info">
                    <div className="track-title">{track.track_name}</div>
                    <div className="track-artist">{track.artist_name}</div>
                  </div>
                  <button
                    className="track-chatbot-btn"
                    title="Ask StatsBot about this song"
                    style={{
                      position: "absolute",
                      right: 10,
                      top: "50%",
                      transform: "translateY(-50%)",
                      background: "none",
                      border: "none",
                      padding: 0,
                      margin: 0,
                      cursor: "pointer",
                      color: "#bbaaff",
                      fontSize: "1.2rem",
                      opacity: 0.7,
                    }}
                    onClick={() => handleCopyAndQuery(track.track_name)}
                    aria-label={`Ask StatsBot about ${track.track_name}`}
                  >
                    <svg
                      width="22"
                      height="22"
                      viewBox="0 0 22 22"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <circle
                        cx="11"
                        cy="11"
                        r="10"
                        stroke="#bbaaff"
                        strokeWidth="1.5"
                        fill="none"
                      />
                      <path
                        d="M7 11h8M11 7v8"
                        stroke="#bbaaff"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                      />
                    </svg>
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TrackListModal;
