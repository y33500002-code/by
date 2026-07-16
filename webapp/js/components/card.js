/* Reusable poster card + row renderer used across Home / Search / Admin. */
function posterCardHtml(m) {
  return `
    <div class="poster-card" data-nav="movie" data-id="${m.id}">
      <img class="poster-img" src="${m.poster}" alt="${escapeHtml(m.title)}" loading="lazy">
      <div class="poster-meta">
        <div class="p-title">${escapeHtml(m.title)}</div>
        <div class="p-sub">${m.year} · ${escapeHtml(m.genre)}${m.quality === '4K' ? ' · 4K' : ''}</div>
        ${m.progress ? `<div class="level-bar" style="margin-top:5px;height:3px;"><i style="width:${m.progress}%"></i></div>` : ''}
      </div>
    </div>`;
}

function sectionHtml(title, movies, seeMore = true) {
  if (!movies || !movies.length) return '';
  return `
    <section class="section">
      <div class="section-head">
        <div class="section-title">${title}</div>
        ${seeMore ? `<div class="section-more" data-genre-more="${escapeHtml(title)}">Barchasi</div>` : ''}
      </div>
      <div class="row-scroll">
        ${movies.map(posterCardHtml).join('')}
      </div>
    </section>`;
}

function bindPosterNav(root) {
  root.querySelectorAll('[data-nav="movie"]').forEach(el => {
    el.addEventListener('click', () => Router.go('movie', { id: el.dataset.id }));
  });
}
