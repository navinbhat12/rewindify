import React, { useState } from "react";
import CalendarHeatmap from "react-calendar-heatmap";
import "react-calendar-heatmap/dist/styles.css";
import FolderUpload from "./components/FolderUpload";
import TrackListModal from "./components/TrackListModal";
import AllTimeStats from "./components/AllTimeStats";

function App() {
  const [data, setData] = useState([]);
  const [selectedYear, setSelectedYear] = useState("");
  const [selectedDate, setSelectedDate] = useState(null);
  const [tracks, setTracks] = useState([]);
  const [allTimeStats, setAllTimeStats] = useState(null);

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
      setAllTimeStats(stats); // <- new state you'll define
    } catch (err) {
      console.error("Failed to fetch all time stats:", err);
    }
  };

  const handleDateClick = async (value) => {
    if (!value?.date) return;

    setSelectedDate(value.date);

    try {
      const res = await fetch(`http://localhost:8000/tracks/${value.date}`);
      const json = await res.json();
      setTracks(json);
    } catch (err) {
      console.error("Failed to fetch tracks for date:", value.date);
      setTracks([]);
    }
  };

  const filteredData = data.filter(
    (entry) => new Date(entry.date).getFullYear().toString() === selectedYear
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
        backgroundColor: "#1e1e1e",
        color: "white",
        boxSizing: "border-box",
      }}
    >
      <h2 style={{ fontSize: "1.75rem", marginBottom: "1rem" }}>
        🎧 Daily Spotify Listening (Seconds)
      </h2>

      <FolderUpload onUploadComplete={handleUploadComplete} />

      {data.length > 0 && (
        <>
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(e.target.value)}
            style={{
              margin: "1.5rem 0",
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

          <div
            style={{
              width: "100%",
              maxWidth: "1400px",
              marginTop: "1rem",
              display: "flex",
              justifyContent: "center",
            }}
          >
            <CalendarHeatmap
              startDate={new Date(`${selectedYear}-01-01`)}
              endDate={new Date(`${selectedYear}-12-31`)}
              values={filteredData}
              onClick={handleDateClick}
              classForValue={(value) => {
                if (!value || value.count < 300) return "color-white";
                if (value.count < 1000) return "color-purple-light";
                if (value.count < 1500) return "color-purple-mid";
                if (value.count < 3600) return "color-purple-dark";
                return "color-purple-max";
              }}
              tooltipDataAttrs={(value) =>
                value.date
                  ? {
                      "data-tip": `${value.date}: ${value.count} sec`,
                    }
                  : {}
              }
              weekdayLabels={["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]}
              showWeekdayLabels
            />
          </div>
        </>
      )}

      {selectedDate && (
        <TrackListModal
          date={selectedDate}
          tracks={tracks}
          onClose={() => setSelectedDate(null)}
        />
      )}
      {allTimeStats && <AllTimeStats data={allTimeStats} />}
    </div>
  );
}

export default App;
