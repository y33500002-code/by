/**
 * server.js — Kino Mini App backend.
 * -------------------------------------------------------------------------
 * Serves:
 *   - the static Mini App frontend (../webapp) at "/"
 *   - the REST API at "/api/*", built on top of the EXISTING kino bot's
 *     database.js and modules (no duplication of movie/user/comment/like/
 *     premium/coin logic — this is a new access layer on the same data).
 *
 * Run alongside (or instead of) the Telegram bot polling process; both
 * read/write the same JSON files under INSTANCE_DIR/data, so actions in
 * the bot and in the Mini App stay in sync.
 */
const path = require("path");
const express = require("express");

const db = require("../bots/kino/database");
const social = require("./socialDb");
const { authMiddleware } = require("./telegramAuth");

const fs = require("fs");

const PORT = process.env.PORT || 3000;
// When this server is proxied behind a path prefix (e.g. Replit artifact
// routing at "/kino-app"), BASE_PATH tells us the prefix so routes and the
// injected frontend API base line up. Empty string when served at "/".
const BASE_PATH = (process.env.BASE_PATH || "").replace(/\/$/, "");
const app = express();

app.use(express.json({ limit: "2mb" }));

// Public config endpoint (no auth needed — returns non-sensitive info like bot username)
let _botUsername = "Kent_savdo_bot"; // fallback; updated at startup via Telegram API
(async () => {
  try {
    const r = await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/getMe`);
    const j = await r.json();
    if (j.ok && j.result.username) _botUsername = j.result.username;
  } catch (e) { /* keep fallback */ }
})();
app.get(`${BASE_PATH}/api/config`, (req, res) => res.json({ botUsername: _botUsername }));

// Media proxy is mounted before auth: <img>/<video> tags don't send our
// custom auth header, and posters/previews aren't sensitive data.
app.use(`${BASE_PATH}/api/media`, require("./routes/media")());

function settingsProvider() {
  try { return db.getSettings() || {}; } catch (e) { return {}; }
}
app.use(`${BASE_PATH}/api`, authMiddleware(db, settingsProvider));

app.use(`${BASE_PATH}/api/movies`, require("./routes/movies")(db, social));
app.use(`${BASE_PATH}/api/reels`, require("./routes/reels")(db, social));
app.use(`${BASE_PATH}/api/search`, require("./routes/search")(db, social));
app.use(`${BASE_PATH}/api/users`, require("./routes/users")(db, social));
app.use(`${BASE_PATH}/api/premium`, require("./routes/premium")(db, social));
app.use(`${BASE_PATH}/api/notifications`, require("./routes/notifications")(social));
app.use(`${BASE_PATH}/api/admin`, require("./routes/admin")(db, social));
app.use(`${BASE_PATH}/api/promos`, require("./routes/promos")(db));

app.use((err, req, res, next) => {
  console.error("API error:", err);
  res.status(500).json({ error: "Server xatosi" });
});

// Static Mini App frontend, served under BASE_PATH so it works whether this
// runs standalone at "/" or proxied at a path prefix like "/kino-app".
const webappDir = path.join(__dirname, "..", "webapp");

app.use(BASE_PATH || "/", express.static(webappDir, { index: false }));
app.get([`${BASE_PATH}/*`, BASE_PATH || "/"], (req, res, next) => {
  if (req.path.startsWith(`${BASE_PATH}/api`)) return next();
  // /kino (slash'siz) so'rov kelsa /kino/ ga yo'naltiramiz,
  // aks holda relative yo'llar noto'g'ri hal qilinadi (css/js yuklanmaydi).
  if (BASE_PATH && req.path === BASE_PATH) {
    return res.redirect(301, BASE_PATH + "/");
  }
  let html = fs.readFileSync(path.join(webappDir, "index.html"), "utf-8");
  // <base> tag: barcha relative yo'llar BASE_PATH/ ga nisbatan hal qilinadi
  const baseTag = BASE_PATH ? `<base href="${BASE_PATH}/">` : "";
  // Tell the frontend where its API lives (webapp/js/api.js reads window.__API_BASE__).
  html = html.replace("<head>", `<head>\n${baseTag}\n<script>window.__API_BASE__=${JSON.stringify(BASE_PATH)};</script>`);
  res.set("Content-Type", "text/html");
  res.send(html);
});

app.listen(PORT, () => {
  console.log(`Kino Mini App backend ${PORT}-portda ishga tushdi`);
});

module.exports = app;
