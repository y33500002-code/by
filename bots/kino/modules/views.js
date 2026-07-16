const db = require("../database");

function incrementView(code) {
  return db.incrementView(code);
}

function getViewCount(code) {
  return db.getViewCount(code);
}

function getTopByViews(n = 10) {
  const views = db.getViews();
  const movies = db.getMovies();
  return Object.entries(views)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([code, count]) => ({
      code,
      name: movies[code]?.name || code,
      views: count,
    }));
}

module.exports = { incrementView, getViewCount, getTopByViews };
