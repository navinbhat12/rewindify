import React from "react";
import "./NavBar.css";

const NavBar = ({ onChatbotOpen }) => (
  <nav className="navbar">
    <div className="navbar-inner">
      <div className="navbar-title">Spotify Dashboard</div>
      <button className="navbar-chatbot-btn" onClick={onChatbotOpen}>
        Ask StatsBot
      </button>
    </div>
  </nav>
);

export default NavBar;
