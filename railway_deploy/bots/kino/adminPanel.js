const { InlineKeyboard, Keyboard } = require("grammy");
const db = require("./database");
const statsModule = require("./modules/stats");
const coinModule = require("./modules/coin");
const premiumModule = require("./modules/premium");

class AdminPanel {
  constructor() {
    this.waiting = new Map();
    this.waitingMovie = new Map();
    // userId -> code: admin oxirgi marta ustida ishlagan/qo'shgan kino kodi.
    // Kino qo'shishda poster/video/reel o'tkazib yuborilsa, admin keyinroq
    // shu kinoga rasm/video yuborsa, avtomatik shu kinoga biriktiriladi.
    this.lastMovieCode = new Map();
    // userId -> { code, field }: "🧩 Kino to'ldirish" orqali aniq bir
    // maydon (poster/video/reel) tanlanganda, keyingi fayl o'sha maydonga tushadi.
    this.fillTarget = new Map();
    // userId -> promo yaratish holati (step, code, type, coins, days, limit)
    this.waitingPromo = new Map();
  }

  isAdmin(userId) {
    const s = db.getSettings();
    return s.admins.includes(userId) || s.supports.includes(userId);
  }

  isOwner(userId) {
    return db.getSettings().ownerId === userId;
  }

  isSupport(userId) {
    return db.getSettings().supports.includes(userId);
  }

  // ─── ANA PANEL ───
  async showPanel(ctx) {
    const userId = ctx.from.id;
    const isOwner = this.isOwner(userId);
    const isSupport = this.isSupport(userId);
    const pendingCount = premiumModule.getPendingPayments().length;
    const moliyaLabel = pendingCount ? `💰 Moliya (${pendingCount})` : "💰 Moliya";

    const keyboard = new Keyboard()
      .text("🎬 Kino").text("👥 Foydalanuvchilar").row()
      .text(moliyaLabel).text("📊 Statistika").row()
      .text("⚙️ Sozlamalar").text("📢 Xabar").row()
      .resized();

    const level = isOwner ? "👑 Egasi" : isSupport ? "🔧 Support" : "⚙️ Admin";
    await ctx.reply(
      `${level} PANEL\n━━━━━━━━━━━━━━━\nKategoriyani tanlang:` +
      (pendingCount ? `\n\n🔔 ${pendingCount} ta yangi premium so'rov bor!` : ""),
      { reply_markup: keyboard }
    );
  }

