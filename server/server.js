require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const TelegramBot = require("node-telegram-bot-api");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 4000;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN; // keep secret
const API_KEY = process.env.API_KEY || "dev-secret-key"; // simple protection

if (!BOT_TOKEN) {
  console.error("❌ Missing TELEGRAM_BOT_TOKEN in .env");
  process.exit(1);
}

const DB_FILE = path.join(__dirname, "chats.json");
let chats = {};
if (fs.existsSync(DB_FILE)) {
  try {
    chats = JSON.parse(fs.readFileSync(DB_FILE));
  } catch (e) {
    chats = {};
  }
}
function saveChats() {
  fs.writeFileSync(DB_FILE, JSON.stringify(chats, null, 2));
}

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// When bot sees any message, record chat
bot.on("message", (msg) => {
  console.log("Received message:", msg); // <--- Add this line
  const chat = msg.chat;
  const id = String(chat.id);
  const title =
    chat.title ||
    `${chat.first_name || ""} ${chat.last_name || ""}`.trim() ||
    chat.username ||
    `Chat ${id}`;

  chats[id] = {
    id,
    title,
    type: chat.type,
    lastSeen: new Date().toISOString(),
  };
  saveChats();

  console.log(`💾 Saved chat: ${title} (${id})`);

  // Save message to chat's messages array
  if (!chats[id].messages) chats[id].messages = [];
  // Prevent duplicates
  const exists = chats[id].messages.some(
    (m) => m.message_id === msg.message_id
  );
  if (!exists) {
    chats[id].messages.push({
      messageId: msg.message_id,
      user: msg.from?.username || msg.from?.first_name || "Unknown",
      text: msg.text || "",
      time: new Date(msg.date * 1000).toISOString(),
    });
    saveChats();
  }
});

bot.on("new_chat_members", (msg) => {
  const chat = msg.chat;
  const id = String(chat.id);

  chats[id] = {
    id,
    title: chat.title || `Group ${id}`,
    type: chat.type,
    lastSeen: new Date().toISOString(),
  };
  saveChats();

  console.log(`👋 Bot added to new group: ${chat.title} (${id})`);
});

const app = express();
app.use(cors());
app.use(bodyParser.json());

function requireApiKey(req, res, next) {
  const key = req.headers["x-api-key"] || req.query.api_key;
  if (key !== API_KEY) return res.status(401).json({ error: "Unauthorized" });
  next();
}

// Get list of known chats
app.get("/api/chats", requireApiKey, (req, res) => {
  const list = Object.values(chats).sort((a, b) =>
    (a.title || "").localeCompare(b.title || "")
  );
  res.json({ chats: list });
});

// Send a message to one or more groups
// --- replace your existing /api/send handler with this ---
// --- replace your existing /api/send handler with this ---
app.post("/api/send", requireApiKey, async (req, res) => {
  const { chatIds, message, parseMode, disablePreview } = req.body;

  // validate
  if (!Array.isArray(chatIds) || chatIds.length === 0) {
    return res.status(400).json({ error: "chatIds array required" });
  }
  if (!message || !String(message).trim()) {
    return res
      .status(400)
      .json({ error: "message required and must not be empty" });
  }

  // generate a request id to trace logs
  const reqId = Date.now() + "-" + Math.floor(Math.random() * 10000);

  // dedupe and normalize chat ids to strings
  const uniqueChatIds = Array.from(new Set(chatIds.map(String)));
  console.log(
    `[SEND ${reqId}] send request -> count=${
      uniqueChatIds.length
    } preview="${String(message).slice(0, 100)}"`
  );

  const results = [];
  for (const chatId of uniqueChatIds) {
    try {
      // send message
      const sent = await bot.sendMessage(chatId, message, {
        parse_mode: parseMode || "HTML",
        disable_web_page_preview: !!disablePreview,
      });

      results.push({ chatId, ok: true, messageId: sent.message_id });
      console.log(
        `[SEND ${reqId}] ok -> ${chatId} message_id=${sent.message_id}`
      );
    } catch (err) {
      // better error text
      const errMsg =
        err?.response?.data?.description || err.message || String(err);
      results.push({ chatId, ok: false, error: errMsg });
      console.warn(`[SEND ${reqId}] fail -> ${chatId} error=${errMsg}`);

      // if Telegram says "upgraded to supergroup" remove old id (cleanup)
      if (errMsg.toLowerCase().includes("supergroup")) {
        if (chats[chatId]) {
          console.log(
            `[SEND ${reqId}] removing old chat id ${chatId} due to supergroup upgrade`
          );
          delete chats[chatId];
          saveChats();
        }
      }
    }

    // small delay to reduce flood / rate-limit issues
    await new Promise((r) => setTimeout(r, 300));
  }

  console.log(`[SEND ${reqId}] results:`, results);
  return res.json({ results });
});

// Get messages for a chat
app.get("/api/messages/:chatId", requireApiKey, (req, res) => {
  const chatId = req.params.chatId;
  const chat = chats[chatId];
  if (!chat || !chat.messages) {
    return res.json({ messages: [] });
  }
  // Remove duplicates based on messageId (or user+text+time if messageId is missing)
  const seen = new Set();
  const uniqueMessages = [];
  for (const m of chat.messages) {
    const key = m.messageId || `${m.user}-${m.text}-${m.time}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueMessages.push(m);
    }
  }
  res.json({ messages: uniqueMessages });
});

app.delete("/api/chats/:id", requireApiKey, (req, res) => {
  const chatId = req.params.id;
  if (chats[chatId]) {
    delete chats[chatId];
    saveChats();
    return res.json({ ok: true, deleted: chatId });
  }
  res.status(404).json({ ok: false, error: "Chat not found" });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

console.log("🤖 Telegram bot started in polling mode");
