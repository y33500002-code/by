const express = require("express");
const { shapeMovie, shapeUser } = require("../lib/shape");

module.exports = function searchRouter(db, social) {
  const router = express.Router();

  router.get("/", (req, res) => {
    const q = String(req.query.q || "").trim().toLowerCase();
    const type = req.query.type || "all";
    if (!q) return res.json({ movies: [], users: [] });

    let movies = [];
    if (type === "all" || type === "movies") {
      movies = Object.values(db.getMovies())
        .filter((m) => (m.name || "").toLowerCase().includes(q) || (m.code || "").toLowerCase().includes(q) || (m.genre || "").toLowerCase().includes(q))
        .slice(0, 24)
        .map((m) => shapeMovie(m, { db, social, userId: req.tgUser.id }));
    }

    let users = [];
    if (type === "all" || type === "users") {
      const all = db.getUsers();
      users = Object.keys(all)
        .filter((uid) => (all[uid].name || "").toLowerCase().includes(q))
        .slice(0, 24)
        .map((uid) => shapeUser(uid, db, social, req.tgUser.id));
    }

    res.json({ movies, users });
  });

  return router;
};