  // ─── KEYBOARD HANDLER (asosiy kategoriyalar) ───
  async handleKeyboard(ctx, bot, movieManager) {
    if (!this.isAdmin(ctx.from.id)) { await ctx.reply("❌ Ruxsat yo'q!"); return; }
    const text = ctx.message?.text;
    const userId = ctx.from.id;

    switch (text) {

      // ═══════════ 🎬 KINO ═══════════
      case "🎬 Kino": {
        const kb = new Keyboard()
          .text("➕ Kino qo'shish").text("🗑 Kino o'chirish").row()
          .text("🧩 Kino to'ldirish").row()
          .text("📋 Kinolar ro'yxati").text("🔝 Top kinolar").row()
          .text("🔙 Orqaga").row().resized();
        await ctx.reply("🎬 KINO BOSHQARUVI", { reply_markup: kb });
        break;
      }

      case "🧩 Kino to'ldirish": {
        this.waiting.set(userId, "fill_movie_search");
        await ctx.reply(
          "🧩 KINO TO'LDIRISH\n━━━━━━━━━━━━━━━\n" +
          "Poster, asosiy video yoki reels prevyusi qo'shilmagan kinoni to'ldirish uchun " +
          "kino kodi yoki nomini yuboring:"
        );
        break;
      }

      case "➕ Kino qo'shish": {
        this.waitingMovie.set(userId, { step: "code" });
        await ctx.reply(
          "🎬 KINO QO'SHISH\n━━━━━━━━━━━━━━━\n" +
          "1-qadam: Kino kodini yuboring\n" +
          "(Oddiy: KN001 | Serial: S01E01):"
        );
        break;
      }

      case "🗑 Kino o'chirish": {
        this.waiting.set(userId, "delete_movie");
        await ctx.reply("Kino kodini yuboring:");
        break;
      }

      case "📋 Kinolar ro'yxati": {
        const movies = movieManager.getAll();
        const list = Object.values(movies);
        if (!list.length) { await ctx.reply("Kinolar yo'q."); break; }
        const chunks = [];
        for (let i = 0; i < list.length; i += 20) chunks.push(list.slice(i, i + 20));
        for (const chunk of chunks) {
          const kb = new InlineKeyboard();
          chunk.forEach(m => {
            const label = m.type === "serial"
              ? `📺 ${m.name} (${m.code})`
              : `🎬 ${m.name} (${m.code})`;
            kb.text(label, `adminmovie_${m.code}`).row();
          });
          await ctx.reply(`📋 Kinolar (${list.length} ta):`, { reply_markup: kb });
        }
        break;
      }

      case "🔝 Top kinolar": {
        const views = require("./modules/views");
        const top = views.getTopByViews(10);
        if (!top.length) { await ctx.reply("Hali ko'rishlar yo'q."); break; }
        let msg = "👁 TOP 10 KINO (Ko'rishlar bo'yicha)\n━━━━━━━━━━━━━━━\n";
        top.forEach((m, i) => {
          msg += `${i + 1}. 🎬 ${m.name}\n   👁 ${m.views} ta ko'rish\n`;
        });
        await ctx.reply(msg);
        break;
      }

      // ═══════════ 👥 FOYDALANUVCHILAR ═══════════
      case "👥 Foydalanuvchilar": {
        const kb = new Keyboard()
          .text("📋 Adminlar").text("➕ Admin qo'sh").row()
          .text("➖ Admin o'chir").text("➕ Support qo'sh").row()
          .text("➖ Support o'chir").row()
          .text("🔙 Orqaga").row().resized();
        await ctx.reply("👥 FOYDALANUVCHILAR", { reply_markup: kb });
        break;
      }

      case "📋 Adminlar": {
        const s = db.getSettings();
        let msg = `👥 ADMINLAR\n━━━━━━━━━━━━━━━\n`;
        s.admins.forEach(id => { msg += `• ${id}${id === s.ownerId ? " 👑 Egasi" : " ⚙️ Admin"}\n`; });
        msg += `\n🔧 Supportlar:\n`;
        if (!s.supports.length) msg += "• Yo'q\n";
        s.supports.forEach(id => { msg += `• ${id}\n`; });
        await ctx.reply(msg);
        break;
      }

      case "➕ Admin qo'sh": {
        if (!this.isOwner(userId)) { await ctx.reply("❌ Faqat egasi!"); break; }
        this.waiting.set(userId, "add_admin");
        await ctx.reply("Admin Telegram ID sini yuboring:");
        break;
      }

      case "➖ Admin o'chir": {
        if (!this.isOwner(userId)) { await ctx.reply("❌ Faqat egasi!"); break; }
        const s = db.getSettings();
        const admins = s.admins.filter(id => id !== s.ownerId);
        if (!admins.length) { await ctx.reply("Adminlar yo'q."); break; }
        const kb = new InlineKeyboard();
        admins.forEach(id => kb.text(`🗑 ${id}`, `deladmin_${id}`).row());
        await ctx.reply("Qaysi adminni o'chirish?", { reply_markup: kb });
        break;
      }

      case "➕ Support qo'sh": {
        if (!this.isOwner(userId)) { await ctx.reply("❌ Faqat egasi!"); break; }
        this.waiting.set(userId, "add_support");
        await ctx.reply("Support Telegram ID sini yuboring:");
        break;
      }

      case "➖ Support o'chir": {
        if (!this.isOwner(userId)) { await ctx.reply("❌ Faqat egasi!"); break; }
        const s = db.getSettings();
        if (!s.supports.length) { await ctx.reply("Supportlar yo'q."); break; }
        const kb = new InlineKeyboard();
        s.supports.forEach(id => kb.text(`🗑 ${id}`, `delsupport_${id}`).row());
        await ctx.reply("Qaysi supportni o'chirish?", { reply_markup: kb });
        break;
      }

      case "📡 Majburiy obuna": {
        const kb = new Keyboard()
          .text("➕ Kanal qo'sh").text("➖ Kanal o'chir").row()
          .text("📋 Kanallar").row()
          .text("🔙 Orqaga").row().resized();
        await ctx.reply("📡 MAJBURIY OBUNA", { reply_markup: kb });
        break;
      }

      case "➕ Kanal qo'sh": {
        this.waiting.set(userId, "add_channel");
        await ctx.reply("Kanal username ini yuboring (@kanal):");
        break;
      }

      case "➖ Kanal o'chir": {
        const s = db.getSettings();
        if (!s.channels.length) { await ctx.reply("Kanallar yo'q."); break; }
        const kb = new InlineKeyboard();
        s.channels.forEach((ch, i) => kb.text(`🗑 @${ch.username}`, `delchan_${i}`).row());
        await ctx.reply("Qaysi kanalni o'chirish?", { reply_markup: kb });
        break;
      }

      case "📋 Kanallar": {
        const s = db.getSettings();
        if (!s.channels.length) { await ctx.reply("Kanallar yo'q."); break; }
        let msg = "📡 KANALLAR:\n";
        s.channels.forEach((ch, i) => { msg += `${i + 1}. @${ch.username}\n`; });
        await ctx.reply(msg);
        break;
      }

      // ═══════════ 💰 MOLIYA ═══════════
      case "💰 Moliya": {
        const pendingCount = premiumModule.getPendingPayments().length;
        const premLabel = pendingCount ? `👑 Premium so'rovlar (${pendingCount})` : "👑 Premium so'rovlar";
        const kb = new Keyboard()
          .text(premLabel).text("💎 Premium ber").row()
          .text("🪙 Coin ber").text("🪙 Coin ol").row()
          .text("💰 Narxlarni o'zgartir").row()
          .text("🎁 Promolar").row()
          .text("🔙 Orqaga").row().resized();
        await ctx.reply("💰 MOLIYA BOSHQARUVI", { reply_markup: kb });
        break;
      }

      // ═══════════ 🎁 PROMOLAR ═══════════
      case "🎁 Promolar": {
        const kb = new Keyboard()
          .text("➕ Promo yaratish").row()
          .text("📋 Promolar ro'yxati").row()
          .text("🗑 Promo o'chirish").row()
          .text("🔙 Orqaga").row().resized();
        const promos = db.getPromos();
        const count = Object.keys(promos).length;
        await ctx.reply(
          `🎁 PROMO BOSHQARUVI\n━━━━━━━━━━━━━━━\n` +
          `Hozirda ${count} ta aktiv promo mavjud.\n\n` +
          `Promokod — bu foydalanuvchilarga maxsus havola orqali yoki\n` +
          `web app profil sahifasida kiritish uchun tarqatiladigan kod.\n\n` +
          `Promo berishi mumkin:\n` +
          `🪙 Coin  |  ⭐ Premium  |  🎁 Ikkalasi`,
          { reply_markup: kb }
        );
        break;
      }

      case "➕ Promo yaratish": {
        this.waitingPromo.set(userId, { step: "code" });
        await ctx.reply(
          `🎁 PROMO YARATISH\n━━━━━━━━━━━━━━━\n` +
          `1-qadam: Promo kodni kiriting\n` +
          `(Faqat lotin harflar va raqamlar, masalan: YOZGI50)\n\n` +
          `⚠️ Katta harfda yozing:`
        );
        break;
      }

      case "📋 Promolar ro'yxati": {
        const promos = db.getPromos();
        const list = Object.values(promos);
        if (!list.length) { await ctx.reply("Hozirda promolar yo'q."); break; }
        const lines = list.map(p => {
          const used = p.usedCount || 0;
          const limit = p.limit ?? "∞";
          const parts = [];
          if (p.coins > 0 || (p.giftType !== "premium" && p.gift > 0))
            parts.push(`🪙 ${p.coins ?? p.gift} coin`);
          if (p.days > 0) parts.push(`⭐ ${p.days} kun Premium`);
          const reward = parts.join(" + ") || "—";
          return `• <code>${p.code}</code> — ${reward} | ${used}/${limit} foydalanilgan`;
        });
        await ctx.reply(
          `📋 PROMOLAR RO'YXATI\n━━━━━━━━━━━━━━━\n` + lines.join("\n"),
          { parse_mode: "HTML" }
        );
        break;
      }

      case "🗑 Promo o'chirish": {
        this.waiting.set(userId, "delete_promo");
        await ctx.reply("O'chirmoqchi bo'lgan promo kodni yuboring (masalan: YOZGI50):");
        break;
      }

      case "👑 Premium so'rovlar": {
        const pending = premiumModule.getPendingPayments();
        if (!pending.length) { await ctx.reply("Hozircha so'rovlar yo'q."); break; }
        for (const p of pending) {
          const kb = new InlineKeyboard()
            .text("✅ Tasdiqlash", `approveprem_${p.userId}`)
            .text("❌ Rad etish", `rejectprem_${p.userId}`);
          await ctx.reply(
            `👑 PREMIUM SO'ROV\n━━━━━━━━━━━━━━━\n` +
            `👤 Foydalanuvchi: @${p.username || p.userId}\n` +
            `📦 Tarif: ${p.planName}\n` +
            `💵 Summa: ${p.price.toLocaleString()} so'm\n` +
            `📅 Yuborilgan: ${p.requestedAt?.split("T")[0]}`,
            { reply_markup: kb }
          );
        }
        break;
      }

      case "💎 Premium ber": {
        this.waiting.set(userId, "admin_give_premium");
        await ctx.reply("Foydalanuvchi ID si va tarif yuboring:\nFormat: ID TARIF\nTariflar: 1m, 3m, 6m, 1y\nMisol: 123456789 3m");
        break;
      }

      case "🪙 Coin ber": {
        this.waiting.set(userId, "admin_give_coin");
        await ctx.reply("Foydalanuvchi ID si va miqdorini yuboring:\nFormat: ID MIQDOR\nMisol: 123456789 100");
        break;
      }

      case "🪙 Coin ol": {
        this.waiting.set(userId, "admin_take_coin");
        await ctx.reply("Foydalanuvchi ID si va miqdorini yuboring:\nFormat: ID MIQDOR\nMisol: 123456789 50");
        break;
      }

      case "💰 Narxlarni o'zgartir": {
        const kb = new InlineKeyboard()
          .text("1 oy", "setprice_1m").text("3 oy", "setprice_3m").row()
          .text("6 oy", "setprice_6m").text("1 yil", "setprice_1y").row();
        const s = db.getSettings();
        const prices = s.premiumPrices || {};
        await ctx.reply(
          `💰 PREMIUM NARXLAR\n━━━━━━━━━━━━━━━\n` +
          `1 oy: ${(prices["1m"] || 0).toLocaleString()} so'm\n` +
          `3 oy: ${(prices["3m"] || 0).toLocaleString()} so'm\n` +
          `6 oy: ${(prices["6m"] || 0).toLocaleString()} so'm\n` +
          `1 yil: ${(prices["1y"] || 0).toLocaleString()} so'm\n\n` +
          `Qaysi tarifni o'zgartirmoqchisiz?`,
          { reply_markup: kb }
        );
        break;
      }

      // ═══════════ 📊 STATISTIKA ═══════════
      case "📊 Statistika": {
        const kb = new Keyboard()
          .text("📊 Bugungi").text("📊 Haftalik").row()
          .text("📊 Oylik").text("📊 Umumiy").row()
          .text("🏆 Top userlar (Coin)").row()
          .text("🏆 Top userlar (Referal)").row()
          .text("🔙 Orqaga").row().resized();
        await ctx.reply("📊 STATISTIKA", { reply_markup: kb });
        break;
      }

      case "📊 Bugungi": {
        const s = statsModule.getFullStats("today");
        await ctx.reply(statsModule.formatStats(s));
        break;
      }

      case "📊 Haftalik": {
        const s = statsModule.getFullStats("week");
        await ctx.reply(statsModule.formatStats(s));
        break;
      }

      case "📊 Oylik": {
        const s = statsModule.getFullStats("month");
        await ctx.reply(statsModule.formatStats(s));
        break;
      }

      case "📊 Umumiy": {
        const s = statsModule.getFullStats("all");
        await ctx.reply(statsModule.formatStats(s));
        break;
      }

      case "🏆 Top userlar (Coin)": {
        const top = coinModule.getTopByCoins(10);
        if (!top.length) { await ctx.reply("Hali ma'lumot yo'q."); break; }
        let msg = "🪙 TOP 10 — COIN\n━━━━━━━━━━━━━━━\n";
        top.forEach((u, i) => {
          const handle = u.username ? `@${u.username}` : u.name;
          msg += `${i + 1}. ${handle}${db.isPremium(u.userId) ? " 👑" : ""} — 🪙 ${u.balance}\n`;
        });
        await ctx.reply(msg);
        break;
      }

      case "🏆 Top userlar (Referal)": {
        const referralModule = require("./modules/referral");
        const top = referralModule.getTopByReferrals(10);
        if (!top.length) { await ctx.reply("Hali ma'lumot yo'q."); break; }
        let msg = "🔗 TOP 10 — REFERAL\n━━━━━━━━━━━━━━━\n";
        top.forEach((u, i) => {
          const handle = u.username ? `@${u.username}` : u.name;
          msg += `${i + 1}. ${handle}${db.isPremium(u.userId) ? " 👑" : ""} — 🔗 ${u.count} ta\n`;
        });
        await ctx.reply(msg);
        break;
      }

      // ═══════════ ⚙️ SOZLAMALAR ═══════════
      case "⚙️ Sozlamalar": {
        const kb = new Keyboard()
          .text("🪙 Coin sozlamalari").row()
          .text("🎬 Janrlar").row()
          .text("💳 Karta sozlash").row()
          .text("📡 Majburiy obuna").row()
          .text("🔙 Orqaga").row().resized();
        await ctx.reply("⚙️ SOZLAMALAR", { reply_markup: kb });
        break;
      }

      case "🪙 Coin sozlamalari": {
        const s = db.getSettings();
        const cs = s.coinSettings || { daily: 3, referral: 10, comment: 2 };
        const kb = new InlineKeyboard()
          .text(`Kunlik: ${cs.daily}`, "setcoin_daily")
          .text(`Referal: ${cs.referral}`, "setcoin_referral")
          .text(`Izoh: ${cs.comment}`, "setcoin_comment");
        await ctx.reply(
          `🪙 COIN SOZLAMALARI\n━━━━━━━━━━━━━━━\n` +
          `Kunlik kirish: ${cs.daily} coin\n` +
          `Referal: ${cs.referral} coin\n` +
          `Izoh: ${cs.comment} coin\n\nO'zgartirish uchun bosing:`,
          { reply_markup: kb }
        );
        break;
      }

      case "🎬 Janrlar": {
        const notif = require("./modules/notifications");
        const genres = notif.getAllGenres();
        const movies = Object.values(movieManager.getAll());
        if (!genres.length) {
          await ctx.reply(
            "🎬 JANRLAR\n━━━━━━━━━━━━━━━\nHali hech qanday janr yo'q.\n\n" +
            "💡 Janr kino qo'shishda (4-qadam) kiritiladi. Kino qo'shganingizda janr yozsangiz, u shu yerda avtomatik paydo bo'ladi."
          );
          break;
        }
        let msg = "🎬 JANRLAR\n━━━━━━━━━━━━━━━\n";
        genres.forEach(g => {
          const count = movies.filter(m => m.genre === g).length;
          const subs = notif.getSubscribersForGenre(g).length;
          msg += `🏷 ${g} — ${count} ta kino, 🔔 ${subs} ta obunachi\n`;
        });
        msg += "\n💡 Yangi janr qo'shish uchun kino qo'shishda (4-qadam) shu janr nomini kiriting.";
        await ctx.reply(msg);
        break;
      }

      case "💳 Karta sozlash": {
        const s = db.getSettings();
        const card = s.paymentCard;
        const kb = new InlineKeyboard().text("✏️ Kartani o'zgartirish", "set_card");
        await ctx.reply(
          card
            ? `💳 TO'LOV KARTASI\n━━━━━━━━━━━━━━━\n💳 Raqam: <code>${card.number}</code>\n👤 Egasi: ${card.holder || "—"}`
            : `💳 TO'LOV KARTASI\n━━━━━━━━━━━━━━━\n❌ Hali karta kiritilmagan.\nPremium sotib olmoqchi bo'lgan userlar karta raqamini ko'ra olmaydi!`,
          { reply_markup: kb, parse_mode: "HTML" }
        );
        break;
      }

      // ═══════════ 📢 XABAR ═══════════
      case "📢 Xabar": {
        const users = db.getUsers();
        const count = Object.keys(users).length;
        const kb = new InlineKeyboard()
          .text("✍️ Oddiy xabar", "bcast_normal").row()
          .text("↩️ Forward xabar", "bcast_forward").row();
        await ctx.reply(
          `📢 XABAR YUBORISH\n━━━━━━━━━━━━━━━\n` +
          `👥 Foydalanuvchilar: ${count} ta\n\nXabar turini tanlang:`,
          { reply_markup: kb }
        );
        break;
      }

      case "🔙 Orqaga": {
        await this.showPanel(ctx);
        break;
      }
    }
  }

