const HomePage = {
  async mount(root) {
    root.innerHTML = `<div class="screen" id="homeScreen">${skeletonHome()}</div>`;
    try {
      const data = await API.getHome();
      Store.homeData = data;
      if (!data || !data.hero) {
        document.getElementById('homeScreen').innerHTML = emptyState('Kinolar hali yo\'q', 'Admin hali kino qo\'shmagan. Tez orada yangi kinolar qo\'shiladi!');
        return;
      }
      renderHome(document.getElementById("homeScreen"), data);
    } catch (e) {
      if (window.__DEBUG__) console.error('HOME MOUNT ERROR:', e);
      const screen = document.getElementById('homeScreen');
      const msg = e?.status === 401
        ? 'Sessiya tasdiqlanmadi. Botni yopib, "🎬 Open Movie App" tugmasi orqali qaytadan oching.'
        : 'Serverga ulanib bo\'lmadi. Internetni tekshirib, qayta urinib ko\'ring.';
      if (screen) screen.innerHTML = emptyState('Ulanishda xatolik', msg);
    }
  }
};

function skeletonHome() {
  return `
    <div class="skeleton" style="height:220px;border-radius:22px;margin-bottom:18px;"></div>
    ${[1,2,3].map(() => `
      <div class="section">
        <div class="skeleton" style="height:16px;width:120px;border-radius:6px;margin:0 14px 10px;"></div>
        <div class="row-scroll">
          ${[1,2,3,4].map(()=>`<div class="skeleton" style="width:118px;height:168px;border-radius:16px;flex:0 0 auto;"></div>`).join('')}
        </div>
      </div>`).join('')}
  `;
}

function emptyState(title, sub) {
  return `<div class="empty">
    <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M9 10h.01M15 10h.01M8.5 15c1 1 2.2 1.5 3.5 1.5s2.5-.5 3.5-1.5" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg>
    <div style="font-weight:700;color:var(--text);margin-bottom:4px;">${title}</div>
    <div style="font-size:12.5px;">${sub}</div>
  </div>`;
}

function renderHome(root, data) {
  const hero = data.hero;
  root.innerHTML = `
    <div class="hero" data-nav="movie" data-id="${hero.id}">
      <img src="${hero.poster}" alt="${escapeHtml(hero.title)}">
      <div class="hero-content">
        <span class="hero-badge">TRENDING #1</span>
        <div class="hero-title">${escapeHtml(hero.title)}</div>
        <div class="hero-meta">${hero.year} · ${escapeHtml(hero.genre)} · ⭐ ${hero.rating}</div>
        <div class="hero-actions">
          <button class="btn btn-primary" id="heroWatch">
            <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z" fill="currentColor"/></svg> Tomosha qilish
          </button>
          <button class="btn btn-ghost" id="heroInfo">Batafsil</button>
        </div>
      </div>
    </div>

    <div class="chip-row" id="genreChips">
      <div class="chip active" data-genre="">Hammasi</div>
      ${data.genres.map(g => `<div class="chip" data-genre="${escapeHtml(g)}">${escapeHtml(g)}</div>`).join('')}
    </div>

    ${sectionHtml('🔥 Trendda', data.trending)}
    ${sectionHtml('▶️ Davom ettirish', data.continueWatching)}
    ${sectionHtml('🆕 Yangi kinolar', data.newMovies)}
    ${sectionHtml('⭐ Mashhur', data.popular)}
    ${sectionHtml('🎯 Siz uchun tavsiya', data.recommended)}
  `;

  root.querySelector('#heroWatch').onclick = () => Router.go('movie', { id: hero.id });
  root.querySelector('#heroInfo').onclick = () => Router.go('movie', { id: hero.id });
  bindPosterNav(root);

  root.querySelectorAll('#genreChips .chip').forEach(chip => {
    chip.onclick = async () => {
      root.querySelectorAll('#genreChips .chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      const genre = chip.dataset.genre;
      if (!genre) { renderHome(root, data); return; }
      const movies = await API.getMoviesByGenre(genre);
      const filteredSection = document.createElement('div');
      filteredSection.innerHTML = sectionHtml(genre, movies, false) || emptyState('Topilmadi', 'Bu janrda hozircha kino yo\'q');
      const oldSections = root.querySelectorAll('.section');
      oldSections.forEach(s => s.remove());
      root.appendChild(filteredSection.firstElementChild || filteredSection);
      bindPosterNav(root);
    };
  });
}
