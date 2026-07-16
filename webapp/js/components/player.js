/* Thin wrapper around <video> for preview/full playback + progress reporting. */
const Player = {
  attachProgressSaver(videoEl, movieId, intervalMs = 5000) {
    if (!videoEl) return;
    let last = 0;
    const save = () => {
      const pos = Math.floor(videoEl.currentTime || 0);
      if (Math.abs(pos - last) >= 3) {
        last = pos;
        API.watchMovie(movieId, pos).catch(() => {});
      }
    };
    videoEl.addEventListener('pause', save);
    videoEl.addEventListener('timeupdate', () => {
      clearTimeout(videoEl._saveT);
      videoEl._saveT = setTimeout(save, intervalMs);
    });
    window.addEventListener('beforeunload', save);
  },

  resumeAt(videoEl, seconds) {
    if (!videoEl || !seconds) return;
    videoEl.addEventListener('loadedmetadata', () => {
      try { videoEl.currentTime = seconds; } catch (e) {}
    }, { once: true });
  },

  /**
   * Mobil brauzerlarda autoplay faqat muted holatda ishlaydi, shu sababli
   * preview videolar ustiga "Ovozni yoqish" tugmasini qo'shadi.
   * containerEl — video joylashgan `position:relative` element (masalan .movie-hero).
   */
  attachUnmuteOverlay(videoEl, containerEl) {
    if (!videoEl || !containerEl) return;
    if (containerEl.querySelector('.unmute-overlay')) return; // ikki marta qo'shilmasin

    const overlay = document.createElement('div');
    overlay.className = 'unmute-overlay';
    overlay.innerHTML = `<span>Ovozni yoqish 🔊</span>`;
    Object.assign(overlay.style, {
      position: 'absolute', bottom: '14px', right: '14px', zIndex: '5',
      background: 'rgba(0,0,0,0.85)', padding: '8px 14px', borderRadius: '20px',
      display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer',
      border: '1px solid var(--border)', fontSize: '11px', fontWeight: 'bold', color: '#fff',
    });
    containerEl.appendChild(overlay);

    const unmute = () => {
      videoEl.muted = false;
      overlay.remove();
    };
    overlay.addEventListener('click', unmute);
    videoEl.addEventListener('volumechange', () => {
      if (!videoEl.muted) overlay.remove();
    });
  }
};