  // ─── WAITING STATE HANDLER ───
  async handleMessage(ctx, bot, movieManager) {
    const userId = ctx.from.id;

    if (this.waitingMovie.has(userId)) {
      await this.handleMovieAdd(ctx, bot, movieManager);
      return true;
    }

    // "🧩 Kino to'ldirish" orqali tanlangan maydonga fayl biriktirish
    if (this.fillTarget.has(userId)) {
      await this.handleFillTarget(ctx, movieManager);
      return true;
    }

    // 🎁 Promo yaratish — ko'p qadamli
    if (this.waitingPromo.has(userId)) {
      await this.handlePromoCreate(ctx);
      return true;
    }

    if (!this.waiting.has(userId)) return false;
    const action = this.waiting.get(userId);
    const text = ctx.message?.text?.trim();
    this.waiting.delete(userId);

    if (action === "fill_movie_search") {
      const codeUpper = text.toUpperCase();
      let movie = movieManager.get(codeUpper);
      if (movie) { await this.showFillMenu(ctx, movie); return true; }

      const allMovies = Object.values(movieManager.getAll());
      const query = text.toLowerCase();
      const matches = allMovies.filter(m => m.name.toLowerCase().includes(query));
      if (!matches.length) {
        await ctx.reply(`❌ "<b>${text}</b>" kod yoki nom bilan kino topilmadi.`, { parse_mode: "HTML" });
        return true;
      }
      if (matches.length === 1) { await this.showFillMenu(ctx, matches[0]); return true; }

      const kb = new InlineKeyboard();
      matches.slice(0, 20).forEach(m => kb.text(`${m.name} (${m.code})`, `fillselect_${m.code}`).row());
      await ctx.reply(`🔍 "${text}" bo'yicha ${matches.length} ta kino topildi. Qaysinisini to'ldirasiz?`, { reply_markup: kb });
      return true;

    } else if (action === "delete_movie") {
      // Avval kod bo'yicha izlash
      const codeUpper = text.toUpperCase();
      if (movieManager.delete(codeUpper)) {
        await ctx.reply(`✅ <b>${codeUpper}</b> o'chirildi.`, { parse_mode: "HTML" });
        return true;
      }
      // Kod topilmadi — nom bo'yicha qidirish
      const allMovies = Object.values(movieManager.getAll());
      const query = text.toLowerCase();
      const matches = allMovies.filter(m => m.name.toLowerCase().includes(query));
      if (!matches.length) {
        await ctx.reply(`❌ "<b>${text}</b>" kod yoki nom bilan kino topilmadi.`, { parse_mode: "HTML" });
        return true;
      }
      if (matches.length === 1) {
        movieManager.delete(matches[0].code);
        await ctx.reply(`✅ <b>${matches[0].name}</b> (${matches[0].code}) o'chirildi.`, { parse_mode: "HTML" });
        return true;
      }
      // Bir nechta mos kino — tanlash uchun ro'yxat
      const kb = new InlineKeyboard();
      matches.slice(0, 20).forEach(m => {
        kb.text(`🗑 ${m.name} (${m.code})`, `delconfirm_${m.code}`).row();
      });
      await ctx.reply(`🔍 "${text}" bo'yicha ${matches.length} ta kino topildi. Qaysinisini o'chirish?`, { reply_markup: kb });

    } else if (action === "add_channel") {
      const username = text.replace("@", "").trim();
      if (!username) { await ctx.reply("❌ Noto'g'ri format!"); return true; }
      const s = db.getSettings();
      if (!s.channels) s.channels = [];
      if (!s.channels.find(c => c.username === username)) {
        s.channels.push({ username });
        db.saveSettings(s);
        await ctx.reply(`✅ @${username} qo'shildi!`);
      } else {
        await ctx.reply(`ℹ️ @${username} allaqachon bor.`);
      }

    } else if (action === "add_admin") {
      if (!this.isOwner(userId)) { await ctx.reply("❌ Faqat egasi!"); return true; }
      const id = parseInt(text);
      if (isNaN(id)) { await ctx.reply("❌ Noto'g'ri ID!"); return true; }
      const s = db.getSettings();
      if (!s.admins.includes(id)) s.admins.push(id);
      db.saveSettings(s);
      await ctx.reply(`✅ ${id} admin qilindi!`);

    } else if (action === "add_support") {
      if (!this.isOwner(userId)) { await ctx.reply("❌ Faqat egasi!"); return true; }
      const id = parseInt(text);
      if (isNaN(id)) { await ctx.reply("❌ Noto'g'ri ID!"); return true; }
      const s = db.getSettings();
      if (!s.supports) s.supports = [];
      if (!s.supports.includes(id)) s.supports.push(id);
      db.saveSettings(s);
      await ctx.reply(`✅ ${id} support qilindi!`);

    } else if (action === "admin_give_coin") {
      const parts = text.split(" ");
      const targetId = parseInt(parts[0]);
      const amount = parseInt(parts[1]);
      if (isNaN(targetId) || isNaN(amount) || amount <= 0) {
        await ctx.reply("❌ Noto'g'ri format! Misol: 123456789 100"); return true;
      }
      const newBal = coinModule.addCoins(targetId, amount);
      await ctx.reply(`✅ ${targetId} ga ${amount} coin berildi.\nYangi balans: ${newBal}`);

    } else if (action === "admin_take_coin") {
      const parts = text.split(" ");
      const targetId = parseInt(parts[0]);
      const amount = parseInt(parts[1]);
      if (isNaN(targetId) || isNaN(amount) || amount <= 0) {
        await ctx.reply("❌ Noto'g'ri format! Misol: 123456789 50"); return true;
      }
      const newBal = coinModule.removeCoins(targetId, amount);
      await ctx.reply(`✅ ${targetId} dan ${amount} coin olindi.\nYangi balans: ${newBal}`);

    } else if (action === "admin_give_premium") {
      const parts = text.split(" ");
      const targetId = parseInt(parts[0]);
      const plan = parts[1]?.toLowerCase();
      const planMonths = { "1m": 1, "3m": 3, "6m": 6, "1y": 12 };
      const planNames  = { "1m": "1 oy", "3m": "3 oy", "6m": "6 oy", "1y": "1 yil" };
      if (isNaN(targetId) || !planMonths[plan]) {
        await ctx.reply("❌ Noto'g'ri format! Misol: 123456789 3m"); return true;
      }
      db.setPremium(targetId, plan, planMonths[plan]);
      await ctx.reply(`✅ ${targetId} ga ${planNames[plan]} premium berildi!`);

    } else if (action?.startsWith("setcoin_")) {
      const type = action.replace("setcoin_", "");
      const val = parseInt(text);
      if (isNaN(val) || val < 0) { await ctx.reply("❌ Noto'g'ri raqam!"); return true; }
      const s = db.getSettings();
      if (!s.coinSettings) s.coinSettings = { daily: 3, referral: 10, comment: 2 };
      s.coinSettings[type] = val;
      db.saveSettings(s);
      await ctx.reply(`✅ ${type} coin: ${val} ga o'zgartirildi!`);

    } else if (action === "set_card") {
      const parts = text.split(" ");
      const number = parts[0]?.trim();
      const holder = parts.slice(1).join(" ").trim();
      if (!number || number.replace(/\D/g, "").length < 12) {
        await ctx.reply("❌ Noto'g'ri format! Misol: 8600123456789012 Ism Familiya"); return true;
      }
      const s = db.getSettings();
      s.paymentCard = { number, holder };
      db.saveSettings(s);
      await ctx.reply(`✅ Karta saqlandi!\n💳 ${number}\n👤 ${holder || "—"}`);

    } else if (action?.startsWith("setprice_")) {
      const plan = action.replace("setprice_", "");
      const val = parseInt(text);
      if (isNaN(val) || val < 0) { await ctx.reply("❌ Noto'g'ri summa!"); return true; }
      const s = db.getSettings();
      if (!s.premiumPrices) s.premiumPrices = {};
      s.premiumPrices[plan] = val;
      db.saveSettings(s);
      const names = { "1m": "1 oy", "3m": "3 oy", "6m": "6 oy", "1y": "1 yil" };
      await ctx.reply(`✅ ${names[plan]} narxi: ${val.toLocaleString()} so'm ga o'zgartirildi!`);

    } else if (action === "delete_promo") {
      const key = text.toUpperCase().trim();
      const ok = db.deletePromo(key);
      if (ok) await ctx.reply(`✅ <code>${key}</code> promosi o'chirildi.`, { parse_mode: "HTML" });
      else    await ctx.reply(`❌ <code>${key}</code> promosi topilmadi.`, { parse_mode: "HTML" });
    }

    return true;
  }

