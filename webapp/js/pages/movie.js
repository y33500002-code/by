const MoviePage = {
  async mount(root, { id }) {
    root.innerHTML = `<div class="screen">${skeletonMovie()}</div>`;
    const [movie, comments] = await Promise.all([API.getMovie(id), API.getComments(id)]);
    renderMovie(root, movie, comments);
  }
};

function skeletonMovie() {
  return `<div class="skeleton" style="height:280px;margin:0 -14px;"></div>
    <div style="padding:0 14px;">
      <div class="skeleton" style="height:22px;width:70%;border-radius:6px;margin:14px 0;"></div>
      <div class="skeleton" style="height:60px;border-radius:10px;"></div>
    </div>`;
}

function renderMovie(root, m, comments) {
  root.innerHTML = `
    <div class="movie-hero" id="movieHero">
      <video id="movieVideo"
        ${m.previewVideo ? `src="${m.previewVideo}" autoplay muted loop` : ''}
        playsinline poster="${m.poster}"></video>
      <div class="hero-play-overlay" id="heroPlayOverlay">
        <div class="hero-play-btn">
          <svg viewBox="0 0 24 24" style="width:26px;height:26px;margin-left:3px;"><path d="M8 5v14l11-7z" fill="#fff"/></svg>
        </div>
      </div>
      <button class="hero-close-btn" id="heroCloseBtn" hidden title="Yopish">
        <svg viewBox="0 0 24 24" style="width:16px;height:16px;"><path d="M6 6l12 12M18 6L6 18" stroke="#fff" stroke-width="2.2" fill="none" stroke-linecap="round"/></svg>
      </button>
      <button class="hero-fullscreen-btn" id="heroFsBtn" hidden title="To'liq ekran / gorizontal">
        <svg viewBox="0 0 24 24" style="width:16px;height:16px;"><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
      <div class="hero-spinner" id="heroSpinner" hidden></div>
    </div>
    <div class="movie-body">
      <div class="movie-title">${escapeHtml(m.title)}</div>
      <div class="meta-row">
        <span class="meta-chip">${m.year}</span>
        <span class="meta-chip">${escapeHtml(m.genre)}</span>
        <span class="meta-chip">${escapeHtml(m.country)}</span>
        <span class="meta-chip">${fmtDuration(m.duration)}</span>
        <span class="meta-chip">${escapeHtml(m.language)}</span>
        <span class="meta-chip">${m.quality}</span>
      </div>
      <div class="stat-row">
        <div><b>${fmtNumber(m.views)}</b>ko'rildi</div>
        <div id="likeCount"><b>${fmtNumber(m.likes)}</b>like</div>
        <div><b>⭐ ${m.rating}</b>reyting</div>
      </div>

      <button class="btn btn-primary btn-block" id="btnWatch" style="margin:10px 0;">
        <svg viewBox="0 0 24 24" style="width:18px;height:18px;margin-right:6px;"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>
        ${m.progress ? `Davom etish (${m.progress}%)` : 'Tomosha qilish'}
      </button>

      <div class="action-row">
        <button class="action-btn ${m.liked ? 'on' : ''}" id="btnLike">
          <svg viewBox="0 0 24 24"><path d="M12 20s-7-4.5-9.5-9C.5 7 3 3.5 6.5 3.5c2 0 3.5 1 5.5 3 2-2 3.5-3 5.5-3C21 3.5 23.5 7 21.5 11 19 15.5 12 20 12 20z" stroke="currentColor" stroke-width="1.6" fill="${m.liked ? 'currentColor' : 'none'}"/></svg>
          Like
        </button>
        <button class="action-btn save ${m.saved ? 'on' : ''}" id="btnSave">
          <svg viewBox="0 0 24 24"><path d="M6 3.5h12v17l-6-4-6 4v-17z" stroke="currentColor" stroke-width="1.6" fill="${m.saved ? 'currentColor' : 'none'}"/></svg>
          Saqlash
        </button>
        <button class="action-btn" id="btnShare">
          <svg viewBox="0 0 24 24"><path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M12 3v13M8 7l4-4 4 4" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
          Ulashish
        </button>
      </div>

      <div class="desc">${escapeHtml(m.description)}</div>

      <div class="section-head" style="padding:0;">
        <div class="section-title">Izohlar (<span id="commentCountVal">${comments.length}</span>)</div>
      </div>
      <div id="commentsList">${comments.map(commentHtml).join('') || emptyCommentsHtml()}</div>
      <div class="comment-input">
        <input id="commentInput" placeholder="Izoh yozing...">
        <button class="btn btn-primary btn-sm" id="commentSend">Yuborish</button>
      </div>
    </div>
  `;

  // Preview video mobil brauzerlarda muted holda — "Ovozni yoqish" overlay
  const heroVideo = root.querySelector('#movieVideo');
  const heroWrap = root.querySelector('#movieHero');
  const heroOverlay = root.querySelector('#heroPlayOverlay');
  const heroCloseBtn = root.querySelector('#heroCloseBtn');
  const heroFsBtn = root.querySelector('#heroFsBtn');
  const heroSpinner = root.querySelector('#heroSpinner');
  const watchBtn = root.querySelector('#btnWatch');

  if (heroVideo && m.previewVideo) {
    Player.attachUnmuteOverlay(heroVideo, heroWrap);
  }

  let isFull = false;

  const goFullscreenLandscape = async () => {
    try {
      if (heroVideo.requestFullscreen) await heroVideo.requestFullscreen();
      else if (heroVideo.webkitEnterFullscreen) heroVideo.webkitEnterFullscreen(); // iOS Safari
      else if (heroWrap.requestFullscreen) await heroWrap.requestFullscreen();
      if (screen.orientation && screen.orientation.lock) {
        screen.orientation.lock('landscape').catch(() => {});
      }
    } catch (e) { /* fullscreen/orientation qo'llab-quvvatlanmasa jim o'tkazamiz */ }
  };

  // To'liq kinoni ko'rish — webapp ichida ijro etilmaydi, buning o'rniga
  // botga qaytarib, kino botning o'zida (chatda) video sifatida yuboriladi.
  function playFull() {
    if (!hasFullOrPreview(m)) {
      toast("Bu kino hali qo'shilmagan yoki admin tomonidan yuklanmagan.");
      return;
    }
    if (!m.videoUrl) {
      // Faqat prevyu bor, to'liq kino hali yo'q
      toast("To'liq kino hali yuklanmagan. Tez orada qo'shiladi ⏳");
      return;
    }
    haptic('medium');
    const botUser = window.__BOT_USERNAME__ || 'Kent_savdo_bot';
    const botLink = `https://t.me/${botUser}?start=movie_${m.id}`;
    // Web app'ni to'liq yopamiz — botga o'tib kino video sifatida yuboriladi.
    // Bot xabarida "Ilovaga qaytish" tugmasi bo'ladi, shu orqali foydalanuvchi
    // istagan payt mini app'ga xuddi shu kino sahifasiga qaytib kirishi mumkin.
    const tg = window.Telegram?.WebApp;
    if (tg?.openTelegramLink) {
      tg.openTelegramLink(botLink);
      tg.close();
    } else if (tg?.openLink) {
      tg.openLink(botLink);
    } else {
      window.open(botLink, '_blank');
    }
  }

  function backToPreview() {
    isFull = false;
    heroWrap.classList.remove('hero-full');
    heroCloseBtn.hidden = true;
    heroFsBtn.hidden = true;
    heroSpinner.hidden = true;
    try { if (document.fullscreenElement) document.exitFullscreen(); } catch (e) {}
    try { if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock(); } catch (e) {}

    heroVideo.pause();
    heroVideo.controls = false;
    if (m.previewVideo) {
      heroVideo.muted = true;
      heroVideo.loop = true;
      heroVideo.src = m.previewVideo;
      heroVideo.load();
      heroVideo.play().catch(() => {});
    } else {
      heroVideo.removeAttribute('src');
      heroVideo.load();
    }
    heroOverlay.style.display = '';
    if (watchBtn) watchBtn.textContent = m.progress ? `Davom etish (${m.progress}%)` : 'Tomosha qilish';
  }

  heroVideo?.addEventListener('waiting', () => { if (isFull) heroSpinner.hidden = false; });
  heroVideo?.addEventListener('playing', () => { heroSpinner.hidden = true; });
  heroVideo?.addEventListener('canplay', () => { heroSpinner.hidden = true; });
  heroVideo?.addEventListener('ended', () => { if (isFull) backToPreview(); });
  heroVideo?.addEventListener('error', () => {
    if (isFull) { heroSpinner.hidden = true; toast("Video yuklab bo'lmadi. Internetni tekshiring yoki qayta urinib ko'ring."); }
  });

  heroOverlay.onclick = playFull;
  heroCloseBtn.onclick = (e) => { e.stopPropagation(); haptic('light'); backToPreview(); };
  heroFsBtn.onclick = (e) => { e.stopPropagation(); haptic('light'); goFullscreenLandscape(); };

  // Like
  root.querySelector('#btnLike').onclick = async (e) => {
    haptic('light');
    const btn = e.currentTarget;
    btn.classList.toggle('on');
    const isOn = btn.classList.contains('on');
    btn.querySelector('svg path').setAttribute('fill', isOn ? 'currentColor' : 'none');
    const res = await API.likeMovie(m.id).catch(() => null);
    if (res && typeof res.likes === 'number') {
      const el = root.querySelector('#likeCount b');
      if (el) el.textContent = fmtNumber(res.likes);
    }
  };

  // Save
  root.querySelector('#btnSave').onclick = async (e) => {
    haptic('light');
    const btn = e.currentTarget;
    btn.classList.toggle('on');
    btn.querySelector('svg path').setAttribute('fill', btn.classList.contains('on') ? 'currentColor' : 'none');
    await API.saveMovie(m.id).catch(() => {});
    toast(btn.classList.contains('on') ? 'Saqlandi ✅' : 'Saqlanganlardan olib tashlandi');
  };

  // Share — Telegram share link + clipboard fallback
  root.querySelector('#btnShare').onclick = () => {
    haptic('light');
    const botLink = `https://t.me/${window.__BOT_USERNAME__ || 'Kent_savdo_bot'}?start=movie_${m.id}`;
    const text = `🎬 ${m.title}`;
    const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(botLink)}&text=${encodeURIComponent(text)}`;
    if (window.Telegram?.WebApp?.openTelegramLink) {
      window.Telegram.WebApp.openTelegramLink(shareUrl);
    } else if (window.Telegram?.WebApp?.openLink) {
      window.Telegram.WebApp.openLink(shareUrl);
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(botLink).then(() => toast('Havola nusxalandi 📋'));
    } else {
      toast('Havola: ' + botLink);
    }
  };

  // Watch — endi alohida sheet ochilmaydi, prevyu ustida to'liq kino ijro bo'ladi (YouTube uslubida)
  root.querySelector('#btnWatch').onclick = () => {
    if (isFull) return; // allaqachon ijro bo'lyapti
    playFull();
  };

  // Comments
  const list = root.querySelector('#commentsList');
  const countEl = root.querySelector('#commentCountVal');
  root.querySelector('#commentSend').onclick = async () => {
    const input = root.querySelector('#commentInput');
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    try {
      const c = await API.postComment(m.id, text);
      if (list.querySelector('.empty')) list.innerHTML = '';
      list.insertAdjacentHTML('afterbegin', commentHtml(c));
      if (countEl) countEl.textContent = list.querySelectorAll('.comment').length;
      haptic('success');
    } catch (e) {
      const msg = e?.message || '';
      toast(msg.includes('429') ? 'Kunlik izoh limiti tugadi' : 'Izoh yuborishda xato');
    }
  };
}

function emptyCommentsHtml() {
  return `<div class="empty" style="padding:24px 10px;">Birinchi bo'lib izoh qoldiring</div>`;
}

function commentHtml(c) {
  return `
    <div class="comment">
      <div class="avatar">${initials(c.user.name)}</div>
      <div class="comment-body">
        <div class="comment-name">${escapeHtml(c.user.name)} ${c.user.premium ? '<span class="badge-premium">PRO</span>' : ''}</div>
        <div class="comment-text">${escapeHtml(c.text)}</div>
        <div class="comment-meta">
          <span>${c.time}</span>
          <span>❤️ ${c.likes}</span>
        </div>
      </div>
    </div>`;
}

function hasFullOrPreview(m) {
  return !!(m.videoUrl || m.previewVideo);
}
