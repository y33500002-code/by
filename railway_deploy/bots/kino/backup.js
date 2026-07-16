/**
 * backup.js — Kino ma'lumotlarini Telegram kanaliga zaxiralash (backup)
 * -------------------------------------------------------------------------
 * SERVER QAYTA ISHLASA ham kinolar yo'qolmasin!
 *
 * Sozlash:
 *   BACKUP_CHANNEL_ID=@mening_kanalim  (yoki -1001234567890)
 *   Bot shu kanalda admin bo'lishi kerak (xabar + pin huquqi)
 */

"use strict";
const https = require("https");
const fs = require("fs");
const path = require("path");

const BOT_TOKEN = process.env.BOT_TOKEN || "";
const BACKUP_CHANNEL = process.env.BACKUP_CHANNEL_ID || "";
const META_FILE = path.join(
  process.env.INSTANCE_DIR || path.join(__dirname, "data"),
  "backup_meta.json"
);

// ─── Helper: meta fayl (oxirgi xabar ID si) ───
function readMeta() {
  try {
    if (fs.existsSync(META_FILE)) return JSON.parse(fs.readFileSync(META_FILE, "utf-8"));
  } catch (_) {}
  return {};
}
function writeMeta(data) {
  try {
    const dir = path.dirname(META_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(META_FILE, JSON.stringify(data));
  } catch (_) {}
}

// ─── Helper: Bot API (JSON) ───
function botApi(method, body) {
  if (!BOT_TOKEN) return Promise.resolve({ ok: false });
  const jsonBody = JSON.stringify(body);
  return new Promise((resolve) => {
    const req = https.request(
      {
        hostname: "api.telegram.org",
        path: `/bot${BOT_TOKEN}/${method}`,
        method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(jsonBody) },
      },
      (res) => {
        let d = "";
        res.on("data", (c) => (d += c));
        res.on("end", () => { try { resolve(JSON.parse(d)); } catch (_) { resolve({ ok: false }); } });
      }
    );
    req.on("error", () => resolve({ ok: false }));
    req.write(jsonBody);
    req.end();
  });
}

// ─── Helper: Document yuklash (multipart) ───
function uploadDocument(movies) {
  if (!BOT_TOKEN || !BACKUP_CHANNEL) return Promise.resolve({ ok: false });
  return new Promise((resolve) => {
    const boundary = "----KinoBkp" + Date.now();
    const jsonStr = JSON.stringify(movies, null, 2);
    const caption = `📦 Kino DB backup | ${new Date().toISOString().split("T")[0]} | ${Object.keys(movies).length} ta kino`;
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="chat_id"\r\n\r\n${BACKUP_CHANNEL}\r\n`),
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="caption"\r\n\r\n${caption}\r\n`),
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="disable_notification"\r\n\r\ntrue\r\n`),
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="document"; filename="movies_backup.json"\r\nContent-Type: application/json\r\n\r\n`),
      Buffer.from(jsonStr, "utf-8"),
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const req = https.request(
      {
        hostname: "api.telegram.org",
        path: `/bot${BOT_TOKEN}/sendDocument`,
        method: "POST",
        headers: { "Content-Type": `multipart/form-data; boundary=${boundary}`, "Content-Length": body.length },
      },
      (res) => {
        let d = "";
        res.on("data", (c) => (d += c));
        res.on("end", () => { try { resolve(JSON.parse(d)); } catch (_) { resolve({ ok: false }); } });
      }
    );
    req.on("error", () => resolve({ ok: false }));
    req.write(body);
    req.end();
  });
}

// ─── Helper: faylni mazmunini yuklab olish ───
function downloadTgFile(filePath) {
  return new Promise((resolve, reject) => {
    const encodedPath = filePath.split("/").map(encodeURIComponent).join("/");
    https.get(`https://api.telegram.org/file/bot${BOT_TOKEN.trim()}/${encodedPath}`, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    }).on("error", reject);
  });
}

// ─── Asosiy: debounce bilan backup rejalashtirish ───
let _timer = null;
function scheduleBackup(moviesGetter) {
  if (!BACKUP_CHANNEL) return;
  if (_timer) clearTimeout(_timer);
  _timer = setTimeout(async () => {
    try {
      const movies = moviesGetter();
      const meta = readMeta();

      // Eski backup xabarini o'chirish
      if (meta.msgId) {
        await botApi("deleteMessage", { chat_id: BACKUP_CHANNEL, message_id: meta.msgId });
      }

      const res = await uploadDocument(movies);
      if (res?.ok && res.result?.message_id) {
        const msgId = res.result.message_id;
        writeMeta({ msgId });
        await botApi("pinChatMessage", {
          chat_id: BACKUP_CHANNEL,
          message_id: msgId,
          disable_notification: true,
        });
        console.log(`✅ Backup saqlandi (${Object.keys(movies).length} kino)`);
      }
    } catch (e) {
      console.error("Backup xatosi:", e.message);
    }
  }, 30_000);
}

// ─── Asosiy: server ishga tushganda tiklaش ───
async function restoreFromBackup() {
  if (!BOT_TOKEN || !BACKUP_CHANNEL) return null;
  try {
    const chatRes = await botApi("getChat", { chat_id: BACKUP_CHANNEL });
    const doc = chatRes?.result?.pinned_message?.document;
    if (!doc) { console.log("Backup: pinned xabar yo'q."); return null; }

    const fileRes = await botApi("getFile", { file_id: doc.file_id });
    if (!fileRes?.ok || !fileRes.result?.file_path) return null;

    const content = await downloadTgFile(fileRes.result.file_path);
    const movies = JSON.parse(content);
    console.log(`✅ Backup tiklandy! ${Object.keys(movies).length} ta kino tiklandi.`);
    return movies;
  } catch (e) {
    console.error("Backup tiklash xatosi:", e.message);
    return null;
  }
}

module.exports = { scheduleBackup, restoreFromBackup };