  // ─── KINO QO'SHISH (multi-step) ───
  async handleMovieAdd(ctx, bot, movieManager) {
    const userId = ctx.from.id;
    const state = this.waitingMovie.get(userId);
    const text = ctx.message?.text?.trim();

    if (state.step === "code") {
      const code = text.toUpperCase();
      const isSerial = /^S\d+E\d+/i.test(code);
      state.code = code;
      state.type = isSerial ? "serial" : "movie";
      if (isSerial) {
        const match = code.match(/^S(\d+)E(\d+)/i);
        state.season = parseInt(match[1]);
        state.episode = parseInt(match[2]);
      }
      state.step = "name";
      this.waitingMovie.set(userId, state);
      await ctx.reply(
        `✅ Kod: ${state.code} ${state.type === "serial" ? "📺 Serial" : "🎬 Kino"}\n\n2-qadam: Kino nomini yuboring:`
      );

    } else if (state.step === "name") {
      state.name = text;
      state.step = "description";
      this.waitingMovie.set(userId, state);
      await ctx.reply(`✅ Nom: ${state.name}\n\n3-qadam: Tavsif yuboring:`);

    } else if (state.step === "description") {
      state.description = text;
      state.step = "genre";
      this.waitingMovie.set(userId, state);
      await ctx.reply("4-qadam: Janr yuboring (masalan: Drama, Komediya) yoki /skip:");

    } else if (state.step === "genre") {
      state.genre = text.startsWith("/skip") ? null : text;
      state.step = "poster";
      this.waitingMovie.set(userId, state);
      await ctx.reply("5-qadam: Kino uchun POSTER (afisha) rasmini yuboring, yoki o'tkazib yuborish uchun /skip:");

    } else if (state.step === "poster") {
      if (ctx.message?.photo) {
        state.poster = ctx.message.photo.at(-1).file_id;
      } else if (!text?.startsWith("/skip")) {
        await ctx.reply("❌ Rasm yuboring yoki /skip bosing.");
        return;
      }
      state.step = "reel";
      this.waitingMovie.set(userId, state);
      await ctx.reply(
        "6-qadam: Reels uchun qisqa prevyu video yuboring (ixtiyoriy), " +
        "yoki o'tkazib yuborish uchun /skip:"
      );

    } else if (state.step === "reel") {
      if (ctx.message?.video) {
        state.previewFileId = ctx.message.video.file_id;
        // MTProto uchun: reel xabar manzilini saqlaymiz
        state.previewChatId = String(ctx.message.chat.id);
        state.previewMsgId = ctx.message.message_id;
      } else if (ctx.message?.document) {
        state.previewFileId = ctx.message.document.file_id;
        state.previewChatId = String(ctx.message.chat.id);
        state.previewMsgId = ctx.message.message_id;
      } else if (!text?.startsWith("/skip")) {
        await ctx.reply("❌ Video yuboring yoki /skip bosing.");
        return;
      }
      state.step = "file";
      this.waitingMovie.set(userId, state);
      await ctx.reply(
        "7-qadam: Kinoning asosiy faylini yuboring (video, rasm yoki hujjat), " +
        "yoki hozircha bo'lmasa /skip bosing (keyin \"🧩 Kino to'ldirish\" orqali qo'shasiz):"
      );

    } else if (state.step === "file") {
      let fileId = null, fileType = null, fileChatId = null, fileMsgId = null;
      if (ctx.message?.video) {
        fileId = ctx.message.video.file_id; fileType = "video";
        // MTProto uchun: katta fayllar uchun xabar manzilini saqlaymiz
        fileChatId = String(ctx.message.chat.id);
        fileMsgId = ctx.message.message_id;
      } else if (ctx.message?.document) {
        fileId = ctx.message.document.file_id; fileType = "document";
        fileChatId = String(ctx.message.chat.id);
        fileMsgId = ctx.message.message_id;
      } else if (ctx.message?.photo) {
        fileId = ctx.message.photo.at(-1).file_id; fileType = "photo";
      } else if (!text?.startsWith("/skip")) {
        await ctx.reply("❌ Fayl yuboring yoki /skip bosing!");
        return;
      }

      this.waitingMovie.delete(userId);
      // Poster o'tkazib yuborilgan bo'lsa — video bilan birga Telegram avtomatik
      // yuboradigan thumbnail'dan foydalanamiz, alohida rasm so'ramaymiz.
      const autoPoster = !state.poster && fileType === "video"
        ? require("./movieManager").autoThumbFileId(ctx.message)
        : null;
      movieManager.add(
        state.code, state.name, state.description, fileId, fileType,
        {
          type: state.type, genre: state.genre, season: state.season, episode: state.episode,
          poster: state.poster || autoPoster || null,
          previewFileId: state.previewFileId || null,
          // MTProto uchun xabar manzillari
          chatId: fileChatId || null,
          msgId: fileMsgId || null,
          previewChatId: state.previewChatId || null,
          previewMsgId: state.previewMsgId || null,
        }
      );
      // Admin shu kinoning ustida ishlagan — keyingi rasm/video shu kinoga
      // avtomatik biriktirilishi mumkin (poster/video/reel o'tkazib yuborilgan bo'lsa).
      this.lastMovieCode.set(userId, state.code);

      const botUsername = ctx.me.username;
      const shareLink = `https://t.me/${botUsername}?start=movie_${state.code}`;
      const missing = movieManager.missingParts(movieManager.get(state.code));
      const partNames = { poster: "poster", video: "asosiy video", reel: "reels prevyu" };

      let msg =
        `✅ ${state.type === "serial" ? "SERIAL" : "KINO"} QO'SHILDI!\n━━━━━━━━━━━━━━━\n` +
        `🔑 Kod: ${state.code}\n🎬 Nom: ${state.name}` +
        (state.genre ? `\n🏷 Janr: ${state.genre}` : "") +
        `\n\n🔗 Ulashish havolasi:\n${shareLink}`;

      if (missing.includes("video")) {
        msg += `\n\n⚠️ Asosiy video hali yuklanmagan — link foydalanuvchiga hozircha kino ko'rsatmaydi.`;
      }
      if (missing.length) {
        msg += `\n\n🧩 Yetishmayapti: ${missing.map(m => partNames[m]).join(", ")}.\n` +
          `Endi shu kinoga rasm/video yuborsangiz — avtomatik biriktiriladi (yoki "🧩 Kino to'ldirish" dan foydalaning).`;
      }

      await ctx.reply(msg, { parse_mode: "HTML" });

      const s = db.getSettings();
      if (s.channels?.length) {
        const kb = new InlineKeyboard();
        s.channels.forEach((ch, i) => kb.text(`📤 @${ch.username}`, `sendchan_${state.code}_${i}`).row());
        await ctx.reply("Kanalga ham yuborasizmi?", { reply_markup: kb });
      }

      if (state.genre) {
        const notif = require("./modules/notifications");
        const subs = notif.getSubscribersForGenre(state.genre);
        if (subs.length) {
          const kb2 = new InlineKeyboard()
            .text(`📩 ${subs.length} ta obunachiга yuborish`, `notify_${state.code}`);
          await ctx.reply(`🔔 "${state.genre}" janriga ${subs.length} ta obunachi bor.`, { reply_markup: kb2 });
        }
      }
    }
  }

