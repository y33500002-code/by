const db = require("../database");

function getSubscribedGenres(userId) {
  return db.getUserNotifications(userId);
}

function subscribe(userId, genre) {
  const genres = db.getUserNotifications(userId);
  if (!genres.includes(genre)) {
    genres.push(genre);
    db.saveNotifications(userId, genres);
    return true;
  }
  return false;
}

function unsubscribe(userId, genre) {
  let genres = db.getUserNotifications(userId);
  const prev = genres.length;
  genres = genres.filter(g => g !== genre);
  db.saveNotifications(userId, genres);
  return genres.length < prev;
}

function toggleSubscription(userId, genre) {
  const genres = db.getUserNotifications(userId);
  if (genres.includes(genre)) {
    unsubscribe(userId, genre);
    return false;
  } else {
    subscribe(userId, genre);
    return true;
  }
}

function isSubscribed(userId, genre) {
  return db.getUserNotifications(userId).includes(genre);
}

function getSubscribersForGenre(genre) {
  const all = db.getNotifications();
  return Object.entries(all)
    .filter(([, genres]) => genres.includes(genre))
    .map(([userId]) => userId);
}

function getAllGenres() {
  const movies = db.getMovies();
  const genres = new Set();
  for (const m of Object.values(movies)) {
    if (m.genre) genres.add(m.genre);
  }
  return [...genres];
}

module.exports = {
  getSubscribedGenres, subscribe, unsubscribe, toggleSubscription,
  isSubscribed, getSubscribersForGenre, getAllGenres,
};
