const db = require("../database");

// Paket o'rnatilmagan bo'lsa ham bot yiqilmasligi uchun xavfsiz require
let Anthropic = null;
try { Anthropic = require("@anthropic-ai/sdk"); } catch (e) { /* paket yo'q — AI tavsiya o'chiq bo'ladi */ }

const client = (Anthropic && process.env.ANTHROPIC_API_KEY)
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

function isEnabled(userId) {
  const user = db.getUser(userId);
  return user?.aiEnabled !== false;
}

function setEnabled(userId, enabled) {
  db.updateUser(userId, { aiEnabled: enabled });
}

function addIgnored(userId, code) {
  const user = db.getUser(userId);
  const ignored = user?.aiIgnored || [];
  if (!ignored.includes(code.toUpperCase())) {
    ignored.push(code.toUpperCase());
    db.updateUser(userId, { aiIgnored: ignored });
  }
}

function getIgnored(userId) {
  return db.getUser(userId)?.aiIgnored || [];
}

// AI ishlamasa yoki sozlanmagan bo'lsa ham, yoqtirgan janrlarga qarab tavsiya beradi
function getFallbackRecommendations(userId) {
  const views = require("./views");
  const movies = db.getMovies();
  const liked = db.getUserLikedMovies(userId);
  const ignored = getIgnored(userId);
  const likedSet = new Set(liked);

  const candidates = Object.keys(movies).filter(c => !ignored.includes(c) && !likedSet.has(c));
  if (!candidates.length) return { ok: false, reason: "Hozircha tavsiya qilinadigan kino yo'q." };

  const likedGenres = new Set(
    liked.map(c => movies[c]?.genre).filter(Boolean)
  );

  let picked;
  if (likedGenres.size) {
    // Avval bir xil janrdagilarni, so'ng qolganini ko'rishlar soni bo'yicha saralaymiz
    const sameGenre = candidates.filter(c => likedGenres.has(movies[c]?.genre));
    const rest = candidates.filter(c => !likedGenres.has(movies[c]?.genre));
    const byViews = arr => arr.sort((a, b) => views.getViewCount(b) - views.getViewCount(a));
    picked = [...byViews(sameGenre), ...byViews(rest)].slice(0, 3);
  } else {
    // Hali hech narsa yoqtirmagan — eng ko'p ko'rilganlarni tavsiya qilamiz
    picked = candidates
      .sort((a, b) => views.getViewCount(b) - views.getViewCount(a))
      .slice(0, 3);
  }

  if (!picked.length) return { ok: false, reason: "Hozircha tavsiya qilinadigan kino yo'q." };
  return { ok: true, movies: picked.map(c => movies[c]).filter(Boolean) };
}

async function getRecommendations(userId) {
  if (!isEnabled(userId)) return { ok: false, reason: "AI tavsiya o'chirilgan." };

  const movies = db.getMovies();
  if (!Object.keys(movies).length) return { ok: false, reason: "Hali kinolar yo'q." };

  // AI sozlanmagan bo'lsa — to'g'ridan-to'g'ri janr asosidagi tavsiyaga o'tamiz
  if (!client) return getFallbackRecommendations(userId);

  const liked = db.getUserLikedMovies(userId);
  const ignored = getIgnored(userId);

  const allCodes = Object.keys(movies).filter(c => !ignored.includes(c));
  const likedMovies = liked.map(c => movies[c]).filter(Boolean);

  if (allCodes.length === 0) return { ok: false, reason: "Hali kinolar yo'q." };

  const movieList = allCodes.map(c => {
    const m = movies[c];
    return `${c}: "${m.name}" — ${m.description || ""}${m.genre ? ` [${m.genre}]` : ""}`;
  }).join("\n");

  const likedList = likedMovies.map(m =>
    `"${m.name}"${m.genre ? ` [${m.genre}]` : ""}`
  ).join(", ");

  const prompt = likedList
    ? `Foydalanuvchi quyidagi kinolarni yoqtirgan: ${likedList}.\n\nMavjud kinolar:\n${movieList}\n\nFoydalanuvchiga eng mos 3 ta kinoni tavsiya qil. Faqat kodlarni vergul bilan ajratib yoz (masalan: KN001, KN002, KN003). Boshqa hech narsa yozma.`
    : `Mavjud kinolar:\n${movieList}\n\nFoydalanuvchi hali kino ko'rmagan. Eng mashhur yoki yaxshi 3 ta kinoni tavsiya qil. Faqat kodlarni vergul bilan ajratib yoz. Boshqa hech narsa yozma.`;

  try {
    const msg = await client.messages.create({
      model: "claude-3-haiku-20240307",
      max_tokens: 100,
      messages: [{ role: "user", content: prompt }],
    });

    const text = msg.content[0]?.text?.trim() || "";
    const codes = text.split(",").map(c => c.trim().toUpperCase()).filter(c => movies[c]);

    if (!codes.length) return getFallbackRecommendations(userId);

    return {
      ok: true,
      movies: codes.map(c => movies[c]).filter(Boolean),
    };
  } catch (e) {
    // AI vaqtincha ishlamasa ham, foydalanuvchi xatolikni ko'rmaydi — janr asosida tavsiya beramiz
    return getFallbackRecommendations(userId);
  }
}

module.exports = { isEnabled, setEnabled, addIgnored, getIgnored, getRecommendations };
