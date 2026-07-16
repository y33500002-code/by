const express = require("express");
const { shapeUser } = require("../lib/shape");

module.exports = function usersRouter(db, social) {
  const router = express.Router();

  router.get("/me", (req, res) => {
    const u = shapeUser(req.tgUser.id, db, social, req.tgUser.id);
    u.isAdmin = req.tgUser.isSupport;
    res.json(u);
  });

  router.patch("/me", (req, res) => {
    const { premiumColor, frame, badge, banner, avatar } = req.body || {};
    const isPremium = db.isPremium(req.tgUser.id);

    // Avatar can be updated by everyone (free + premium)
    if (avatar !== undefined) {
      social.setPremiumProfile(req.tgUser.id, { avatar: avatar || null });
    }

    // Premium-only fields
    if (premiumColor !== undefined || frame !== undefined || badge !== undefined || banner !== undefined) {
      if (!isPremium) {
        return res.status(403).json({ error: "Faqat Premium foydalanuvchilar profilni sozlashi mumkin" });
      }
      social.setPremiumProfile(req.tgUser.id, {
        ...(premiumColor ? { color: premiumColor } : {}),
        ...(frame ? { frame } : {}),
        ...(typeof badge === "boolean" ? { badge } : {}),
        ...(banner ? { banner } : {}),
      });
    }

    const updated = shapeUser(req.tgUser.id, db, social, req.tgUser.id);
    res.json({ ok: true, user: updated });
  });

  router.get("/:id", (req, res) => {
    if (!db.getUser(req.params.id)) return res.status(404).json({ error: "Foydalanuvchi topilmadi" });
    res.json(shapeUser(req.params.id, db, social, req.tgUser.id));
  });

  router.post("/:id/follow", (req, res) => {
    const result = social.toggleFollow(req.tgUser.id, req.params.id);
    if (result.following) {
      social.pushNotification(req.params.id, "follow", `${req.tgUser.name} sizga follow qildi`);
    }
    res.json(result);
  });

  return router;
};