  // ─── 🎁 Promo yaratish — ko'p qadamli flow ───
  async handlePromoCreate(ctx) {
    const userId = ctx.from.id;
    const state = this.waitingPromo.get(userId);
    const text = ctx.message?.text?.trim();

    if (!text && state.step !== "done") {
      await ctx.reply("❌ Matn kiriting yoki /bekor bosing.");
      return;
    }
    if (text === "/bekor") {
      this.waitingPromo.delete(userId);
      await ctx.reply("❌ Promo yaratish bekor qilindi.");
      return;
    }

    if (state.step === "code") {
      const code = text.toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (!code || code.length < 3 || code.length > 20) {
        await ctx.reply("❌ Kod 3-20 belgidan iborat bo'lishi kerak (faqat lotin harflar va raqamlar).\nQayta kiriting:");
        return;
      }
      if (db.getPromo(code)) {
        await ctx.reply(`❌ <code>${code}</code> kodi allaqachon mavjud.\nBoshqa kod kiriting:`, { parse_mode: "HTML" });
        return;
      }
      state.code = code;
      state.step = "type";
      this.waitingPromo.set(userId, state);
      const kb = new InlineKeyboard()
        .text("🪙 Faqat coin", "promo_type_coin").row()
        .text("⭐ Faqat Premium", "promo_type_premium").row()
        .text("🎁 Ikkalasi (coin + premium)", "promo_type_both").row();
      await ctx.reply(
        `2-qadam: <code>${code}</code> promosi nima beradi?`,
        { reply_markup: kb, parse_mode: "HTML" }
      );

    } else if (state.step === "coins") {
      const coins = parseInt(text);
      if (isNaN(coins) || coins < 0) {
        await ctx.reply("❌ Noto'g'ri raqam. Nechta coin beradi (masalan: 100)?");
        return;
      }
      state.coins = coins;
      if (state.type === "both") {
        state.step = "days";
        this.waitingPromo.set(userId, state);
        await ctx.reply("4-qadam: Premium necha kun beriladi? (masalan: 30)");
      } else {
        state.step = "limit";
        this.waitingPromo.set(userId, state);
        await ctx.reply("3-qadam: Promo necha marta ishlatilishi mumkin? (masalan: 100)");
      }

    } else if (state.step === "days") {
      const days = parseInt(text);
      if (isNaN(days) || days < 1) {
        await ctx.reply("❌ Noto'g'ri raqam. Necha kun? (masalan: 30)");
        return;
      }
      state.days = days;
      state.step = "limit";
      this.waitingPromo.set(userId, state);
      await ctx.reply(
        `${state.type === "both" ? "5" : "3"}-qadam: Promo necha marta ishlatilishi mumkin?\n(masalan: 50 — 50 ta foydalanuvchi ishlatishi mumkin)`
      );

    } else if (state.step === "limit") {
      const limit = parseInt(text);
      if (isNaN(limit) || limit < 1) {
        await ctx.reply("❌ Noto'g'ri raqam. Minimal 1 ta bo'lishi kerak.");
        return;
      }
      state.limit = limit;
      this.waitingPromo.delete(userId);

      // Promo ni saqlash
      const promo = {
        code: state.code,
        type: state.type,
        coins: state.coins || 0,
        days:  state.days  || 0,
        limit: state.limit,
        usedCount: 0,
        usedBy: [],
        createdAt: new Date().toISOString(),
        expiry: null,
      };
      db.savePromo(state.code, promo);

      // Natijani ko'rsatish
      const parts = [];
      if (promo.coins > 0) parts.push(`🪙 ${promo.coins} coin`);
      if (promo.days  > 0) parts.push(`⭐ ${promo.days} kun Premium`);
      await ctx.reply(
        `✅ PROMO YARATILDI!\n━━━━━━━━━━━━━━━\n` +
        `🔑 Kod: <code>${promo.code}</code>\n` +
        `🎁 Beradi: ${parts.join(" + ")}\n` +
        `👥 Limit: ${promo.limit} ta foydalanuvchi\n\n` +
        `Tarqatish uchun kodni nusxalang 👆`,
        { parse_mode: "HTML" }
      );
    }
  }

