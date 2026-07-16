const db = require("../database");
const coin = require("./coin");

function getReferralLink(userId, botUsername) {
  return `https://t.me/${botUsername}?start=ref_${userId}`;
}

function applyReferral(newUserId, referrerId) {
  if (String(newUserId) === String(referrerId)) return { ok: false };

  const newUserRef = db.getUserReferral(newUserId);
  if (newUserRef.referredBy) return { ok: false, reason: "Allaqachon taklif qilingan." };

  const s = db.getSettings();
  const refCoin = s.coinSettings?.referral || 10;

  newUserRef.referredBy = String(referrerId);
  db.saveReferral(newUserId, newUserRef);

  const refData = db.getUserReferral(referrerId);
  if (!refData.referrals) refData.referrals = [];
  if (!refData.level2) refData.level2 = [];
  if (!refData.referrals.includes(String(newUserId))) {
    refData.referrals.push(String(newUserId));
    db.saveReferral(referrerId, refData);
  }

  const isPrem = db.isPremium(referrerId);
  const earnedCoin = isPrem ? refCoin * 2 : refCoin;
  coin.addCoins(referrerId, earnedCoin);

  if (refData.referredBy) {
    const level2ReferrerId = refData.referredBy;
    const l2data = db.getUserReferral(level2ReferrerId);
    if (!l2data.level2) l2data.level2 = [];
    if (!l2data.level2.includes(String(newUserId))) {
      l2data.level2.push(String(newUserId));
      db.saveReferral(level2ReferrerId, l2data);
      const l2Coin = Math.floor(earnedCoin / 2);
      coin.addCoins(level2ReferrerId, l2Coin);
    }
  }

  return { ok: true, earnedCoin };
}

function applyPremiumReferralBonus(newPremiumUserId) {
  const ref = db.getUserReferral(newPremiumUserId);
  if (!ref.referredBy) return;

  const s = db.getSettings();
  const bonus = s.referralPremiumBonus || 30;
  coin.addCoins(ref.referredBy, bonus);
  return { referrerId: ref.referredBy, bonus };
}

function getReferralStats(userId, botUsername) {
  const data = db.getUserReferral(userId);
  const users = db.getUsers();

  const referrals = (data.referrals || []).map(id => ({
    id,
    name: users[id]?.name || `ID:${id}`,
    username: users[id]?.username,
  }));
  const level2 = (data.level2 || []).map(id => ({
    id,
    name: users[id]?.name || `ID:${id}`,
  }));

  return {
    link: getReferralLink(userId, botUsername),
    level1Count: referrals.length,
    level2Count: level2.length,
    referrals,
    level2,
  };
}

function getTopByReferrals(n = 10) {
  const ref = db.getReferral();
  const users = db.getUsers();
  return Object.entries(ref)
    .sort((a, b) => (b[1].referrals?.length || 0) - (a[1].referrals?.length || 0))
    .slice(0, n)
    .map(([id, data]) => ({
      userId: id,
      name: users[id]?.name || `ID:${id}`,
      username: users[id]?.username,
      count: data.referrals?.length || 0,
    }));
}

module.exports = { getReferralLink, applyReferral, applyPremiumReferralBonus, getReferralStats, getTopByReferrals };
