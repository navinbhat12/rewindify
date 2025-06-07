import React, { useEffect, useState } from "react";
import "./TrackListModal.css";

const TrackListModal = ({ date, onClose }) => {
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTracks = async () => {
      setLoading(true);
      try {
        const res = await fetch(`http://localhost:8000/tracks/${date}`);
        const data = await res.json();

        const enriched = await Promise.all(
          data.map(async ({ track_name, artist_name }) => {
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

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginBottom: "1rem" }}>Tracks from {date}</h3>
        <div className="track-list">
          {loading ? (
            <div className="loading-container">
              <div className="spinner" />
              <p>Going back in time....</p>
            </div>
          ) : (
            tracks.map((track, idx) => (
              <div key={idx} className="track-card">
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
              </div>
            ))
          )}
        </div>
        <button onClick={onClose} className="close-button">
          Close
        </button>
      </div>
    </div>
  );
};

export default TrackListModal;