  // ─── Promo type callback ───
  async handlePromoTypeCallback(ctx, type) {
    const userId = ctx.from.id;
    await ctx.answerCallbackQuery().catch(() => {});
    if (!this.waitingPromo.has(userId)) return;
    const state = this.waitingPromo.get(userId);
    state.type = type;

    if (type === "premium") {
      // Faqat premium — coin so'ramaymiz
      state.coins = 0;
      state.step = "days";
      this.waitingPromo.set(userId, state);
      await ctx.reply("3-qadam: Premium necha kun beriladi? (masalan: 30)");
    } else {
      // coin yoki both — avval coin miqdorini so'raymiz
      state.step = "coins";
      this.waitingPromo.set(userId, state);
      await ctx.reply("3-qadam: Nechta coin beradi? (masalan: 100)");
    }
  }

  // ─── "🧩 Kino to'ldirish" — yetishmayotgan qismni tanlash menyusi ───
  async showFillMenu(ctx, movie) {
    const parts = [
      { key: "poster", label: "🖼 Poster", has: !!movie.poster },
      { key: "video",  label: "🎬 Asosiy video", has: !!movie.fileId },
      { key: "reel",   label: "🎞 Reels prevyu", has: !!movie.previewFileId },
    ];
    const kb = new InlineKeyboard();
    parts.forEach(p => {
      kb.text(`${p.has ? "🔁 Almashtirish: " : "➕ Qo'shish: "}${p.label}`, `fillfield_${movie.code}_${p.key}`).row();
    });
    await ctx.reply(
      `🎬 ${movie.name} (${movie.code})\n━━━━━━━━━━━━━━━\n` +
      parts.map(p => `${p.has ? "✅" : "❌"} ${p.label}`).join("\n") +
      `\n\nQaysi qismni to'ldirmoqchisiz?`,
      { reply_markup: kb }
    );
  }

