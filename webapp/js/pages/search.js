const SearchPage = {
  mode: 'all',
  async mount(root) {
    root.innerHTML = `
      <div class="screen">
        <div class="search-bar">
          <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="1.8" fill="none"/><path d="M20 20l-4-4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
          <input id="searchInput" placeholder="Kino nomi, kodi yoki foydalanuvchi...">
        </div>
        <div class="seg">
          <button class="active" data-mode="all">Hammasi</button>
          <button data-mode="movies">Kinolar</button>
          <button data-mode="users">Userlar</button>
        </div>
        <div id="searchResults">${emptyState('Qidiruvni boshlang', 'Kino nomi, kodi (masalan: ABC123) yoki foydalanuvchi ismini yozing')}</div>
      </div>`;

    const input = root.querySelector('#searchInput');
    root.querySelectorAll('.seg button').forEach(b => b.onclick = () => {
      root.querySelectorAll('.seg button').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      this.mode = b.dataset.mode;
      run(input.value.trim());
    });

    let t;
    input.oninput = () => {
      clearTimeout(t);
      t = setTimeout(() => run(input.value.trim()), 300);
    };

    const run = async (q) => {
      const results = document.getElementById('searchResults');
      if (!q) {
        results.innerHTML = emptyState('Qidiruvni boshlang', 'Kino nomi, kodi (masalan: ABC123) yoki foydalanuvchi ismini yozing');
        return;
      }
      results.innerHTML = `<div class="skeleton" style="height:80px;border-radius:12px;"></div>`;
      const { movies, users } = await API.search(q, this.mode);
      if (!movies.length && !users.length) {
        results.innerHTML = emptyState('Hech narsa topilmadi', `"${escapeHtml(q)}" bo'yicha natija yo'q`);
        return;
      }
      results.innerHTML = `
        ${users.length ? `<div class="section-title" style="margin-bottom:8px;">Foydalanuvchilar</div>${users.map(userRowHtml).join('')}` : ''}
        ${movies.length ? `<div class="section-title" style="margin:16px 0 10px;">Kinolar</div><div class="grid-2">${movies.map(posterCardHtml).join('')}</div>` : ''}
      `;
      bindPosterNav(results);
      results.querySelectorAll('[data-user]').forEach(el => {
        el.onclick = () => Router.go('profile', { id: el.dataset.user });
      });
    };
  }
};

function userRowHtml(u) {
  const avatarStyle = u.premiumColor
    ? `style="background:${u.premiumColor};box-shadow:0 0 0 2px ${u.premiumColor}44;"`
    : u.premium ? 'style="box-shadow:0 0 0 2px var(--gold);"' : '';
  const avatarContent = u.avatar
    ? `<img src="${u.avatar}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;" onerror="this.style.display='none';">`
    : initials(u.name);

  return `
    <div class="user-row" data-user="${u.id}">
      <div class="avatar" ${avatarStyle}>${avatarContent}</div>
      <div style="flex:1;">
        <div class="user-name">
          ${escapeHtml(u.name)}
          ${u.premium ? '<span class="badge-premium">PRO</span>' : ''}
          ${u.premiumColor ? `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${u.premiumColor};margin-left:4px;vertical-align:middle;"></span>` : ''}
        </div>
        <div class="user-sub">${escapeHtml(u.username || '')}</div>
      </div>
    </div>`;
}
