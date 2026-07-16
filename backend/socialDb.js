/**
 * socialDb.js
 * -------------------------------------------------------------------------
 * Additive data store for the Mini App's social features (follow system,
 * saved movies, continue-watching progress, premium profile customization).
 *
 * IMPORTANT: this intentionally does NOT touch bots/kino/database.js or any
 * of its existing JSON files (movies/users/likes/comments/premium/...).
 * It writes brand-new JSON files into the SAME data directory (governed by
 * the same INSTANCE_DIR env var the bot already uses), so the Telegram bot
 * and the Mini App backend share one source of truth without any risk of
 * breaking the bot's existing behaviour.
 */
const fs = require("fs");
const path = require("path");

const INSTANCE_DIR = process.env.INSTANCE_DIR || path.join(__dirname, "..", "bots", "kino");
const DATA_DIR = path.join(INSTANCE_DIR, "data");

const PATHS = {
  saves: path.join(DATA_DIR, "saves.json"),
  follows: path.join(DATA_DIR, "follows.json"),
  watchProgress: path.join(DATA_DIR, "watchProgress.json"),
  premiumProfile: path.join(DATA_DIR, "premiumProfile.json"),
  activity: path.join(DATA_DIR, "activityNotifications.json"),
};

const DEFAULTS = {
  saves: {},           // { code: [userId, ...] }
  follows: {},         // { userId: { following: [userId,...], followers: [userId,...] } }
  watchProgress: {},   // { userId: { code: { position, duration, updatedAt } } }
  premiumProfile: {},  // { userId: { color, frame, badge } }
  activity: {},         // { userId: [ {id, type, text, createdAt, read} ] }
};

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}
function read(type) {
  try {
    if (!fs.existsSync(PATHS[type])) return JSON.parse(JSON.stringify(DEFAULTS[type]));
    return JSON.parse(fs.readFileSync(PATHS[type], "utf-8"));
  } catch (e) {
    return JSON.parse(JSON.stringify(DEFAULTS[type]));
  }
}
function write(type, data) {
  ensureDir();
  fs.writeFileSync(PATHS[type], JSON.stringify(data, null, 2));
}

// ─── SAVES (bookmark a movie) ───
function isSaved(userId, code) {
  const s = read("saves")[code.toUpperCase()] || [];
  return s.includes(String(userId));
}
function toggleSave(userId, code) {
  const saves = read("saves");
  const c = code.toUpperCase();
  const id = String(userId);
  if (!saves[c]) saves[c] = [];
  const idx = saves[c].indexOf(id);
  let saved;
  if (idx === -1) { saves[c].push(id); saved = true; }
  else { saves[c].splice(idx, 1); saved = false; }
  write("saves", saves);
  return saved;
}
function getUserSavedMovies(userId) {
  const saves = read("saves");
  const id = String(userId);
  return Object.keys(saves).filter((code) => saves[code].includes(id));
}

// ─── FOLLOW SYSTEM ───
function ensureFollowEntry(follows, id) {
  if (!follows[id]) follows[id] = { following: [], followers: [] };
  return follows[id];
}
function isFollowing(userId, targetId) {
  const follows = read("follows");
  const me = follows[String(userId)];
  return !!me && me.following.includes(String(targetId));
}
function toggleFollow(userId, targetId) {
  if (String(userId) === String(targetId)) return { following: false, reason: "self" };
  const follows = read("follows");
  const a = ensureFollowEntry(follows, String(userId));
  const b = ensureFollowEntry(follows, String(targetId));
  const idx = a.following.indexOf(String(targetId));
  let following;
  if (idx === -1) {
    a.following.push(String(targetId));
    b.followers.push(String(userId));
    following = true;
  } else {
    a.following.splice(idx, 1);
    const fidx = b.followers.indexOf(String(userId));
    if (fidx !== -1) b.followers.splice(fidx, 1);
    following = false;
  }
  write("follows", follows);
  return { following };
}
function getFollowCounts(userId) {
  const e = read("follows")[String(userId)] || { following: [], followers: [] };
  return { followers: e.followers.length, following: e.following.length };
}
function getFollowers(userId) {
  return (read("follows")[String(userId)] || { followers: [] }).followers;
}
function getFollowing(userId) {
  return (read("follows")[String(userId)] || { following: [] }).following;
}

