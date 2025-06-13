import React, { useState, useRef, useEffect } from "react";
import "./Chatbot.css";

const DUMMY_RESPONSE =
  "I'm a friendly Spotify bot! (This is a dummy response.)";

const Chatbot = ({ open, onClose, pendingMessage, onMessageHandled }) => {
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
  const hasSentPending = useRef(false);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  // Auto-send pendingMessage if provided and input is empty
  useEffect(() => {
    if (open && pendingMessage && !input && !hasSentPending.current) {
      setInput(pendingMessage);
      setTimeout(() => {
        document
          .querySelector(".chatbot-input")
          ?.form?.dispatchEvent(
            new Event("submit", { cancelable: true, bubbles: true })
          );
        hasSentPending.current = true;
        if (onMessageHandled) onMessageHandled();
      }, 100);
    }
    if (!pendingMessage) {
      hasSentPending.current = false;
    }
  }, [open, pendingMessage, input, onMessageHandled]);

  if (!open) return null;

  function extractFirstJsonObject(text) {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      return match[0];
    }
    throw new Error("No JSON object found in response");
  }

  const handleSend = async (e) => {
    e.preventDefault();
    if (!input.trim()) return;
    const userMsg = input.trim();
    setMessages((msgs) => [...msgs, { sender: "user", text: userMsg }]);
    setInput("");

    try {
      const prompt = `Return ONLY a valid JSON object, with no explanation, no markdown, and no code block. The JSON must have EXACTLY these fields (with these exact labels):\n\n{\n  \"entity_type\": \"song|album|artist\",\n  \"name\": string,\n  \"artist\": string or null,\n  \"album\": string or null,\n  \"metric\": \"time|count\",\n  \"timeframe\": string (a year, e.g. \"2020\", or \"all\"),\n  \"time_amount\": \"minutes|hours\" or null\n}\n\nIMPORTANT: Only fill in a field if it is explicitly mentioned in the user's question. If the artist or album is not mentioned, set them to null. Do NOT use your own knowledge to fill in missing information.\n\nQuestion: ${userMsg}`;

      const response = await window.puter.ai.chat(prompt);
      console.log("puter.ai.chat response:", typeof response, response);
      let parsed;
      if (typeof response === "string") {
        const jsonString = extractFirstJsonObject(response);
        parsed = JSON.parse(jsonString);
      } else if (typeof response === "object" && response !== null) {
        if (response.message && typeof response.message.content === "string") {
          const jsonString = extractFirstJsonObject(response.message.content);
          parsed = JSON.parse(jsonString);
        } else {
          parsed = response;
        }
      } else {
        console.error("Unexpected response type from puter.ai.chat:", response);
        throw new Error("Unexpected response type from puter.ai.chat");
      }

      const msgLower = userMsg.toLowerCase();
      if (!msgLower.includes("artist") && parsed.entity_type === "song") {
        parsed.artist = null;
      }
      if (!msgLower.includes("album") && parsed.entity_type === "song") {
        parsed.album = null;
      }

      const res = await fetch("http://localhost:8000/chatbot/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed),
      });
      const data = await res.json();

      // Post-process the backend response for context-aware, conversational reply
      try {
        const rephrasePrompt = `Given the user's question and the backend's factual response, rephrase the response to be more context-aware and conversational. If the user's question specifies a year, include it in the response. Be concise and natural.\n\nUser's question: \"${userMsg}\"\nBackend's response: \"${data.response}\"\n\nReturn ONLY the improved response, with no extra explanation or formatting.`;
        const improvedResponse = await window.puter.ai.chat(rephrasePrompt);
        setMessages((msgs) => [
          ...msgs,
          {
            sender: "bot",
            text:
              typeof improvedResponse === "string"
                ? improvedResponse
                : improvedResponse.message?.content || data.response,
          },
        ]);
      } catch (rephraseErr) {
        console.error("Rephrase error:", rephraseErr);
        setMessages((msgs) => [
          ...msgs,
          { sender: "bot", text: data.response },
        ]);
      }
    } catch (err) {
      console.error(err);
      setMessages((msgs) => [
        ...msgs,
        {
          sender: "bot",
          text: "Sorry, I couldn't understand or process your query. Please try again.",
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
