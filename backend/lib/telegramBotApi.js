/**
 * telegramBotApi.js
 * -------------------------------------------------------------------------
 * Lightweight helper for sending plain messages to Telegram users straight
 * from the Mini App backend (e.g. "premium tasdiqlandi" notifications),
 * without needing the grammY bot instance loaded in this process. Uses the
 * plain Bot API over HTTPS with the same BOT_TOKEN the bot itself uses.
 *
 * Fails silently (returns { ok: false }) if BOT_TOKEN is missing or the
 * user has blocked the bot / never started it — callers should not let a
 * failed notification block the underlying action (premium already
 * granted, etc).
 */
const BOT_TOKEN = process.env.BOT_TOKEN || "";

async function sendMessage(chatId, text, extra = {}) {
  if (!BOT_TOKEN || !chatId) return { ok: false };
  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, ...extra }),
    });
    return await res.json();
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

module.exports = { sendMessage };