  // ─── Tanlangan maydonga faylni biriktirish ───
  async handleFillTarget(ctx, movieManager) {
    const userId = ctx.from.id;
    const target = this.fillTarget.get(userId);
    this.fillTarget.delete(userId);

    const movie = movieManager.get(target.code);
    if (!movie) { await ctx.reply("❌ Kino topilmadi (o'chirilgan bo'lishi mumkin)."); return; }

    const patch = {};
    if (target.field === "poster") {
      if (!ctx.message?.photo) { await ctx.reply("❌ Rasm yuboring."); this.fillTarget.set(userId, target); return; }
      patch.poster = ctx.message.photo.at(-1).file_id;
    } else if (target.field === "video") {
      if (ctx.message?.video)         { patch.fileId = ctx.message.video.file_id; patch.fileType = "video"; }
      else if (ctx.message?.document) { patch.fileId = ctx.message.document.file_id; patch.fileType = "document"; }
      else if (ctx.message?.photo)    { patch.fileId = ctx.message.photo.at(-1).file_id; patch.fileType = "photo"; }
      else { await ctx.reply("❌ Video, rasm yoki hujjat yuboring."); this.fillTarget.set(userId, target); return; }
      // Poster hali yo'q bo'lsa — video bilan kelgan avtomatik thumbnail'ni ishlatamiz.
      if (!movie.poster && patch.fileType === "video") {
        const autoPoster = require("./movieManager").autoThumbFileId(ctx.message);
        if (autoPoster) patch.poster = autoPoster;
      }
    } else if (target.field === "reel") {
      if (ctx.message?.video)         patch.previewFileId = ctx.message.video.file_id;
      else if (ctx.message?.document) patch.previewFileId = ctx.message.document.file_id;
      else { await ctx.reply("❌ Qisqa prevyu video yuboring."); this.fillTarget.set(userId, target); return; }
    }

    movieManager.update(target.code, patch);
    const partNames = { poster: "Poster", video: "Asosiy video", reel: "Reels prevyu" };
    await ctx.reply(`✅ ${partNames[target.field]} yangilandi: ${movie.name} (${movie.code}).`);

    const updated = movieManager.get(target.code);
    const missing = movieManager.missingParts(updated);
    if (!missing.length) {
      await ctx.reply(`🎉 "${movie.name}" endi to'liq! Ulashish havolasi ishlaydi.`);
    }
  }

