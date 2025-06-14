import React, { useState, useEffect } from "react";
import CalendarHeatmap from "react-calendar-heatmap";
import "react-calendar-heatmap/dist/styles.css";
import FolderUpload from "./components/FolderUpload";
import TrackListModal from "./components/TrackListModal";
import AllTimeStats from "./components/AllTimeStats";
import Chatbot from "./components/Chatbot";
import NavBar from "./components/NavBar";

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
    const formatted = uploadedData
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
      const res = await fetch("http://localhost:8000/all_time_stats");
      const stats = await res.json();
      setAllTimeStats(stats);
    } catch (err) {
      console.error("Failed to fetch all time stats:", err);
    }
  };

  const handleDateClick = async (value) => {
    if (!value) return;
    setSelectedDate(value.date);
    try {
      const res = await fetch(`http://localhost:8000/tracks/${value.date}`);
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
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              minHeight: "80vh",
            }}
          >
            <h2
              style={{
                fontSize: "2rem",
                marginBottom: "1rem",
                color: "#a0a0a0",
                fontFamily:
                  "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
              }}
            >
              Upload Your Spotify Data
            </h2>
            <FolderUpload onUploadComplete={handleUploadComplete} />
          </div>
        ) : (
          <>
            <NavBar onChatbotOpen={() => setChatbotOpen(true)} />
            <div style={{ paddingTop: "20px" }} />
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              style={{
                margin: "0.7rem 0 0.5rem 0",
                fontSize: "1rem",
                padding: "0.4rem",
                borderRadius: "4px",
                backgroundColor: "#2e2e2e",
                color: "white",
                border: "1px solid #444",
              }}
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

            <h3
              style={{
                margin: "0.5rem 0 0.25rem",
                fontWeight: "bold",
                fontSize: "1.5rem",
                fontFamily:
                  "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
                textAlign: "left",
                maxWidth: "1400px",
                marginLeft: "auto",
                marginRight: "auto",
                paddingLeft: "0",
                color: "#a0a0a0",
              }}
            >
              {selectedYear} Spotify Listening
            </h3>

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
                  if (!value || value.count < 120) return "color-white";
                  if (value.count < 1000) return "color-purple-light";
                  if (value.count < 2200) return "color-purple-mid";
                  if (value.count < 4700) return "color-purple-dark";
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
              <div
                className="heatmap-legend"
                style={{
                  marginTop: "0rem",
                  marginLeft: "auto",
                  marginRight: "auto",
                  maxWidth: "1400px",
                  paddingLeft: "2rem",
                }}
              >
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
          </>
        )}
      </div>
    </div>
  );
}

export default App;
