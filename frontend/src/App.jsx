import React, { useState, useEffect } from "react";
import CalendarHeatmap from "react-calendar-heatmap";
import "react-calendar-heatmap/dist/styles.css";
import FolderUpload from "./components/FolderUpload";
import TrackListModal from "./components/TrackListModal";
import AllTimeStats from "./components/AllTimeStats";
import Chatbot from "./components/Chatbot";
import NavBar from "./components/NavBar";
import { API_BASE_URL } from "./config";

function App() {
  const [data, setData] = useState(() => {
    const savedData = sessionStorage.getItem("spotifyData");
    return savedData ? JSON.parse(savedData) : [];
  });
  const [selectedYear, setSelectedYear] = useState(() => {
    const savedYear = sessionStorage.getItem("selectedYear");
    return savedYear || "";
  });
  const [selectedDate, setSelectedDate] = useState(null);
  const [tracks, setTracks] = useState([]);
  const [allTimeStats, setAllTimeStats] = useState(() => {
    const savedStats = sessionStorage.getItem("allTimeStats");
    return savedStats ? JSON.parse(savedStats) : null;
  });
  const [metrics, setMetrics] = useState({
    artists: "time",
    songs: "time",
    albums: "time",
  });
  const [chatbotOpen, setChatbotOpen] = useState(false);
  const [pendingChatbotMessage, setPendingChatbotMessage] = useState("");
  const [fullscreenImage, setFullscreenImage] = useState(null);

  // Save data to sessionStorage whenever it changes
  useEffect(() => {
    if (data.length > 0) {
      sessionStorage.setItem("spotifyData", JSON.stringify(data));
    }
  }, [data]);

  // Save selected year to sessionStorage whenever it changes
  useEffect(() => {
    if (selectedYear) {
      sessionStorage.setItem("selectedYear", selectedYear);
    }
  }, [selectedYear]);

  // Save all time stats to sessionStorage whenever they change
  useEffect(() => {
    if (allTimeStats) {
      sessionStorage.setItem("allTimeStats", JSON.stringify(allTimeStats));
    }
  }, [allTimeStats]);

  const handleUploadComplete = async (uploadedData) => {
    // Clear any existing cached data
    sessionStorage.removeItem("spotifyData");
    sessionStorage.removeItem("allTimeStats");
    sessionStorage.removeItem("selectedYear");

    // Extract the data array from the uploaded data object
    const dataArray = uploadedData.data || uploadedData;

    const formatted = dataArray
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .map((entry) => ({
        date: entry.date,
        count: Math.round(entry.total_seconds),
      }));

    setData(formatted);

    const years = [
      ...new Set(formatted.map((d) => new Date(d.date).getFullYear())),
    ];
    setSelectedYear(years[years.length - 1].toString());

    try {
      const sessionId = sessionStorage.getItem("sessionId");
      if (!sessionId) {
        console.error("No session ID found");
        return;
      }

      const res = await fetch(`${API_BASE_URL}/all_time_stats`, {
        headers: {
          "X-Session-ID": sessionId,
        },
      });
      const stats = await res.json();
      console.log("📊 Received all-time stats:", stats); // Debug log
      setAllTimeStats(stats);
    } catch (err) {
      console.error("Failed to fetch all time stats:", err);
    }
  };

  const handleClearData = () => {
    // Clear session storage
    sessionStorage.removeItem("spotifyData");
    sessionStorage.removeItem("allTimeStats");
    sessionStorage.removeItem("selectedYear");

    // Clear backend database
    const sessionId = sessionStorage.getItem("sessionId");
    if (sessionId) {
      fetch(`${API_BASE_URL}/clear_data`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Session-ID": sessionId,
        },
      })
        .then((response) => response.json())
        .then((data) => {
          console.log("🗑️ Backend data cleared:", data);
        })
        .catch((error) => {
          console.error("❌ Error clearing backend data:", error);
        });
    }

    // Reset all state
    setData([]);
    setSelectedYear("");
    setAllTimeStats({
      artists: { time: [], count: [] },
      songs: { time: [], count: [] },
      albums: { time: [], count: [] },
    });
    setChatbotOpen(false);
  };

  const handleDateClick = async (value) => {
    if (!value) return;
    setSelectedDate(value.date);
    try {
      const res = await fetch(`${API_BASE_URL}/tracks/${value.date}`);
      const data = await res.json();
      setTracks(data);
    } catch (err) {
      console.error("Failed to fetch tracks:", err);
      setTracks([]);
    }
  };

  const filteredData = data.filter(
    (d) => new Date(d.date).getFullYear().toString() === selectedYear
  );

  return (
    <div
      style={{
        minHeight: "100vh",
        width: "100vw",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: data.length > 0 ? "flex-start" : "center",
        padding: "2rem",
        backgroundColor: "#000000",
        color: "white",
        boxSizing: "border-box",
      }}
    >
      <div style={{ padding: "2rem", maxWidth: "1400px", margin: "0 auto" }}>
        {data.length === 0 ? (
          <div // This is the fixed container
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 1000,
              overflowY: "auto", // Enables scrolling on this container
              background:
                "linear-gradient(135deg, #0f0f23 0%, #1a1a2e 50%, #16213e 100%)",
            }}
          >
            <div className="landing-page-content">
              <div className="brand-header">
                <div className="logo">
                  <svg
                    width="64"
                    height="64"
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M12 2L13.09 8.26L20 9L13.09 9.74L12 16L10.91 9.74L4 9L10.91 8.26L12 2Z"
                      fill="#9146ff"
                    />
                    <path
                      d="M19 15L19.74 12.26L22 12L19.74 11.74L19 9L18.26 11.74L16 12L18.26 12.26L19 15Z"
                      fill="#9146ff"
                    />
                    <path
                      d="M5 15L5.74 12.26L8 12L5.74 11.74L5 9L4.26 11.74L2 12L4.26 12.26L5 15Z"
                      fill="#9146ff"
                    />
                  </svg>
                </div>
                <h1>Rewindify</h1>
                <p>Visualize your listening habits with beautiful insights</p>
              </div>

              <FolderUpload onUploadComplete={handleUploadComplete} />

              <div className="features-showcase">
                <h2>Discover Your Music Journey</h2>
                <p className="showcase-subtitle">
                  Explore powerful insights about your listening habits
                </p>

                <div className="feature-section">
                  <div className="feature-content">
                    <div className="feature-text">
                      <h3>📊 Interactive Dashboard</h3>
                      <p>
                        Visualize your Spotify listening data with beautiful
                        heatmaps and charts. See your daily listening patterns,
                        track your favorite artists, and discover your
                        most-played songs all in one place.
                      </p>
                    </div>
                    <div className="feature-image">
                      <img
                        src="/HomePage.png"
                        alt="Dashboard Overview"
                        onClick={() => setFullscreenImage("/HomePage.png")}
                        style={{ cursor: "pointer" }}
                      />
                    </div>
                  </div>
                </div>

                <div className="feature-section">
                  <div className="feature-content reverse">
                    <div className="feature-text">
                      <h3>🎵 Track Details</h3>
                      <p>
                        Click on any day to see exactly what you listened to.
                        Explore your daily playlists, discover forgotten
                        favorites, and relive your musical moments with detailed
                        track information.
                      </p>
                    </div>
                    <div className="feature-image">
                      <img
                        src="/TrackListModal.png"
                        alt="Track Details"
                        onClick={() =>
                          setFullscreenImage("/TrackListModal.png")
                        }
                        style={{ cursor: "pointer" }}
                      />
                    </div>
                  </div>
                </div>

                <div className="feature-section">
                  <div className="feature-content">
                    <div className="feature-text">
                      <h3>🤖 AI Chatbot Assistant</h3>
                      <p>
                        Ask questions about your music taste in natural
                        language. Find your top artists, most-played songs,
                        listening trends, and get personalized insights about
                        your Spotify journey.
                      </p>
                    </div>
                    <div className="feature-image">
                      <img
                        src="/Chatbot.png"
                        alt="AI Chatbot"
                        onClick={() => setFullscreenImage("/Chatbot.png")}
                        style={{ cursor: "pointer" }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <footer className="upload-footer">
                <p>Made by Navin Bhat</p>
              </footer>
            </div>

            <style jsx>{`
              .landing-page-content {
                max-width: 800px;
                margin: 0 auto;
                padding: 4rem 2rem;
                text-align: center;
                width: 100%;
                box-sizing: border-box;
              }

              .brand-header {
                margin-bottom: 3rem;
              }

              .logo {
                margin-bottom: 1.5rem;
                filter: drop-shadow(0 8px 16px rgba(145, 70, 255, 0.3));
              }

              .brand-header h1 {
                font-size: 3rem;
                font-weight: 700;
                margin: 0 0 0.5rem 0;
                background: linear-gradient(135deg, #ffffff 0%, #9146ff 100%);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
                background-clip: text;
                font-family: "Inter", -apple-system, BlinkMacSystemFont,
                  "Segoe UI", Roboto, sans-serif;
              }

              .brand-header p {
                font-size: 1.1rem;
                color: #a0a0a0;
                margin: 0;
                font-weight: 400;
              }

              .features-showcase {
                margin-top: 4rem;
                max-width: 1200px;
                margin-left: auto;
                margin-right: auto;
                padding: 0 2rem;
              }

              .features-showcase h2 {
                font-size: 2.5rem;
                font-weight: 700;
                text-align: center;
                margin-bottom: 0.5rem;
                background: linear-gradient(135deg, #ffffff 0%, #9146ff 100%);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
                background-clip: text;
              }

              .showcase-subtitle {
                text-align: center;
                color: #a0a0a0;
                font-size: 1.1rem;
                margin-bottom: 4rem;
              }

              .feature-section {
                margin-bottom: 6rem;
                scroll-margin-top: 2rem;
              }

              .feature-content {
                display: flex;
                align-items: center;
                gap: 4rem;
                max-width: 1000px;
                margin: 0 auto;
              }

              .feature-content.reverse {
                flex-direction: row-reverse;
              }

              .feature-text {
                flex: 1;
              }

              .feature-text h3 {
                font-size: 1.8rem;
                font-weight: 600;
                margin-bottom: 1rem;
                color: #ffffff;
              }

              .feature-text p {
                font-size: 1.1rem;
                line-height: 1.6;
                color: #a0a0a0;
                margin: 0;
              }

              .feature-image {
                flex: 1;
                display: flex;
                justify-content: center;
              }

              .feature-image img {
                max-width: 100%;
                height: auto;
                border-radius: 12px;
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
                border: 1px solid rgba(145, 70, 255, 0.2);
                transition: transform 0.3s ease;
                cursor: pointer;
                user-select: none;
              }

              .feature-image img:hover {
                transform: scale(1.02);
              }

              @media (max-width: 768px) {
                .feature-content {
                  flex-direction: column;
                  gap: 2rem;
                }

                .feature-content.reverse {
                  flex-direction: column;
                }

                .features-showcase h2 {
                  font-size: 2rem;
                }

                .feature-text h3 {
                  font-size: 1.5rem;
                }
              }

              .fullscreen-modal {
                position: fixed;
                top: 0;
                left: 0;
                width: 100vw;
                height: 100vh;
                background: rgba(0, 0, 0, 0.6);
                backdrop-filter: blur(10px);
                -webkit-backdrop-filter: blur(10px);
                z-index: 3000;
                display: flex;
                align-items: center;
                justify-content: center;
                animation: fadeIn 0.3s ease;
              }

              @keyframes fadeIn {
                from {
                  opacity: 0;
                }
                to {
                  opacity: 1;
                }
              }

              .fullscreen-content {
                position: relative;
                max-width: 90vw;
                max-height: 90vh;
              }

              .fullscreen-content img {
                max-width: 100%;
                max-height: 100%;
                object-fit: contain;
                border-radius: 12px;
                box-shadow: 0 16px 64px rgba(0, 0, 0, 0.5);
              }

              .fullscreen-close-btn {
                position: absolute;
                top: -40px;
                right: -40px;
                background: #2c222c;
                border: 1px solid rgba(255, 255, 255, 0.1);
                color: #ffffff;
                font-size: 1.5rem;
                font-weight: 300;
                cursor: pointer;
                border-radius: 50%;
                width: 36px;
                height: 36px;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.3s ease;
              }

              .fullscreen-close-btn:hover {
                background: #3a2d3a;
                transform: scale(1.1);
              }
            `}</style>
          </div>
        ) : (
          <div className="dashboard-container">
            <style jsx>{`
              .dashboard-container {
                min-height: 100vh;
                width: 100vw;
                background: linear-gradient(
                  135deg,
                  #0f0f23 0%,
                  #1a1a2e 50%,
                  #16213e 100%
                );
                padding: 0;
                margin: 0;
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                overflow-y: auto;
                padding-top: 70px; /* Push content down */
              }

              .dashboard-content {
                max-width: 1400px;
                margin: 0 auto;
                padding: 2rem;
              }

              .heatmap-title-container {
                display: flex;
                justify-content: center;
                align-items: center;
                gap: 1rem;
                margin-bottom: 1rem;
              }

              .heatmap-title-container select {
                margin: 0;
                font-size: 1rem;
                padding: 0.4rem 0.8rem;
                border-radius: 8px;
                background: rgba(145, 70, 255, 0.1);
                color: white;
                border: 1px solid rgba(145, 70, 255, 0.3);
                transition: all 0.3s ease;
                font-family: "Inter", -apple-system, BlinkMacSystemFont,
                  "Segoe UI", Roboto, sans-serif;
              }

              .heatmap-title-container select:hover {
                border-color: rgba(145, 70, 255, 0.5);
                background: rgba(145, 70, 255, 0.15);
              }

              .heatmap-title-container select:focus {
                outline: none;
                border-color: #9146ff;
                box-shadow: 0 0 0 2px rgba(145, 70, 255, 0.2);
              }

              .heatmap-title-container h3 {
                margin: 0;
                font-weight: 600;
                font-size: 1.5rem;
                font-family: "Inter", -apple-system, BlinkMacSystemFont,
                  "Segoe UI", Roboto, sans-serif;
                text-align: left;
                color: #ffffff;
              }

              .dashboard-content .heatmap-legend {
                margin-top: 0rem;
                margin-left: auto;
                margin-right: auto;
                max-width: 1400px;
                padding-left: 2rem;
              }

              .dashboard-content .heatmap-legend span {
                color: #a0a0a0;
                font-weight: 500;
              }
            `}</style>
            <NavBar
              onChatbotOpen={() => setChatbotOpen(true)}
              onClearData={handleClearData}
            />
            <div className="dashboard-content">
              <div className="heatmap-title-container">
                <h3>{selectedYear} Spotify Listening</h3>
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(e.target.value)}
                >
                  {Array.from(
                    new Set(data.map((d) => new Date(d.date).getFullYear()))
                  )
                    .sort()
                    .map((year) => (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    ))}
                </select>
              </div>

              <div
                style={{
                  width: "100%",
                  maxWidth: "1400px",
                  marginTop: "1rem",
                  display: "flex",
                  justifyContent: "center",
                  marginBottom: "0.5rem",
                }}
              >
                <CalendarHeatmap
                  startDate={new Date(`${selectedYear}-01-01`)}
                  endDate={new Date(`${selectedYear}-12-31`)}
                  values={filteredData}
                  onClick={handleDateClick}
                  classForValue={(value) => {
                    if (!value || value.count < 600) return "color-white";
                    if (value.count < 1800) return "color-purple-light";
                    if (value.count < 3600) return "color-purple-mid";
                    if (value.count < 7200) return "color-purple-dark";
                    return "color-max";
                  }}
                  tooltipDataAttrs={(value) =>
                    value.date
                      ? {
                          "data-tip": `${value.date}: ${value.count} sec`,
                        }
                      : {}
                  }
                  weekdayLabels={[
                    "Sun",
                    "Mon",
                    "Tue",
                    "Wed",
                    "Thu",
                    "Fri",
                    "Sat",
                  ]}
                  showWeekdayLabels
                  style={{
                    "--react-calendar-heatmap-text-color": "#a0a0a0",
                    "--react-calendar-heatmap-month-label-color": "#a0a0a0",
                    "--react-calendar-heatmap-weekday-label-color": "#a0a0a0",
                  }}
                />
                <div className="heatmap-legend">
                  <span>Less</span>
                  <div className="legend-box color-white" />
                  <div className="legend-box color-purple-light" />
                  <div className="legend-box color-purple-mid" />
                  <div className="legend-box color-purple-dark" />
                  <div className="legend-box color-max" />
                  <span>More</span>
                </div>
              </div>

              {selectedDate && (
                <TrackListModal
                  date={selectedDate}
                  tracks={tracks}
                  onClose={() => setSelectedDate(null)}
                  onChatbotQuery={(msg) => {
                    setPendingChatbotMessage(msg);
                    setChatbotOpen(true);
                  }}
                />
              )}
              {allTimeStats && (
                <AllTimeStats
                  data={allTimeStats}
                  metrics={metrics}
                  setMetrics={setMetrics}
                />
              )}
              <Chatbot
                open={chatbotOpen}
                onClose={() => setChatbotOpen(false)}
                pendingMessage={pendingChatbotMessage}
                onMessageHandled={() => setPendingChatbotMessage("")}
              />
            </div>
          </div>
        )}
      </div>
      {fullscreenImage && (
        <div
          className="fullscreen-modal"
          onClick={() => setFullscreenImage(null)}
        >
          <div
            className="fullscreen-content"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="fullscreen-close-btn"
              onClick={() => setFullscreenImage(null)}
              aria-label="Close fullscreen"
            >
              &times;
            </button>
            <img src={fullscreenImage} alt="Fullscreen view" />
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
