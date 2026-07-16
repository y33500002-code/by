const ReelsPage = {
  cursor: 0,
  loading: false,
  async mount(root) {
    this.cursor = 0;
    root.innerHTML = `<div class="reels-wrap" id="reelsWrap"></div>`;
    await this.loadMore();
    const wrap = document.getElementById('reelsWrap');
    wrap.addEventListener('scroll', () => {
      if (wrap.scrollTop + wrap.clientHeight >= wrap.scrollHeight - 500) this.loadMore();
      this.updateActiveVideo(wrap);
    }, { passive: true });
  },

  async loadMore() {
    if (this.loading) return;
    this.loading = true;
    const wrap = document.getElementById('reelsWrap');
    if (!wrap) return;
    try {
      const { items, nextCursor } = await API.getReels(this.cursor);
      if (!items || !items.length) {
        if (this.cursor === 0) {
          wrap.innerHTML = emptyState('Reels hali yo\'q', 'Admin hali reels prevyu qo\'shmagan.');
        }
        return;
      }
      wrap.insertAdjacentHTML('beforeend', items.map(reelHtml).join(''));
      bindReelEvents(wrap);
      this.cursor = nextCursor;
      this.updateActiveVideo(wrap);
    } catch(e) {
      console.error('Reels load error:', e);
      if (this.cursor === 0) {
        const msg = e?.status === 401
          ? 'Sessiya tasdiqlanmadi. Botni qaytadan oching.'
          : 'Serverga ulanib bo\'lmadi. Qayta urinib ko\'ring.';
        wrap.innerHTML = emptyState('Ulanishda xatolik', msg);
      }
    } finally {
      this.loading = false;
    }
  },

  updateActiveVideo(wrap) {
    const reels = [...wrap.querySelectorAll('.reel')];
    const wrapRect = wrap.getBoundingClientRect();
    const mid = wrapRect.top + wrapRect.height / 2;
    let found = false;
    reels.forEach(r => {
      const v = r.querySelector('video');
      if (!v) return;
      const rect = r.getBoundingClientRect();
      const within = rect.top <= mid && rect.bottom > mid;
      if (within && !found) {
        found = true;
        // Foydalanuvchi ilgari ovozni yoqgan bo'lsa — yangi reelda ham ovozli boshlanadi
        if (getReelSoundPref()) v.muted = false;
        if (v.paused) v.play().catch(() => {
          // Ovoz bilan autoplay browser tomonidan bloklangan bo'lsa — muted holda urinib ko'ramiz
          v.muted = true;
          v.play().catch(() => {});
        });
        // Ovozni yoqish overlay ni ko'rsatish (agar hali yopilmagan bo'lsa)
        attachReelUnmute(v, r);
      } else {
        if (!v.paused) v.pause();
      }
    });
  }
};

const REEL_SOUND_KEY = 'kino_reel_sound_on';
function getReelSoundPref() {
  try { return localStorage.getItem(REEL_SOUND_KEY) === '1'; } catch (e) { return false; }
}
function setReelSoundPref(on) {
  try { localStorage.setItem(REEL_SOUND_KEY, on ? '1' : '0'); } catch (e) {}
}

// Reels uchun "Ovozni yoqish" tugmasi
function attachReelUnmute(videoEl, reelEl) {
  if (!videoEl || !reelEl) return;
  if (reelEl.querySelector('.reel-unmute')) return; // ikki marta qo'shilmasin
  if (!videoEl.muted) return; // allaqachon ovozli

  const btn = document.createElement('button');
  btn.className = 'reel-unmute';
  btn.innerHTML = '🔊 Ovozni yoqish';
  Object.assign(btn.style, {
    position: 'absolute',
    top: '14px',
    right: '14px',
    zIndex: '10',
    background: 'rgba(0,0,0,0.75)',
    border: '1px solid rgba(255,255,255,0.3)',
    borderRadius: '20px',
    padding: '6px 14px',
    color: '#fff',
    fontSize: '12px',
    fontWeight: '600',
    cursor: 'pointer',
  });
  reelEl.appendChild(btn);

  btn.onclick = (e) => {
    e.stopPropagation();
    videoEl.muted = false;
    setReelSoundPref(true); // keyingi reels ham ovozli boshlanadi
    btn.remove();
    haptic('light');
  };

  videoEl.addEventListener('volumechange', () => {
    if (!videoEl.muted) btn.remove();
  });
}

