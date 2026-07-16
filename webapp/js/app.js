/* App bootstrap. */
(async function init() {
  // Agar ilova Telegram WebApp orqali emas, oddiy brauzerda ochilgan bo'lsa —
  // initData bo'lmaydi va barcha /api so'rovlari 401 bilan qaytadi. Bu holatda
  // har bir sahifada noaniq "Ulanishda xatolik" ko'rsatish o'rniga, darhol
  // aniq va tushunarli xabar beramiz.
  const tgEarly = window.Telegram?.WebApp;
  tgEarly?.ready?.();
  tgEarly?.expand?.();
  if (!tgEarly || !tgEarly.initData) {
    document.getElementById('app').innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;padding:32px;text-align:center;gap:14px;">
        <div style="font-size:44px;">🎬</div>
        <div style="font-size:17px;font-weight:600;color:var(--text,#fff);">Ilova to'g'ridan-to'g'ri ochilmadi</div>
        <div style="font-size:14px;color:var(--text-secondary,#9a97a5);line-height:1.5;">
          Bu Mini App faqat Telegram bot ichidan ochilishi kerak.<br>
          Botga o'ting va "🎬 Open Movie App" tugmasini bosing.<br><br>
          Agar botdan ochgan bo'lsangiz-u baribir shu xabarni ko'rsangiz — internet aloqasi vaqtincha uzilgan bo'lishi mumkin, birozdan so'ng qayta urinib ko'ring.
        </div>
        <button onclick="location.reload()" style="margin-top:8px;padding:10px 22px;border-radius:12px;border:none;background:var(--accent,#6C5CE7);color:#fff;font-weight:600;">Qayta yuklash</button>
      </div>`;
    return;
  }

  // Resolve current user + admin flag, and fetch public config (bot username).
  const [meResult, configResult] = await Promise.allSettled([
    API.getMe(),
    fetch((window.__API_BASE__ || '') + '/api/config').then(r => r.json()),
  ]);

  if (meResult.status === 'fulfilled') {
    Store.me = meResult.value;
    Store.isAdmin = !!meResult.value.isAdmin;
  } else {
    Store.isAdmin = false;
    if (window.__DEBUG__) console.error('getMe xatosi:', meResult.reason);
  }

  if (configResult.status === 'fulfilled' && configResult.value?.botUsername) {
    window.__BOT_USERNAME__ = configResult.value.botUsername;
  }

  document.getElementById('notifBtn').addEventListener('click', openNotifications);
  refreshNotifDot();

  Router.init();

  // Deep-link: bot ulashish havolasi orqali kelgan bo'lsa → kinoga o'tish
  // Telegram WebApp startParam: ?startapp=movie_KN001  yoki  bot ?start=movie_KN001 dan webApp ochilsa
  const tg = window.Telegram?.WebApp;
  const startParam = tg?.initDataUnsafe?.start_param || new URLSearchParams(window.location.search).get('movie');
  if (startParam) {
    const code = startParam.startsWith('movie_') ? startParam.slice(6) : startParam;
    if (code) setTimeout(() => Router.go('movie', { id: code }), 300);
  }
})();

async function openNotifications() {
  const list = await API.getNotifications().catch(() => []);
  openSheet(`
    <div class="section-title" style="margin-bottom:14px;">Bildirishnomalar</div>
    ${list.length ? list.map(n => `
      <div class="comment" style="border-bottom:1px solid var(--border);">
        <div class="avatar">${notifIcon(n.type)}</div>
        <div class="comment-body">
          <div class="comment-text" style="color:var(--text);">${escapeHtml(n.text)}</div>
          <div class="comment-meta"><span>${n.time}</span></div>
        </div>
      </div>`).join('') : `<div class="empty">Hozircha bildirishnoma yo'q</div>`}
  `);
  document.getElementById('notifDot').hidden = true;
}

function notifIcon(type) {
  return { follow: '➕', like: '❤️', comment: '💬', gift: '🎁' }[type] || '🔔';
}

async function refreshNotifDot() {
  const list = await API.getNotifications().catch(() => []);
  document.getElementById('notifDot').hidden = !list.some(n => !n.read);
}
