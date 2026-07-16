const fs = require("fs");
const path = require("path");

const INSTANCE_DIR = process.env.INSTANCE_DIR || __dirname;
const DATA_DIR = path.join(INSTANCE_DIR, "data");

// Backup moduli — kinolar yo'qolmasin deb Telegram kanaliga saqlaydi
// (circular-dependency bo'lmasin deb lazy import ishlatamiz)
let _backup = null;
function getBackup() {
  if (!_backup) {
    try { _backup = require("./backup"); } catch (_) { _backup = { scheduleBackup: () => {} }; }
  }
  return _backup;
}

const PATHS = {
  movies:        path.join(DATA_DIR, "movies.json"),
  users:         path.join(DATA_DIR, "users.json"),
  settings:      path.join(DATA_DIR, "settings.json"),
  views:         path.join(DATA_DIR, "views.json"),
  likes:         path.join(DATA_DIR, "likes.json"),
  ratings:       path.join(DATA_DIR, "ratings.json"),
  comments:      path.join(DATA_DIR, "comments.json"),
  coin:          path.join(DATA_DIR, "coin.json"),
  premium:       path.join(DATA_DIR, "premium.json"),
  referral:      path.join(DATA_DIR, "referral.json"),
  notifications: path.join(DATA_DIR, "notifications.json"),
  promos:        path.join(DATA_DIR, "promos.json"),
};

