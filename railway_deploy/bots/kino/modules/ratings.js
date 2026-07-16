const db = require("../database");

function setRating(userId, code, stars) {
  if (stars < 1 || stars > 5) return null;
  return db.setRating(userId, code, stars);
}

function getUserRating(userId, code) {
  return db.getUserRating(userId, code);
}

function getMovieRating(code) {
  return db.getMovieRatingAvg(code);
}

function formatRating(code) {
  const { avg, count } = getMovieRating(code);
  if (count === 0) return "⭐️ Hali baholanmagan";
  const stars = "⭐️".repeat(Math.round(avg));
  return `⭐️ ${avg} (${count} baho)`;
}

module.exports = { setRating, getUserRating, getMovieRating, formatRating };
