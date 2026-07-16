/**
 * telegramFile.js
 * -------------------------------------------------------------------------
 * Telegram fayllarni brauzerga proxy qiladi.
 *
 * Kichik fayllar (< 20MB): Bot API getFile → CDN URL → stream
 * Katta fayllar (> 20MB):  MTProto (GramJS) → to'g'ridan-to'g'ri stream
 *
 * MTProto ishlashi uchun kerakli env:
 *   API_ID, API_HASH, BOT_TOKEN
 *   Kino qo'shilganda chatId + msgId saqlanishi kerak (avtomatik)
 */

"use strict";
const https = require("https");

const BOT_TOKEN = process.env.BOT_TOKEN || "";
const fileUrlCache = new Map(); // fileId -> { url, expiresAt }
const CACHE_TTL_MS = 5 * 60 * 1000;

// MTProto vaqtincha ishlamay qolsa (masalan tarmoq boshqa data-markazga
// ulanishni bloklasa), buni "eslab qolamiz" — aks holda video o'ynatilayotganda
// brauzer har bir yangi bo'lak (chunk) so'raganda qayta-qayta 10 soniyalik
// kutish (lag/qotish) yuzaga keladi. Muvaffaqiyatsizlikdan keyin bir muddat
// to'g'ridan-to'g'ri Bot API'ga o'tamiz, keyin qayta urinib ko'ramiz.
let mtprotoDownUntil = 0;
const MTPROTO_COOLDOWN_MS = 3 * 60 * 1000;

function apiRequest(method) {
  return new Promise((resolve, reject) => {
    https
      .get(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(e);
          }
        });
      })
      .on("error", reject);
  });
}

async function resolveFileUrl(fileId) {
  const cached = fileUrlCache.get(fileId);
  if (cached && cached.expiresAt > Date.now()) return cached.url;
  const resp = await apiRequest(`getFile?file_id=${encodeURIComponent(fileId)}`);
  if (!resp.ok) throw new Error("Telegram getFile failed: " + JSON.stringify(resp));
  const url = `https://api.telegram.org/file/bot${BOT_TOKEN}/${resp.result.file_path}`;
  fileUrlCache.set(fileId, { url, expiresAt: Date.now() + CACHE_TTL_MS });
  return url;
}

const keepAliveAgent = new https.Agent({ keepAlive: true, maxSockets: 64 });

// ─── Bot API orqali stream (kichik fayllar) ───
async function tryBotApiStream(fileId, req, res) {
  const pipeOnce = (forceRefresh) =>
    new Promise(async (resolve, reject) => {
      try {
        if (forceRefresh) fileUrlCache.delete(fileId);
        const url = await resolveFileUrl(fileId);
        const headers = {};
        if (req.headers.range) headers.Range = req.headers.range;

        const upstreamReq = https.get(url, { headers, agent: keepAliveAgent }, (upstream) => {
          if (!forceRefresh && (upstream.statusCode === 404 || upstream.statusCode === 400)) {
            upstream.resume();
            resolve({ retry: true });
            return;
          }
          if (res.headersSent) { resolve({ retry: false }); return; }
          res.status(upstream.statusCode || 200);
          ["content-type", "content-length", "content-range", "accept-ranges", "cache-control"].forEach((h) => {
            if (upstream.headers[h]) res.setHeader(h, upstream.headers[h]);
          });
          if (!upstream.headers["accept-ranges"]) res.setHeader("Accept-Ranges", "bytes");
          req.on("close", () => upstream.destroy());
          upstream.on("error", () => { if (!res.writableEnded) res.destroy(); });
          upstream.pipe(res);
          upstream.on("end", () => resolve({ retry: false }));
        });
        upstreamReq.on("error", (e) => {
          if (res.headersSent) { resolve({ retry: false }); return; }
          reject(e);
        });
        req.on("close", () => upstreamReq.destroy());
      } catch (e) {
        reject(e);
      }
    });

  const first = await pipeOnce(false);
  if (first?.retry) await pipeOnce(true);
}

/**
 * Express handler: Bot API + MTProto fallback
 * chatId va msgId query parametrlari bo'lsa MTProto ishlatiladi (katta fayllar uchun)
 */
function streamHandler() {
  return async (req, res) => {
    const { fileId } = req.params;
    if (!BOT_TOKEN) return res.status(503).json({ error: "BOT_TOKEN sozlanmagan" });
    if (!fileId) return res.status(400).json({ error: "fileId kerak" });

    const chatId = req.query.chatId;
    const msgId = req.query.msgId;

    // ─── MTProto orqali (katta fayllar uchun, chatId+msgId kerak) ───
    // Eslatma: ba'zi tarmoq muhitlarida boshqa Telegram data-markazga ulanish
    // "osilib qolishi" mumkin (javob kelmaydi). Shu sababli qattiq vaqt chegarasi
    // qo'yamiz — aks holda video so'rovi abadiy "qotib" qoladi.
    const mtprotoAvailable = chatId && msgId && (process.env.API_ID || process.env.TG_SESSION);
    if (mtprotoAvailable && Date.now() < mtprotoDownUntil) {
      // Yaqinda muvaffaqiyatsiz bo'lgan — har bir video bo'lagida qayta 10s
      // kutmaslik uchun to'g'ridan-to'g'ri Bot API'ga o'tamiz.
    } else if (mtprotoAvailable) {
      const MTPROTO_TIMEOUT_MS = 10000;
      try {
        const { streamFileByMessage } = require("./telegramMtproto");
        const timeout = new Promise((resolve) => setTimeout(() => resolve("timeout"), MTPROTO_TIMEOUT_MS));
        const result = await Promise.race([streamFileByMessage(chatId, msgId, req, res), timeout]);
        if (result === true) { mtprotoDownUntil = 0; return; }
        if (result === "timeout") {
          console.error(`MTProto ${MTPROTO_TIMEOUT_MS}ms ichida javob bermadi, Bot API ga o'tildi (chatId=${chatId}, msgId=${msgId})`);
          mtprotoDownUntil = Date.now() + MTPROTO_COOLDOWN_MS;
        }
        if (res.headersSent) return; // MTProto qisman javob yozgan bo'lsa qayta yozmaymiz
      } catch (e) {
        console.error("MTProto fallback xatosi:", e.message);
        mtprotoDownUntil = Date.now() + MTPROTO_COOLDOWN_MS;
        if (res.headersSent) return;
      }
    }

    // ─── Bot API orqali (kichik fayllar, 20MB gacha) ───
    try {
      await tryBotApiStream(fileId, req, res);
    } catch (e) {
      if (!res.headersSent) {
        res.status(502).json({
          error: "Fayl yuklab bo'lmadi",
          detail: e.message,
          hint: chatId && msgId
            ? "MTProto ishlamadi. API_ID va API_HASH ni tekshiring."
            : "Katta fayl (>20MB) uchun kino qo'shishda chatId/msgId avtomatik saqlanadi.",
        });
      }
    }
  };
}

module.exports = { resolveFileUrl, streamHandler };
