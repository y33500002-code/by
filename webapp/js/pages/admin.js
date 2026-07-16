const AdminPage = {
  tab: 'movies',

  async mount(root) {
    root.innerHTML = `<div class="screen">${skeletonAdmin()}</div>`;
    await renderAdmin(root, this.tab);
  }
};

function skeletonAdmin() {
  return `<div class="skeleton" style="height:70px;border-radius:12px;margin-bottom:14px;"></div>
    ${[1,2,3].map(()=>`<div class="skeleton" style="height:64px;border-radius:10px;margin-bottom:8px;"></div>`).join('')}`;
}

const ADMIN_TABS = [
  { key: 'movies', label: 'Kinolar' },
  { key: 'users', label: 'Userlar' },
  { key: 'premium', label: 'Premium so\'rovlar' },
  { key: 'settings', label: 'Sozlamalar' },
];

async function renderAdmin(root, tab) {
  AdminPage.tab = tab;
  const stats = await API.adminStats().catch(() => ({ totalMovies:0, totalUsers:0, totalViews:0, premiumUsers:0 }));

  root.innerHTML = `
    <div class="screen">
      <div class="screen-title">Admin panel</div>
      <div class="profile-stats" style="margin-bottom:18px;">
        <div><b>${fmtNumber(stats.totalMovies)}</b><span>Kinolar</span></div>
        <div><b>${fmtNumber(stats.totalUsers)}</b><span>Userlar</span></div>
        <div><b>${fmtNumber(stats.totalViews)}</b><span>Ko'rishlar</span></div>
        <div><b>${fmtNumber(stats.premiumUsers)}</b><span>Premium</span></div>
      </div>
      <div class="tabs-underline" id="adminTabs">
        ${ADMIN_TABS.map(t => `<button data-tab="${t.key}" class="${t.key===tab?'active':''}">${t.label}</button>`).join('')}
      </div>
      <div id="adminTabContent"><div class="skeleton" style="height:64px;border-radius:10px;"></div></div>
    </div>
  `;

  root.querySelectorAll('#adminTabs button').forEach(btn => {
    btn.onclick = () => { haptic('light'); renderAdmin(root, btn.dataset.tab); };
  });

  const content = root.querySelector('#adminTabContent');
  if (tab === 'movies') await mountMoviesTab(root, content);
  else if (tab === 'users') await mountUsersTab(content);
  else if (tab === 'premium') await mountPremiumTab(content);
  else if (tab === 'settings') await mountSettingsTab(content);
}

/* ===================== KINOLAR ===================== */

async function mountMoviesTab(root, content) {
  const movies = await API.adminListMovies();
  content.innerHTML = `
    <div class="section-head" style="padding:0;">
      <div class="section-title">Kinolar ro'yxati</div>
    </div>
    <div id="adminMovieList">${movies.map(adminItemHtml).join('') || emptyHtml("Hali kino qo'shilmagan")}</div>
  `;
  bindAdminActions(content, movies);

  let fab = document.getElementById('addMovieFab');
  if (!fab) {
    fab = document.createElement('button');
    fab.className = 'fab';
    fab.id = 'addMovieFab';
    fab.setAttribute('aria-label', "Kino qo'shish");
    fab.innerHTML = `<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>`;
    root.appendChild(fab);
  }
  fab.hidden = false;
  fab.onclick = () => openMovieForm();
}

function adminItemHtml(m) {
  return `
    <div class="admin-list-item" data-id="${m.id}">
      <img src="${m.poster}" alt="">
      <div class="grow">
        <div class="t">${escapeHtml(m.title)}</div>
        <div class="s">${m.year} · ${escapeHtml(m.genre)} · ${fmtNumber(m.views)} ko'rish${m.previewVideo ? ' · 🎞 reels' : ''}</div>
      </div>
      <button class="btn btn-sm btn-surface" data-edit="${m.id}">Tahrirlash</button>
      <button class="btn btn-sm" style="background:var(--danger);color:#fff;" data-del="${m.id}">O'chirish</button>
    </div>`;
}

