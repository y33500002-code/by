const ProfilePage = {
  async mount(root, params = {}) {
    root.innerHTML = `<div class="screen">${skeletonProfile()}</div>`;
    const isMe = !params.id || params.id === 'me';
    const user = isMe ? await API.getMe() : await API.getUser(params.id);
    if (isMe) Store.me = user;
    renderProfile(root, user, isMe);
  }
};

function skeletonProfile() {
  return `<div class="skeleton" style="width:76px;height:76px;border-radius:50%;margin-bottom:14px;"></div>
    <div class="skeleton" style="height:16px;width:50%;border-radius:6px;margin-bottom:20px;"></div>
    <div class="skeleton" style="height:60px;border-radius:12px;"></div>`;
}

function avatarStyle(u) {
  if (u.premiumColor) return `style="background:${u.premiumColor};"`;
  return '';
}

function renderProfile(root, u, isMe) {
  const avatarContent = u.avatar
    ? `<img src="${u.avatar}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" onerror="this.style.display='none';">`
    : initials(u.name);

  root.innerHTML = `
    <div class="screen">
      <div class="profile-head">
        <div class="profile-avatar frame-${u.frame || 'none'}" ${avatarStyle(u)}>${avatarContent}</div>
        <div>
          <div class="profile-name">${escapeHtml(u.name)} ${u.premium ? '<span class="badge-premium">PRO</span>' : ''}</div>
          <div class="profile-uname">${escapeHtml(u.username || '')}</div>
        </div>
      </div>

      <div class="profile-stats">
        <div><b>${fmtNumber(u.followers)}</b><span>Follower</span></div>
        <div><b>${fmtNumber(u.following)}</b><span>Following</span></div>
        <div><b>${fmtNumber(u.watchHistory || 0)}</b><span>Ko'rilgan</span></div>
      </div>

      ${isMe ? levelBarHtml(u) : `<button class="btn btn-primary btn-block" id="followBtn" style="margin-bottom:16px;">${u.isFollowing ? 'Unfollow' : 'Follow qilish'}</button>`}

      ${isMe && !u.premium ? premiumCardHtml() : ''}
      ${isMe && u.premium ? premiumManageHtml(u) : ''}

      ${!isMe && u.premium && u.premiumColor ? `<div style="display:inline-block;background:${u.premiumColor};border-radius:8px;padding:3px 10px;font-size:12px;margin-bottom:12px;">🎨 Premium rang</div>` : ''}

      ${isMe ? promoCardHtml() : ''}

      <div class="tabs-underline" id="profileTabs">
        <button class="active" data-tab="saved">Saqlangan</button>
        <button data-tab="liked">Like qilingan</button>
        ${isMe ? '<button data-tab="history">Tarix</button>' : ''}
      </div>
      <div class="grid-2" id="profileGrid"></div>

      ${isMe ? `<button class="btn btn-outline btn-block" id="adminBtn" style="margin-top:22px;" hidden>⚙️ Admin panel</button>` : ''}
    </div>`;

  loadTab(root, 'saved');
  root.querySelectorAll('#profileTabs button').forEach(b => {
    b.onclick = () => {
      root.querySelectorAll('#profileTabs button').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      loadTab(root, b.dataset.tab);
    };
  });

  if (!isMe) {
    root.querySelector('#followBtn').onclick = async (e) => {
      haptic('light');
      const btn = e.currentTarget;
      const wasFollowing = btn.textContent.trim() === 'Unfollow';
      btn.textContent = wasFollowing ? 'Follow qilish' : 'Unfollow';
      await API.followUser(u.id).catch(() => {});
    };
  }

  const premBtn = root.querySelector('#openPremium');
  if (premBtn) premBtn.onclick = () => openPremiumSheet();

  const custBtn = root.querySelector('#customizePremium');
  if (custBtn) custBtn.onclick = () => openCustomizeSheet(u);

  const avatarBtn = root.querySelector('#changeAvatar');
  if (avatarBtn) avatarBtn.onclick = () => openAvatarSheet(u);

  const adminBtn = root.querySelector('#adminBtn');
  if (adminBtn && Store.isAdmin) {
    adminBtn.hidden = false;
    adminBtn.onclick = () => Router.go('admin');
  }

  const promoInput = root.querySelector('#promoInput');
  const promoBtn   = root.querySelector('#promoSubmitBtn');
  const promoPreview = root.querySelector('#promoPreview');

  if (promoInput) {
    // Kod yozilayotganda 600ms kutib, promo haqida ma'lumot yuklaymiz
    let _previewTimer = null;
    promoInput.addEventListener('input', () => {
      const code = promoInput.value.trim().toUpperCase();
      if (promoPreview) promoPreview.innerHTML = '';
      if (_previewTimer) clearTimeout(_previewTimer);
      if (code.length < 3) return;
      _previewTimer = setTimeout(async () => {
        try {
          const info = await API.promoInfo(code);
          if (!info?.valid || !promoPreview) return;
          const parts = [];
          if (info.coins > 0) parts.push(`<b>🪙 ${info.coins} coin</b>`);
          if (info.days  > 0) parts.push(`<b>⭐ ${info.days} kun Premium</b>`);
          const left = info.left !== null ? ` · ${info.left} ta qoldi` : '';
          promoPreview.innerHTML = `<div style="font-size:12px;color:var(--accent);margin-top:8px;">✅ Promo topildi: ${parts.join(' + ')}${left}</div>`;
        } catch (e) {
          if (!promoPreview) return;
          const msg = e?.status === 404 ? 'Topilmadi' : e?.status === 409 ? 'Allaqachon ishlatilgan' : e?.status === 410 ? 'Muddati tugagan' : null;
          if (msg) promoPreview.innerHTML = `<div style="font-size:12px;color:#e54;margin-top:8px;">❌ ${msg}</div>`;
        }
      }, 600);
    });
  }

  if (promoBtn) {
    promoBtn.onclick = async () => {
      const input = root.querySelector('#promoInput');
      const code = input ? input.value.trim().toUpperCase() : '';
      if (!code) { toast('Promokodni kiriting'); return; }

      haptic('light');
      promoBtn.disabled = true;
      promoBtn.textContent = 'Kutilmoqda...';

      try {
        const result = await API.claimPromo(code);
        // Muvaffaqiyatli aktivlashtirildi
        haptic('success');
        input.value = '';
        if (promoPreview) promoPreview.innerHTML = '';

        // Natijani ko'rsatish
        const parts = [];
        if (result.coins > 0) parts.push(`🪙 ${result.coins} coin`);
        if (result.days  > 0) parts.push(`⭐ ${result.days} kun Premium`);
        const rewardText = parts.length ? `Siz qo'lga kiritdingiz: ${parts.join(' + ')}` : '';

        openSheet(`
          <div style="text-align:center;padding:20px 0;">
            <div style="font-size:48px;margin-bottom:12px;">🎁</div>
            <div style="font-weight:700;font-size:18px;margin-bottom:8px;">Tabriklaymiz!</div>
            <div style="color:var(--text-dim);font-size:14px;line-height:1.5;">${rewardText}</div>
            ${result.premiumUntil ? `<div style="margin-top:12px;font-size:13px;color:var(--text-dim);">Premium amal qilish muddati: <b>${new Date(result.premiumUntil).toLocaleDateString('uz-UZ')}</b></div>` : ''}
          </div>
        `);

        // Sahifani yangilash (premium badge ko'rinishi uchun)
        setTimeout(() => ProfilePage.mount(root, {}), 1500);
      } catch (e) {
        toast(e?.message || 'Xatolik yuz berdi');
        haptic('error');
      } finally {
        promoBtn.disabled = false;
        promoBtn.textContent = 'Faollashtirish';
      }
    };
  }
}

