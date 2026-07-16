/* Minimal SPA router: 4 root tabs (home/reels/search/profile) plus
   stacked detail views (movie/admin) that show a back button. */
const Router = (() => {
  const pages = {
    home: HomePage, reels: ReelsPage, search: SearchPage,
    profile: ProfilePage, movie: MoviePage, admin: AdminPage,
  };
  const tabs = ['home', 'reels', 'search', 'profile'];
  let stack = [{ name: 'home', params: {} }];

  const view = document.getElementById('view');
  const backBtn = document.getElementById('backBtn');
  const brandTitle = document.getElementById('brandTitle');
  const tabbar = document.getElementById('tabbar');

  const titles = { home: 'KINO', reels: 'REELS', search: 'QIDIRUV', profile: 'PROFIL', movie: 'KINO', admin: 'ADMIN' };

  async function render() {
    const top = stack[stack.length - 1];
    const isRoot = tabs.includes(top.name) && stack.length === 1;
    backBtn.hidden = isRoot;
    tabbar.style.display = isRoot ? 'flex' : (tabs.includes(top.name) ? 'flex' : 'none');
    brandTitle.querySelector('span:last-child').textContent = titles[top.name] || 'KINO';

    if (tabs.includes(top.name)) {
      document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === top.name));
    }

    view.scrollTop = 0;
    try {
      await pages[top.name].mount(view, top.params);
    } catch (e) {
      console.error('Render error:', e);
      view.innerHTML = `<div class="empty" style="padding-top:80px;">Xatolik yuz berdi. Qayta urinib ko'ring.</div>`;
    }
  }

  function go(name, params = {}) {
    if (!pages[name]) return console.error('Unknown route:', name);
    haptic('light');
    if (tabs.includes(name)) {
      stack = [{ name, params }];
    } else {
      stack.push({ name, params });
    }
    render();
  }

  function back() {
    if (stack.length > 1) {
      stack.pop();
      render();
    }
  }

  function reload() {
    render();
  }

  backBtn.addEventListener('click', back);
  tabbar.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => go(btn.dataset.tab));
  });

  // Telegram BackButton integration
  if (TG?.BackButton) {
    TG.onEvent('backButtonClicked', back);
  }

  return { go, back, reload, init: render };
})();
