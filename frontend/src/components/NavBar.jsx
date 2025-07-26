import React from "react";
import "./NavBar.css";

const NavBar = ({ onChatbotOpen, onClearData }) => (
  <nav className="navbar">
    <div className="navbar-inner">
      <div className="navbar-title">Spotify Dashboard</div>
      <div className="navbar-buttons">
        <button className="navbar-clear-btn" onClick={onClearData}>
          Clear Data
        </button>
        <button className="navbar-chatbot-btn" onClick={onChatbotOpen}>
          Ask StatsBot
        </button>
      </div>
    </div>
  </nav>
);

export default NavBar;