  // ─── CALLBACK HANDLER ───
  async handleCallback(ctx, bot, movieManager) {
    const data = ctx.callbackQuery.data;
    const userId = ctx.from.id;
    if (!this.isAdmin(userId)) { await ctx.answerCallbackQuery("❌ Ruxsat yo'q!").catch(() => {}); return; }
    await ctx.answerCallbackQuery().catch(() => {});

    // Promo yaratish — type tanlash callback
    if (data.startsWith("promo_type_")) {
      const type = data.replace("promo_type_", ""); // coin | premium | both
      await this.handlePromoTypeCallback(ctx, type);
      return;
    }

    if (data.startsWith("fillselect_")) {
      const code = data.replace("fillselect_", "");
      const movie = movieManager.get(code);
      if (!movie) { await ctx.reply("❌ Kino topilmadi."); return; }
      await this.showFillMenu(ctx, movie);
      return;
    }

    if (data.startsWith("fillfield_")) {
      const rest = data.replace("fillfield_", "");
      const lastUnderscore = rest.lastIndexOf("_");
      const code = rest.slice(0, lastUnderscore);
      const field = rest.slice(lastUnderscore + 1);
      const movie = movieManager.get(code);
      if (!movie) { await ctx.reply("❌ Kino topilmadi."); return; }
      this.fillTarget.set(userId, { code, field });
      const prompts = {
        poster: "🖼 Poster uchun rasm yuboring:",
        video: "🎬 Asosiy video/fayl yuboring:",
        reel: "🎞 Reels uchun qisqa prevyu video yuboring:",
      };
      await ctx.reply(prompts[field] || "Fayl yuboring:");
      return;
    }

    if (data.startsWith("adminmovie_")) {
      const code = data.replace("adminmovie_", "");
      const movie = movieManager.get(code);
      if (!movie) { await ctx.reply("Kino topilmadi."); return; }
      const views = require("./modules/views");
      const ratings = require("./modules/ratings");
      const likes = require("./modules/likes");
      const viewCount = views.getViewCount(code);
      const { avg, count: rCount } = ratings.getMovieRating(code);
      const likeCount = likes.getLikeCount(code);
      const kb = new InlineKeyboard().text("🗑 O'chirish", `delconfirm_${code}`);
      await ctx.reply(
        `🎬 ${movie.name} (${movie.code})\n━━━━━━━━━━━━━━━\n` +
        `📝 ${movie.description}\n` +
        (movie.genre ? `🏷 Janr: ${movie.genre}\n` : "") +
        `👁 Ko'rishlar: ${viewCount}\n` +
        `❤️ Like: ${likeCount}\n` +
        `⭐️ Reyting: ${rCount > 0 ? `${avg} (${rCount} baho)` : "Yo'q"}`,
        { reply_markup: kb }
      );

    } else if (data.startsWith("delconfirm_")) {
      movieManager.delete(data.replace("delconfirm_", ""));
      await ctx.editMessageText("✅ Kino o'chirildi.");

    } else if (data.startsWith("delchan_")) {
      const s = db.getSettings();
      const removed = s.channels.splice(parseInt(data.replace("delchan_", "")), 1);
      db.saveSettings(s);
      await ctx.editMessageText(`✅ @${removed[0]?.username} o'chirildi.`);

    } else if (data.startsWith("deladmin_")) {
      if (!this.isOwner(userId)) return;
      const s = db.getSettings();
      s.admins = s.admins.filter(a => a !== parseInt(data.replace("deladmin_", "")));
      db.saveSettings(s);
      await ctx.editMessageText("✅ Admin o'chirildi.");

    } else if (data.startsWith("delsupport_")) {
      if (!this.isOwner(userId)) return;
      const s = db.getSettings();
      s.supports = s.supports.filter(a => a !== parseInt(data.replace("delsupport_", "")));
      db.saveSettings(s);
      await ctx.editMessageText("✅ Support o'chirildi.");

    } else if (data.startsWith("sendchan_")) {
      const parts = data.split("_");
      const code = parts[1];
      const chanIdx = parseInt(parts[2]);
      const s = db.getSettings();
      const channel = s.channels[chanIdx];
      const movie = movieManager.get(code);
      if (!movie || !channel) return;
      const caption = `🎬 ${movie.name}\n━━━━━━━━━━━━━━━\n📝 ${movie.description}\n━━━━━━━━━━━━━━━\n🔑 Kod: ${movie.code}`;
      try {
        if (movie.fileType === "video") await bot.api.sendVideo(`@${channel.username}`, movie.fileId, { caption });
        else if (movie.fileType === "photo") await bot.api.sendPhoto(`@${channel.username}`, movie.fileId, { caption });
        else await bot.api.sendDocument(`@${channel.username}`, movie.fileId, { caption });
        await ctx.reply(`✅ @${channel.username} ga yuborildi!`);
      } catch (e) { await ctx.reply(`❌ Xatolik: ${e.message}`); }

    } else if (data.startsWith("approveprem_")) {
      const targetId = data.replace("approveprem_", "");
      const result = premiumModule.approvePremium(targetId);
      if (!result.ok) { await ctx.reply("❌ " + result.reason); return; }
      await ctx.editMessageText(`✅ ${targetId} ga ${result.planName} Premium berildi!`);
      try { await bot.api.sendMessage(targetId, `🎉 Tabriklaymiz! Sizga ${result.planName} Premium berildi!\n\n✨ Endi siz premium imtiyozlardan foydalanishingiz mumkin.`); } catch (e) {}
      const refBonus = require("./modules/referral").applyPremiumReferralBonus(targetId);
      if (refBonus) {
        try { await bot.api.sendMessage(refBonus.referrerId, `🎁 Refalingiz premium oldi! Sizga +${refBonus.bonus} coin berildi!`); } catch (e) {}
      }

    } else if (data.startsWith("rejectprem_")) {
      const targetId = data.replace("rejectprem_", "");
      premiumModule.rejectPremium(targetId);
      await ctx.editMessageText(`❌ ${targetId} ning so'rovi rad etildi.`);
      try { await bot.api.sendMessage(targetId, "❌ Afsuski, premium so'rovingiz rad etildi.\nIltimos, to'lov chekini tekshirib qayta yuboring."); } catch (e) {}

    } else if (data.startsWith("notify_")) {
      const code = data.replace("notify_", "");
      const movie = movieManager.get(code);
      if (!movie || !movie.genre) return;
      const notif = require("./modules/notifications");
      const subs = notif.getSubscribersForGenre(movie.genre);
      let sent = 0;
      for (const subId of subs) {
        try {
          await bot.api.sendMessage(subId,
            `🔔 YANGI ${movie.type === "serial" ? "SERIAL" : "KINO"}!\n━━━━━━━━━━━━━━━\n` +
            `🎬 ${movie.name}\n📝 ${movie.description}\n\n` +
            `👉 Kod: <code>${movie.code}</code>`,
            { parse_mode: "HTML" }
          );
          sent++;
          if (sent % 25 === 0) await new Promise(r => setTimeout(r, 1000));
        } catch (e) {}
      }
      await ctx.reply(`✅ ${sent} ta obunachiга bildirishnoma yuborildi!`);

    } else if (data.startsWith("setprice_")) {
      const plan = data.replace("setprice_", "");
      const names = { "1m": "1 oy", "3m": "3 oy", "6m": "6 oy", "1y": "1 yil" };
      this.waiting.set(userId, `setprice_${plan}`);
      await ctx.reply(`${names[plan]} uchun yangi narxni (so'mda) yuboring:`);

    } else if (data.startsWith("setcoin_")) {
      const type = data.replace("setcoin_", "");
      const labels = { daily: "Kunlik", referral: "Referal", comment: "Izoh" };
      this.waiting.set(userId, `setcoin_${type}`);
      await ctx.reply(`${labels[type] || type} coin miqdorini yuboring:`);

    } else if (data === "set_card") {
      this.waiting.set(userId, "set_card");
      await ctx.reply(
        "💳 Karta raqamini yuboring.\nFormat: RAQAM Ism Familiya\nMisol: 8600123456789012 Aziz Azizov"
      );
    }
  }

  async checkSubscription(bot, userId) {
    const s = db.getSettings();
    if (!s.channels?.length) return { ok: true };
    const notSub = [];
    for (const ch of s.channels) {
      try {
        const m = await bot.api.getChatMember(`@${ch.username}`, userId);
        if (!["member", "administrator", "creator"].includes(m.status)) notSub.push(ch);
      } catch (e) { notSub.push(ch); }
    }
    return { ok: notSub.length === 0, channels: notSub };
  }
}

module.exports = AdminPanel;
