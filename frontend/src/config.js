// API Configuration
const API_BASE_URL =
  process.env.NODE_ENV === "production"
    ? "https://spotify-dashboard-api-302797976880.us-central1.run.app"
    : "http://localhost:8000";

export { API_BASE_URL };