function bindAdminActions(root, movies) {
  root.querySelectorAll('[data-edit]').forEach(btn => {
    btn.onclick = () => openMovieForm(movies.find(m => m.id === btn.dataset.edit));
  });
  root.querySelectorAll('[data-del]').forEach(btn => {
    btn.onclick = async () => {
      if (!confirm('Kinoni o\'chirishga ishonchingiz komilmi?')) return;
      await API.adminDeleteMovie(btn.dataset.del).catch(() => {});
      btn.closest('.admin-list-item').remove();
      toast('Kino o\'chirildi');
    };
  });
}

function openMovieForm(movie) {
  const isEdit = !!movie;
  openSheet(`
    <div class="section-title" style="margin-bottom:14px;">${isEdit ? "Kinoni tahrirlash" : "Yangi kino qo'shish"}</div>
    <div class="form-field"><label>Nomi</label><input id="f_title" value="${movie ? escapeHtml(movie.title) : ''}"></div>
    <div class="form-field"><label>Tavsif</label><textarea id="f_desc">${movie ? escapeHtml(movie.description) : ''}</textarea></div>
    <div style="display:flex;gap:10px;">
      <div class="form-field" style="flex:1;"><label>Janr</label><input id="f_genre" value="${movie ? escapeHtml(movie.genre) : ''}"></div>
      <div class="form-field" style="flex:1;"><label>Yil</label><input id="f_year" type="number" value="${movie ? movie.year : 2026}"></div>
    </div>
    <div style="display:flex;gap:10px;">
      <div class="form-field" style="flex:1;"><label>Davlat</label><input id="f_country" value="${movie ? escapeHtml(movie.country) : "O'zbekiston"}"></div>
      <div class="form-field" style="flex:1;"><label>Davomiyligi (daq)</label><input id="f_duration" type="number" value="${movie ? movie.duration : 90}"></div>
    </div>
    <div class="form-field">
      <label>Poster (Telegram file_id yoki URL)</label>
      <input id="f_poster" value="${movie ? escapeHtml(movie.poster || '') : ''}" placeholder="Telegram file_id yoki https://...">
      <div style="font-size:11px;color:var(--text-mute);margin-top:4px;">
        📌 file_id olish: botga rasm yuboring → bot avtomatik file_id ni xabarga yozib beradi.
      </div>
    </div>
    <div class="form-field">
      <label>Asosiy kino — video file_id</label>
      <input id="f_fileId" value="${movie ? escapeHtml(movie.fileId || '') : ''}" placeholder="Kino videosini botga yuboring → file_id nusxalang">
      <div style="font-size:11px;color:var(--text-mute);margin-top:4px;">
        📌 "Tomosha qilish" tugmasi bosilganda shu video foydalanuvchiga yuboriladi. Siqilmasdan yuborish uchun <b>fayl sifatida</b> yuboring.
      </div>
    </div>
    <div class="form-field">
      <label>Reels prevyu video (qisqa klip, ixtiyoriy)</label>
      <input id="f_preview" value="${movie ? escapeHtml(movie.previewFileId || '') : ''}" placeholder="15–60 soniyalik klipni botga yuboring → file_id">
      <div style="font-size:11px;color:var(--text-mute);margin-top:4px;">
        📌 To'ldirilsa kino Reels bo'limida ham ko'rinadi.
      </div>
    </div>
    <div class="form-field"><label>Sifat</label>
      <select id="f_quality"><option ${movie?.quality==='HD'?'selected':''}>HD</option><option ${movie?.quality==='4K'?'selected':''}>4K</option></select>
    </div>
    <button class="btn btn-primary btn-block" id="saveMovieBtn">${isEdit ? 'Saqlash' : "Qo'shish"}</button>
  `);

  document.getElementById('saveMovieBtn').onclick = async () => {
    const data = {
      title: val('f_title'), description: val('f_desc'), genre: val('f_genre'),
      year: Number(val('f_year')), country: val('f_country'), duration: Number(val('f_duration')),
      poster: val('f_poster'), previewFileId: val('f_preview') || null, quality: val('f_quality'),
      fileId: val('f_fileId') || null, fileType: val('f_fileId') ? 'video' : null,
    };
    if (!data.title) { toast('Kino nomini kiriting'); return; }
    try {
      let result;
      if (isEdit) { await API.adminUpdateMovie(movie.id, data); result = { id: movie.id }; }
      else result = await API.adminCreateMovie(data);
      closeSheet();
      const movieId = result?.id || result?.code || data.title.replace(/\s+/g, '_').toUpperCase();
      const shareLink = `https://t.me/${window.__BOT_USERNAME__ || 'Kent_savdo_bot'}?start=movie_${movieId}`;
      openSheet(`
        <div style="text-align:center;padding:16px 0 8px;">
          <div style="font-size:40px;margin-bottom:10px;">✅</div>
          <div style="font-weight:700;font-size:17px;margin-bottom:6px;">${isEdit ? 'Yangilandi' : "Qo'shildi"}</div>
          <div style="color:var(--text-dim);font-size:13px;margin-bottom:16px;">
            ${isEdit ? 'Kino muvaffaqiyatli yangilandi.' : 'Kino muvaffaqiyatli qo\'shildi.'}
          </div>
          <div style="background:var(--surface-2);border-radius:10px;padding:12px;margin-bottom:14px;word-break:break-all;font-size:13px;text-align:left;">
            <div style="color:var(--text-dim);margin-bottom:4px;font-size:11px;">🔗 Ulashish havolasi:</div>
            <code id="shareLinkVal" style="color:var(--accent);">${shareLink}</code>
          </div>
          <button class="btn btn-primary btn-block" id="copyShareBtn">📋 Havolani nusxalash</button>
          <button class="btn btn-surface btn-block" style="margin-top:8px;" id="closeSaveSheet">Yopish</button>
        </div>
      `);
      document.getElementById('copyShareBtn')?.addEventListener('click', () => {
        haptic('light');
        if (navigator.clipboard) {
          navigator.clipboard.writeText(shareLink).then(() => toast('Havola nusxalandi 📋'));
        } else {
          const el = document.getElementById('shareLinkVal');
          if (el) { const sel = window.getSelection(); const range = document.createRange(); range.selectNode(el); sel.removeAllRanges(); sel.addRange(range); }
          toast('Havolani belgilab nusxalang');
        }
      });
      document.getElementById('closeSaveSheet')?.addEventListener('click', () => { closeSheet(); Router.reload(); });
    } catch (e) {
      toast('Xatolik yuz berdi');
    }
  };
}

