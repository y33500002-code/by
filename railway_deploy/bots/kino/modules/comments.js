const db = require("../database");
const crypto = require("crypto");
const uuidv4 = () => crypto.randomUUID();

const SPAM_PATTERNS = [
  /https?:\/\//i,
  /t\.me\//i,
  /telegram\.me\//i,
  /\binstagram\.com\b/i,
  /\byoutube\.com\b/i,
  /\byoutu\.be\b/i,
  /\@[\w]+/,
];

const MAX_DAILY_COMMENTS = 1;
const MAX_DAILY_COMMENTS_PREMIUM = 2;
const MAX_COMMENT_LENGTH = 500;

function getMaxDailyComments(isPrem) {
  return isPrem ? MAX_DAILY_COMMENTS_PREMIUM : MAX_DAILY_COMMENTS;
}

function hasSpam(text) {
  return SPAM_PATTERNS.some(p => p.test(text));
}

function getComments(code) {
  return db.getMovieComments(code);
}

function addComment(userId, username, code, text, isPrem = false) {
  if (!text || text.trim().length === 0)
    return { ok: false, reason: "Bo'sh izoh yuborib bo'lmaydi." };

  if (text.length > MAX_COMMENT_LENGTH)
    return { ok: false, reason: `Izoh ${MAX_COMMENT_LENGTH} belgidan oshmasligi kerak.` };

  if (hasSpam(text))
    return { ok: false, reason: "Izohda reklama yoki havola topildi. Izoh o'chirildi." };

  const maxDaily = getMaxDailyComments(isPrem);
  const dailyCount = db.getUserTodayCommentCount(userId);
  if (dailyCount >= maxDaily)
    return { ok: false, reason: `Kuniga faqat ${maxDaily} ta izoh yozish mumkin.${!isPrem ? " (Premium 2 ta yozadi)" : ""}` };

  const today = new Date().toISOString().split("T")[0];
  const comment = {
    id: uuidv4(),
    userId: String(userId),
    username: username || "Anonim",
    text: text.trim(),
    date: today,
    createdAt: new Date().toISOString(),
  };

  db.addComment(code, comment);
  return { ok: true, comment };
}

function deleteComment(code, commentId) {
  return db.deleteComment(code, commentId);
}

function formatComments(code) {
  const list = getComments(code);
  if (!list.length) return "💬 Hali izoh yo'q. Birinchi bo'ling!";
  return list.slice(-20).map((c, i) =>
    `${i + 1}. 👤 ${c.username}${db.isPremium(c.userId) ? " 👑" : ""}: ${c.text}`
  ).join("\n");
}

module.exports = { getComments, addComment, deleteComment, formatComments, hasSpam, MAX_DAILY_COMMENTS, MAX_DAILY_COMMENTS_PREMIUM, getMaxDailyComments };
