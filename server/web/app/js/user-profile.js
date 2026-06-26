'use strict';

let _userProfileFrom = 'feed';
const USER_PROFILE_PAGE = 10;

function _renderUserCard(info) {
  const publicUsername = info.profile_username || info.profileUsername || info.username || info.tgUsername || '';
  document.getElementById('up-name').textContent     = info.display_name || info.displayName || publicUsername || '';
  document.getElementById('up-username').textContent = '@' + publicUsername;
  document.getElementById('up-bio').textContent      = info.bio || '';

  const badge = document.getElementById('up-verified-badge');
  badge.style.display = (info.verified || info.isVerified) ? 'inline-block' : 'none';

  const av  = document.getElementById('up-avatar');
  av.onerror = () => { av.onerror = null; av.src = '/appimg/default_avatar.png'; };
  av.src = info.avatar_url || info.avatarUrl || '/appimg/default_avatar.png';

  const bannerImg = document.getElementById('up-banner-img');
  const bannerPH  = document.getElementById('up-banner-placeholder');
  bannerImg.onload = () => bannerImg.classList.add('loaded');
  bannerImg.onerror = () => {
    bannerImg.onerror = null;
    bannerImg.src = '/appimg/baner.png';
    bannerImg.classList.add('loaded');
    bannerPH.style.display = 'none';
  };
  bannerImg.src    = info.banner_url || '/appimg/baner.png';
  bannerPH.style.display = 'none';
}

async function openUserProfile(tgUsername, options = {}) {
  if (!tgUsername) return;

  _userProfileFrom = _currentView;

  const wrap    = document.getElementById('user-profile-wrap');
  const postsEl = document.getElementById('up-posts-container');

  document.getElementById('up-name').textContent     = '...';
  document.getElementById('up-username').textContent  = '@' + tgUsername;
  document.getElementById('up-bio').textContent       = '';
  document.getElementById('up-avatar').src            = '/appimg/default_avatar.png';
  document.getElementById('up-verified-badge').style.display = 'none';
  document.getElementById('up-banner-img').classList.remove('loaded');
  postsEl.innerHTML = '<p class="feed__empty">Загрузка...</p>';
  wrap.scrollTop    = 0;

  showView('user-profile', { skipRoute: true });
  if (!options.skipRoute) history.pushState({ view: 'user-profile', username: tgUsername }, '', `/u/${encodeURIComponent(tgUsername)}`);

  const cachedInfo = getCachedUserProfile(tgUsername);
  if (cachedInfo) _renderUserCard(cachedInfo);

  let posts = [];
  try {
    const res = await apiFetch(`${API}/posts?author=${encodeURIComponent(tgUsername)}&page=1&limit=${USER_PROFILE_PAGE}`);
    if (res.ok) posts = await res.json();
  } catch {}

  if (posts.length && posts[0].author) {
    _renderUserCard(posts[0].author);
  }

  fetchUserProfileCached(tgUsername)
    .then(info => { if (info) _renderUserCard(info); })
    .catch(() => {});

  postsEl.innerHTML = '';
  if (!posts.length) {
    postsEl.innerHTML = '<p class="feed__empty">Постов пока нет</p>';
    return;
  }

  renderUserProfilePosts(postsEl, posts, tgUsername, false);

  if (posts.length >= USER_PROFILE_PAGE) {
    loadRemainingUserProfilePosts(postsEl, tgUsername, 2);
  }
}

function renderUserProfilePosts(postsEl, posts, tgUsername, append) {
  let lastDateKey = append ? (postsEl.dataset.lastDateKey || null) : null;
  if (!append) postsEl.dataset.lastDateKey = '';
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
  postsEl.dataset.lastDateKey = lastDateKey || '';

  postsEl.querySelectorAll('.post__more-wrap:not([data-bound])').forEach(wrap => {
    wrap.dataset.bound = '1';
    const btn    = wrap.querySelector('.post__more');
    const id     = Number(btn.dataset.id);
    const postEl = wrap.closest('.post');
    wrap.addEventListener('click', e => {
      e.stopPropagation();
      if (_openMenuId === id) { closeAllMenus(); return; }
      openPostMenu(id, postEl, document.getElementById('user-profile-wrap'), [
        { src: '/appimg/trash.svg', action: () => { closeAllMenus(); deletePost(id, () => openUserProfile(tgUsername)); } },
        { src: '/appimg/pin.svg',   action: () => { closeAllMenus(); pinPost(id, () => openUserProfile(tgUsername)); } },
        { src: '/appimg/edit.svg',  action: () => { closeAllMenus(); startEditPost(id, postEl, () => openUserProfile(tgUsername)); } },
        { src: '/appimg/close.svg', action: () => closeAllMenus() },
      ]);
    });
  });
}

async function loadRemainingUserProfilePosts(postsEl, tgUsername, startPage = 2) {
  let page = startPage;
  while (postsEl.isConnected) {
    let posts = [];
    try {
      const res = await apiFetch(`${API}/posts?author=${encodeURIComponent(tgUsername)}&page=${page}&limit=${USER_PROFILE_PAGE}`);
      if (!res.ok) break;
      posts = await res.json();
    } catch {
      break;
    }
    if (!posts.length) break;
    renderUserProfilePosts(postsEl, posts, tgUsername, true);
    if (posts.length < USER_PROFILE_PAGE) break;
    page += 1;
    await new Promise(resolve => runWhenIdle(resolve, 900));
  }
}

function closeUserProfile() {
  closeAllMenus();
  showView(_userProfileFrom || 'feed');
}

document.getElementById('btn-user-profile-back').addEventListener('click', closeUserProfile);

document.getElementById('nav-home').addEventListener('click',    () => { _userProfileFrom = 'feed'; });
document.getElementById('btn-profile-settings')?.addEventListener('click', () => { _userProfileFrom = 'settings'; });
document.getElementById('nav-profile').addEventListener('click', () => { _userProfileFrom = 'profile'; });

document.addEventListener('click', e => {
  if (e.target.closest('.compose'))      return;
  if (e.target.closest('.profile-card')) return;

  const postEl = e.target.closest('.post');
  if (!postEl) return;

  const isAvatar = e.target.closest('.post__header .avatar');
  const isName   = e.target.closest('.post__name');
  const isHandle = e.target.closest('.post__handle');
  if (!isAvatar && !isName && !isHandle) return;

  const author = postEl.dataset.profileAuthor || postEl.dataset.author;
  const tgAuthor = postEl.dataset.author;
  if (!author) return;

  if (tgAuthor === window._tgUsername) {
    showView('profile');
    return;
  }

  openUserProfile(author);
});
