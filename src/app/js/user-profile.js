'use strict';

/* ── User profile view ──────────────────────────────────────────────── */

let _userProfileFrom = 'feed';

function _renderUserCard(info) {
  document.getElementById('up-name').textContent     = info.display_name || info.displayName || info.tgUsername || '';
  document.getElementById('up-username').textContent = '@' + (info.profile_username || info.profileUsername || info.tgUsername || '');
  document.getElementById('up-bio').textContent      = info.bio || '';

  const badge = document.getElementById('up-verified-badge');
  badge.style.display = (info.verified || info.isVerified) ? 'inline-block' : 'none';

  const av  = document.getElementById('up-avatar');
  const src = info.avatar_url || info.avatarUrl || '../../img/default_avatar.png';
  av.src = src;

  const bannerImg = document.getElementById('up-banner-img');
  const bannerPH  = document.getElementById('up-banner-placeholder');
  bannerImg.onload = () => bannerImg.classList.add('loaded');
  bannerImg.src    = info.banner_url || '../../img/baner.png';
  bannerPH.style.display = 'none';
}

async function openUserProfile(tgUsername) {
  if (!tgUsername) return;

  _userProfileFrom = _currentView;

  const wrap    = document.getElementById('user-profile-wrap');
  const postsEl = document.getElementById('up-posts-container');

  // Сброс
  document.getElementById('up-name').textContent     = '...';
  document.getElementById('up-username').textContent  = '@' + tgUsername;
  document.getElementById('up-bio').textContent       = '';
  document.getElementById('up-avatar').src            = '../../img/logo_blue.png';
  document.getElementById('up-verified-badge').style.display = 'none';
  document.getElementById('up-banner-img').classList.remove('loaded');
  postsEl.innerHTML = '<p class="feed__empty">Загрузка...</p>';
  wrap.scrollTop    = 0;

  showView('user-profile');

  // Посты — основной запрос (быстрый)
  let posts = [];
  try {
    const res = await apiFetch(`${API}/posts?author=${encodeURIComponent(tgUsername)}&limit=100`);
    if (res.ok) posts = await res.json();
  } catch {}

  // Карточку рендерим сразу из данных автора первого поста
  if (posts.length && posts[0].author) {
    _renderUserCard(posts[0].author);
  }

  // Биo и актуальные данные — фоновый запрос (только БД, быстро)
  fetch(`${API}/users/${encodeURIComponent(tgUsername)}`)
    .then(r => r.ok ? r.json() : null)
    .then(info => { if (info) _renderUserCard(info); })
    .catch(() => {});

  // Посты
  postsEl.innerHTML = '';
  if (!posts.length) {
    postsEl.innerHTML = '<p class="feed__empty">Постов пока нет</p>';
    return;
  }

  let lastDateKey = null;
  posts.forEach((post, i) => {
    post.isOwn = post.author?.tgUsername === window._tgUsername;
    registerServerPost(post);
    const ts      = post.createdAt || post.id;
    const dateKey = getDateKey(ts);
    if (dateKey !== lastDateKey) {
      postsEl.appendChild(buildDateSeparator(ts));
      lastDateKey = dateKey;
    }
    postsEl.appendChild(buildPostEl(post, null, null, false, '', i, true));
  });

  postsEl.querySelectorAll('.post__more-wrap:not([data-bound])').forEach(wrap => {
    wrap.dataset.bound = '1';
    const btn    = wrap.querySelector('.post__more');
    const id     = Number(btn.dataset.id);
    const postEl = wrap.closest('.post');
    btn.addEventListener('click', e => {
      e.stopPropagation();
      if (_openMenuId === id) { closeAllMenus(); return; }
      openPostMenu(id, postEl, document.getElementById('user-profile-wrap'), [
        { src: '../../img/trash.svg', action: () => { closeAllMenus(); deletePost(id, () => openUserProfile(tgUsername)); } },
        { src: '../../img/pin.svg',   action: () => { closeAllMenus(); pinPost(id, () => openUserProfile(tgUsername)); } },
        { src: '../../img/edit.svg',  action: () => { closeAllMenus(); startEditPost(id, postEl, () => openUserProfile(tgUsername)); } },
        { src: '../../img/close.svg', action: () => closeAllMenus() },
      ]);
    });
  });
}

function closeUserProfile() {
  closeAllMenus();
  showView(_userProfileFrom || 'feed');
}

document.getElementById('btn-user-profile-back').addEventListener('click', closeUserProfile);

document.getElementById('nav-home').addEventListener('click',    () => { _userProfileFrom = 'feed'; });
document.getElementById('nav-profile').addEventListener('click', () => { _userProfileFrom = 'profile'; });

// ── Делегирование кликов: аватарка / имя / хэндл внутри поста ──
document.addEventListener('click', e => {
  if (e.target.closest('.compose'))      return;
  if (e.target.closest('.profile-card')) return;

  const postEl = e.target.closest('.post');
  if (!postEl) return;

  const isAvatar = e.target.closest('.post__header .avatar');
  const isName   = e.target.closest('.post__name');
  const isHandle = e.target.closest('.post__handle');
  if (!isAvatar && !isName && !isHandle) return;

  const author = postEl.dataset.author;
  if (!author) return;

  if (author === window._tgUsername) {
    showView('profile');
    return;
  }

  openUserProfile(author);
});
