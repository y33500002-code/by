const express = require("express");
const { shapeMovie } = require("../lib/shape");

module.exports = function reelsRouter(db, social) {
  const router = express.Router();

  router.get("/", (req, res) => {
    const cursor = Number(req.query.cursor) || 0;
    const pageSize = 6;
    // Reels needs some playable video — a dedicated prevyu if one was
    // uploaded, otherwise the movie's own file (shape.js falls back to it
    // automatically). Movies with no video at all can't be a reel.
    const source = Object.values(db.getMovies()).filter((m) => m.previewFileId || m.fileId);
    const slice = source.slice(cursor, cursor + pageSize);

    const following = social.getFollowing(req.tgUser.id);
    const items = slice.map((m) => {
      const shaped = shapeMovie(m, { db, social, userId: req.tgUser.id });
      const likeList = db.getLikeList(m.code);
      const friendId = likeList.find((uid) => following.includes(uid) && uid !== req.tgUser.id);
      let friendActivity = null;
      if (friendId) {
        const u = db.getUser(friendId);
        friendActivity = { name: u?.name || "Do'stingiz", action: "liked" };
      }
      return { ...shaped, reelViews: shaped.views, friendActivity };
    });

    res.json({ items, nextCursor: cursor + pageSize < source.length ? cursor + pageSize : null });
  });

  router.post("/:code/like", (req, res) => {
    // Shares the exact same like state as the movie page (one "like" per
    // user per movie, visible everywhere) — same pattern as save below.
    const { liked, count } = db.toggleLike(req.tgUser.id, req.params.code);
    res.json({ liked, likes: count });
  });

  router.post("/:code/save", (req, res) => {
    const active = social.toggleSave(req.tgUser.id, req.params.code);
    res.json({ saved: active });
  });

  router.post("/:code/share", (req, res) => {
    res.json({ ok: true });
  });

  return router;
};
