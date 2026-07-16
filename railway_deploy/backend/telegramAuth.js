/**
 * telegramAuth.js
 * -------------------------------------------------------------------------
 * Validates the `X-Telegram-Init-Data` header sent by the Mini App
 * frontend (window.Telegram.WebApp.initData), per Telegram's documented
 * HMAC-SHA256 scheme: https://core.telegram.org/bots/webapps#validating-data
 *
 * In development (no BOT_TOKEN, or ALLOW_DEV_AUTH=1) it falls back to a
 * fixed test user so the API is runnable/testable without a live bot.
 */
const crypto = require("crypto");

const BOT_TOKEN = process.env.BOT_TOKEN || "";
// Dev auth faqat BOT_TOKEN bo'lmasa VA production rejimida bo'lmasa ishlaydi.
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const ALLOW_DEV_AUTH = !IS_PRODUCTION && (process.env.ALLOW_DEV_AUTH === "1" || !BOT_TOKEN);
const OWNER_ID = String(process.env.OWNER_ID || "");

const DEV_USER = { id: "dev_1", first_name: "Test", last_name: "User", username: "testuser" };

function verifyInitData(initData) {
  if (!initData) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;
  params.delete("hash");

  const pairs = [];
  for (const [key, value] of [...params.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    pairs.push(`${key}=${value}`);
  }
  const dataCheckString = pairs.join("\n");

  const secretKey = crypto.createHmac("sha256", "WebAppData").update(BOT_TOKEN).digest();
  const computedHash = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  if (computedHash !== hash) return null;

  const userJson = params.get("user");
  if (!userJson) return null;
  try {
    return JSON.parse(userJson);
  } catch (e) {
    return null;
  }
}

function authMiddleware(db, settingsProvider) {
  return (req, res, next) => {
    const initData = req.header("X-Telegram-Init-Data") || "";
    let user = null;

    if (BOT_TOKEN && initData) {
      user = verifyInitData(initData);
    }
    if (!user && ALLOW_DEV_AUTH) {
      user = DEV_USER;
    }
    if (!user) {
      return res.status(401).json({ error: "Telegram autentifikatsiyasi muvaffaqiyatsiz" });
    }

    const name = [user.first_name, user.last_name].filter(Boolean).join(" ") || user.username || "User";
    db.addUser(user.id, name);

    const settings = settingsProvider();
    const isOwner = String(user.id) === OWNER_ID || String(user.id) === String(settings.ownerId || "");
    const isAdmin = isOwner || (settings.admins || []).map(String).includes(String(user.id));
    const isSupport = isAdmin || (settings.supports || []).map(String).includes(String(user.id));

    req.tgUser = {
      id: String(user.id),
      name,
      username: user.username ? "@" + user.username : "",
      isOwner,
      isAdmin,
      isSupport,
    };
    next();
  };
}

module.exports = { verifyInitData, authMiddleware, ALLOW_DEV_AUTH };
