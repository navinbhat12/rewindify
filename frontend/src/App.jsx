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
                <h1>Spotify Dashboard</h1>
                <p>Visualize your listening habits with beautiful insights</p>
              </div>

              <FolderUpload onUploadComplete={handleUploadComplete} />

              <div className="features">
                <div className="feature">
                  <div className="feature-icon">📊</div>
                  <h3>Interactive Heatmap</h3>
                  <p>See your daily listening patterns at a glance</p>
                </div>
                <div className="feature">
                  <div className="feature-icon">🎵</div>
                  <h3>Track Details</h3>
                  <p>Explore what you listened to on any day</p>
                </div>
                <div className="feature">
                  <div className="feature-icon">🤖</div>
                  <h3>AI Chatbot</h3>
                  <p>Ask questions about your music taste</p>
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

              .features {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                gap: 2rem;
                margin-top: 2.5rem;
              }

              .feature {
                background: rgba(255, 255, 255, 0.02);
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 12px;
                padding: 1.5rem;
                transition: all 0.3s ease;
              }

              .feature:hover {
                background: rgba(255, 255, 255, 0.05);
                border-color: rgba(145, 70, 255, 0.3);
                transform: translateY(-2px);
              }

              .feature-icon {
                font-size: 2rem;
                margin-bottom: 1rem;
              }

              .feature h3 {
                font-size: 1.1rem;
                font-weight: 600;
                margin: 0 0 0.5rem 0;
                color: #ffffff;
              }

              .feature p {
                font-size: 0.9rem;
                color: #a0a0a0;
                margin: 0;
                line-height: 1.4;
              }

              .upload-footer {
                margin-top: 3rem;
                padding: 2rem 0;
                border-top: 1px solid rgba(255, 255, 255, 0.1);
                width: 100%;
              }

              .upload-footer p {
                margin: 0;
                color: #a0a0a0;
                font-size: 0.9rem;
                font-weight: 500;
                text-align: center;
              }

              @media (max-width: 768px) {
                .landing-page-content {
                  padding: 2rem 1rem;
                }
                .brand-header h1 {
                  font-size: 2.5rem;
                }
                .features {
                  grid-template-columns: 1fr;
                  gap: 1.5rem;
                  margin-top: 2rem;
                }
                .upload-footer {
                  margin-top: 2.5rem;
                  padding: 1.5rem 0;
                }
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
    </div>
  );
}

export default App;