/* ===================== USERLAR ===================== */

async function mountUsersTab(content) {
  content.innerHTML = `
    <div class="form-field" style="margin-bottom:14px;">
      <input id="userSearchInput" placeholder="Ism, username yoki ID bo'yicha qidirish...">
    </div>
    <div id="adminUserList">${skeletonAdmin()}</div>
  `;
  const list = content.querySelector('#adminUserList');
  const search = content.querySelector('#userSearchInput');

  let debounceTimer;
  search.oninput = () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => loadUsers(list, search.value.trim()), 300);
  };

  await loadUsers(list, '');
}

async function loadUsers(list, q) {
  const users = await API.adminListUsers(q).catch(() => []);
  list.innerHTML = users.map(userItemHtml).join('') || emptyHtml("Foydalanuvchi topilmadi");
  list.querySelectorAll('[data-grant]').forEach(btn => {
    btn.onclick = () => openGrantPremiumForm(btn.dataset.grant, users.find(u => u.id === btn.dataset.grant));
  });
  list.querySelectorAll('[data-revoke]').forEach(btn => {
    btn.onclick = async () => {
      if (!confirm("Premiumni bekor qilishga ishonchingiz komilmi?")) return;
      await API.adminRevokePremium(btn.dataset.revoke).catch(() => {});
      toast('Premium bekor qilindi');
      loadUsers(list, document.getElementById('userSearchInput')?.value.trim() || '');
    };
  });
}

