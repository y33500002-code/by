/**
 * routes/promos.js
 * POST /api/promos/claim  — promokodni faollashtirish
 * GET  /api/promos/info/:code — promo haqida ma'lumot (faollashtirmasdan)
 */
"use strict";
const express = require("express");

module.exports = function promosRouter(db) {
  const router = express.Router();

  // Promo haqida oldindan ma'lumot (foydalanuvchi "Nima beradi?" ko'rishi uchun)
  router.get("/info/:code", (req, res) => {
    const key = String(req.params.code || "").trim().toUpperCase();
    const promo = db.getPromo(key);
    if (!promo) return res.status(404).json({ error: "Promokod topilmadi" });
    if (promo.expiry && new Date(promo.expiry) < new Date())
      return res.status(410).json({ error: "Promokod muddati tugagan" });

    const limit = promo.limit ?? promo.maxUses ?? null;
    if (limit !== null && (promo.usedCount || 0) >= limit)
      return res.status(410).json({ error: "Promokod limiti tugagan" });

    const userId = req.tgUser?.id;
    if (userId) {
      const uid = String(userId);
      if ((promo.usedBy || []).includes(uid))
        return res.status(409).json({ error: "Siz bu promokodni allaqachon ishlatgansiz" });
    }

    const type   = promo.type || "coin";
    const coins  = Number(promo.coins ?? (type !== "premium" ? promo.gift : 0)) || 0;
    const days   = Number(promo.days ?? 0) || 0;
    const left   = limit !== null ? limit - (promo.usedCount || 0) : null;

    res.json({ code: key, type, coins, days, left, valid: true });
  });

  // Promokodni faollashtirish
  router.post("/claim", (req, res) => {
    try {
      const userId = req.tgUser?.id;
      const code   = String(req.body?.code || "").trim();

      if (!userId) return res.status(401).json({ error: "Autentifikatsiya talab qilinadi" });
      if (!code)   return res.status(400).json({ error: "Promokodni kiriting" });

      const result = db.usePromo(code, userId);
      if (!result.ok) {
        return res.status(400).json({ error: result.reason });
      }

      let message = "";
      let newBalance = null;
      let premiumUntil = null;

      // Coin berish
      if ((result.type === "coin" || result.type === "both") && result.coins > 0) {
        newBalance = db.addCoins(userId, result.coins);
      }

      // Premium berish (kunlar asosida)
      if ((result.type === "premium" || result.type === "both") && result.days > 0) {
        // Avvalgi premium ni davom ettiramiz (agar bor bo'lsa)
        const existing = db.getPremiumInfo(userId);
        const now = new Date();
        let base = (existing && new Date(existing.expiresAt) > now)
          ? new Date(existing.expiresAt)
          : now;
        base.setDate(base.getDate() + result.days);

        // setPremium months ishlatadi — biz days dan oyni hisoblaymiz
        // Lekin aniq kunlar kerak, shuning uchun to'g'ridan-to'g'ri premium data yozamiz
        const d = db.getPremiumData?.() ?? (() => {
          try { return JSON.parse(require("fs").readFileSync(
            require("path").join(process.env.INSTANCE_DIR || __dirname, "../../bots/kino/data", "premium.json"), "utf-8"
          )); } catch(_) { return { users: {}, pending: [] }; }
        })();
        if (!d.users) d.users = {};
        d.users[String(userId)] = {
          plan: `promo_${result.days}d`,
          expiresAt: base.toISOString(),
          activatedAt: now.toISOString(),
        };
        try { db.savePremiumData?.(d); } catch(_) {}
        // Fallback: setPremium oylar bilan (taxminiy)
        if (!db.savePremiumData) {
          const months = Math.max(1, Math.round(result.days / 30));
          db.setPremium(userId, `promo_${result.days}d`, months);
        }
        premiumUntil = base.toISOString();
      }

      // Xabar matni
      const parts = [];
      if (result.coins > 0) parts.push(`${result.coins} 🪙 coin`);
      if (result.days  > 0) parts.push(`${result.days} kunlik ⭐ Premium`);
      message = `🎁 Tabriklaymiz! ${parts.join(" va ")} qo'lga kiritdingiz!`;

      return res.json({ success: true, message, newBalance, premiumUntil, coins: result.coins, days: result.days });
    } catch (e) {
      console.error("Promo claim error:", e);
      res.status(500).json({ error: "Tizim xatoligi" });
    }
  });

  return router;
};
