/**
 * telegramMtproto.js — GramJS orqali katta fayllarni stream qilish
 * -------------------------------------------------------------------------
 * Bot API faqat 20MB gacha fayllarni yuklay oladi.
 * Bu modul MTProto protokoli orqali ISTALGAN hajmdagi faylni stream qiladi.
 *
 * Kerakli env o'zgaruvchilar:
 *   API_ID    — my.telegram.org dan olinadi (raqam)
 *   API_HASH  — my.telegram.org dan olinadi (matn)
 *   BOT_TOKEN — BotFather dan
 *   TG_SESSION — (ixtiyoriy) birinchi ishga tushganda konsolda ko'rsatiladi,
 *                keyingi marta env ga qo'shing
 */

"use strict";

let _client = null;
let _sessionStr = process.env.TG_SESSION || "";

async function getClient() {
  // Lazy import — faqat API_ID/API_HASH bo'lsa yuklanadi
  const apiId = parseInt(process.env.API_ID || "0");
  const apiHash = process.env.API_HASH || "";
  if (!apiId || !apiHash) return null;

  if (_client) {
    try {
      if (_client.connected) return _client;
    } catch (_) {}
  }

  const { TelegramClient } = require("telegram");
  const { StringSession } = require("telegram/sessions");

  _client = new TelegramClient(
    new StringSession(_sessionStr),
    apiId,
    apiHash,
    {
      connectionRetries: 3,
      autoReconnect: true,
      retryDelay: 1000,
      requestRetries: 3,
    }
  );

  await _client.start({ botAuthToken: process.env.BOT_TOKEN });

  // Yangi session ni log qilamiz (birinchi marta)
  const saved = _client.session.save();
  if (saved && saved !== _sessionStr) {
    _sessionStr = saved;
    console.log("\n🔑 MTProto session (TG_SESSION ga saqlang):");
    console.log(saved);
    console.log();
  }

  return _client;
}

/**
 * chatId + msgId orqali faylni HTTP stream sifatida yuborish.
 * Range so'rovlarini (seek) ham qo'llab-quvvatlaydi.
 *
 * @returns {boolean} true — muvaffaqiyatli, false — MTProto mavjud emas / xato
 */
async function streamFileByMessage(chatId, msgId, req, res) {
  let client;
  try {
    client = await getClient();
  } catch (e) {
    console.error("MTProto client xatosi:", e.message);
    return false;
  }
  if (!client) return false;

  try {
    // Xabarni olish
    const messages = await client.getMessages(chatId, { ids: [parseInt(msgId)] });
    if (!messages?.length) return false;
    const msg = messages[0];
    if (!msg?.media) return false;

    // Media hajmini aniqlash
    const media = msg.media;
    const doc = media.document || media.photo || media.video;
    if (!doc) return false;

    const fileSize =
      typeof doc.size === "bigint"
        ? Number(doc.size)
        : Number(doc.size ?? 0);
    const mimeType = doc.mimeType || "video/mp4";

    // Range so'rovini tahlil qilish
    let start = 0;
    let end = fileSize > 0 ? fileSize - 1 : 0;
    const rangeHeader = req.headers.range;

    if (rangeHeader && fileSize > 0) {
      const m = rangeHeader.match(/bytes=(\d+)-(\d*)/);
      if (m) {
        start = parseInt(m[1]);
        end = m[2] ? parseInt(m[2]) : fileSize - 1;
      }
    }

    const chunkLen = end - start + 1;
    const isPartial = !!rangeHeader && fileSize > 0;

    // Agar chaqiruvchi (telegramFile.js) vaqt tugagani sababli allaqachon
    // Bot API orqali javob yuborgan bo'lsa — ikki marta yozmaslik uchun to'xtaymiz.
    if (res.headersSent || res.writableEnded) return false;

    res.status(isPartial ? 206 : 200);
    res.setHeader("Content-Type", mimeType);
    res.setHeader("Accept-Ranges", "bytes");
    if (fileSize > 0) {
      res.setHeader("Content-Length", chunkLen);
      if (isPartial) {
        res.setHeader("Content-Range", `bytes ${start}-${end}/${fileSize}`);
      }
    }

    // Faylni oqim (stream) sifatida yuborish
    // Eslatma: gramJS ichki offset uchun native BigInt emas, "big-integer"
    // kutubxonasining BigInteger obyektini kutadi (offset.add/.divide chaqiradi).
    const bigInt = require("big-integer");
    const CHUNK_SIZE = 512 * 1024; // 512 KB
    const startBig = bigInt(start);

    for await (const chunk of client.iterDownload({
      file: media,
      offset: startBig,
      limit: chunkLen || undefined,
      requestSize: CHUNK_SIZE,
    })) {
      if (req.destroyed || res.destroyed || res.writableEnded) break;
      res.write(chunk);
    }

    if (!res.writableEnded) res.end();
    return true;
  } catch (e) {
    console.error("MTProto stream xatosi:", e.message);
    return false;
  }
}

module.exports = { getClient, streamFileByMessage };