function levelBarHtml(u) {
  return `
    <div class="level-bar-wrap">
      <div class="level-top"><span>Daraja: <b style="color:var(--text)">${u.level}</b></span><span>${u.levelProgress}%</span></div>
      <div class="level-bar"><i style="width:${u.levelProgress}%"></i></div>
    </div>`;
}

function promoCardHtml() {
  return `
    <div class="level-bar-wrap" style="margin-top:12px;">
      <h3 style="font-family:var(--font-display);font-size:14px;margin:0 0 4px;color:var(--text);">🎁 Promokod</h3>
      <p style="font-size:11.5px;color:var(--text-dim);margin:0 0 10px;line-height:1.4;">
        Promokodni kiriting — 🪙 coin yoki ⭐ Premium qo'lga kiriting!
      </p>
      <div style="display:flex;gap:8px;">
        <input type="text" id="promoInput" placeholder="PROMOKOD" autocomplete="off" autocorrect="off"
               style="flex:1;background:var(--surface-2);border:1px solid var(--border);border-radius:var(--radius-s);padding:10px 14px;color:var(--text);font-size:13px;text-transform:uppercase;letter-spacing:1px;">
        <button class="btn btn-primary btn-sm" id="promoSubmitBtn" style="padding:10px 16px;white-space:nowrap;">Faollashtirish</button>
      </div>
      <div id="promoPreview"></div>
    </div>`;
}

