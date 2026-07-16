require("dotenv").config();
const { Bot, InlineKeyboard, Keyboard, InputFile } = require("grammy");
const AdminPanel = require("./adminPanel");
const MovieManager = require("./movieManager");
const db = require("./database");
const { restoreFromBackup } = require("./backup");

// ─── Modules ───
const viewsModule    = require("./modules/views");
const likesModule    = require("./modules/likes");
const ratingsModule  = require("./modules/ratings");
const commentsModule = require("./modules/comments");
const coinModule     = require("./modules/coin");
const premiumModule  = require("./modules/premium");
const referralModule = require("./modules/referral");
const notifModule    = require("./modules/notifications");
const aiModule       = require("./modules/aiRecommend");
const statsModule    = require("./modules/stats");

// ─── Init ───
const BOT_TOKEN = (process.env.BOT_TOKEN || "").trim();
const OWNER_ID  = parseInt(process.env.OWNER_ID || "0");

if (!BOT_TOKEN) { console.error("❌ BOT_TOKEN kerak! .env faylga qo'shing."); process.exit(1); }
if (!BOT_TOKEN.includes(":")) { console.error("❌ BOT_TOKEN formati noto'g'ri! Format: 123456789:ABCdefGHIjklMNO..."); process.exit(1); }

// Token ni tekshiramiz
(async () => {
  try {
    const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getMe`);
    const j = await r.json();
    if (!j.ok) {
      console.error(`❌ BOT_TOKEN noto'g'ri! Telegram javobi: ${j.description} (${j.error_code})`);
      console.error("BotFather dan @BotFather → /mybots → API Token orqali tokenni oling.");
      process.exit(1);
    }
    console.log(`✅ Bot tasdiqlandi: @${j.result.username} (ID: ${j.result.id})`);
  } catch (e) {
    console.error("❌ Telegram API ga ulanib bo'lmadi:", e.message);
    process.exit(1);
  }
})();

const bot          = new Bot(BOT_TOKEN);
const adminPanel   = new AdminPanel();
const movieManager = new MovieManager();

// ─── Backup dan tiklash (server qayta ishlaganda kinolar saqlanadi) ───
(async () => {
  const existing = db.getMovies();
  if (Object.keys(existing).length === 0) {
    console.log("📦 Kinolar bo'sh, backup dan tiklash urinilmoqda...");
    const restored = await restoreFromBackup();
    if (restored && Object.keys(restored).length > 0) {
      // Tiklanilgan kinolarni bazaga yozish
      const fs = require("fs");
      const path = require("path");
      const DATA_DIR = path.join(process.env.INSTANCE_DIR || __dirname, "data");
      if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(path.join(DATA_DIR, "movies.json"), JSON.stringify(restored, null, 2));
      console.log(`✅ ${Object.keys(restored).length} ta kino tiklandi!`);
    }
  } else {
    console.log(`📀 ${Object.keys(existing).length} ta kino bazada mavjud.`);
  }
})();

// Owner initialization
const s = db.getSettings();
if (OWNER_ID && !s.ownerId) {
  s.ownerId = OWNER_ID;
  if (!s.admins.includes(OWNER_ID)) s.admins.push(OWNER_ID);
  db.saveSettings(s);
}

// ─── Kino xabari uchun caption + tugmalarni yig'ish (like/izoh bosilgach ham qayta ishlatiladi) ───
function buildMovieMessage(movie, botUsername, userId) {
  const shareLink = `https://t.me/${botUsername}?start=movie_${movie.code}`;
  const shareText = encodeURIComponent(`🎬 ${movie.name}\n\nBu kinoni ko'rish uchun:\n${shareLink}`);

  const { avg, count: rCount } = ratingsModule.getMovieRating(movie.code);
  const likeCount   = likesModule.getLikeCount(movie.code);
  const viewCount   = viewsModule.getViewCount(movie.code);
  const isLikedNow  = userId ? likesModule.isLiked(userId, movie.code) : false;
  const userRating  = userId ? ratingsModule.getUserRating(userId, movie.code) : null;

  const caption =
    `🎬 <b>${movie.name}</b>\n━━━━━━━━━━━━━━━\n` +
    `📝 ${movie.description}\n━━━━━━━━━━━━━━━\n` +
    `🔑 Kod: <code>${movie.code}</code>\n` +
    (movie.genre ? `🏷 Janr: ${movie.genre}\n` : "") +
    `👁 Ko'rishlar: ${viewCount}   ❤️ ${likeCount}   ` +
    (rCount > 0 ? `⭐️ ${avg} (${rCount})` : "⭐️ Baholanmagan");

  const kb = new InlineKeyboard()
    .text(isLikedNow ? `❤️ Like (${likeCount})` : `🤍 Like (${likeCount})`, `like_${movie.code}`)
    .text(userRating ? `⭐️ ${userRating}/5` : "⭐️ Baho ber", `rate_${movie.code}`).row()
    .text("💬 Izohlar", `comments_${movie.code}`)
    .url("📤 Ulashish", `https://t.me/share/url?url=${shareLink}&text=${shareText}`).row();

  // Ilova (web app) yopilgach, foydalanuvchi shu tugma orqali xuddi shu kino
  // sahifasiga qaytib kirishi mumkin bo'lsin.
  // MUHIM: "t.me/bot?startapp=..." havolasi faqat BotFather orqali ro'yxatdan
  // o'tkazilgan "Main Mini App" bo'lsa ishlaydi — bizda esa web app faqat
  // setChatMenuButton orqali dinamik o'rnatilgan, shu sabab ilgari bu tugma
  // ishlamagan. To'g'ri yechim — bevosita `web_app` turidagi tugma ishlatish,
  // u BotFather sozlamasidan qat'i nazar mini app'ni to'g'ridan-to'g'ri ochadi.
  if (WEBAPP_URL) {
    kb.webApp("🔙 Ilovaga qaytish", `${WEBAPP_URL}?movie=${movie.code}`).row();
  }

  return { caption, kb };
}

// Poster rasmini (fileId) bir marta yuklab, video uchun thumbnail sifatida qayta ishlatamiz —
// Telegram video thumbnail'ni file_id orqali qabul qilmaydi, faqat yangi yuklangan bayt sifatida.
const posterThumbCache = new Map();
// Foydalanuvchi "Baho ber" tugmasini bosgach, qaysi kino xabariga
// (chatId/messageId) qaytib caption'ni yangilashni eslab qolish uchun.
const pendingRate = new Map();
async function getPosterThumbnail(posterFileId) {
  if (!posterFileId) return null;
  if (posterThumbCache.has(posterFileId)) return posterThumbCache.get(posterFileId);
  try {
    const file = await bot.api.getFile(posterFileId);
    const url  = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;
    const res  = await fetch(url);
    const buf  = Buffer.from(await res.arrayBuffer());
    posterThumbCache.set(posterFileId, buf);
    return buf;
  } catch (e) {
    return null;
  }
}

// ─── Kino yuborish ───
async function sendMovie(target, movie, botUsername, userId) {
  const chatId = typeof target === "object" ? target.chat.id : target;
  if (!movie.fileId) {
    await bot.api.sendMessage(chatId,
      `🎬 <b>${movie.name}</b>\n⏳ Bu kino hali to'liq yuklanmagan (video qo'shilmagan). Tez orada tayyor bo'ladi.`,
      { parse_mode: "HTML" }
    );
    return;
  }
  viewsModule.incrementView(movie.code);

  const { caption, kb } = buildMovieMessage(movie, botUsername, userId);
  const opts = { caption, parse_mode: "HTML", reply_markup: kb, protect_content: true };

  try {
    // Bitta xabar: video (yoki rasm/fayl) o'zi prevyu vazifasini ham bajaradi —
    // Telegram uni bosilganda ijro etadi, tugagach/chiqib ketilganda yana
    // prevyu (thumbnail) holatiga qaytadi. Alohida poster xabari yuborilmaydi.
    if (movie.fileType === "video") {
      const thumbBuf = movie.poster ? await getPosterThumbnail(movie.poster) : null;
      if (thumbBuf) opts.thumbnail = new InputFile(thumbBuf, "poster.jpg");
      await bot.api.sendVideo(chatId, movie.fileId, opts);
    }
    else if (movie.fileType === "photo")  await bot.api.sendPhoto(chatId, movie.fileId, opts);
    else                                   await bot.api.sendDocument(chatId, movie.fileId, opts);
  } catch (e) {
    await bot.api.sendMessage(chatId,
      caption + `\n\n❌ Fayl yuborishda xatolik: ${e.message}`,
      { parse_mode: "HTML" }
    );
  }
}

// ─── Xush kelibsiz ───
// WEBAPP_URL faqat to'g'ri https:// URL bo'lsa ishlatiladi
// Aks holda Replit dev domain dan quriladi (vaqtinchalik hosting)
const _rawWebapp = (process.env.WEBAPP_URL || "").trim();
let WEBAPP_URL = (_rawWebapp.startsWith("https://") || _rawWebapp.startsWith("http://")) ? _rawWebapp : "";
if (!WEBAPP_URL && process.env.REPLIT_DEV_DOMAIN) {
  WEBAPP_URL = `https://${process.env.REPLIT_DEV_DOMAIN}/kino`;
  console.log("ℹ️ WEBAPP_URL Replit dev domain dan qurildi:", WEBAPP_URL);
}
if (_rawWebapp && !(_rawWebapp.startsWith("https://") || _rawWebapp.startsWith("http://"))) {
  console.warn("⚠️ WEBAPP_URL noto'g'ri edi — Replit URL ishlatilmoqda.");
}

async function sendWelcome(ctx, isPrem) {
  const userId  = ctx.from.id;
  const balance = coinModule.getBalance(userId);
  const premBadge = isPrem ? " 👑" : "";

  if (WEBAPP_URL) {
    const appKb = new InlineKeyboard().webApp("🎬 Open Movie App", WEBAPP_URL);
    await ctx.reply(
      `🎬 <b>KINO MINI APP</b>\n━━━━━━━━━━━━━━━\nNetflix uslubidagi ilovada kinolarni ko'ring, reels'larni tomosha qiling va do'stlaringiz bilan ulashing!`,
      { parse_mode: "HTML", reply_markup: appKb }
    );
  }

  const kb = new Keyboard()
    .text("❤️ Sevimlilar").text("🪙 Coinlar").row()
    .text("👑 Premium").text("🔗 Referal").row()
    .text("ℹ️ Bot haqida").text("🎁 Promo").row()
    .text("🎁 Kunlik bonus").text("🔝 Top kinolar").row()
    .resized();

  await ctx.reply(
    `🎬 <b>KINO BOTGA XUSH KELIBSIZ!</b>${premBadge}\n━━━━━━━━━━━━━━━\n` +
    (isPrem ? "👑 <b>Premium</b> foydalanuvchi\n" : "") +
    `🪙 Balansingiz: <b>${balance}</b> coin\n\n` +
    `Kino kodini yuboring va kinoni oling!\n` +
    `📌 Misol: <code>KN001</code>`,
    { parse_mode: "HTML", reply_markup: kb }
  );
}

// ─── Obuna tekshirish ───
async function checkSub(userId, isPrem) {
  if (isPrem) return { ok: true };
  return await adminPanel.checkSubscription(bot, userId);
}

async function sendSubRequired(ctx, channels, cbData) {
  const kb = new InlineKeyboard();
  for (const ch of channels) kb.url(`➡️ @${ch.username}`, `https://t.me/${ch.username}`).row();
  kb.text("✅ Obuna bo'ldim", cbData);
  await ctx.reply(
    `🔒 <b>Avval kanallarga obuna bo'ling!</b>`,
    { parse_mode: "HTML", reply_markup: kb }
  );
}

// ─── /start ───
bot.command("start", async (ctx) => {
  const args   = ctx.match?.trim();
  const userId = ctx.from.id;
  const isNew  = db.addUser(userId, ctx.from.first_name || "User");
  if (ctx.from.username) db.updateUser(userId, { username: ctx.from.username });

  const isPrem = premiumModule.isPremium(userId);

  // Deep link: /start movie_KN001  → obuna tekshirib, webapp ga yo'naltirish
  if (args?.startsWith("movie_")) {
    const code = args.replace("movie_", "").toUpperCase();
    const check = await checkSub(userId, isPrem);
    if (!check.ok) { await sendSubRequired(ctx, check.channels, `sub_then_webapp_${code}`); return; }
    const movie = movieManager.get(code);
    if (!movie) { await ctx.reply(`❌ <b>${code}</b> kodli kino topilmadi.`, { parse_mode: "HTML" }); return; }
    await sendMovie(ctx, movie, ctx.me.username, userId);
    return;
  }

  // Deep link: /start ref_userId
  if (args?.startsWith("ref_")) {
    const referrerId = args.replace("ref_", "");
    if (isNew && referrerId !== String(userId)) {
      const result = referralModule.applyReferral(userId, referrerId);
      if (result.ok) {
        try {
          const users = db.getUsers();
          const refName = users[referrerId]?.name || "Do'stingiz";
          await ctx.reply(`🎉 ${refName} taklifi bilan keldingiz!`);
          await bot.api.sendMessage(referrerId, `🎉 Yangi refal! ${ctx.from.first_name || "Foydalanuvchi"} sizning linkingiz orqali keldi!\n🪙 +${result.earnedCoin} coin berildi!`);
        } catch (e) {}
      }
    }
  }

  const check = await checkSub(userId, isPrem);
  if (!check.ok) { await sendSubRequired(ctx, check.channels, "check_sub"); return; }
  await sendWelcome(ctx, isPrem);
});

// ─── /admin ───
bot.command("admin", async (ctx) => {
  if (!adminPanel.isAdmin(ctx.from.id)) { await ctx.reply("❌ Ruxsat yo'q!"); return; }
  await adminPanel.showPanel(ctx);
});

// ─── /daily ───
bot.command("daily", async (ctx) => {
  const userId = ctx.from.id;
  const isPrem = premiumModule.isPremium(userId);
  const result = coinModule.claimDaily(userId, isPrem);
  if (!result.ok) {
    await ctx.reply(`⏳ ${result.reason}`);
  } else {
    const balance = coinModule.getBalance(userId);
    await ctx.reply(
      `🪙 KUNLIK BONUS\n━━━━━━━━━━━━━━━\n` +
      `+${result.amount} coin olindi${isPrem ? " (Premium 2x)" : ""}!\n` +
      `💰 Balans: ${balance} coin`
    );
  }
});

// ─── /top ───
bot.command("top", async (ctx) => {
  const top = viewsModule.getTopByViews(10);
  if (!top.length) { await ctx.reply("Hali ko'rishlar yo'q."); return; }
  let msg = "🔝 TOP 10 KINO\n━━━━━━━━━━━━━━━\n";
  top.forEach((m, i) => { msg += `${i + 1}. 🎬 ${m.name} — 👁 ${m.views}\n`; });
  await ctx.reply(msg);
});

// ─── /referral ───
bot.command("referral", async (ctx) => {
  const userId = ctx.from.id;
  const botUsername = ctx.me.username;
  const stats  = referralModule.getReferralStats(userId, botUsername);
  const balance = coinModule.getBalance(userId);
  await ctx.reply(
    `🔗 REFERAL TIZIMI\n━━━━━━━━━━━━━━━\n` +
    `👥 1-daraja: ${stats.level1Count} ta\n` +
    `👤 2-daraja: ${stats.level2Count} ta\n` +
    `🪙 Balans: ${balance} coin\n\n` +
    `📌 Sizning havolangiz:\n${stats.link}\n\n` +
    `💡 Har bir taklif uchun +${db.getSettings().coinSettings?.referral || 10} coin!`
  );
});

// ─── /top_users ───
bot.command("top_users", async (ctx) => {
  const coinTop = coinModule.getTopByCoins(10);
  const refTop  = referralModule.getTopByReferrals(10);
  let msg = "🏆 TOP FOYDALANUVCHILAR\n━━━━━━━━━━━━━━━\n";
  msg += "🪙 Coin bo'yicha:\n";
  coinTop.forEach((u, i) => {
    const handle = u.username ? `@${u.username}` : u.name;
    msg += `${i + 1}. ${handle}${db.isPremium(u.userId) ? " 👑" : ""} — ${u.balance} coin\n`;
  });
  msg += "\n🔗 Referal bo'yicha:\n";
  refTop.forEach((u, i) => {
    const handle = u.username ? `@${u.username}` : u.name;
    msg += `${i + 1}. ${handle}${db.isPremium(u.userId) ? " 👑" : ""} — ${u.count} ta\n`;
  });
  await ctx.reply(msg);
});

// ─── /premium ───
bot.command("premium", async (ctx) => {
  const userId = ctx.from.id;
  const isPrem = premiumModule.isPremium(userId);
  const info   = premiumModule.getPremiumInfo(userId);
  const prices = premiumModule.getPriceList();

  if (isPrem && info) {
    const kb = new InlineKeyboard().text("🔄 Yangilash", "premium_buy");
    await ctx.reply(
      `👑 PREMIUM MAVJUD\n━━━━━━━━━━━━━━━\n` +
      `📦 Tarif: ${info.planName}\n📅 Tugaydi: ${info.expiresAt?.split("T")[0]}\n` +
      `⏳ Qoldi: ${info.daysLeft} kun\n\n✨ Imtiyozlar:\n` +
      `• Majburiy obunasiz kino ko'rish\n• Coin 2x bonus\n• Referal bonusi`,
      { reply_markup: kb }
    );
  } else {
    const kb = new InlineKeyboard().text("👑 Premium olish", "premium_buy");
    let msg = `👑 PREMIUM\n━━━━━━━━━━━━━━━\n✨ Imtiyozlar:\n` +
      `• Kanallarga obunasiz kino\n• Coin 2x bonus\n• Referal bonusi\n\n💰 Narxlar:\n`;
    prices.forEach(p => {
      msg += `• ${p.name}: ${p.finalPrice.toLocaleString()} so'm`;
      if (p.discount > 0) msg += ` (-${p.discount}%)`;
      msg += "\n";
    });
    await ctx.reply(msg, { reply_markup: kb });
  }
});

// ─── /balance ───
bot.command("balance", async (ctx) => {
  const balance = coinModule.getBalance(ctx.from.id);
  await ctx.reply(`🪙 Balansingiz: <b>${balance}</b> coin`, { parse_mode: "HTML" });
});

// ─── Admin keyboard buttons ───
const ADMIN_BUTTONS = new Set([
  "🎬 Kino", "👥 Foydalanuvchilar", "💰 Moliya",
  "⚙️ Sozlamalar", "📢 Xabar",
  "➕ Kino qo'shish", "🗑 Kino o'chirish", "🧩 Kino to'ldirish", "📋 Kinolar ro'yxati",
  "📋 Adminlar", "➕ Admin qo'sh", "➖ Admin o'chir",
  "➕ Support qo'sh", "➖ Support o'chir",
  "📡 Majburiy obuna", "➕ Kanal qo'sh", "➖ Kanal o'chir", "📋 Kanallar",
  "👑 Premium so'rovlar", "💎 Premium ber", "🪙 Coin ber", "🪙 Coin ol", "💰 Narxlarni o'zgartir",
  "📊 Statistika", "📊 Bugungi", "📊 Haftalik", "📊 Oylik", "📊 Umumiy",
  "🏆 Top userlar (Coin)", "🏆 Top userlar (Referal)",
  "🪙 Coin sozlamalari", "🎬 Janrlar", "💳 Karta sozlash",
  "🎁 Promolar", "➕ Promo yaratish", "📋 Promolar ro'yxati", "🗑 Promo o'chirish",
  "🔙 Orqaga",
]);

// User buttons
const USER_BUTTONS = new Set([
  "❤️ Sevimlilar", "🪙 Coinlar", "👑 Premium", "🔗 Referal",
  "ℹ️ Bot haqida", "🎁 Promo", "🔝 Top kinolar", "🎁 Kunlik bonus",
]);

// ─── Message handler ───
bot.on("message", async (ctx) => {
  const userId = ctx.from.id;
  let text = ctx.message?.text?.trim();
  // Tugma matnidagi "(2)" kabi bildirishnoma belgisini olib tashlaymiz —
  // aks holda tugma matni switch/case bilan mos kelmay qoladi
  if (text) {
    const stripped = text.replace(/\s\(\d+\)$/, "");
    if (stripped !== text) {
      text = stripped;
      if (ctx.message) ctx.message.text = stripped;
    }
  }
  if (ctx.from.username) db.updateUser(userId, { username: ctx.from.username });

  if (ctx.message?.entities?.some(e => e.type === "bot_command" && e.offset === 0)) return;

  const isAdmin = adminPanel.isAdmin(userId);
  const isPrem  = premiumModule.isPremium(userId);

  // ─── Admin panel buttons ───
  if (isAdmin && ADMIN_BUTTONS.has(text)) {
    if (text === "📢 Xabar") {
      const count = Object.keys(db.getUsers()).length;
      const kb = new InlineKeyboard()
        .text("✍️ Oddiy xabar", "bcast_normal").row()
        .text("↩️ Forward xabar", "bcast_forward").row();
      await ctx.reply(`📢 XABAR YUBORISH\n👥 ${count} ta foydalanuvchi`, { reply_markup: kb });
      return;
    }
    await adminPanel.handleKeyboard(ctx, bot, movieManager);
    return;
  }

  // ─── Admin waiting states ───
  // "comment_" va "premium_check_" holatlari xuddi shu `adminPanel.waiting` xotirasida
  // saqlanadi, lekin ular ODDIY foydalanuvchi oqimlari — agar shu holatlar admin
  // tomonidan ham chaqirilsa (masalan, bot egasi o'zi izoh yozsa), quyidagi admin
  // blokiga tushib ketmasligi va pastdagi tegishli userlik ishlovchisiga yetib borishi kerak.
  const _waitAction = adminPanel.waiting.get(userId);
  const _isUserLevelWait = _waitAction && (_waitAction.startsWith("comment_") || _waitAction.startsWith("premium_check_") || _waitAction === "promo_code_input");
  if (isAdmin && !_isUserLevelWait && (adminPanel.waiting.has(userId) || adminPanel.waitingMovie.has(userId) || adminPanel.fillTarget.has(userId) || adminPanel.waitingPromo.has(userId))) {
    const action = adminPanel.waiting.get(userId);

    if (action === "broadcast_normal") {
      adminPanel.waiting.delete(userId);
      const ids = Object.keys(db.getUsers());
      await ctx.reply(`⏳ ${ids.length} ta foydalanuvchiga yuborilmoqda...`);
      let sent = 0;
      for (const id of ids) {
        try {
          const msg = ctx.message;
          if (msg.photo)         await bot.api.sendPhoto(id, msg.photo.at(-1).file_id, { caption: msg.caption || "", parse_mode: "HTML" });
          else if (msg.video)    await bot.api.sendVideo(id, msg.video.file_id, { caption: msg.caption || "", parse_mode: "HTML" });
          else if (msg.document) await bot.api.sendDocument(id, msg.document.file_id, { caption: msg.caption || "", parse_mode: "HTML" });
          else if (msg.text)     await bot.api.sendMessage(id, msg.text, { parse_mode: "HTML" });
          sent++;
          if (sent % 25 === 0) await new Promise(r => setTimeout(r, 1000));
        } catch (e) {}
      }
      await ctx.reply(`✅ ${sent} ta foydalanuvchiga yuborildi!`);
      return;
    }

    if (action === "broadcast_forward") {
      adminPanel.waiting.delete(userId);
      const ids = Object.keys(db.getUsers());
      await ctx.reply(`⏳ ${ids.length} ta foydalanuvchiga forward qilinmoqda...`);
      let sent = 0;
      for (const id of ids) {
        try {
          await bot.api.forwardMessage(id, ctx.message.chat.id, ctx.message.message_id);
          sent++;
          if (sent % 25 === 0) await new Promise(r => setTimeout(r, 1000));
        } catch (e) {}
      }
      await ctx.reply(`✅ ${sent} ta foydalanuvchiga forward qilindi!`);
      return;
    }

    await adminPanel.handleMessage(ctx, bot, movieManager);
    return;
  }

  // ─── Admin: bo'sh joyda rasm/video/hujjat yuborsa ───
  // Avval: agar admin yaqinda "Kino qo'shish" orqali kino yaratgan bo'lsa va
  // o'sha kinoda poster/video/reel yetishmasa — avtomatik o'sha kinoga
  // biriktiriladi (qadam-baqadam file_id qo'lda ko'chirish shart emas).
  if (isAdmin && (ctx.message?.photo || ctx.message?.video || ctx.message?.document)) {
    const msg = ctx.message;
    const lastCode = adminPanel.lastMovieCode.get(userId);
    const lastMovie = lastCode ? movieManager.get(lastCode) : null;
    const missing = lastMovie ? movieManager.missingParts(lastMovie) : [];

    if (lastMovie && missing.length) {
      const patch = {};
      let filledField = null;

      if (msg.photo && missing.includes("poster")) {
        patch.poster = msg.photo.at(-1).file_id;
        filledField = "poster";
      } else if ((msg.video || msg.document) && missing.includes("video")) {
        if (msg.video)         { patch.fileId = msg.video.file_id; patch.fileType = "video"; }
        else                   { patch.fileId = msg.document.file_id; patch.fileType = "document"; }
        filledField = "video";
        // MTProto uchun: xabar manzilini saqlaymiz (katta fayllar streaming uchun)
        patch.chatId = String(msg.chat.id);
        patch.msgId = msg.message_id;
        // Poster hali yo'q bo'lsa — video bilan kelgan avtomatik thumbnail'ni ishlatamiz.
        if (missing.includes("poster") && patch.fileType === "video") {
          const autoPoster = MovieManager.autoThumbFileId(msg);
          if (autoPoster) patch.poster = autoPoster;
        }
      } else if ((msg.video || msg.document) && missing.includes("reel")) {
        patch.previewFileId = msg.video ? msg.video.file_id : msg.document.file_id;
        // MTProto uchun: reel xabar manzilini ham saqlaymiz
        patch.previewChatId = String(msg.chat.id);
        patch.previewMsgId = msg.message_id;
        filledField = "reel";
      }

      if (filledField) {
        movieManager.update(lastCode, patch);
        const partNames = { poster: "Poster", video: "Asosiy video", reel: "Reels prevyu" };
        const updated = movieManager.get(lastCode);
        const stillMissing = movieManager.missingParts(updated);
        let reply = `✅ ${partNames[filledField]} qo'shildi: ${lastMovie.name} (${lastCode}).`;
        if (!stillMissing.length) {
          reply += `\n🎉 Kino endi to'liq! Ulashish havolasi ishlaydi.`;
          adminPanel.lastMovieCode.delete(userId);
        } else {
          reply += `\n🧩 Yana yetishmayapti: ${stillMissing.map(m => partNames[m] || m).join(", ")}.`;
        }
        await ctx.reply(reply);
        return;
      }
    }

    // Hech qanday faol kino topilmadi — foydalanuvchini to'g'ri yo'lga yo'naltiramiz
    await ctx.reply(
      "ℹ️ Fayl qabul qilindi, lekin bu qaysi kinoga tegishli ekanligi noaniq.\n\n" +
      "• Yangi kino qo'shish uchun: <b>➕ Kino qo'shish</b>\n" +
      "• Mavjud kinoga poster/video/reel qo'shish uchun: <b>🧩 Kino to'ldirish</b>",
      { parse_mode: "HTML" }
    );
    return;
  }

  // ─── User waiting states ───

  let waiting = adminPanel.waiting.get(userId);

  // Menyu tugmasi bosilsa — kutish holatini bekor qilib, tugmani ishlatamiz
  // (aks holda "rasm tashlang" kabi eski so'rov boshqa tugmalarni ushlab qolaverardi)
  if (waiting && USER_BUTTONS.has(text)) {
    adminPanel.waiting.delete(userId);
    waiting = undefined;
  }

  // ─── User keyboard buttons ───
  if (USER_BUTTONS.has(text)) {
    await handleUserButton(ctx, userId, isPrem);
    return;
  }

  // Premium payment receipt
  if (waiting?.startsWith("premium_check_")) {
    const plan = waiting.replace("premium_check_", "");
    if (ctx.message?.photo) {
      adminPanel.waiting.delete(userId);
      const fileId   = ctx.message.photo.at(-1).file_id;
      const settings = db.getSettings();
      const priceInfo = premiumModule.getPriceList().find(p => p.key === plan);
      const uname    = ctx.from.username ? `@${ctx.from.username}` : String(userId);
      const kb = new InlineKeyboard()
        .text("✅ Tasdiqlash", `approveprem_${userId}`)
        .text("❌ Rad etish", `rejectprem_${userId}`);
      for (const adminId of settings.admins || []) {
        try {
          await bot.api.sendPhoto(adminId, fileId, {
            caption:
              `💳 PREMIUM SO'ROVI\n━━━━━━━━━━━━━━━\n` +
              `👤 Foydalanuvchi: ${uname} (${userId})\n` +
              `📦 Tarif: ${priceInfo?.name || plan}\n` +
              `💵 Summa: ${priceInfo?.finalPrice?.toLocaleString() || "?"} so'm`,
            reply_markup: kb,
          });
        } catch (e) {}
      }
      await ctx.reply("✅ Chekingiz adminlarga yuborildi. Tez orada tekshiriladi.");
    } else {
      await ctx.reply("📸 Iltimos, to'lov chekini RASM sifatida yuboring.");
    }
    return;
  }

  // ─── Promo kod kiritish ───
  if (waiting === "promo_code_input") {
    const code = (text || "").trim().toUpperCase();
    if (!code) { await ctx.reply("❌ Promo kodni matn sifatida yuboring."); return; }
    try {
      // db.usePromo() promos.json dan o'qiydi — admin savePromo() bilan yozgan joy
      const result = db.usePromo(code, userId);
      if (!result.ok) {
        // "Topilmadi" — state saqlanadi, user qayta urina oladi
        // Boshqa xatolar (muddati tugagan, limit, allaqachon ishlatilgan) — state o'chiriladi
        const isNotFound = result.reason.includes("topilmadi") || result.reason.includes("mavjud emas");
        if (!isNotFound) adminPanel.waiting.delete(userId);
        await ctx.reply(`❌ ${result.reason}.`, { parse_mode: "HTML" });
        return;
      }
      // Muvaffaqiyat — state o'chiriladi
      adminPanel.waiting.delete(userId);
      const parts = [];
      if (result.coins > 0) { coinModule.addCoins(userId, result.coins); parts.push(`🪙 <b>${result.coins} coin</b>`); }
      if (result.days  > 0) { premiumModule.grantPremium(userId, "promo", result.days, `Promo: ${code}`); parts.push(`⭐ <b>${result.days} kun Premium</b>`); }
      const rewardText = parts.length ? parts.join(" + ") : "Bonus";
      await ctx.reply(
        `🎉 <b>Tabriklaymiz!</b>\n━━━━━━━━━━━━━━━\n` +
        `✅ Promo kod faollashtirildi: <code>${code}</code>\n\n` +
        `🎁 Siz qo'lga kiritdingiz:\n${rewardText}`,
        { parse_mode: "HTML" }
      );
    } catch (e) {
      adminPanel.waiting.delete(userId);
      await ctx.reply("❌ Xatolik yuz berdi: " + (e.message || "Qayta urinib ko'ring."));
    }
    return;
  }

  // Comment
  if (waiting?.startsWith("comment_")) {
    const code = waiting.replace("comment_", "");
    adminPanel.waiting.delete(userId);
    if (!text) { await ctx.reply("❌ Matn yuboring."); return; }
    const result = commentsModule.addComment(
      userId,
      ctx.from.username || ctx.from.first_name || "Anonim",
      code,
      text,
      isPrem
    );
    if (!result.ok) {
      await ctx.reply(`❌ ${result.reason}`);
    } else {
      await ctx.reply("✅ Izohingiz qo'shildi!");
      const settings = db.getSettings();
      const commentCoin = settings.coinSettings?.comment || 2;
      const earned = isPrem ? commentCoin * 2 : commentCoin;
      if (earned > 0) {
        coinModule.addCoins(userId, earned);
        await ctx.reply(`🪙 Izoh uchun +${earned} coin oldiniz!`);
      }
    }
    return;
  }

  // ─── Obuna tekshirish ───
  const check = await checkSub(userId, isPrem);
  if (!check.ok) {
    await sendSubRequired(ctx, check.channels, "check_sub");
    return;
  }

  if (!text) return;

  // ─── Serial kod: S01E01 ───
  if (/^S\d+E\d+$/i.test(text)) {
    const movie = movieManager.get(text.toUpperCase());
    if (!movie) {
      await ctx.reply(`❌ <b>${text.toUpperCase()}</b> serial kodi topilmadi.\nMisol: S01E01, S01E02`, { parse_mode: "HTML" });
      return;
    }
    await sendMovie(ctx, movie, ctx.me.username, userId);
    return;
  }

  // ─── Oddiy kino kod ───
  const movie = movieManager.get(text.toUpperCase());
  if (!movie) {
    await ctx.reply(
      `❌ <b>KOD XATO</b>\n━━━━━━━━━━━━━━━\n"${text}" kodli kino topilmadi.\n\nTo'g'ri kodni yuboring.`,
      { parse_mode: "HTML" }
    );
    return;
  }
  await sendMovie(ctx, movie, ctx.me.username, userId);
});

// ─── User keyboard handlers ───
async function handleUserButton(ctx, userId, isPrem) {
  const text = ctx.message?.text;
  const botUsername = ctx.me.username;

  if (text === "❤️ Sevimlilar") {
    const liked = likesModule.getUserLikedMovies(userId);
    if (!liked.length) { await ctx.reply("❤️ Hali sevimli kinolar yo'q."); return; }
    const movies = db.getMovies();
    const kb = new InlineKeyboard();
    liked.forEach(code => {
      const m = movies[code];
      if (m) kb.text(`🎬 ${m.name}`, `getmovie_${code}`).row();
    });
    await ctx.reply(`❤️ Sevimlilar (${liked.length} ta):`, { reply_markup: kb });

  } else if (text === "🪙 Coinlar") {
    const balance  = coinModule.getBalance(userId);
    const coinData = db.getUserCoin(userId);
    const today    = new Date().toISOString().split("T")[0];
    const canClaim = coinData.lastDaily !== today;
    const kb = canClaim
      ? new InlineKeyboard().text("🪙 Kunlik bonus olish", "daily_claim")
      : undefined;
    const settings = db.getSettings();
    await ctx.reply(
      `🪙 COIN HAMYON\n━━━━━━━━━━━━━━━\n💰 Balans: ${balance} coin\n` +
      (canClaim ? "✅ Kunlik bonus mavjud!\n" : "⏳ Kunlik bonus olindi.\n") +
      `\n📌 Coin yig'ish:\n• Kunlik kirish: +${settings.coinSettings?.daily || 3}\n` +
      `• Referal: +${settings.coinSettings?.referral || 10}\n` +
      `• Izoh: +${settings.coinSettings?.comment || 2}` +
      (isPrem ? "\n• Premium 2x bonus!" : ""),
      { reply_markup: kb }
    );

  } else if (text === "👑 Premium") {
    const info   = premiumModule.getPremiumInfo(userId);
    const prices = premiumModule.getPriceList();
    if (isPrem && info) {
      const kb = new InlineKeyboard().text("🔄 Yangilash", "premium_buy");
      await ctx.reply(
        `👑 PREMIUM MAVJUD\n━━━━━━━━━━━━━━━\n📦 ${info.planName}\n📅 Tugaydi: ${info.expiresAt?.split("T")[0]}\n⏳ ${info.daysLeft} kun qoldi`,
        { reply_markup: kb }
      );
    } else {
      const kb = new InlineKeyboard().text("👑 Premium olish", "premium_buy");
      let msg = `👑 PREMIUM\n━━━━━━━━━━━━━━━\n✨ Imtiyozlar:\n• Kanallarsiz kino\n• Coin 2x\n• Referal bonus\n\n💰 Narxlar:\n`;
      prices.forEach(p => {
        msg += `• ${p.name}: ${p.finalPrice.toLocaleString()} so'm`;
        if (p.discount > 0) msg += ` (-${p.discount}%)`;
        msg += "\n";
      });
      await ctx.reply(msg, { reply_markup: kb });
    }

  } else if (text === "🔗 Referal") {
    const stats   = referralModule.getReferralStats(userId, botUsername);
    const balance = coinModule.getBalance(userId);
    await ctx.reply(
      `🔗 REFERAL\n━━━━━━━━━━━━━━━\n👥 1-daraja: ${stats.level1Count} ta\n👤 2-daraja: ${stats.level2Count} ta\n🪙 Balans: ${balance} coin\n\n📌 Havolangiz:\n${stats.link}`
    );

  } else if (text === "ℹ️ Bot haqida") {
    const botUsername = ctx.me.username;
    await ctx.reply(
      `ℹ️ <b>BOT HAQIDA</b>\n━━━━━━━━━━━━━━━\n` +
      `🎬 <b>@${botUsername}</b> — Netflix uslubidagi kino platformasi!\n\n` +
      `📌 <b>Bot imkoniyatlari:</b>\n` +
      `• 🎬 Kino kodini yuboring — kinoni bevosita oling\n` +
      `• 👑 Premium — kanallarsiz kino va 2x coin bonus\n` +
      `• 🪙 Coinlar — kunlik bonus, referal va izoh uchun\n` +
      `• 🔗 Referal — do'st taklif qiling, coin ishlang\n` +
      `• 🎁 Promo — maxsus kodlar orqali bonus oling\n` +
      `• 🔝 Top — eng ko'p ko'rilgan kinolar\n` +
      `• ❤️ Sevimlilar — yoqtirgan kinolaringiz\n\n` +
      `🎬 <b>Qanday foydalanish:</b>\n` +
      `Kino kodini yuboring (masalan: <code>KN001</code>)\n` +
      `Bot kinoni darhol yuboradi!\n\n` +
      `👑 <b>Premium afzalliklari:</b>\n` +
      `• Majburiy kanallarsiz kino ko'rish\n` +
      `• Kunlik 2x coin bonus\n` +
      `• Referal bonusi oshadi\n\n` +
      `📞 <b>Muammo bo'lsa:</b> Admin bilan bog'laning`,
      { parse_mode: "HTML" }
    );

  } else if (text === "🎁 Promo") {
    const kb = new InlineKeyboard()
      .text("🎁 Promo kod faollashtirish", "promo_enter");
    await ctx.reply(
      `🎁 <b>PROMO KOD</b>\n━━━━━━━━━━━━━━━\n` +
      `Maxsus promo kodlar orqali bonus qo'lga kiriting!\n\n` +
      `🎯 <b>Promo koddan nima olasiz:</b>\n` +
      `• 🪙 Coin — coin balansingiz ko'payadi\n` +
      `• ⭐ Premium — bepul Premium muddati qo'shiladi\n\n` +
      `📢 <b>Promo kodlarni qayerdan olasiz?</b>\n` +
      `Rasmiy kanalimiz va ijtimoiy tarmoqlarda e'lon qilinadi!\n\n` +
      `💡 <b>Qanday faollashtirish:</b>\n` +
      `Tugmani bosing va promo kodni kiriting`,
      { parse_mode: "HTML", reply_markup: kb }
    );

  } else if (text === "🔝 Top kinolar") {
    const top = viewsModule.getTopByViews(10);
    if (!top.length) { await ctx.reply("Hali ko'rishlar yo'q."); return; }
    let msg = "🔝 TOP 10 KINO\n━━━━━━━━━━━━━━━\n";
    top.forEach((m, i) => { msg += `${i + 1}. 🎬 ${m.name} — 👁 ${m.views}\n`; });
    await ctx.reply(msg);

  } else if (text === "🎁 Kunlik bonus") {
    const result = coinModule.claimDaily(userId, isPrem);
    if (!result.ok) {
      await ctx.reply(`⏳ ${result.reason}`);
    } else {
      const balance = coinModule.getBalance(userId);
      await ctx.reply(
        `🪙 KUNLIK BONUS\n━━━━━━━━━━━━━━━\n` +
        `+${result.amount} coin olindi${isPrem ? " (Premium 2x)" : ""}!\n` +
        `💰 Balans: ${balance} coin`
      );
    }
  }
}

// ─── Callback query (bitta handler barcha callbacklar uchun) ───
bot.on("callback_query", async (ctx) => {
  const data   = ctx.callbackQuery.data;
  const userId = ctx.from.id;
  const isPrem = premiumModule.isPremium(userId);

  // ─── Obuna ───
  if (data === "check_sub") {
    const check = await checkSub(userId, isPrem);
    if (check.ok) {
      await ctx.answerCallbackQuery("✅ Tasdiqlandi!");
      try { await ctx.deleteMessage(); } catch (e) {}
      await sendWelcome(ctx, isPrem);
    } else {
      await ctx.answerCallbackQuery("❌ Hali obuna bo'lmadingiz!", { show_alert: true });
    }
    return;
  }

  if (data.startsWith("sub_then_movie_")) {
    const code  = data.replace("sub_then_movie_", "").toUpperCase();
    const check = await checkSub(userId, isPrem);
    if (!check.ok) {
      await ctx.answerCallbackQuery("❌ Hali obuna bo'lmadingiz!", { show_alert: true });
      return;
    }
    await ctx.answerCallbackQuery("✅ Tasdiqlandi!");
    try { await ctx.deleteMessage(); } catch (e) {}
    const movie = movieManager.get(code);
    if (!movie) { await ctx.reply("❌ Kino topilmadi."); return; }
    await sendMovie(ctx, movie, ctx.me.username, userId);
    return;
  }

  // Obuna tekshirildi → webapp ni kinoga yo'naltirish
  if (data.startsWith("sub_then_webapp_")) {
    const code  = data.replace("sub_then_webapp_", "").toUpperCase();
    const check = await checkSub(userId, isPrem);
    if (!check.ok) {
      await ctx.answerCallbackQuery("❌ Hali obuna bo'lmadingiz!", { show_alert: true });
      return;
    }
    await ctx.answerCallbackQuery("✅ Tasdiqlandi!");
    try { await ctx.deleteMessage(); } catch (e) {}
    const movie = movieManager.get(code);
    if (!movie) { await ctx.reply("❌ Kino topilmadi."); return; }
    await sendMovie(ctx, movie, ctx.me.username, userId);
    return;
  }

  // ─── Sevimlilar: kino ochish ───
  if (data.startsWith("getmovie_")) {
    const code  = data.replace("getmovie_", "");
    const check = await checkSub(userId, isPrem);
    if (!check.ok) {
      await ctx.answerCallbackQuery("❌ Avval kanallarga obuna bo'ling!", { show_alert: true });
      await sendSubRequired(ctx, check.channels, `sub_then_movie_${code}`);
      return;
    }
    const movie = movieManager.get(code);
    if (!movie) { await ctx.answerCallbackQuery("❌ Kino topilmadi."); return; }
    await ctx.answerCallbackQuery();
    await sendMovie(ctx, movie, ctx.me.username, userId);
    return;
  }

  // ─── Kunlik coin ───
  if (data === "daily_claim") {
    const result = coinModule.claimDaily(userId, isPrem);
    if (!result.ok) {
      await ctx.answerCallbackQuery(result.reason, { show_alert: true });
    } else {
      const balance = coinModule.getBalance(userId);
      await ctx.answerCallbackQuery(`🪙 +${result.amount} coin! Balans: ${balance}`, { show_alert: true });
    }
    return;
  }

  // ─── Like ───
  if (data.startsWith("like_")) {
    const code   = data.replace("like_", "");
    const result = likesModule.toggleLike(userId, code);
    await ctx.answerCallbackQuery(result.liked ? "❤️ Like qo'shildi!" : "🤍 Like olib tashlandi");
    // Xabardagi Like sonini/tugmasini darhol yangilaymiz
    const movie = movieManager.get(code);
    if (movie) {
      const { caption, kb } = buildMovieMessage(movie, ctx.me.username, userId);
      try { await ctx.editMessageCaption({ caption, parse_mode: "HTML", reply_markup: kb }); } catch (e) {}
    }
    return;
  }

  // ─── Reyting (1-qadam: tugma tanlash) ───
  if (data.startsWith("rate_")) {
    const code = data.replace("rate_", "");
    // Baho tanlangach qaysi kino xabariga qaytib caption'ni yangilashni bilish uchun eslab qolamiz
    pendingRate.set(userId, {
      code,
      chatId: ctx.callbackQuery.message.chat.id,
      messageId: ctx.callbackQuery.message.message_id,
    });
    const kb = new InlineKeyboard()
      .text("⭐️1", `setrate_${code}_1`).text("⭐️2", `setrate_${code}_2`)
      .text("⭐️3", `setrate_${code}_3`).text("⭐️4", `setrate_${code}_4`)
      .text("⭐️5", `setrate_${code}_5`);
    await ctx.answerCallbackQuery();
    await ctx.reply(`⭐️ ${code} uchun bahoni tanlang:`, { reply_markup: kb });
    return;
  }

  // ─── Reyting (2-qadam: baho saqlash) ───
  if (data.startsWith("setrate_")) {
    const [, code, starStr] = data.split("_");
    const stars = parseInt(starStr);
    const res   = ratingsModule.setRating(userId, code, stars);
    await ctx.answerCallbackQuery(`⭐️ ${stars}/5 baho berildi! (O'rtacha: ${res.avg}/5)`, { show_alert: true });
    try { await ctx.deleteMessage(); } catch (e) {}
    // Asl kino xabaridagi reyting/tugmani yangilaymiz
    const pending = pendingRate.get(userId);
    if (pending && pending.code === code) {
      const movie = movieManager.get(code);
      if (movie) {
        const { caption, kb } = buildMovieMessage(movie, ctx.me.username, userId);
        try {
          await bot.api.editMessageCaption(pending.chatId, pending.messageId, { caption, parse_mode: "HTML", reply_markup: kb });
        } catch (e) {}
      }
      pendingRate.delete(userId);
    }
    return;
  }

  // ─── Izohlar ───
  if (data.startsWith("comments_")) {
    const code     = data.replace("comments_", "");
    const movie    = movieManager.get(code);
    const formatted = commentsModule.formatComments(code);
    await ctx.answerCallbackQuery();
    const kb = new InlineKeyboard().text("✍️ Izoh yozish", `addcomment_${code}`);
    await ctx.reply(
      `💬 IZOHLAR — ${movie?.name || code}\n━━━━━━━━━━━━━━━\n${formatted}`,
      { reply_markup: kb }
    );
    return;
  }

  if (data.startsWith("addcomment_")) {
    const code = data.replace("addcomment_", "");
    await ctx.answerCallbackQuery();
    adminPanel.waiting.set(userId, `comment_${code}`);
    const todayCount = db.getUserTodayCommentCount(userId);
    const maxDaily = commentsModule.getMaxDailyComments(isPrem);
    await ctx.reply(
      `✍️ Izohingizni yuboring:\n(Bugun: ${todayCount}/${maxDaily} ta)\n\nHavolalar va reklamalar qabul qilinmaydi.`
    );
    return;
  }

  // ─── Premium ───
  if (data === "premium_buy") {
    const prices = premiumModule.getPriceList();
    await ctx.answerCallbackQuery();
    const kb = new InlineKeyboard();
    prices.forEach(p => kb.text(`${p.name} — ${p.finalPrice.toLocaleString()} so'm`, `buyprem_${p.key}`).row());
    await ctx.reply("👑 Tarifni tanlang:", { reply_markup: kb });
    return;
  }

  if (data.startsWith("buyprem_")) {
    const plan   = data.replace("buyprem_", "");
    const result = premiumModule.requestPremium(userId, ctx.from.username || String(userId), plan);
    await ctx.answerCallbackQuery();
    if (!result.ok) {
      await ctx.reply("❌ " + result.reason);
      return;
    }
    adminPanel.waiting.set(userId, `premium_check_${plan}`);
    const card = db.getSettings().paymentCard;
    const cardBlock = card
      ? `💳 Kartaga o'tkazing:\n<code>${card.number}</code>\n👤 ${card.holder || "—"}\n\n`
      : `💳 To'lov uchun admin bilan bog'laning.\n\n`;
    await ctx.reply(
      `👑 ${result.planName} Premium\n━━━━━━━━━━━━━━━\n💵 To'lov: ${result.price.toLocaleString()} so'm\n\n` +
      cardBlock +
      `📸 To'lovdan so'ng chekni RASM sifatida yuboring.`,
      { parse_mode: "HTML" }
    );
    return;
  }

  // ─── Promo kod faollashtirish ───
  if (data === "promo_enter") {
    await ctx.answerCallbackQuery();
    adminPanel.waiting.set(userId, "promo_code_input");
    await ctx.reply(
      `🎁 Promo kodingizni yuboring:\n\n💡 Masalan: <code>KINO2025</code>`,
      { parse_mode: "HTML" }
    );
    return;
  }

  // ─── AI Tavsiya ───
  if (data === "ai_recommend") {
    await ctx.answerCallbackQuery("🤖 Yuklanmoqda...");
    const result = await aiModule.getRecommendations(userId);
    if (!result.ok) {
      await ctx.reply("❌ " + result.reason);
      return;
    }
    for (const movie of result.movies) {
      const kb = new InlineKeyboard().text("🚫 Endi tavsiya qilma", `ai_ignore_${movie.code}`);
      await ctx.reply(
        `🤖 <b>AI TAVSIYA</b>\n━━━━━━━━━━━━━━━\n🎬 ${movie.name}\n📝 ${movie.description}\n🔑 Kod: <code>${movie.code}</code>`,
        { reply_markup: kb }
      );
    }
    return;
  }

  if (data.startsWith("ai_ignore_")) {
    const code = data.replace("ai_ignore_", "");
    aiModule.addIgnored(userId, code);
    await ctx.answerCallbackQuery("✅ Endi tavsiya qilinmaydi.");
    try { await ctx.editMessageReplyMarkup({ inline_keyboard: [] }); } catch (e) {}
    return;
  }

  if (data === "ai_toggle") {
    const current = aiModule.isEnabled(userId);
    aiModule.setEnabled(userId, !current);
    await ctx.answerCallbackQuery(!current ? "✅ AI tavsiya yoqildi" : "❌ AI tavsiya o'chirildi");
    return;
  }

  // ─── Bildirishnomalar ───
  if (data.startsWith("notif_toggle_")) {
    const genre      = data.replace("notif_toggle_", "");
    const subscribed = notifModule.toggleSubscription(userId, genre);
    await ctx.answerCallbackQuery(subscribed ? `🔔 ${genre} yoqildi` : `🔕 ${genre} o'chirildi`);
    return;
  }

  // ─── Broadcast ───
  if (data === "bcast_normal") {
    await ctx.answerCallbackQuery();
    adminPanel.waiting.set(userId, "broadcast_normal");
    await ctx.reply("✍️ Yubormoqchi bo'lgan xabarni yuboring:");
    return;
  }

  if (data === "bcast_forward") {
    await ctx.answerCallbackQuery();
    adminPanel.waiting.set(userId, "broadcast_forward");
    await ctx.reply("↩️ Forward qilinadigan xabarni yuboring:");
    return;
  }

  // ─── Admin callbacks ───
  await adminPanel.handleCallback(ctx, bot, movieManager);
});

// ─── my_chat_member ───
bot.on("my_chat_member", async (ctx) => {
  const status = ctx.myChatMember.new_chat_member.status;
  if (["kicked", "left"].includes(status)) db.markLeft(ctx.from.id);
});

// ─── Premium expire warning (har 12 soatda) ───
async function checkPremiumExpiry() {
  try {
    const expiring = premiumModule.getExpiringSoon();
    for (const userId of expiring.day3) {
      try {
        await bot.api.sendMessage(userId,
          "⚠️ Premiumingiz 3 kun ichida tugaydi!\n\n/premium buyrug'i orqali yangilashingiz mumkin."
        );
      } catch (e) {}
    }
    for (const userId of expiring.day1) {
      try {
        await bot.api.sendMessage(userId,
          "🚨 Premiumingiz ERTAGA tugaydi!\n\n/premium buyrug'i orqali yangilashingiz mumkin."
        );
      } catch (e) {}
    }
  } catch (e) { console.error("checkPremiumExpiry xato:", e.message); }
}

// ─── 24 soatda obuna tekshiruv ───
async function checkSubscriptions() {
  try {
    const users = db.getUsers();
    const settings = db.getSettings();
    if (!settings.channels?.length) return;
    for (const [id] of Object.entries(users)) {
      const uid = parseInt(id);
      try {
        const check = await adminPanel.checkSubscription(bot, uid);
        if (!check.ok) {
          const kb = new InlineKeyboard();
          for (const ch of check.channels) kb.url(`➡️ @${ch.username}`, `https://t.me/${ch.username}`).row();
          kb.text("✅ Obuna bo'ldim", "check_sub");
          await bot.api.sendMessage(uid,
            "🔔 Kanaldan chiqib ketgansiz! Qayta obuna bo'ling.",
            { reply_markup: kb }
          );
          db.markLeft(uid);
        }
      } catch (e) {}
      await new Promise(r => setTimeout(r, 50));
    }
  } catch (e) { console.error("checkSubscriptions xato:", e.message); }
}

setInterval(checkPremiumExpiry, 12 * 60 * 60 * 1000);
setInterval(checkSubscriptions, 24 * 60 * 60 * 1000);

bot.catch((err) => console.error("Bot xato:", err.error?.message || err));
bot.start({
  onStart: async (info) => {
    console.log(`🎬 Kino Bot @${info.username} ishga tushdi!`);
    // Mini App menu tugmasini o'rnatish (chat ichida "Open App" tugmasi)
    if (WEBAPP_URL) {
      try {
        await bot.api.setChatMenuButton({
          menu_button: { type: "web_app", text: "🎬 Kinolar", web_app: { url: WEBAPP_URL } }
        });
        console.log("✅ Menu tugmasi o'rnatildi:", WEBAPP_URL);
      } catch (e) {
        console.error("Menu tugmasini o'rnatishda xato:", e.message);
      }
    }
  }
});