function reelHtml(r) {
  return `
    <div class="reel" data-id="${r.id}">
      ${r.previewVideo
        ? `<video src="${r.previewVideo}" loop muted playsinline preload="metadata"></video>`
        : `<img src="${r.poster}" alt="${escapeHtml(r.title)}" loading="lazy">`}
      <div class="reel-pause-icon"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></div>
      <div class="reel-info">
        <div class="reel-title">🎬 ${escapeHtml(r.title)}</div>
        <div class="reel-desc">${escapeHtml(r.description || '')}</div>
        ${r.friendActivity ? `<div class="reel-social">👤 ${escapeHtml(r.friendActivity.name)} ${r.friendActivity.action === 'liked' ? 'like qildi' : 'izoh qoldirdi'}</div>` : ''}
      </div>
      <button class="btn btn-primary reel-watch-btn" data-watch="${r.id}">
        <svg viewBox="0 0 24 24" style="width:16px;height:16px;margin-right:4px;"><path d="M8 5v14l11-7z" fill="currentColor"/></svg> To'liq ko'rish
      </button>
      <div class="reel-actions">
        <div class="reel-action${r.liked ? ' on' : ''}" data-act="like" data-id="${r.id}">
          <svg viewBox="0 0 24 24"><path d="M12 20s-7-4.5-9.5-9C.5 7 3 3.5 6.5 3.5c2 0 3.5 1 5.5 3 2-2 3.5-3 5.5-3C21 3.5 23.5 7 21.5 11 19 15.5 12 20 12 20z" stroke="currentColor" stroke-width="1.8" fill="${r.liked ? 'currentColor' : 'none'}"/></svg>
          <span class="reel-like-count">${fmtNumber(r.likes)}</span>
        </div>
        <div class="reel-action" data-act="comment" data-id="${r.id}">
          <svg viewBox="0 0 24 24"><path d="M21 12a8 8 0 1 1-3.2-6.4L21 4l-1 4.5" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round"/></svg>
          <span>Izoh</span>
        </div>
        <div class="reel-action save${r.saved ? ' on' : ''}" data-act="save" data-id="${r.id}">
          <svg viewBox="0 0 24 24"><path d="M6 3.5h12v17l-6-4-6 4v-17z" stroke="currentColor" stroke-width="1.8" fill="${r.saved ? 'currentColor' : 'none'}"/></svg>
          <span>Saqlash</span>
        </div>
        <div class="reel-action" data-act="share" data-id="${r.id}" data-title="${escapeHtml(r.title)}">
          <svg viewBox="0 0 24 24"><path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M12 3v13M8 7l4-4 4 4" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
          <span>Ulash</span>
        </div>
      </div>
    </div>`;
}

function bindReelEvents(wrap) {
  wrap.querySelectorAll('[data-watch]').forEach(btn => {
    if (btn._bound) return; btn._bound = true;
    btn.onclick = () => Router.go('movie', { id: btn.dataset.watch });
  });

  // Ekranga bosganda video to'xtaydi/davom etadi (tugmalar bundan mustasno)
  wrap.querySelectorAll('.reel').forEach(reelEl => {
    if (reelEl._tapBound) return; reelEl._tapBound = true;
    reelEl.addEventListener('click', (e) => {
      if (e.target.closest('button, .reel-action, .reel-watch-btn')) return;
      const v = reelEl.querySelector('video');
      if (!v) return;
      const icon = reelEl.querySelector('.reel-pause-icon');
      if (v.paused) {
        v.play().catch(() => {});
        if (icon) { icon.classList.remove('show'); }
      } else {
        v.pause();
        if (icon) {
          icon.classList.add('show');
          clearTimeout(icon._hideT);
          icon._hideT = setTimeout(() => icon.classList.remove('show'), 700);
        }
      }
      haptic('light');
    });
  });

  wrap.querySelectorAll('.reel-action').forEach(el => {
    if (el._bound) return; el._bound = true;
    el.onclick = async () => {
      haptic('light');
      const id = el.dataset.id;
      const act = el.dataset.act;

      if (act === 'share') {
        const botUser = window.__BOT_USERNAME__ || 'Kent_savdo_bot';
        const link = `https://t.me/${botUser}?start=movie_${id}`;
        const title = el.dataset.title || '';
        const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent('🎬 ' + title)}`;
        if (window.Telegram?.WebApp?.openTelegramLink) {
          window.Telegram.WebApp.openTelegramLink(shareUrl);
        } else if (navigator.clipboard) {
          navigator.clipboard.writeText(link).then(() => toast('Havola nusxalandi 📋'));
        }
        return;
      }
      if (act === 'comment') { Router.go('movie', { id }); return; }

      if (act === 'like') {
        el.classList.toggle('on');
        const isOn = el.classList.contains('on');
        el.querySelector('svg path').setAttribute('fill', isOn ? 'currentColor' : 'none');
        const res = await API.reelAction(id, 'like').catch(() => null);
        if (res && typeof res.likes === 'number') {
          const cnt = el.querySelector('.reel-like-count');
          if (cnt) cnt.textContent = fmtNumber(res.likes);
        }
        return;
      }

      if (act === 'save') {
        el.classList.toggle('on');
        el.querySelector('svg path').setAttribute('fill', el.classList.contains('on') ? 'currentColor' : 'none');
        await API.reelAction(id, 'save').catch(() => {});
        return;
      }
    };
  });
}