function premiumCardHtml() {
  return `
    <div class="premium-card">
      <h3>✨ Premium'ga o'ting</h3>
      <p>Profil rangi, avatar rom, badge va sovg'a qilish imkoniyatlari.</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button class="btn btn-sm btn-surface" id="changeAvatar">📷 Rasm qo'yish</button>
        <button class="btn btn-sm" style="background:var(--gold);color:#26200D;" id="openPremium">Premium olish</button>
      </div>
    </div>`;
}

function premiumManageHtml(u) {
  return `
    <div class="premium-card">
      <h3>✨ Siz Premium foydalanuvchisiz</h3>
      <p>Profilingizni sozlang yoki do'stingizga Premium sovg'a qiling.</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button class="btn btn-sm" style="background:var(--gold);color:#26200D;" id="customizePremium">🎨 Rang/Rom</button>
        <button class="btn btn-sm btn-surface" id="changeAvatar">📷 Rasm</button>
        <button class="btn btn-sm btn-outline" id="openPremium">🎁 Sovg'a</button>
      </div>
    </div>`;
}

async function loadTab(root, tab) {
  const grid = root.querySelector('#profileGrid');
  grid.innerHTML = `<div class="skeleton" style="height:150px;border-radius:16px;"></div>`;
  const home = Store.homeData || await API.getHome();
  const list = tab === 'saved' ? home.trending.slice(0, 6)
    : tab === 'liked' ? home.popular.slice(0, 6)
    : home.newMovies.slice(0, 6);
  grid.innerHTML = list.length ? list.map(posterCardHtml).join('') : `<div class="empty" style="grid-column:1/-1;">Bo'sh</div>`;
  bindPosterNav(grid);
}

function openPremiumSheet() {
  openSheet(`<div class="section-title" style="margin-bottom:14px;">Premium tarif tanlang</div><div id="planList">Yuklanmoqda...</div>`);
  API.getPremiumPlans().then(plans => {
    document.getElementById('planList').innerHTML = plans.map(p => `
      <div class="admin-list-item" style="align-items:center;">
        <div class="grow">
          <div class="t">${p.name} ${p.badge ? `<span class="badge-premium">${p.badge}</span>` : ''}</div>
          <div class="s">${fmtMoney(p.price)} · ${p.coins} coin · ⭐${p.stars}</div>
        </div>
        <button class="btn btn-primary btn-sm" data-plan="${p.id}">Sotib olish</button>
      </div>`).join('');
    document.querySelectorAll('[data-plan]').forEach(btn => {
      btn.onclick = () => choosePaymentMethod(btn.dataset.plan);
    });
  });
}

