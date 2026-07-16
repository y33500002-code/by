/* Global state + small shared utilities used across pages. */
const Store = {
  me: null,
  activeTab: 'home',
  homeData: null,
  isAdmin: false,
};

const TG = window.Telegram?.WebApp;
if (TG) {
  TG.ready();
  TG.expand();
  try { TG.setHeaderColor('#0A0A0E'); TG.setBackgroundColor('#0A0A0E'); } catch (e) {}
}

function haptic(kind = 'light') {
  try {
    if (!TG?.HapticFeedback) return;
    if (kind === 'success' || kind === 'error' || kind === 'warning') {
      TG.HapticFeedback.notificationOccurred(kind);
    } else {
      TG.HapticFeedback.impactOccurred(kind);
    }
  } catch (e) {}
}

function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { el.hidden = true; }, 2200);
}

function fmtNumber(n) {
  n = Number(n) || 0;
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace('.0', '') + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1).replace('.0', '') + 'K';
  return String(n);
}

function fmtDuration(min) {
  const h = Math.floor(min / 60), m = min % 60;
  return h > 0 ? `${h}s ${m}d` : `${m} daqiqa`;
}

function fmtMoney(sum) {
  return Number(sum).toLocaleString('ru-RU') + " so'm";
}

function escapeHtml(str = '') {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function initials(name = '?') {
  return name.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase()).join('');
}

function openSheet(innerHtml) {
  closeSheet();
  const backdrop = document.createElement('div');
  backdrop.className = 'sheet-backdrop';
  backdrop.id = 'activeSheetBackdrop';
  backdrop.onclick = closeSheet;
  const sheet = document.createElement('div');
  sheet.className = 'sheet';
  sheet.id = 'activeSheet';
  sheet.innerHTML = `<div class="sheet-handle"></div>${innerHtml}`;
  sheet.onclick = (e) => e.stopPropagation();
  document.body.appendChild(backdrop);
  document.body.appendChild(sheet);
}
function closeSheet() {
  document.getElementById('activeSheetBackdrop')?.remove();
  document.getElementById('activeSheet')?.remove();
}
