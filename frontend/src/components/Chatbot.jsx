import React, { useState, useRef, useEffect } from "react";
import "./Chatbot.css";

const DUMMY_RESPONSE =
  "I'm a friendly Spotify bot! (This is a dummy response.)";

const Chatbot = ({ open, onClose }) => {
  const [messages, setMessages] = useState([
    {
      sender: "bot",
      text:
        "Hi! I can help you with your Spotify stats. Here are some example queries you can ask me:\n\n" +
        "• How many minutes/hours did I listen to [Artist Name] in [Year]?\n" +
        "• How many times did I listen to the song [Song Name] in [Year]?\n" +
        "• How many times did I listen to the song [Song Name] by [Artist Name] in [Year]?\n" +
        "• How many minutes/hours did I listen to the album [Album Name] in [Year]?\n\n" +
        "Note: The [Year] part is optional. You can also use 'have I listened' instead of 'did I listen'.",
    },
  ]);
  const [input, setInput] = useState("");
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  if (!open) return null;

  const handleSend = async (e) => {
    e.preventDefault();
    if (!input.trim()) return;
    const userMsg = input.trim();
    setMessages((msgs) => [...msgs, { sender: "user", text: userMsg }]);
    setInput("");

    // Pattern: How many times (have|did) I listened to the song[,]? (Song Name) by (Artist Name) in (Year)
    const matchSongCountArtist = userMsg.match(
      /^how many times (?:have|did) i listen(?:ed)? to the song,? (.+?)(?: by (.+?))?(?: in (\d{4}))?$/i
    );
    // Pattern: How many times (have|did) I listened to the song[,]? (Song Name) in (Year)
    const matchSongCount = userMsg.match(
      /^how many times (?:have|did) i listen(?:ed)? to the song,? (.+?)(?: in (\d{4}))?$/i
    );
    // Pattern: How many minutes/hours (have|did) I listened to the album[,]? (Album Name) in (Year)
    const matchAlbum = userMsg.match(
      /^how many (minutes|hours) (?:have|did) i listen(?:ed)? to the album,? (.+?)(?: in (\d{4}))?$/i
    );
    // Pattern: How many minutes/hours (have|did) I listened to the song[,]? (Song Name) in (Year)
    const matchSong = userMsg.match(
      /^how many (minutes|hours) (?:have|did) i listen(?:ed)? to the song,? (.+?)(?: in (\d{4}))?$/i
    );
    // Pattern: How many minutes/hours (have|did) I listened to (Artist Name) in (Year)
    const matchArtist = userMsg.match(
      /^how many (minutes|hours) (?:have|did) i listen(?:ed)? to (.+?)(?: in (\d{4}))?$/i
    );
    if (matchSongCountArtist) {
      const song = matchSongCountArtist[1].trim();
      const artist = matchSongCountArtist[2]?.trim() || "";
      const year = matchSongCountArtist[3] || "all";
      try {
        const res = await fetch(
          `http://localhost:8000/chatbot/query?entity_type=song&name=${encodeURIComponent(
            song
          )}&artist=${encodeURIComponent(
            artist
          )}&timeframe=${year}&metric=count`
        );
        const data = await res.json();
        const response = data.response;
        const yearSuffix = year !== "all" ? ` in ${year}` : "";
        setMessages((msgs) => [
          ...msgs,
          {
            sender: "bot",
            text: response.replace(/\.$/, "") + yearSuffix + ".",
          },
        ]);
      } catch {
        setMessages((msgs) => [
          ...msgs,
          {
            sender: "bot",
            text: "Sorry, I couldn't fetch your play count for that song and artist.",
          },
        ]);
      }
    } else if (matchSongCount) {
      const song = matchSongCount[1].trim();
      const year = matchSongCount[2] || "all";
      try {
        const res = await fetch(
          `http://localhost:8000/chatbot/query?entity_type=song&name=${encodeURIComponent(
            song
          )}&timeframe=${year}&metric=count`
        );
        const data = await res.json();
        const response = data.response;
        const yearSuffix = year !== "all" ? ` in ${year}` : "";
        setMessages((msgs) => [
          ...msgs,
          {
            sender: "bot",
            text: response.replace(/\.$/, "") + yearSuffix + ".",
          },
        ]);
      } catch {
        setMessages((msgs) => [
          ...msgs,
          {
            sender: "bot",
            text: "Sorry, I couldn't fetch your play count for that song.",
          },
        ]);
      }
    } else if (matchAlbum) {
      const timeAmount = matchAlbum[1].toLowerCase();
      const album = matchAlbum[2].trim();
      const year = matchAlbum[3] || "all";
      try {
        const res = await fetch(
          `http://localhost:8000/chatbot/query?entity_type=album&name=${encodeURIComponent(
            album
          )}&timeframe=${year}&metric=time&time_amount=${timeAmount}`
        );
        const data = await res.json();
        const response = data.response;
        const yearSuffix = year !== "all" ? ` in ${year}` : "";
        setMessages((msgs) => [
          ...msgs,
          {
            sender: "bot",
            text: response.replace(/\.$/, "") + yearSuffix + ".",
          },
        ]);
      } catch {
        setMessages((msgs) => [
          ...msgs,
          {
            sender: "bot",
            text: "Sorry, I couldn't fetch your listening time for that album.",
          },
        ]);
      }
    } else if (matchSong) {
      const timeAmount = matchSong[1].toLowerCase();
      const song = matchSong[2].trim();
      const year = matchSong[3] || "all";
      try {
        const res = await fetch(
          `http://localhost:8000/chatbot/query?entity_type=song&name=${encodeURIComponent(
            song
          )}&timeframe=${year}&metric=time&time_amount=${timeAmount}`
        );
        const data = await res.json();
        const response = data.response;
        const yearSuffix = year !== "all" ? ` in ${year}` : "";
        setMessages((msgs) => [
          ...msgs,
          {
            sender: "bot",
            text: response.replace(/\.$/, "") + yearSuffix + ".",
          },
        ]);
      } catch {
        setMessages((msgs) => [
          ...msgs,
          {
            sender: "bot",
            text: "Sorry, I couldn't fetch your listening time for that song.",
          },
        ]);
      }
    } else if (matchArtist) {
      const timeAmount = matchArtist[1].toLowerCase();
      const artist = matchArtist[2].trim();
      const year = matchArtist[3] || "all";
      try {
        const res = await fetch(
          `http://localhost:8000/chatbot/query?entity_type=artist&name=${encodeURIComponent(
            artist
          )}&timeframe=${year}&metric=time&time_amount=${timeAmount}`
        );
        const data = await res.json();
        const response = data.response;
        const yearSuffix = year !== "all" ? ` in ${year}` : "";
        setMessages((msgs) => [
          ...msgs,
          {
            sender: "bot",
            text: response.replace(/\.$/, "") + yearSuffix + ".",
          },
        ]);
      } catch {
        setMessages((msgs) => [
          ...msgs,
          {
            sender: "bot",
            text: "Sorry, I couldn't fetch your listening time for that artist.",
          },
        ]);
      }
    } else {
      setMessages((msgs) => [
        ...msgs,
        {
          sender: "bot",
          text:
            "I can help you with your Spotify stats. Here are some example queries you can ask me:\n\n" +
            "• How many minutes/hours did I listen to [Artist Name] in [Year]?\n" +
            "• How many times did I listen to the song [Song Name] in [Year]?\n" +
            "• How many times did I listen to the song [Song Name] by [Artist Name] in [Year]?\n" +
            "• How many minutes/hours did I listen to the album [Album Name] in [Year]?\n\n" +
            "Note: The [Year] part is optional. You can also use 'have I listened' instead of 'did I listen'.",
        },
      ]);
    }
  };

  return (
    <>
      <div className="chatbot-backdrop" onClick={onClose} />
      <div className="chatbot-modal">
        <div className="chatbot-header-modal">
          <span>StatsBot</span>
          <button
            className="chatbot-close-btn"
            onClick={onClose}
            aria-label="Close chatbot"
          >
            &times;
          </button>
        </div>
        <div className="chatbot-messages">
          {messages.map((msg, idx) => (
            <div
              key={idx}
              className={
                msg.sender === "user"
                  ? "chatbot-bubble chatbot-bubble-user"
                  : "chatbot-bubble chatbot-bubble-bot"
              }
            >
              {msg.text}
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
        <form className="chatbot-input-bar" onSubmit={handleSend}>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message..."
            className="chatbot-input"
          />
          <button type="submit" className="chatbot-send-btn" aria-label="Send">
            <svg
              width="22"
              height="22"
              viewBox="0 0 22 22"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M11 4L11 18"
                stroke="white"
                strokeWidth="2.2"
                strokeLinecap="round"
              />
              <path
                d="M6 9L11 4L16 9"
                stroke="white"
                strokeWidth="2.2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </form>
      </div>
    </>
  );
};

export default Chatbot;