function choosePaymentMethod(planId) {
  openSheet(`
    <div class="section-title" style="margin-bottom:14px;">To'lov usuli</div>
    <button class="btn btn-block btn-surface" style="margin-bottom:8px;" data-method="stars">⭐ Telegram Stars</button>
    <button class="btn btn-block btn-surface" style="margin-bottom:8px;" data-method="card">💳 Bank kartasi</button>
    <button class="btn btn-block btn-surface" data-method="coin">🪙 Coin balansi</button>
  `);
  document.querySelectorAll('[data-method]').forEach(btn => {
    btn.onclick = async () => {
      closeSheet();
      haptic('medium');
      try {
        const res = await API.buyPremium(planId, btn.dataset.method);
        if (res && res.activated) {
          // Coin bilan darhol faollashdi
          haptic('success');
          toast('🎉 Premium muvaffaqiyatli faollashtirildi!');
          Router.reload();
        } else if (res && res.pending) {
          if (btn.dataset.method === 'card') {
            await showCardPaymentInstructions();
          } else {
            // Stars
            showStarsPaymentInstructions();
          }
        }
      } catch (e) {
        if (e.status === 402) {
          toast('🪙 Coin balansi yetarli emas');
        } else if (e.status === 409) {
          toast("⏳ So'rovingiz allaqachon ko'rib chiqilmoqda");
        } else {
          toast('Xatolik yuz berdi, qayta urinib ko\'ring');
        }
      }
    };
  });
}

async function showCardPaymentInstructions() {
  const botUser = window.__BOT_USERNAME__ || 'Kent_savdo_bot';
  // Use the public payment-info endpoint — NOT admin/settings (which is admin-only)
  const info = await API.getPremiumPaymentInfo().catch(() => ({}));
  const cardNumber = info.paymentCard || '—';
  openSheet(`
    <div class="section-title" style="margin-bottom:12px;">💳 Karta orqali to'lov</div>
    <div style="background:var(--surface-2);border-radius:14px;padding:16px;margin-bottom:14px;">
      <div style="font-size:12px;color:var(--text-mute);margin-bottom:6px;">To'lov karta raqami</div>
      <div style="font-size:20px;font-weight:700;letter-spacing:3px;font-family:monospace;">${escapeHtml(cardNumber)}</div>
    </div>
    <div style="color:var(--text-dim);font-size:14px;line-height:1.7;">
      1️⃣ Yuqoridagi karta raqamiga to'lov qiling<br>
      2️⃣ To'lov cheki rasmini botga yuboring<br>
      3️⃣ Admin tasdiqlangach Premium avtomatik faollashadi ✅
    </div>
    <p style="color:var(--text-mute);font-size:12px;margin-top:10px;">⏳ Ko'rib chiqish vaqti: 1–24 soat</p>
    <button class="btn btn-primary btn-block" id="goBotCardBtn" style="margin-top:14px;">
      📨 Chekni botga yuborish — @${escapeHtml(botUser)}
    </button>
  `);
  document.getElementById('goBotCardBtn')?.addEventListener('click', () => {
    const link = `https://t.me/${botUser}`;
    if (window.Telegram?.WebApp?.openTelegramLink) {
      window.Telegram.WebApp.openTelegramLink(link);
    } else {
      window.open(link, '_blank');
    }
    closeSheet();
  });
}

function showStarsPaymentInstructions() {
  const botUser = window.__BOT_USERNAME__ || 'Kent_savdo_bot';
  openSheet(`
    <div class="section-title" style="margin-bottom:12px;">⭐ Stars orqali to'lov</div>
    <p style="color:var(--text-dim);font-size:14px;line-height:1.7;">
      Stars to'lovini botimiz orqali amalga oshiring.<br>
      Admin tasdiqlangach Premium avtomatik faollashadi.
    </p>
    <div style="background:var(--surface-2);border-radius:12px;padding:12px;margin:12px 0;text-align:center;">
      <div style="font-size:24px;margin-bottom:4px;">⏳</div>
      <div style="font-weight:600;">So'rovingiz qabul qilindi</div>
      <div style="color:var(--text-mute);font-size:13px;">Admin ko'rib chiqmoqda</div>
    </div>
    <button class="btn btn-primary btn-block" id="goBotStarsBtn" style="margin-top:14px;">
      ⭐ Botga o'tish — @${escapeHtml(botUser)}
    </button>
  `);
  document.getElementById('goBotStarsBtn')?.addEventListener('click', () => {
    const link = `https://t.me/${botUser}`;
    if (window.Telegram?.WebApp?.openTelegramLink) {
      window.Telegram.WebApp.openTelegramLink(link);
    } else {
      window.open(link, '_blank');
    }
    closeSheet();
  });
}

