const db = require("../database");

const PLAN_MONTHS = { "1m": 1, "3m": 3, "6m": 6, "1y": 12 };
const PLAN_NAMES  = { "1m": "1 oy", "3m": "3 oy", "6m": "6 oy", "1y": "1 yil" };

function isPremium(userId) {
  return db.isPremium(userId);
}

function getPremiumInfo(userId) {
  const info = db.getPremiumInfo(userId);
  if (!info) return null;
  const now = new Date();
  const exp = new Date(info.expiresAt);
  const daysLeft = Math.max(0, Math.ceil((exp - now) / (1000 * 60 * 60 * 24)));
  return { ...info, daysLeft, planName: PLAN_NAMES[info.plan] || info.plan };
}

function requestPremium(userId, username, plan) {
  if (!PLAN_MONTHS[plan]) return { ok: false, reason: "Noto'g'ri tarif!" };
  const pending = db.getPendingPayments();
  if (pending.some(p => String(p.userId) === String(userId)))
    return { ok: false, reason: "Sizning so'rovingiz allaqachon ko'rib chiqilmoqda." };

  const s = db.getSettings();
  const prices = s.premiumPrices || { "1m": 10000, "3m": 25000, "6m": 45000, "1y": 80000 };
  const discounts = s.premiumDiscount || {};
  const price = prices[plan] || 0;
  const discount = discounts[plan] || 0;
  const finalPrice = Math.round(price * (1 - discount / 100));

  db.addPendingPayment({
    userId: String(userId),
    username: username || String(userId),
    plan,
    planName: PLAN_NAMES[plan],
    price: finalPrice,
    requestedAt: new Date().toISOString(),
  });

  return { ok: true, plan, planName: PLAN_NAMES[plan], price: finalPrice };
}

function approvePremium(userId) {
  const pending = db.getPendingPayments();
  const req = pending.find(p => String(p.userId) === String(userId));
  if (!req) return { ok: false, reason: "Topilmadi." };

  const months = PLAN_MONTHS[req.plan] || 1;
  db.setPremium(userId, req.plan, months);
  db.removePendingPayment(userId);

  return { ok: true, plan: req.plan, planName: req.planName };
}

function rejectPremium(userId) {
  const pending = db.getPendingPayments();
  const req = pending.find(p => String(p.userId) === String(userId));
  if (!req) return { ok: false };
  db.removePendingPayment(userId);
  return { ok: true };
}

function getPendingPayments() {
  return db.getPendingPayments();
}

function getExpiringSoon() {
  const premiumUsers = db.getAllPremiumUsers();
  const now = new Date();
  const result = { day1: [], day3: [] };
  for (const [userId, info] of Object.entries(premiumUsers)) {
    const exp = new Date(info.expiresAt);
    const daysLeft = Math.ceil((exp - now) / (1000 * 60 * 60 * 24));
    if (daysLeft === 1) result.day1.push(userId);
    else if (daysLeft === 3) result.day3.push(userId);
  }
  return result;
}

function getPriceList() {
  const s = db.getSettings();
  const prices = s.premiumPrices || { "1m": 10000, "3m": 25000, "6m": 45000, "1y": 80000 };
  const discounts = s.premiumDiscount || {};
  return Object.entries(PLAN_NAMES).map(([key, name]) => {
    const price = prices[key] || 0;
    const disc = discounts[key] || 0;
    const final = Math.round(price * (1 - disc / 100));
    return { key, name, price, discount: disc, finalPrice: final };
  });
}

function removePremium(userId) {
  db.removePremium(userId);
}

module.exports = {
  isPremium, getPremiumInfo, requestPremium,
  approvePremium, rejectPremium, getPendingPayments,
  getExpiringSoon, getPriceList, removePremium, PLAN_NAMES, PLAN_MONTHS,
};
