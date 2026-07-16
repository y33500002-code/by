const PLACEHOLDER_POSTER =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='400' height='560'><rect width='100%' height='100%' fill='#17161F'/><text x='50%' y='50%' fill='#7C7A87' font-family='sans-serif' font-size='22' text-anchor='middle'>Poster yo'q</text></svg>`
  );

// Artifakt proxy ostida (masalan "/kino-app") ishga tushirilganda, frontendga
// qaytariladigan media URL'lar ham shu prefiks bilan boshlanishi kerak —
// aks holda brauzer to'g'ridan-to'g'ri "/api/..." ga (boshqa xizmatga) so'rov yuboradi.
const BASE_PATH = (process.env.BASE_PATH || "").replace(/\/$/, "");

function posterUrl(movie) {
  return movie.poster ? `${BASE_PATH}/api/media/poster/${encodeURIComponent(movie.poster)}` : PLACEHOLDER_POSTER;
}

// chatId + msgId bo'lsa MTProto uchun parametr qo'shamiz (katta fayllar uchun)
function buildMediaUrl(fileId, chatId, msgId) {
  if (!fileId) return null;
  const base = `${BASE_PATH}/api/media/video/${encodeURIComponent(fileId)}`;
  if (chatId && msgId) {
    return `${base}?chatId=${encodeURIComponent(chatId)}&msgId=${encodeURIComponent(msgId)}`;
  }
  return base;
}

function previewUrl(movie) {
  const id = movie.previewFileId || movie.fileId;
  if (!id) return null;
  // Preview uchun previewChatId/previewMsgId, yo'q bo'lsa asosiy chatId/msgId
  const cId = movie.previewChatId || movie.chatId;
  const mId = movie.previewMsgId || movie.msgId;
  return buildMediaUrl(id, cId, mId);
}

function videoUrl(movie) {
  return buildMediaUrl(movie.fileId, movie.chatId, movie.msgId);
}

/** Shapes a raw db movie record (code/name/...) into the frontend's Movie shape. */
function shapeMovie(movie, ctx) {
  const { db, social, userId } = ctx;
  const code = movie.code;
  const { avg, count: ratingCount } = db.getMovieRatingAvg(code);
  const views = db.getViewCount(code);
  const likeCount = db.getLikeCount(code);
  const progress = userId ? social.getWatchProgress(userId, code) : null;
  const durationMin = movie.duration || 90;

  return {
    id: code,
    title: movie.name,
    poster: posterUrl(movie),
    previewVideo: previewUrl(movie),
    videoUrl: videoUrl(movie),
    description: movie.description || "",
    genre: movie.genre || "Aralash",
    country: movie.country || "Noma'lum",
    year: movie.year || new Date(movie.addedAt || Date.now()).getFullYear(),
    duration: durationMin,
    language: movie.language || "O'zbek tili",
    quality: movie.quality || "HD",
    views,
    likes: likeCount,
    rating: ratingCount > 0 ? avg : 0,
    liked: userId ? db.isLiked(userId, code) : false,
    saved: userId ? social.isSaved(userId, code) : false,
    progress: progress && progress.duration ? Math.round((progress.position / progress.duration) * 100) : 0,
  };
}

function shapeComment(c) {
  return {
    id: c.id,
    user: { id: c.userId, name: c.userName, premium: !!c.premium },
    text: c.text,
    likes: (c.likedBy || []).length,
    liked: false,
    time: timeAgo(c.createdAt),
    replies: c.replies || [],
  };
}

function timeAgo(iso) {
  if (!iso) return "";
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "hozir";
  if (min < 60) return `${min} daqiqa oldin`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} soat oldin`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} kun oldin`;
  return new Date(iso).toLocaleDateString("uz-UZ");
}

function shapeUser(uid, db, social, viewerId) {
  const raw = db.getUser(uid) || { id: uid, name: "Foydalanuvchi" };
  const premiumInfo = db.getPremiumInfo(uid);
  const isPremium = db.isPremium(uid);
  const profile = social.getPremiumProfile(uid);
  const counts = social.getFollowCounts(uid);
  const { level, levelProgress } = social.computeLevel(uid);
  const coin = db.getUserCoin(uid);
  const savedMovies = social.getUserSavedMovies(uid);
  const likedMovies = db.getUserLikedMovies(uid);
  const history = social.getUserWatchHistory(uid);

  return {
    id: uid,
    name: raw.name || "Foydalanuvchi",
    username: raw.username ? "@" + raw.username : "",
    avatar: profile.avatar || null,
    premium: isPremium,
    premiumColor: isPremium ? profile.color : null,
    frame: isPremium ? profile.frame : "none",
    isAdmin: false,
    followers: counts.followers,
    following: counts.following,
    level,
    levelProgress,
    coins: coin.balance || 0,
    savedMovies: savedMovies.length,
    likedMovies: likedMovies.length,
    watchHistory: history.length,
    isFollowing: viewerId ? social.isFollowing(viewerId, uid) : false,
  };
}

module.exports = { shapeMovie, shapeComment, shapeUser, posterUrl, previewUrl, timeAgo };
