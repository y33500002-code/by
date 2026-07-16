const express = require("express");
const { shapeMovie } = require("../lib/shape");
const bot = require("../lib/telegramBotApi");
const premiumLogic = require("../../bots/kino/modules/premium");
const referralLogic = require("../../bots/kino/modules/referral");

function requireSupport(req, res, next) {
  if (!req.tgUser.isSupport) return res.status(403).json({ error: "Admin panelga ruxsat yo'q" });
  next();
}
function requireAdmin(req, res, next) {
  if (!req.tgUser.isAdmin) return res.status(403).json({ error: "Faqat admin/owner uchun" });
  next();
}

function genCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

// Admin views need the raw Telegram file IDs (poster/preview) alongside the
// public shape, so the edit form can show/preserve what's actually stored —
// the public shapeMovie() only exposes proxied media URLs, not raw IDs.
function shapeMovieForAdmin(movie, ctx) {
  return { ...shapeMovie(movie, ctx), previewFileId: movie.previewFileId || null, fileId: movie.fileId || null };
}

module.exports = function adminRouter(db, social) {
  const router = express.Router();
  router.use(requireSupport);

  router.get("/movies", (req, res) => {
    const movies = Object.values(db.getMovies()).sort((a, b) => new Date(b.addedAt || 0) - new Date(a.addedAt || 0));
    res.json(movies.map((m) => shapeMovieForAdmin(m, { db, social, userId: req.tgUser.id })));
  });

  router.post("/movies", (req, res) => {
    const body = req.body || {};
    if (!body.title) return res.status(400).json({ error: "Kino nomi majburiy" });
    let code = genCode();
    while (db.getMovie(code)) code = genCode();
    const record = {
      code,
      name: body.title,
      description: body.description || "",
      genre: body.genre || "Aralash",
      country: body.country || "O'zbekiston",
      year: Number(body.year) || new Date().getFullYear(),
      duration: Number(body.duration) || 90,
      language: body.language || "O'zbek tili",
      quality: body.quality || "HD",
      poster: body.posterFileId || body.poster || null,
      previewFileId: body.previewFileId || null,
      fileId: body.fileId || null,
      fileType: body.fileType || null,
      addedAt: new Date().toISOString(),
      addedBy: req.tgUser.id,
    };
    db.saveMovie(code, record);
    res.json(shapeMovieForAdmin(record, { db, social, userId: req.tgUser.id }));
  });

  router.put("/movies/:code", (req, res) => {
    const existing = db.getMovie(req.params.code);
    if (!existing) return res.status(404).json({ error: "Kino topilmadi" });
    const body = req.body || {};
    const updated = {
      ...existing,
      name: body.title ?? existing.name,
      description: body.description ?? existing.description,
      genre: body.genre ?? existing.genre,
      country: body.country ?? existing.country,
      year: body.year !== undefined ? Number(body.year) : existing.year,
      duration: body.duration !== undefined ? Number(body.duration) : existing.duration,
      language: body.language ?? existing.language,
      quality: body.quality ?? existing.quality,
      poster: body.posterFileId ?? body.poster ?? existing.poster,
      previewFileId: body.previewFileId ?? existing.previewFileId,
      fileId: body.fileId !== undefined ? (body.fileId || null) : existing.fileId,
      fileType: body.fileId ? (body.fileType || "video") : (body.fileId === null ? null : existing.fileType),
      updatedAt: new Date().toISOString(),
    };
    db.saveMovie(existing.code, updated);
    res.json(shapeMovieForAdmin(updated, { db, social, userId: req.tgUser.id }));
  });

  router.delete("/movies/:code", (req, res) => {
    if (!db.getMovie(req.params.code)) return res.status(404).json({ error: "Kino topilmadi" });
    db.deleteMovie(req.params.code);
    res.json({ ok: true });
  });

  router.get("/stats", requireAdmin, (req, res) => {
    const movies = db.getMovies();
    const users = db.getUsers();
    const views = db.getViews();
    const totalViews = Object.values(views).reduce((sum, v) => sum + (v || 0), 0);
    const premiumUsers = Object.keys(db.getAllPremiumUsers()).length;
    res.json({
      totalMovies: Object.keys(movies).length,
      totalUsers: Object.keys(users).length,
      totalViews,
      premiumUsers,
    });
  });

  // ─────────────── FOYDALANUVCHILAR ───────────────
  router.get("/users", (req, res) => {
    const q = (req.query.q || "").toString().trim().toLowerCase();
    const settings = db.getSettings();
    const admins = (settings.admins || []).map(String);
    const supports = (settings.supports || []).map(String);
    const ownerId = String(settings.ownerId || "");

    let users = Object.values(db.getUsers());
    if (q) {
      users = users.filter((u) => {
        const name = (u.name || "").toLowerCase();
        const username = (u.username || "").toLowerCase();
        return name.includes(q) || username.includes(q) || String(u.id).includes(q);
      });
    }
    users.sort((a, b) => new Date(b.joinedAt || 0) - new Date(a.joinedAt || 0));

    res.json(
      users.slice(0, 200).map((u) => {
        const premiumInfo = premiumLogic.getPremiumInfo(u.id);
        const coin = db.getUserCoin(u.id);
        return {
          id: u.id,
          name: u.name || "Foydalanuvchi",
          username: u.username || "",
          joinedAt: u.joinedAt || null,
          coins: coin.balance || 0,
          premium: !!premiumInfo,
          premiumPlan: premiumInfo ? premiumInfo.planName : null,
          premiumDaysLeft: premiumInfo ? premiumInfo.daysLeft : null,
          isOwner: String(u.id) === ownerId,
          isAdmin: admins.includes(String(u.id)),
          isSupport: supports.includes(String(u.id)),
        };
      })
    );
  });

  router.post("/users/:id/premium", requireAdmin, (req, res) => {
    const { plan } = req.body || {};
    if (!premiumLogic.PLAN_MONTHS[plan]) return res.status(400).json({ error: "Noto'g'ri tarif" });
    if (!db.getUser(req.params.id)) return res.status(404).json({ error: "Foydalanuvchi topilmadi" });

    db.setPremium(req.params.id, plan, premiumLogic.PLAN_MONTHS[plan]);
    const planName = premiumLogic.PLAN_NAMES[plan];
    bot.sendMessage(req.params.id, `🎉 Tabriklaymiz! Sizga ${planName} Premium berildi!\n\n✨ Endi siz premium imtiyozlardan foydalanishingiz mumkin.`);
    const refBonus = referralLogic.applyPremiumReferralBonus(req.params.id);
    if (refBonus) bot.sendMessage(refBonus.referrerId, `🎁 Refalingiz premium oldi! Sizga +${refBonus.bonus} coin berildi!`);

    res.json({ ok: true, plan, planName });
  });

  router.delete("/users/:id/premium", requireAdmin, (req, res) => {
    if (!db.getUser(req.params.id)) return res.status(404).json({ error: "Foydalanuvchi topilmadi" });
    db.removePremium(req.params.id);
    res.json({ ok: true });
  });

  // ─────────────── PREMIUM SO'ROVLAR ───────────────
  router.get("/premium/pending", (req, res) => {
    const pending = premiumLogic.getPendingPayments();
    res.json(
      pending.map((p) => {
        const u = db.getUser(p.userId);
        return { ...p, name: u?.name || p.username || p.userId };
      })
    );
  });

  router.post("/premium/pending/:userId/approve", requireAdmin, (req, res) => {
    const result = premiumLogic.approvePremium(req.params.userId);
    if (!result.ok) return res.status(404).json({ error: result.reason });
    bot.sendMessage(req.params.userId, `🎉 Tabriklaymiz! Sizga ${result.planName} Premium berildi!\n\n✨ Endi siz premium imtiyozlardan foydalanishingiz mumkin.`);
    const refBonus = referralLogic.applyPremiumReferralBonus(req.params.userId);
    if (refBonus) bot.sendMessage(refBonus.referrerId, `🎁 Refalingiz premium oldi! Sizga +${refBonus.bonus} coin berildi!`);
    res.json({ ok: true, plan: result.plan, planName: result.planName });
  });

  router.post("/premium/pending/:userId/reject", requireAdmin, (req, res) => {
    const result = premiumLogic.rejectPremium(req.params.userId);
    if (!result.ok) return res.status(404).json({ error: "So'rov topilmadi" });
    bot.sendMessage(req.params.userId, "❌ Afsuski, premium so'rovingiz rad etildi.\nIltimos, to'lov chekini tekshirib qayta yuboring.");
    res.json({ ok: true });
  });

  // ─────────────── SOZLAMALAR ───────────────
  router.get("/settings", requireAdmin, (req, res) => {
    const s = db.getSettings();
    res.json({
      channels: s.channels || [],
      premiumPrices: s.premiumPrices || { "1m": 10000, "3m": 25000, "6m": 45000, "1y": 80000 },
      premiumDiscount: s.premiumDiscount || {},
      premiumBonusCoin: s.premiumBonusCoin || 0,
      referralPremiumBonus: s.referralPremiumBonus || 0,
      paymentCard: s.paymentCard || "",
      coinSettings: s.coinSettings || { daily: 3, referral: 10, comment: 2 },
    });
  });

  router.put("/settings", requireAdmin, (req, res) => {
    const s = db.getSettings();
    const body = req.body || {};
    if (body.premiumPrices) s.premiumPrices = { ...s.premiumPrices, ...body.premiumPrices };
    if (body.premiumDiscount) s.premiumDiscount = { ...s.premiumDiscount, ...body.premiumDiscount };
    if (body.premiumBonusCoin !== undefined) s.premiumBonusCoin = Number(body.premiumBonusCoin) || 0;
    if (body.referralPremiumBonus !== undefined) s.referralPremiumBonus = Number(body.referralPremiumBonus) || 0;
    if (body.paymentCard !== undefined) s.paymentCard = String(body.paymentCard).trim();
    if (body.coinSettings) s.coinSettings = { ...s.coinSettings, ...body.coinSettings };
    db.saveSettings(s);
    res.json({ ok: true });
  });

  router.post("/channels", requireAdmin, (req, res) => {
    const { username, title } = req.body || {};
    if (!username) return res.status(400).json({ error: "Kanal username majburiy" });
    const s = db.getSettings();
    if (!s.channels) s.channels = [];
    const clean = String(username).replace(/^@/, "").trim();
    if (s.channels.some((c) => c.username === clean)) {
      return res.status(409).json({ error: "Bu kanal allaqachon qo'shilgan" });
    }
    s.channels.push({ username: clean, title: title || clean });
    db.saveSettings(s);
    res.json({ ok: true, channels: s.channels });
  });

  router.delete("/channels/:index", requireAdmin, (req, res) => {
    const s = db.getSettings();
    const idx = Number(req.params.index);
    if (!s.channels || !s.channels[idx]) return res.status(404).json({ error: "Kanal topilmadi" });
    s.channels.splice(idx, 1);
    db.saveSettings(s);
    res.json({ ok: true, channels: s.channels });
  });

  return router;
};
