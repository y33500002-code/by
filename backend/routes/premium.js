const express = require("express");
const premiumLogic = require("../../bots/kino/modules/premium");

/** Send a Telegram message to the owner/admin. Fire-and-forget. */
async function notifyAdmin(text) {
  const token = process.env.BOT_TOKEN;
  const ownerId = process.env.OWNER_ID;
  if (!token || !ownerId) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // NOTE: text must be pre-escaped by caller; we use HTML parse_mode for bold/code
      body: JSON.stringify({ chat_id: ownerId, text, parse_mode: "HTML" }),
    });
  } catch (e) {
    console.error("[premium notify]", e.message);
}
}

/** Escape user-controlled strings before inserting into HTML notify messages. */
function escHtml(str) {
  return String(str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

module.exports = function premiumRouter(db, social) {
  const router = express.Router();

  // Public-safe payment info (card number) — for authenticated buyers, not admin-only
  router.get("/payment-info", (req, res) => {
    const s = db.getSettings() || {};
    res.json({ paymentCard: s.paymentCard || "" });
  });

  router.get("/plans", (req, res) => {
    const list = premiumLogic.getPriceList();
    res.json(list.map((p) => ({
      id: p.key,
      name: p.name,
      price: p.finalPrice,
      coins: p.finalPrice,
      stars: Math.round(p.finalPrice / 20),
      badge: p.key === "3m" ? "Mashhur" : undefined,
    })));
  });

  router.post("/purchase", async (req, res) => {
    const { planId, method } = req.body || {};
    const plans = premiumLogic.getPriceList();
    const plan = plans.find((p) => p.key === planId);
    if (!plan) return res.status(400).json({ error: "Noto'g'ri tarif" });

    if (method === "coin") {
      const coin = db.getUserCoin(req.tgUser.id);
      if ((coin.balance || 0) < plan.finalPrice) {
        return res.status(402).json({ error: "Coin balansi yetarli emas" });
      }
      db.removeCoins(req.tgUser.id, plan.finalPrice);
      db.setPremium(req.tgUser.id, plan.key, premiumLogic.PLAN_MONTHS[plan.key]);
      // Notify admin that premium was auto-activated via coins
      notifyAdmin(
        `🪙 <b>Coin bilan Premium olindi</b>\n` +
        `👤 ${escHtml(req.tgUser.name)} (@${escHtml(req.tgUser.username || String(req.tgUser.id))})\n` +
        `📦 Tarif: ${escHtml(plan.name)}\n💰 ${plan.finalPrice.toLocaleString()} coin`
      );
      return res.json({ ok: true, activated: true, method: "coin" });
    }

    if (method === "stars" || method === "card") {
      const result = premiumLogic.requestPremium(
        req.tgUser.id,
        req.tgUser.username || req.tgUser.name,
        plan.key
      );
      if (!result.ok) return res.status(409).json({ error: result.reason });

      // Notify admin about new pending payment
      const emoji = method === "stars" ? "⭐" : "💳";
      const methodName = method === "stars" ? "Telegram Stars" : "Bank kartasi";
      notifyAdmin(
        `${emoji} <b>Yangi Premium so'rovi!</b>\n` +
        `👤 ${escHtml(req.tgUser.name)} (@${escHtml(req.tgUser.username || String(req.tgUser.id))})\n` +
        `📦 Tarif: ${escHtml(plan.name)} — ${plan.finalPrice.toLocaleString()} so'm\n` +
        `💳 To'lov usuli: ${escHtml(methodName)}\n\n` +
        `⚡ Tasdiqlash uchun admin panelga kiring.`
      );

      return res.json({ ok: true, activated: false, pending: true, method });
    }

    res.status(400).json({ error: "Noto'g'ri to'lov usuli" });
  });

  router.post("/gift", (req, res) => {
    const { userId, planId } = req.body || {};
    if (!userId || !db.getUser(userId)) return res.status(404).json({ error: "Foydalanuvchi topilmadi" });
    const plans = premiumLogic.getPriceList();
    const plan = plans.find((p) => p.key === planId);
    if (!plan) return res.status(400).json({ error: "Noto'g'ri tarif" });

    const coin = db.getUserCoin(req.tgUser.id);
    if ((coin.balance || 0) < plan.finalPrice) {
      return res.status(402).json({ error: "Coin balansi yetarli emas" });
    }
    db.removeCoins(req.tgUser.id, plan.finalPrice);
    db.setPremium(userId, plan.key, premiumLogic.PLAN_MONTHS[plan.key]);
    social.pushNotification(userId, "gift", `${req.tgUser.name} sizga Premium sovg'a qildi 🎁`);
    res.json({ ok: true });
  });

  return router;
};