function openCustomizeSheet(u) {
  const colors = ['#FF3B5C', '#8B5CF6', '#3DDC84', '#E8B84B', '#4EA1FF', '#FF6B35', '#00D4FF'];
  let selectedColor = u.premiumColor || colors[0];
  openSheet(`
    <div class="section-title" style="margin-bottom:14px;">🎨 Profilni sozlash</div>
    <div class="form-field">
      <label>Profil rangi</label>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:6px;" id="colorPicker">
        ${colors.map(c => `
          <div data-color="${c}"
            style="width:36px;height:36px;border-radius:50%;background:${c};cursor:pointer;
              border:3px solid ${c === selectedColor ? '#fff' : 'transparent'};transition:border .15s;"
          ></div>`).join('')}
      </div>
    </div>
    <div class="form-field" style="margin-top:14px;">
      <label>Avatar rom</label>
      <select id="frameSelect" style="margin-top:6px;">
        <option value="none" ${u.frame==='none'||!u.frame?'selected':''}>Yo'q</option>
        <option value="gold" ${u.frame==='gold'?'selected':''}>🟡 Oltin</option>
        <option value="violet" ${u.frame==='violet'?'selected':''}>🟣 Binafsha</option>
      </select>
    </div>
    <button class="btn btn-primary btn-block" id="saveProfileBtn" style="margin-top:18px;">Saqlash</button>
  `);

  document.querySelectorAll('[data-color]').forEach(el => {
    el.onclick = () => {
      selectedColor = el.dataset.color;
      document.querySelectorAll('[data-color]').forEach(x => x.style.borderColor = 'transparent');
      el.style.borderColor = '#fff';
    };
  });

  document.getElementById('saveProfileBtn').onclick = async () => {
    const frame = document.getElementById('frameSelect').value;
    try {
      await API.updateProfile({ premiumColor: selectedColor, frame });
      closeSheet();
      toast('Profil yangilandi ✅');
      haptic('success');
      Router.reload();
    } catch(e) {
      toast('Xatolik yuz berdi');
    }
  };
}

function openAvatarSheet(u) {
  openSheet(`
    <div class="section-title" style="margin-bottom:14px;">📷 Profil rasmi</div>
    <div class="form-field">
      <label>Rasm URL manzili</label>
      <input id="avatarUrlInput" placeholder="https://..." value="${escapeHtml(u.avatar || '')}" style="margin-top:6px;">
      <div style="font-size:12px;color:var(--text-mute);margin-top:4px;">
        Internet'dagi rasm manzilini kiriting (jpg, png, webp)
      </div>
    </div>
    <div style="text-align:center;margin:10px 0;" id="avatarPreview">
      ${u.avatar ? `<img src="${u.avatar}" style="width:64px;height:64px;border-radius:50%;object-fit:cover;">` : ''}
    </div>
    <button class="btn btn-primary btn-block" id="saveAvatarBtn">Saqlash</button>
    ${u.avatar ? `<button class="btn btn-outline btn-block" id="removeAvatarBtn" style="margin-top:8px;">Rasmni olib tashlash</button>` : ''}
  `);

  const urlInput = document.getElementById('avatarUrlInput');
  urlInput?.addEventListener('input', () => {
    const preview = document.getElementById('avatarPreview');
    if (preview && urlInput.value) {
      preview.innerHTML = `<img src="${escapeHtml(urlInput.value)}" style="width:64px;height:64px;border-radius:50%;object-fit:cover;" onerror="this.src='';">`;
    }
  });

  document.getElementById('saveAvatarBtn')?.addEventListener('click', async () => {
    const avatar = urlInput?.value.trim() || null;
    try {
      await API.updateProfile({ avatar });
      closeSheet();
      toast('Rasm saqlandi ✅');
      haptic('success');
      Router.reload();
    } catch(e) {
      toast('Xatolik yuz berdi');
    }
  });

  document.getElementById('removeAvatarBtn')?.addEventListener('click', async () => {
    try {
      await API.updateProfile({ avatar: '' });
      closeSheet();
      toast('Rasm olib tashlandi');
      Router.reload();
    } catch(e) {
      toast('Xatolik yuz berdi');
    }
  });
}
