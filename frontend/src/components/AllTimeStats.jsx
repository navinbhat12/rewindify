import React from "react";
import "./AllTimeStats.css";

const AllTimeStats = ({ data, metrics, setMetrics }) => {
  const formatValue = (item, metric) => {
    if (metric === "time") {
      return `${(item.ms_played / 1000 / 60 / 60).toFixed(1)} hrs`;
    }
    return `${item.play} plays`;
  };

  const types = ["artists", "songs", "albums"];

  return (
    <div className="stats-container">
      {types.map((type) => (
        <div key={type} className="stat-card">
          <div className="stat-header">
            <h3>Top {type.charAt(0).toUpperCase() + type.slice(1)}</h3>
            <div className="metric-toggle">
              <button
                className={metrics[type] === "time" ? "active" : ""}
                onClick={() =>
                  setMetrics((prev) => ({ ...prev, [type]: "time" }))
                }
              >
                Time
              </button>
              <button
                className={metrics[type] === "count" ? "active" : ""}
                onClick={() =>
                  setMetrics((prev) => ({ ...prev, [type]: "count" }))
                }
              >
                Count
              </button>
            </div>
          </div>

          <ul className="stat-list">
            {data[type][metrics[type]].map((item, index) => (
              <li key={index} className="stat-item">
                <span className="rank">#{index + 1}</span>
                {item.name}
                <span className="value">
                  {formatValue(item, metrics[type])}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
};

export default AllTimeStats;
