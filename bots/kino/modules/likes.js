const db = require("../database");

function toggleLike(userId, code) {
  return db.toggleLike(userId, code);
}

function isLiked(userId, code) {
  return db.isLiked(userId, code);
}

function getLikeCount(code) {
  return db.getLikeCount(code);
}

function getUserLikedMovies(userId) {
  return db.getUserLikedMovies(userId);
}

module.exports = { toggleLike, isLiked, getLikeCount, getUserLikedMovies };