function userItemHtml(u) {
  const roleTag = u.isOwner ? ' · 👑 Owner' : u.isAdmin ? ' · 🛡 Admin' : u.isSupport ? ' · 🎧 Support' : '';
  return `
    <div class="admin-list-item" data-id="${u.id}">
      <div style="width:44px;height:44px;border-radius:50%;background:var(--surface-2);display:flex;align-items:center;justify-content:center;font-weight:700;color:var(--text-dim);flex-shrink:0;">${initials(u.name)}</div>
      <div class="grow">
        <div class="t">${escapeHtml(u.name)} ${u.premium ? '👑' : ''}</div>
        <div class="s">${escapeHtml(u.username || u.id)}${roleTag} · ${fmtNumber(u.coins)} coin${u.premium ? ` · ${u.premiumPlan} (${u.premiumDaysLeft} kun qoldi)` : ''}</div>
      </div>
      ${u.premium
        ? `<button class="btn btn-sm" style="background:var(--danger);color:#fff;" data-revoke="${u.id}">Olib qo'yish</button>`
        : `<button class="btn btn-sm btn-primary" data-grant="${u.id}">Premium berish</button>`}
    </div>`;
}

function openGrantPremiumForm(userId, user) {
  const plans = [
    { key: '1m', label: '1 oy' }, { key: '3m', label: '3 oy' },
    { key: '6m', label: '6 oy' }, { key: '1y', label: '1 yil' },
  ];
  openSheet(`
    <div class="section-title" style="margin-bottom:14px;">${escapeHtml(user?.name || userId)} ga Premium berish</div>
    <div class="form-field">
      <label>Tarif</label>
      <select id="grantPlanSelect">${plans.map(p => `<option value="${p.key}">${p.label}</option>`).join('')}</select>
    </div>
    <button class="btn btn-primary btn-block" id="grantPremiumBtn">Premium berish</button>
  `);
  document.getElementById('grantPremiumBtn').onclick = async () => {
    const plan = document.getElementById('grantPlanSelect').value;
    try {
      await API.adminGrantPremium(userId, plan);
      closeSheet();
      toast('Premium berildi');
      Router.reload();
    } catch (e) {
      toast('Xatolik yuz berdi');
    }
  };
}

/* ===================== PREMIUM SO'ROVLAR ===================== */

async function mountPremiumTab(content) {
  content.innerHTML = skeletonAdmin();
  const pending = await API.adminPendingPremium().catch(() => []);
  content.innerHTML = `
    <div class="section-head" style="padding:0;">
      <div class="section-title">Kutilayotgan so'rovlar</div>
    </div>
    <div id="pendingList">${pending.map(pendingItemHtml).join('') || emptyHtml("Hozircha kutilayotgan so'rov yo'q")}</div>
  `;
  content.querySelectorAll('[data-approve]').forEach(btn => {
    btn.onclick = async () => {
      btn.disabled = true;
      try {
        await API.adminApprovePremium(btn.dataset.approve);
        toast('Premium tasdiqlandi ✅');
        btn.closest('.admin-list-item').remove();
      } catch (e) { toast('Xatolik yuz berdi'); btn.disabled = false; }
    };
  });
  content.querySelectorAll('[data-reject]').forEach(btn => {
    btn.onclick = async () => {
      if (!confirm("So'rovni rad etishga ishonchingiz komilmi?")) return;
      btn.disabled = true;
      try {
        await API.adminRejectPremium(btn.dataset.reject);
        toast("So'rov rad etildi");
        btn.closest('.admin-list-item').remove();
      } catch (e) { toast('Xatolik yuz berdi'); btn.disabled = false; }
    };
  });
}

function pendingItemHtml(p) {
  return `
    <div class="admin-list-item" data-id="${p.userId}" style="align-items:flex-start;">
      <div style="width:44px;height:44px;border-radius:50%;background:var(--surface-2);display:flex;align-items:center;justify-content:center;font-weight:700;color:var(--text-dim);flex-shrink:0;">${initials(p.name)}</div>
      <div class="grow">
        <div class="t">${escapeHtml(p.name)}</div>
        <div class="s">${escapeHtml(p.username || p.userId)} · ${p.planName} · ${fmtMoney(p.price)}</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:6px;">
        <button class="btn btn-sm btn-primary" data-approve="${p.userId}">Tasdiqlash</button>
        <button class="btn btn-sm" style="background:var(--danger);color:#fff;" data-reject="${p.userId}">Rad etish</button>
      </div>
    </div>`;
}

/* ===================== SOZLAMALAR ===================== */

async function mountSettingsTab(content) {
  content.innerHTML = skeletonAdmin();
  const s = await API.adminGetSettings().catch(() => ({
    channels: [], premiumPrices: {}, premiumDiscount: {}, premiumBonusCoin: 0, referralPremiumBonus: 0, paymentCard: '',
  }));
  const plans = [ { key:'1m', label:'1 oy' }, { key:'3m', label:'3 oy' }, { key:'6m', label:'6 oy' }, { key:'1y', label:'1 yil' } ];

  content.innerHTML = `
    <div class="section-head" style="padding:0;">
      <div class="section-title">To'lov karta raqami</div>
    </div>
    <div class="form-field">
      <input id="s_card" value="${escapeHtml(s.paymentCard || '')}" placeholder="8600 1234 5678 9012">
    </div>

    <div class="section-head" style="padding:0;margin-top:18px;">
      <div class="section-title">Premium narxlari (so'm)</div>
    </div>
    ${plans.map(p => `
      <div class="form-field" style="display:flex;gap:10px;align-items:flex-end;">
        <div style="flex:1;"><label>${p.label}</label><input id="s_price_${p.key}" type="number" value="${s.premiumPrices?.[p.key] || 0}"></div>
        <div style="width:90px;"><label>Chegirma %</label><input id="s_disc_${p.key}" type="number" value="${s.premiumDiscount?.[p.key] || 0}"></div>
      </div>`).join('')}

    <div class="form-field" style="display:flex;gap:10px;">
      <div style="flex:1;"><label>Premium olganda bonus coin</label><input id="s_bonusCoin" type="number" value="${s.premiumBonusCoin || 0}"></div>
      <div style="flex:1;"><label>Referal premium bonusi (coin)</label><input id="s_refBonus" type="number" value="${s.referralPremiumBonus || 0}"></div>
    </div>

    <button class="btn btn-primary btn-block" id="saveSettingsBtn" style="margin-top:6px;">Sozlamalarni saqlash</button>

    <div class="section-head" style="padding:0;margin-top:24px;">
      <div class="section-title">Majburiy obuna kanallari</div>
    </div>
    <div id="channelList">${(s.channels || []).map(channelItemHtml).join('') || emptyHtml("Kanal qo'shilmagan")}</div>
    <div class="form-field" style="display:flex;gap:8px;margin-top:10px;">
      <input id="newChannelInput" placeholder="@kanal_username" style="flex:1;">
      <button class="btn btn-surface" id="addChannelBtn">Qo'shish</button>
    </div>
  `;

  document.getElementById('saveSettingsBtn').onclick = async () => {
    const premiumPrices = {}, premiumDiscount = {};
    plans.forEach(p => {
      premiumPrices[p.key] = Number(val(`s_price_${p.key}`)) || 0;
      premiumDiscount[p.key] = Number(val(`s_disc_${p.key}`)) || 0;
    });
    try {
      await API.adminSaveSettings({
        paymentCard: val('s_card'),
        premiumPrices, premiumDiscount,
        premiumBonusCoin: Number(val('s_bonusCoin')) || 0,
        referralPremiumBonus: Number(val('s_refBonus')) || 0,
      });
      toast('Sozlamalar saqlandi');
    } catch (e) {
      toast('Xatolik yuz berdi');
    }
  };

  document.getElementById('addChannelBtn').onclick = async () => {
    const input = document.getElementById('newChannelInput');
    const username = input.value.trim().replace(/^@/, '');
    if (!username) { toast('Kanal username kiriting'); return; }
    try {
      await API.adminAddChannel(username, username);
      input.value = '';
      mountSettingsTab(content);
      toast('Kanal qo\'shildi');
    } catch (e) {
      toast(e.message?.includes('409') ? 'Bu kanal allaqachon bor' : 'Xatolik yuz berdi');
    }
  };

  content.querySelectorAll('[data-del-channel]').forEach(btn => {
    btn.onclick = async () => {
      if (!confirm("Kanalni o'chirishga ishonchingiz komilmi?")) return;
      await API.adminDeleteChannel(btn.dataset.delChannel).catch(() => {});
      mountSettingsTab(content);
      toast('Kanal o\'chirildi');
    };
  });
}

function channelItemHtml(c, i) {
  return `
    <div class="admin-list-item">
      <div class="grow">
        <div class="t">@${escapeHtml(c.username)}</div>
        ${c.title && c.title !== c.username ? `<div class="s">${escapeHtml(c.title)}</div>` : ''}
      </div>
      <button class="btn btn-sm" style="background:var(--danger);color:#fff;" data-del-channel="${i}">O'chirish</button>
    </div>`;
}

/* ===================== UTIL ===================== */

function emptyHtml(text) {
  return `<div class="empty" style="padding:24px 0;">${text}</div>`;
}

function val(id) { return document.getElementById(id).value.trim(); }
