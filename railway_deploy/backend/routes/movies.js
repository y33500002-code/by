const express = require("express");
const fs = require("fs");
const path = require("path");
const { shapeMovie, shapeComment } = require("../lib/shape");

const INSTANCE_DIR = process.env.INSTANCE_DIR || path.join(__dirname, "..", "..", "bots", "kino");
const COMMENTS_PATH = path.join(INSTANCE_DIR, "data", "comments.json");

/** In-place update of a single comment's likedBy list, preserving array order
 *  (db.js only exposes add/delete for comments, not a generic update). */
function updateCommentLike(code, commentId, userId) {
  if (!fs.existsSync(COMMENTS_PATH)) return null;
  const all = JSON.parse(fs.readFileSync(COMMENTS_PATH, "utf-8"));
  const c = code.toUpperCase();
  const list = all[c] || [];
  const comment = list.find((x) => x.id === commentId);
  if (!comment) return null;
  comment.likedBy = comment.likedBy || [];
  const idx = comment.likedBy.indexOf(userId);
  let liked;
  if (idx === -1) { comment.likedBy.push(userId); liked = true; }
  else { comment.likedBy.splice(idx, 1); liked = false; }
  fs.writeFileSync(COMMENTS_PATH, JSON.stringify(all, null, 2));
  return { liked, likes: comment.likedBy.length, ownerId: comment.userId };
}

module.exports = function moviesRouter(db, social) {
  const router = express.Router();

  function ctx(req) {
    return { db, social, userId: req.tgUser.id };
  }

  function allMovies() {
    return Object.values(db.getMovies());
  }

  router.get("/home", (req, res) => {
    const movies = allMovies().map((m) => shapeMovie(m, ctx(req)));
    if (!movies.length) {
      return res.json({ hero: null, trending: [], newMovies: [], continueWatching: [], popular: [], recommended: [], genres: [] });
    }
    const byViews = [...movies].sort((a, b) => b.views - a.views);
    const byDate = [...allMovies()].sort((a, b) => new Date(b.addedAt || 0) - new Date(a.addedAt || 0)).map((m) => shapeMovie(m, ctx(req)));
    const genres = [...new Set(allMovies().map((m) => m.genre).filter(Boolean))];

    const cw = social.getContinueWatching(req.tgUser.id).map((e) => {
      const m = db.getMovie(e.code);
      return m ? shapeMovie(m, ctx(req)) : null;
    }).filter(Boolean);

    res.json({
      hero: byViews[0],
      trending: byViews.slice(0, 10),
      newMovies: byDate.slice(0, 10),
      continueWatching: cw,
      popular: byViews.slice(0, 10),
      recommended: [...movies].sort(() => Math.random() - 0.5).slice(0, 10),
      genres,
    });
  });

  router.get("/genres", (req, res) => {
    res.json([...new Set(allMovies().map((m) => m.genre).filter(Boolean))]);
  });

  router.get("/", (req, res) => {
    const { genre } = req.query;
    let movies = allMovies();
    if (genre) movies = movies.filter((m) => (m.genre || "") === genre);
    res.json(movies.map((m) => shapeMovie(m, ctx(req))));
  });

  router.get("/:code", (req, res) => {
    const m = db.getMovie(req.params.code);
    if (!m) return res.status(404).json({ error: "Kino topilmadi" });
    res.json(shapeMovie(m, ctx(req)));
  });

  router.post("/:code/like", (req, res) => {
    const m = db.getMovie(req.params.code);
    if (!m) return res.status(404).json({ error: "Kino topilmadi" });
    const { liked, count } = db.toggleLike(req.tgUser.id, req.params.code);
    res.json({ liked, likes: count });
  });

  router.post("/:code/save", (req, res) => {
    const m = db.getMovie(req.params.code);
    if (!m) return res.status(404).json({ error: "Kino topilmadi" });
    const saved = social.toggleSave(req.tgUser.id, req.params.code);
    res.json({ saved });
  });

  router.post("/:code/watch", (req, res) => {
    const m = db.getMovie(req.params.code);
    if (!m) return res.status(404).json({ error: "Kino topilmadi" });
    const durationSec = (m.duration || 90) * 60;
    const progress = social.setWatchProgress(req.tgUser.id, req.params.code, req.body.position, durationSec);
    res.json({ ok: true, progress });
  });

  router.get("/:code/comments", (req, res) => {
    const list = db.getMovieComments(req.params.code);
    res.json(list.filter((c) => !c.deleted).map(shapeComment));
  });

  router.post("/:code/comments", (req, res) => {
    const m = db.getMovie(req.params.code);
    if (!m) return res.status(404).json({ error: "Kino topilmadi" });
    const text = (req.body.text || "").trim().slice(0, 500);
    if (!text) return res.status(400).json({ error: "Izoh matni bo'sh bo'lishi mumkin emas" });

    const isPremium = db.isPremium(req.tgUser.id);
    const dailyLimit = isPremium ? 50 : 8;
    const used = db.getUserDailyCommentCount(req.tgUser.id, req.params.code);
    if (used >= dailyLimit) {
      return res.status(429).json({ error: `Kunlik izoh limiti (${dailyLimit}) tugadi${isPremium ? "" : ", Premium bilan limit oshadi"}` });
    }

    const comment = {
      id: req.params.code + "-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7),
      userId: req.tgUser.id,
      userName: req.tgUser.name,
      premium: isPremium,
      text,
      replyTo: req.body.replyTo || null,
      date: new Date().toISOString().split("T")[0],
      createdAt: new Date().toISOString(),
      likedBy: [],
    };
    db.addComment(req.params.code, comment);
    res.json(shapeComment(comment));
  });

  router.post("/:code/comments/:commentId/like", (req, res) => {
    const result = updateCommentLike(req.params.code, req.params.commentId, req.tgUser.id);
    if (!result) return res.status(404).json({ error: "Izoh topilmadi" });
    if (result.liked && result.ownerId && result.ownerId !== req.tgUser.id) {
      social.pushNotification(result.ownerId, "like", `${req.tgUser.name} sizning izohingizni like qildi`);
    }
    res.json(result);
  });

  router.delete("/:code/comments/:commentId", (req, res) => {
    const list = db.getMovieComments(req.params.code);
    const c = list.find((x) => x.id === req.params.commentId);
    if (!c) return res.status(404).json({ error: "Izoh topilmadi" });
    const isOwner = c.userId === req.tgUser.id;
    if (!isOwner && !req.tgUser.isSupport) return res.status(403).json({ error: "Ruxsat yo'q" });
    db.deleteComment(req.params.code, req.params.commentId);
    res.json({ ok: true });
  });

  return router;
};
