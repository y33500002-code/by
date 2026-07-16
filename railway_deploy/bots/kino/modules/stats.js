const db = require("../database");

function getWeekRange() {
  const now = new Date();
  const start = new Date(now);
  start.setDate(now.getDate() - 7);
  return { start: start.toISOString().split("T")[0], end: now.toISOString().split("T")[0] };
}

function getMonthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  return { start: start.toISOString().split("T")[0], end: now.toISOString().split("T")[0] };
}

function inRange(date, start, end) {
  return date >= start && date <= end;
}

function getFullStats(period = "all") {
  const users = db.getUsers();
  const movies = db.getMovies();
  const views = db.getViews();
  const likes = db.getLikes();
  const comments = db.getComments();
  const coin = db.getCoin();
  const premiumData = db.getPremiumData();
  const referral = db.getReferral();
  const today = new Date().toISOString().split("T")[0];

  let range = null;
  if (period === "today") range = { start: today, end: today };
  else if (period === "week") range = getWeekRange();
  else if (period === "month") range = getMonthRange();

  const userList = Object.values(users);

  let userCount = 0;
  let activeUsers = 0;

  if (period === "all") {
    userCount = userList.filter(u => !u.leftAt).length;
    activeUsers = userCount;
  } else {
    userCount = userList.filter(u => {
      if (period === "today") return u.joinedAt === today;
      return inRange(u.joinedAt, range.start, range.end);
    }).length;
    activeUsers = userList.filter(u =>
      inRange(u.lastSeen || u.joinedAt, range.start, range.end)
    ).length;
  }

  const totalViews = Object.values(views).reduce((a,b) => a+b, 0);
  const totalLikes = Object.values(likes).reduce((a,b) => a+(b.length||0), 0);
  const totalComments = Object.values(comments).reduce((a,b) => a+(b.length||0), 0);
  const totalCoins = Object.values(coin).reduce((a,b) => a+(b.balance||0), 0);
  const premiumCount = Object.values(premiumData.users || {}).filter(p =>
    new Date(p.expiresAt) > new Date()
  ).length;
  const referralCount = Object.values(referral).reduce((a,b) => a+(b.referrals?.length||0), 0);

  return {
    period,
    users: period === "all" ? userCount : `${userCount} ta yangi`,
    activeUsers,
    totalMovies: Object.keys(movies).length,
    totalViews,
    totalLikes,
    totalComments,
    totalCoins,
    premiumCount,
    referralCount,
  };
}

function formatStats(stats) {
  const periodLabel = {
    today: "Bugungi", week: "Haftalik", month: "Oylik", all: "Umumiy"
  }[stats.period] || stats.period;

  return (
    `📊 ${periodLabel.toUpperCase()} STATISTIKA\n━━━━━━━━━━━━━━━\n` +
    `👥 Foydalanuvchilar: ${stats.users}\n` +
    `✅ Aktiv userlar: ${stats.activeUsers}\n` +
    `🎬 Jami kinolar: ${stats.totalMovies}\n` +
    `👁 Ko'rishlar: ${stats.totalViews}\n` +
    `❤️ Like: ${stats.totalLikes}\n` +
    `💬 Izohlar: ${stats.totalComments}\n` +
    `🪙 Jami coinlar: ${stats.totalCoins}\n` +
    `👑 Premium: ${stats.premiumCount}\n` +
    `🔗 Referallar: ${stats.referralCount}\n` +
    `━━━━━━━━━━━━━━━`
  );
}

module.exports = { getFullStats, formatStats };
