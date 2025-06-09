import React from "react";
import "./AllTimeStats.css";

const AllTimeStats = ({ data }) => {
  return (
    <div className="stats-container">
      {["artists", "songs", "albums"].map((type) => (
        <div key={type} className="stat-card">
          <h3>Top {type.charAt(0).toUpperCase() + type.slice(1)}</h3>
          <ul className="stat-list">
            {data[type].map((item, index) => (
              <li key={index} className="stat-item">
                <span className="rank">#{index + 1}</span> {item.name}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
};

export default AllTimeStats;
