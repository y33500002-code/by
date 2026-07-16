const db = require("./database");

// Telegram avtomatik ravishda video xabarlarga kichik thumbnail (JPEG) biriktiradi —
// bu poster/prevyu uchun alohida fayl talab qilmasdan tayyor rasm beradi.
function autoThumbFileId(msg) {
  return msg?.video?.thumbnail?.file_id || msg?.video?.thumb?.file_id || null;
}

class MovieManager {
  get(code) {
    return db.getMovie(code);
  }

  add(code, name, description, fileId, fileType, extra = {}) {
    db.saveMovie(code, {
      code: code.toUpperCase(),
      name,
      description,
      fileId: fileId || null,
      fileType: fileType || null,
      poster: extra.poster || null,
      previewFileId: extra.previewFileId || null,
      type: extra.type || "movie",
      genre: extra.genre || null,
      season: extra.season || null,
      episode: extra.episode || null,
      addedAt: new Date().toISOString(),
      // ─── MTProto uchun: kino yuklab olingan xabar ma'lumoti ───
      chatId: extra.chatId || null,     // admin videoni yuborgan chat
      msgId: extra.msgId || null,       // asosiy video xabar ID si
      previewChatId: extra.previewChatId || null,  // reel prevyu chat
      previewMsgId: extra.previewMsgId || null,    // reel prevyu xabar ID si
    });
  }

  // Mavjud kinoning bitta maydonini to'ldirish / almashtirish
  update(code, patch) {
    const movie = db.getMovie(code);
    if (!movie) return null;
    const updated = { ...movie, ...patch };
    db.saveMovie(code, updated);
    return updated;
  }

  // Kino "to'liq"mi — asosiy video yuklanganmi
  isComplete(movie) {
    return !!movie?.fileId;
  }

  missingParts(movie) {
    const missing = [];
    if (!movie?.poster) missing.push("poster");
    if (!movie?.fileId) missing.push("video");
    if (!movie?.previewFileId) missing.push("reel");
    return missing;
  }

  delete(code) {
    if (!db.getMovie(code)) return false;
    db.deleteMovie(code);
    return true;
  }

  getAll() {
    return db.getMovies();
  }

  isSerial(code) {
    return /^S\d+E\d+/i.test(code);
  }
}

module.exports = MovieManager;
module.exports.autoThumbFileId = autoThumbFileId;
