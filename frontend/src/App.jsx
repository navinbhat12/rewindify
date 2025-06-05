import React, { useEffect, useState } from "react";
import CalendarHeatmap from "react-calendar-heatmap";
import "react-calendar-heatmap/dist/styles.css";

function App() {
  const [data, setData] = useState([]);
  const [selectedYear, setSelectedYear] = useState("");

  useEffect(() => {
    fetch("/daily_seconds.json")
      .then((res) => res.json())
      .then((json) => {
        const formatted = json
          .sort((a, b) => new Date(a.date) - new Date(b.date))
          .map((entry) => ({
            date: entry.date,
            count: Math.round(entry.total_seconds),
          }));
        setData(formatted);

        // Set default year to most recent
        const years = [
          ...new Set(formatted.map((d) => new Date(d.date).getFullYear())),
        ];
        setSelectedYear(years[years.length - 1].toString());
      });
  }, []);

  const filteredData = data.filter(
    (entry) => new Date(entry.date).getFullYear().toString() === selectedYear
  );

  return (
    <div className="App" style={{ padding: "2rem" }}>
      <h2 style={{ marginBottom: "1rem" }}>
        🎧 Daily Spotify Listening (Seconds)
      </h2>

      <select
        value={selectedYear}
        onChange={(e) => setSelectedYear(e.target.value)}
        style={{ marginBottom: "1.5rem", fontSize: "1rem", padding: "0.25rem" }}
      >
        {Array.from(new Set(data.map((d) => new Date(d.date).getFullYear())))
          .sort()
          .map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
      </select>

      <CalendarHeatmap
        startDate={new Date(`${selectedYear}-01-01`)}
        endDate={new Date(`${selectedYear}-12-31`)}
        values={filteredData}
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
  );
}

export default App;
