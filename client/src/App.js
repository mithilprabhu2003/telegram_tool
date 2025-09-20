import React, { useEffect, useState } from "react";
import "./App.css";

const API_BASE = process.env.REACT_APP_API_BASE || "http://localhost:4000";
const API_KEY = process.env.REACT_APP_API_KEY || "your-super-secret-api-key";

function App() {
  const [chats, setChats] = useState([]);
  const [selected, setSelected] = useState({});
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [log, setLog] = useState([]);

  useEffect(() => {
    fetchChats();
    const id = setInterval(fetchChats, 10000);
    return () => clearInterval(id);
  }, []);

  async function fetchChats() {
    try {
      const res = await fetch(`${API_BASE}/api/chats`, {
        headers: { "x-api-key": API_KEY },
      });
      const data = await res.json();
      setChats(data.chats || []);
    } catch (e) {
      console.error(e);
    }
  }

  function toggleSelect(id) {
    setSelected((prev) => ({ ...prev, [id]: !prev[id] }));
  }
  function selectAll() {
    const all = {};
    chats.forEach((c) => (all[c.id] = true));
    setSelected(all);
  }
  function clearSelection() {
    setSelected({});
  }
  function clearActivity() {
    setLog([]);
  }

  async function deleteChat(chatId) {
    if (!window.confirm("Are you sure you want to delete this chat?")) return;

    try {
      const res = await fetch(`${API_BASE}/api/chats/${chatId}`, {
        method: "DELETE",
        headers: { "x-api-key": API_KEY },
      });
      const data = await res.json();
      if (data.ok) {
        setChats((prev) => prev.filter((c) => c.id !== chatId));
        setLog((prev) => [
          { message: `Deleted chat ${chatId}`, results: [] },
          ...prev,
        ]);
      } else {
        alert("Error deleting: " + data.error);
      }
    } catch (err) {
      alert("Delete failed: " + err.message);
    }
  }

  async function sendMessage() {
    const chatIds = Object.keys(selected).filter((id) => selected[id]);
    if (chatIds.length === 0) {
      alert("Select ≥ 1 group/chat");
      return;
    }
    if (!message.trim()) {
      alert("Type a message first");
      return;
    }

    setSending(true);

    try {
      const res = await fetch(`${API_BASE}/api/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": API_KEY },
        body: JSON.stringify({
          chatIds,
          message,
          parseMode: "HTML",
          disablePreview: false,
        }),
      });
      const data = await res.json();
      setLog((prev) => [{ message, results: data.results }, ...prev]);
      setMessage("");
      clearSelection();
    } catch (err) {
      setLog((prev) => [`Error: ${err.message}`, ...prev]);
    } finally {
      setSending(false);
      fetchChats();
    }
  }

  const chatNameMap = {};
  chats.forEach((c) => {
    chatNameMap[c.id] = c.title;
  });

  return (
    <div className="app">
      <header>
        <h1>Telegram Multi-Group Sender</h1>
        <br />
      </header>
      <section className="composer">
        <textarea
          placeholder="Type announcement, Zoom link..."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
        <div className="composer-actions">
          <button onClick={selectAll}>Select all</button>
          <button onClick={clearSelection}>Clear Selection</button>
          <button onClick={() => setMessage("")}>Clear Message</button>
          <button className="send" onClick={sendMessage} disabled={sending}>
            {sending ? "Sending…" : "Send to selected"}
          </button>
        </div>
      </section>

      <section className="chat-list">
        <h2>Groups ({chats.length})</h2>
        <div className="list">
          {chats.map((chat) => (
            <div key={chat.id} className="chat-item">
              <div className="meta">
                <input
                  type="checkbox"
                  checked={!!selected[chat.id]}
                  onChange={() => toggleSelect(chat.id)}
                />
                {/* Group title is now plain text, not clickable */}
                <span className="meta title">{chat.title}</span>
                <span className="sub">{chat.type}</span>
              </div>
              <button
                className="delete-btn"
                onClick={() => deleteChat(chat.id)}
              >
                ✖
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="activity">
        <div className="activity-header">
          <h3>📜 Activity</h3>
          {log.length > 0 && (
            <button className="clear-btn" onClick={() => setLog([])}>
              Clear
            </button>
          )}
        </div>

        {log.length === 0 ? (
          <p className="empty">No activity yet...</p>
        ) : (
          log.slice(0, 5).map((entry, i) => {
            if (!entry || typeof entry !== "object") return null;
            return (
              <div
                key={i}
                className={`activity-item ${
                  entry.results?.some((r) => r.ok) ? "success" : "error"
                }`}
              >
                <p className="message">
                  <strong>Message:</strong> {entry.message || "(empty)"}
                </p>
                {entry.results &&
                  entry.results.map((r, j) => (
                    <p key={j} className="result">
                      {r.ok
                        ? `✅ Sent to ${chatNameMap[r.chatId] || r.chatId}`
                        : `❌ Failed to ${chatNameMap[r.chatId] || r.chatId} (${
                            r.error
                          })`}
                    </p>
                  ))}
              </div>
            );
          })
        )}
      </section>
    </div>
  );
}

export default App;
