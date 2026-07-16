/* ===================================================================
   API layer.
   Talks to the Express backend at /api/*. If the backend is not
   reachable (network error), it falls back to local mock data.
   HTTP errors from the server are thrown properly so callers can
   handle status-specific cases (402 coin, 409 conflict, etc.).
=================================================================== */
const API = (() => {
  const BASE = (window.__API_BASE__ || '') + '/api';
  const tg = window.Telegram?.WebApp;
  const initData = tg?.initData || '';

  let mockMode = false;

  async function request(path, opts = {}) {
    let res;
    try {
      res = await fetch(BASE + path, {
        headers: {
          'Content-Type': 'application/json',
          'X-Telegram-Init-Data': initData,
        },
        ...opts,
      });
    } catch (networkError) {
      // Network unreachable — fall back to mock data
      mockMode = true;
      return Mock.handle(path, opts);
    }

    if (!res.ok) {
      // Parse the server's error message and throw a structured error
      const body = await res.json().catch(() => ({}));
      const err = new Error(body.error || `HTTP ${res.status}`);
      err.status = res.status; // callers can branch on e.status === 402, 409, etc.
      throw err;
    }

    mockMode = false;
    return await res.json();
  }

  return {
    isMock: () => mockMode,

    // Movies
    getHome: () => request('/movies/home'),
    getMovie: (id) => request('/movies/' + id),
    getGenres: () => request('/movies/genres'),
    getMoviesByGenre: (genre) => request('/movies?genre=' + encodeURIComponent(genre)),
    likeMovie: (id) => request('/movies/' + id + '/like', { method: 'POST' }),
    saveMovie: (id) => request('/movies/' + id + '/save', { method: 'POST' }),
    watchMovie: (id, position = 0) => request('/movies/' + id + '/watch', {
      method: 'POST', body: JSON.stringify({ position })
    }),
    getComments: (id) => request('/movies/' + id + '/comments'),
    postComment: (id, text, replyTo = null) => request('/movies/' + id + '/comments', {
      method: 'POST', body: JSON.stringify({ text, replyTo })
    }),
    likeComment: (movieId, commentId) => request(`/movies/${movieId}/comments/${commentId}/like`, { method: 'POST' }),
    deleteComment: (movieId, commentId) => request(`/movies/${movieId}/comments/${commentId}`, { method: 'DELETE' }),

    // Reels
    getReels: (cursor = 0) => request('/reels?cursor=' + cursor),
    reelAction: (id, action) => request(`/reels/${id}/${action}`, { method: 'POST' }),

    // Search
    search: (q, type = 'all') => request(`/search?q=${encodeURIComponent(q)}&type=${type}`),

    // Users / profile
    getMe: () => request('/users/me'),
    getUser: (id) => request('/users/' + id),
    followUser: (id) => request('/users/' + id + '/follow', { method: 'POST' }),
    updateProfile: (data) => request('/users/me', { method: 'PATCH', body: JSON.stringify(data) }),

    // Premium
    getPremiumPaymentInfo: () => request('/premium/payment-info'),
    getPremiumPlans: () => request('/premium/plans'),
    buyPremium: (planId, method) => request('/premium/purchase', {
      method: 'POST', body: JSON.stringify({ planId, method })
    }),
    giftPremium: (userId, planId) => request('/premium/gift', {
      method: 'POST', body: JSON.stringify({ userId, planId })
    }),

    // Notifications
    getNotifications: () => request('/notifications'),

    // Promo codes
    // Oldindan ma'lumot — faollashtirmasdan "nima beradi" ko'rish uchun
    promoInfo: (code) => request('/promos/info/' + encodeURIComponent(code.toUpperCase())),
    // Faollashtirish
    claimPromo: (code) => request('/promos/claim', {
      method: 'POST', body: JSON.stringify({ code })
    }),

    // Admin — movies
    adminListMovies: () => request('/admin/movies'),
    adminCreateMovie: (data) => request('/admin/movies', { method: 'POST', body: JSON.stringify(data) }),
    adminUpdateMovie: (id, data) => request('/admin/movies/' + id, { method: 'PUT', body: JSON.stringify(data) }),
    adminDeleteMovie: (id) => request('/admin/movies/' + id, { method: 'DELETE' }),
    adminStats: () => request('/admin/stats'),

    // Admin — users
    adminListUsers: (q = '') => request('/admin/users' + (q ? '?q=' + encodeURIComponent(q) : '')),
    adminGrantPremium: (userId, plan) => request(`/admin/users/${userId}/premium`, {
      method: 'POST', body: JSON.stringify({ plan })
    }),
    adminRevokePremium: (userId) => request(`/admin/users/${userId}/premium`, { method: 'DELETE' }),

    // Admin — premium requests
    adminPendingPremium: () => request('/admin/premium/pending'),
    adminApprovePremium: (userId) => request(`/admin/premium/pending/${userId}/approve`, { method: 'POST' }),
    adminRejectPremium: (userId) => request(`/admin/premium/pending/${userId}/reject`, { method: 'POST' }),

    // Admin — settings & channels
    adminGetSettings: () => request('/admin/settings'),
    adminSaveSettings: (data) => request('/admin/settings', { method: 'PUT', body: JSON.stringify(data) }),
    adminAddChannel: (username, title) => request('/admin/channels', {
      method: 'POST', body: JSON.stringify({ username, title })
    }),
    adminDeleteChannel: (index) => request('/admin/channels/' + index, { method: 'DELETE' }),
  };
})();