// ─── WATCH PROGRESS / CONTINUE WATCHING ───
function setWatchProgress(userId, code, position, duration) {
  const wp = read("watchProgress");
  const id = String(userId);
  const c = code.toUpperCase();
  if (!wp[id]) wp[id] = {};
  wp[id][c] = { position: Math.max(0, Math.floor(position || 0)), duration: Math.floor(duration || 0), updatedAt: new Date().toISOString() };
  write("watchProgress", wp);
  return wp[id][c];
}
function getWatchProgress(userId, code) {
  const wp = read("watchProgress");
  return wp[String(userId)]?.[code.toUpperCase()] || null;
}
function getUserWatchHistory(userId) {
  const wp = read("watchProgress");
  const entries = wp[String(userId)] || {};
  return Object.entries(entries)
    .map(([code, v]) => ({ code, ...v }))
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}
function getContinueWatching(userId, maxAgeDays = 60) {
  return getUserWatchHistory(userId).filter((e) => {
    if (!e.duration) return e.position > 0;
    const pct = e.position / e.duration;
    return pct > 0.02 && pct < 0.95;
  });
}

// ─── LEVEL SYSTEM (derived, no separate storage needed) ───
const LEVELS = [
  { name: "Bronze", min: 0 },
  { name: "Silver", min: 10 },
  { name: "Gold", min: 30 },
  { name: "Diamond", min: 60 },
];
function computeLevel(userId) {
  const watchedCount = getUserWatchHistory(userId).length;
  let current = LEVELS[0];
  let next = LEVELS[1];
  for (let i = 0; i < LEVELS.length; i++) {
    if (watchedCount >= LEVELS[i].min) {
      current = LEVELS[i];
      next = LEVELS[i + 1] || null;
    }
  }
  const progress = next
    ? Math.min(100, Math.round(((watchedCount - current.min) / (next.min - current.min)) * 100))
    : 100;
  return { level: current.name, levelProgress: progress, watchedCount };
}

// ─── PREMIUM PROFILE CUSTOMIZATION ───
function getPremiumProfile(userId) {
  return read("premiumProfile")[String(userId)] || { color: "#8B5CF6", frame: "none", badge: true, banner: null };
}
function setPremiumProfile(userId, fields) {
  const p = read("premiumProfile");
  const id = String(userId);
  p[id] = { ...getPremiumProfile(id), ...fields };
  write("premiumProfile", p);
  return p[id];
}

// ─── ACTIVITY NOTIFICATIONS (follow / comment-like / gift events) ───
const NOTIF_ICON = { follow: "follow", like: "like", comment: "comment", gift: "gift" };
function pushNotification(userId, type, text) {
  const store = read("activity");
  const id = String(userId);
  if (!store[id]) store[id] = [];
  store[id].unshift({ id: Date.now() + "-" + Math.random().toString(36).slice(2, 6), type: NOTIF_ICON[type] || type, text, createdAt: new Date().toISOString(), read: false });
  store[id] = store[id].slice(0, 50);
  write("activity", store);
}
function getNotifications(userId) {
  return read("activity")[String(userId)] || [];
}
function markNotificationsRead(userId) {
  const store = read("activity");
  const id = String(userId);
  if (store[id]) store[id].forEach((n) => (n.read = true));
  write("activity", store);
}

module.exports = {
  isSaved, toggleSave, getUserSavedMovies,
  isFollowing, toggleFollow, getFollowCounts, getFollowers, getFollowing,
  setWatchProgress, getWatchProgress, getUserWatchHistory, getContinueWatching,
  computeLevel,
  getPremiumProfile, setPremiumProfile,
  pushNotification, getNotifications, markNotificationsRead,
};