const DEFAULTS = {
  movies:        {},
  users:         {},
  settings: {
    channels: [], admins: [], supports: [], ownerId: null,
    coinSettings: { daily: 3, referral: 10, comment: 2 },
    premiumPrices: { "1m": 10000, "3m": 25000, "6m": 45000, "1y": 80000 },
    premiumDiscount: { "3m": 0, "6m": 0, "1y": 0 },
    premiumBonusCoin: 50,
    referralPremiumBonus: 30,
    paymentCard: null,
  },
  views:         {},
  likes:         {},
  ratings:       {},
  comments:      {},
  coin:          {},
  premium:       { users: {}, pending: [] },
  referral:      {},
  notifications: {},
  promos:        {},
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

// ─── MOVIES ───
function getMovies()           { return read("movies"); }
function getMovie(code)        { return read("movies")[code.toUpperCase()] || null; }
function saveMovie(code, data) {
  const movies = read("movies");
  movies[code.toUpperCase()] = data;
  write("movies", movies);
  // Backup rejalashtirish (30 sek debounce bilan)
  getBackup().scheduleBackup(() => read("movies"));
}
function deleteMovie(code) {
  const movies = read("movies");
  delete movies[code.toUpperCase()];
  write("movies", movies);
  // Backup rejalashtirish
  getBackup().scheduleBackup(() => read("movies"));
}

// ─── USERS ───
function getUsers()        { return read("users"); }
function getUser(userId)   { return read("users")[String(userId)] || null; }
function addUser(userId, name) {
  const users = read("users");
  const id = String(userId);
  const today = new Date().toISOString().split("T")[0];
  if (!users[id]) {
    users[id] = { id, name, joinedAt: today, lastSeen: today };
    write("users", users);
    return true;
  }
  users[id].lastSeen = today;
  if (name) users[id].name = name;
  write("users", users);
  return false;
}
function updateUser(userId, fields) {
  const users = read("users");
  const id = String(userId);
  if (!users[id]) return;
  Object.assign(users[id], fields);
  write("users", users);
}
function markLeft(userId) {
  const users = read("users");
  if (users[String(userId)]) {
    users[String(userId)].leftAt = new Date().toISOString().split("T")[0];
    write("users", users);
  }
}

// ─── SETTINGS ───
function getSettings()       { return read("settings"); }
function saveSettings(data)  { write("settings", data); }

// ─── VIEWS ───
function getViews()              { return read("views"); }
function getViewCount(code)      { return (read("views")[code.toUpperCase()] || 0); }
function incrementView(code)     {
  const v = read("views");
  const c = code.toUpperCase();
  v[c] = (v[c] || 0) + 1;
  write("views", v);
  return v[c];
}

// ─── LIKES ───
function getLikes()                   { return read("likes"); }
function getLikeList(code)            { return read("likes")[code.toUpperCase()] || []; }
function getLikeCount(code)           { return getLikeList(code).length; }
function isLiked(userId, code)        { return getLikeList(code).includes(String(userId)); }
function toggleLike(userId, code) {
  const likes = read("likes");
  const c = code.toUpperCase();
  const id = String(userId);
  if (!likes[c]) likes[c] = [];
  const idx = likes[c].indexOf(id);
  let liked;
  if (idx === -1) { likes[c].push(id); liked = true; }
  else            { likes[c].splice(idx, 1); liked = false; }
  write("likes", likes);
  return { liked, count: likes[c].length };
}
function getUserLikedMovies(userId) {
  const likes = read("likes");
  const id = String(userId);
  return Object.keys(likes).filter(code => likes[code].includes(id));
}

// ─── RATINGS ───
function getRatings()                     { return read("ratings"); }
function getMovieRatings(code)            { return read("ratings")[code.toUpperCase()] || {}; }
function getUserRating(userId, code)      { return (getMovieRatings(code))[String(userId)] || null; }
function setRating(userId, code, stars) {
  const ratings = read("ratings");
  const c = code.toUpperCase();
  if (!ratings[c]) ratings[c] = {};
  ratings[c][String(userId)] = stars;
  write("ratings", ratings);
  const vals = Object.values(ratings[c]);
  const avg = vals.length ? (vals.reduce((a,b) => a+b, 0) / vals.length) : 0;
  return { avg: Math.round(avg * 10) / 10, count: vals.length };
}
function getMovieRatingAvg(code) {
  const vals = Object.values(getMovieRatings(code));
  if (!vals.length) return { avg: 0, count: 0 };
  const avg = vals.reduce((a,b) => a+b, 0) / vals.length;
  return { avg: Math.round(avg * 10) / 10, count: vals.length };
}

// ─── COMMENTS ───
function getComments()                { return read("comments"); }
function getMovieComments(code)       { return (read("comments")[code.toUpperCase()] || []); }
function addComment(code, comment) {
  const comments = read("comments");
  const c = code.toUpperCase();
  if (!comments[c]) comments[c] = [];
  comments[c].push(comment);
  write("comments", comments);
}
function deleteComment(code, commentId) {
  const comments = read("comments");
  const c = code.toUpperCase();
  if (!comments[c]) return false;
  const idx = comments[c].findIndex(cm => cm.id === commentId);
  if (idx === -1) return false;
  comments[c].splice(idx, 1);
  write("comments", comments);
  return true;
}
function getUserDailyCommentCount(userId, code) {
  const today = new Date().toISOString().split("T")[0];
  const comments = read("comments");
  const c = code.toUpperCase();
  if (!comments[c]) return 0;
  return comments[c].filter(cm => String(cm.userId) === String(userId) && cm.date === today).length;
}
function getUserTodayCommentCount(userId) {
  const today = new Date().toISOString().split("T")[0];
  const comments = read("comments");
  let count = 0;
  for (const code of Object.keys(comments)) {
    count += comments[code].filter(cm => String(cm.userId) === String(userId) && cm.date === today).length;
  }
  return count;
}

// ─── COIN ───
function getCoin()                    { return read("coin"); }
function getUserCoin(userId)          { return read("coin")[String(userId)] || { balance: 0, lastDaily: null }; }
function saveCoin(userId, data)       {
  const coin = read("coin");
  coin[String(userId)] = data;
  write("coin", coin);
}
function addCoins(userId, amount) {
  const coin = read("coin");
  const id = String(userId);
  if (!coin[id]) coin[id] = { balance: 0, lastDaily: null };
  coin[id].balance = (coin[id].balance || 0) + amount;
  write("coin", coin);
  return coin[id].balance;
}
function removeCoins(userId, amount) {
  const coin = read("coin");
  const id = String(userId);
  if (!coin[id]) coin[id] = { balance: 0, lastDaily: null };
  coin[id].balance = Math.max(0, (coin[id].balance || 0) - amount);
  write("coin", coin);
  return coin[id].balance;
}
function setLastDaily(userId) {
  const coin = read("coin");
  const id = String(userId);
  const today = new Date().toISOString().split("T")[0];
  if (!coin[id]) coin[id] = { balance: 0, lastDaily: null };
  coin[id].lastDaily = today;
  write("coin", coin);
}

// ─── PROMO CODES ───
function getPromos()          { return read("promos"); }
function getPromo(code)       { return read("promos")[String(code).trim().toUpperCase()] || null; }
function savePromo(code, promo) {
  const promos = read("promos");
  promos[String(code).trim().toUpperCase()] = promo;
  write("promos", promos);
}
function deletePromo(code) {
  const promos = read("promos");
  const key = String(code).trim().toUpperCase();
  if (!promos[key]) return false;
  delete promos[key];
  write("promos", promos);
  return true;
}
/**
 * Foydalanuvchi tomonidan promokodni faollashtirish.
 * Promo formati:
 *   { type: "coin"|"premium"|"both", coins: N, days: N, limit: N, usedBy: [], usedCount: N, expiry: ISO|null }
 * Muvaffaqiyatda { ok, coins, days, type } qaytaradi — chaqiruvchi
 * coin va premium berishni amalga oshiradi.
 */
function usePromo(code, userId) {
  const key = String(code).trim().toUpperCase();
  const promos = read("promos");
  const promo = promos[key];
  if (!promo) return { ok: false, reason: "Promokod topilmadi yoki mavjud emas" };
  if (promo.expiry && new Date(promo.expiry) < new Date()) {
    return { ok: false, reason: "Promokod muddati tugagan" };
  }
  const limit = promo.limit ?? promo.maxUses ?? null;
  if (limit !== null && (promo.usedCount || 0) >= limit) {
    return { ok: false, reason: "Promokod faollashtirish limiti tugagan" };
  }
  const uid = String(userId);
  if (!promo.usedBy) promo.usedBy = [];
  if (promo.usedBy.includes(uid)) {
    return { ok: false, reason: "Siz bu promokodni allaqachon ishlatgansiz" };
  }
  promo.usedBy.push(uid);
  promo.usedCount = (promo.usedCount || 0) + 1;
  write("promos", promos);
  // Yangi format (type/coins/days) va eski format (gift/giftType) ni qo'llab-quvvatlash
  const type = promo.type || (promo.giftType === "premium" ? "premium" : "coin");
  const coins = Number(promo.coins ?? (type === "coin" || type === "both" ? promo.gift : 0)) || 0;
  const days  = Number(promo.days ?? 0) || 0;
  return { ok: true, type, coins, days };
}

/** Foydalanuvchi foydalangan promokodlar ro'yxatini qaytaradi */
function getUserUsedPromos(userId) {
  const uid = String(userId);
  const promos = read("promos");
  return Object.entries(promos)
    .filter(([, p]) => (p.usedBy || []).includes(uid))
    .map(([code]) => code);
}

// ─── PREMIUM ───
function getPremiumData()         { return read("premium"); }
function isPremium(userId) {
  const d = read("premium");
  const u = d.users?.[String(userId)];
  if (!u) return false;
  return new Date(u.expiresAt) > new Date();
}
function getPremiumInfo(userId) {
  const d = read("premium");
  return d.users?.[String(userId)] || null;
}
function setPremium(userId, plan, months) {
  const d = read("premium");
  if (!d.users) d.users = {};
  const now = new Date();
  now.setMonth(now.getMonth() + months);
  d.users[String(userId)] = { plan, expiresAt: now.toISOString(), activatedAt: new Date().toISOString() };
  write("premium", d);
}
function removePremium(userId) {
  const d = read("premium");
  if (d.users) delete d.users[String(userId)];
  write("premium", d);
}
function addPendingPayment(request) {
  const d = read("premium");
  if (!d.pending) d.pending = [];
  d.pending.push(request);
  write("premium", d);
}
function getPendingPayments()     { return (read("premium").pending || []); }
function removePendingPayment(userId) {
  const d = read("premium");
  if (!d.pending) d.pending = [];
  d.pending = d.pending.filter(p => String(p.userId) !== String(userId));
  write("premium", d);
}
function getAllPremiumUsers() {
  const d = read("premium");
  return d.users || {};
}

// ─── REFERRAL ───
function getReferral()                { return read("referral"); }
function getUserReferral(userId)      { return read("referral")[String(userId)] || { referredBy: null, referrals: [], level2: [] }; }
function saveReferral(userId, data) {
  const ref = read("referral");
  ref[String(userId)] = data;
  write("referral", ref);
}

// ─── NOTIFICATIONS ───
function getNotifications()           { return read("notifications"); }
function getUserNotifications(userId) { return read("notifications")[String(userId)] || []; }
function saveNotifications(userId, genres) {
  const n = read("notifications");
  n[String(userId)] = genres;
  write("notifications", n);
}

// ─── STATS ───
function getStats() {
  const users = read("users");
  const movies = read("movies");
  const today = new Date().toISOString().split("T")[0];
  let joinedToday = 0, leftToday = 0;
  for (const u of Object.values(users)) {
    if (u.joinedAt === today) joinedToday++;
    if (u.leftAt === today) leftToday++;
  }
  return {
    totalUsers: Object.keys(users).length,
    totalMovies: Object.keys(movies).length,
    joinedToday,
    leftToday,
  };
}

module.exports = {
  // movies
  getMovies, getMovie, saveMovie, deleteMovie,
  // users
  getUsers, getUser, addUser, updateUser, markLeft,
  // settings
  getSettings, saveSettings,
  // views
  getViews, getViewCount, incrementView,
  // likes
  getLikes, getLikeList, getLikeCount, isLiked, toggleLike, getUserLikedMovies,
  // ratings
  getRatings, getMovieRatings, getUserRating, setRating, getMovieRatingAvg,
  // comments
  getComments, getMovieComments, addComment, deleteComment, getUserDailyCommentCount, getUserTodayCommentCount,
  // coin
  getCoin, getUserCoin, saveCoin, addCoins, removeCoins, setLastDaily,
  // promo codes
  getPromos, getPromo, savePromo, deletePromo, usePromo, getUserUsedPromos,
  // premium
  getPremiumData, isPremium, getPremiumInfo, setPremium, removePremium,
  addPendingPayment, getPendingPayments, removePendingPayment, getAllPremiumUsers,
  // referral
  getReferral, getUserReferral, saveReferral,
  // notifications
  getNotifications, getUserNotifications, saveNotifications,
  // stats
  getStats,
};
