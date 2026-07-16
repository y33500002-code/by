const db = require("../database");

function getBalance(userId) {
  return db.getUserCoin(userId).balance || 0;
}

function addCoins(userId, amount) {
  return db.addCoins(userId, amount);
}

function removeCoins(userId, amount) {
  return db.removeCoins(userId, amount);
}

function setAdminCoin(userId, amount) {
  const coin = db.getCoin();
  const id = String(userId);
  if (!coin[id]) coin[id] = { balance: 0, lastDaily: null };
  coin[id].balance = amount;
  db.saveCoin(userId, coin[id]);
  return amount;
}

function claimDaily(userId, isPremium) {
  const today = new Date().toISOString().split("T")[0];
  const coinData = db.getUserCoin(userId);

  if (coinData.lastDaily === today)
    return { ok: false, reason: "Bugun allaqachon oldiniz. Ertaga qaytib keling!" };

  const s = db.getSettings();
  let amount = s.coinSettings?.daily || 3;
  if (isPremium) amount *= 2;

  db.addCoins(userId, amount);
  db.setLastDaily(userId);

  return { ok: true, amount };
}

function getTopByCoins(n = 10) {
  const coin = db.getCoin();
  const users = db.getUsers();
  return Object.entries(coin)
    .sort((a, b) => (b[1].balance || 0) - (a[1].balance || 0))
    .slice(0, n)
    .map(([id, data]) => ({
      userId: id,
      username: users[id]?.username || users[id]?.name || `ID:${id}`,
      name: users[id]?.name || `ID:${id}`,
      balance: data.balance || 0,
    }));
}

module.exports = { getBalance, addCoins, removeCoins, setAdminCoin, claimDaily, getTopByCoins };
