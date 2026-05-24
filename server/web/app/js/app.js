'use strict';

/* ── Navigation ─────────────────────────────── */
let _currentView = 'feed';

function showView(name) {
  if (_currentView === name) return;
  _currentView = name;
  document.getElementById('view-feed').classList.toggle('view--active', name === 'feed');
  document.getElementById('view-profile').classList.toggle('view--active', name === 'profile');
  document.getElementById('view-user-profile').classList.toggle('view--active', name === 'user-profile');
  document.getElementById('nav-home').classList.toggle('active', name === 'feed');
  document.getElementById('nav-profile').classList.toggle('active', name === 'profile');
  if (name === 'feed') {
    renderFeedPosts();
    _scrollTopBtn.classList.toggle('visible', _feedEl.scrollTop > 300);
  } else if (name === 'profile') {
    renderProfile();
    renderProfilePosts();
    _scrollTopBtn.classList.toggle('visible', _profileWrap.scrollTop > 300);
  }
}

document.getElementById('nav-home').addEventListener('click', () => showView('feed'));
document.getElementById('nav-profile').addEventListener('click', () => showView('profile'));

/* ── Scroll to top ───────────────────────────── */
const _scrollTopBtn = document.getElementById('btn-scroll-top');

_feedEl.addEventListener('scroll', () => {
  if (_currentView === 'feed') {
    _scrollTopBtn.classList.toggle('visible', _feedEl.scrollTop > 300);
    document.getElementById('view-feed').classList.toggle('view--scrolled', _feedEl.scrollTop > 10);
  }
});
_profileWrap.addEventListener('scroll', () => {
  if (_currentView === 'profile') {
    _scrollTopBtn.classList.toggle('visible', _profileWrap.scrollTop > 300);
    document.getElementById('view-profile').classList.toggle('view--scrolled', _profileWrap.scrollTop > 10);
  }
});
document.getElementById('user-profile-wrap').addEventListener('scroll', () => {
  if (_currentView === 'user-profile') {
    _scrollTopBtn.classList.toggle('visible', document.getElementById('user-profile-wrap').scrollTop > 300);
    document.getElementById('view-user-profile').classList.toggle('view--scrolled', document.getElementById('user-profile-wrap').scrollTop > 10);
  }
});
_scrollTopBtn.addEventListener('click', () => {
  if (_currentView === 'feed') _feedEl.scrollTo({ top: 0, behavior: 'smooth' });
  else if (_currentView === 'profile') _profileWrap.scrollTo({ top: 0, behavior: 'smooth' });
  else if (_currentView === 'user-profile') document.getElementById('user-profile-wrap').scrollTo({ top: 0, behavior: 'smooth' });
});

/* ── Close menu on outside click ────────────── */
document.addEventListener('click', closeAllMenus);

/* ── Init ────────────────────────────────────── */
window._tgUsername = null;

function checkAuth() {
  const token = getToken();
  if (!token) { logout(); return false; }
  return true;
}

async function initTgProfile() {
  try {
    const tgUser = getStoredUser();
    if (!tgUser) return;

    window._tgUsername = tgUser.username || null;

    let p = getProfile();
    if (p.tgUsername && p.tgUsername !== tgUser.username) {
      clearProfile();
      p = getProfile();
    }

    if (tgUser.first_name) {
      p.name = tgUser.last_name
        ? tgUser.first_name + ' ' + tgUser.last_name
        : tgUser.first_name;
    }
    if (tgUser.profile_username) p.username = tgUser.profile_username;
    else if (tgUser.username) p.username = tgUser.username;
    p.bio = tgUser.bio || 'Привет, я использую Bouston';
    if (tgUser.verified) p.verified = true;
    if (tgUser.avatar_b64) {
      p.avatar = tgUser.avatar_b64;
    } else if (tgUser.avatar_url) {
      p.avatar = tgUser.avatar_url;
    }

    try {
      const uRes = await apiFetch(`${API}/users/${tgUser.username}`);
      if (uRes.ok) {
        const uData = await uRes.json();
        if (uData.banner_url) p.banner = uData.banner_url;
        if (uData.avatar_url && !tgUser.avatar_b64) p.avatar = uData.avatar_url;
        if (uData.bio) p.bio = uData.bio;
        if (uData.display_name) p.name = uData.display_name;
        if (uData.profile_username) p.username = uData.profile_username;
        if (uData.verified) p.verified = uData.verified;
      }
    } catch {}

    p.tgSynced   = true;
    p.tgUsername = tgUser.username || null;
    saveProfile(p);

    const avatarSrc = p.avatar || '/appimg/default_avatar.png';
    ['feed-compose-avatar', 'profile-compose-avatar', 'thread-compose-avatar', 'profile-avatar'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.src = avatarSrc;
    });
  } catch {}
}

/* ── Real-time avatar updates (SSE) ─────────────── */
function updateAvatarsInDom(username, avatarUrl) {
  document.querySelectorAll(`[data-author="${username}"] .avatar`).forEach(img => {
    img.src = avatarUrl;
  });
  if (username === window._tgUsername) {
    ['feed-compose-avatar', 'profile-compose-avatar', 'thread-compose-avatar', 'profile-avatar'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.src = avatarUrl;
    });
  }
}

let _sseSource = null;

function connectEvents() {
  if (_sseSource) { _sseSource.close(); _sseSource = null; }
  const token = getToken();
  if (!token) return;

  const es = new EventSource(`${API}/events?token=${encodeURIComponent(token)}`);
  _sseSource = es;

  es.onmessage = e => {
    try {
      const data = JSON.parse(e.data);
      if (data.type === 'avatar_update')   updateAvatarsInDom(data.username, data.avatarUrl);
      if (data.type === 'new_post')        prependPostToFeed(data.post);
      if (data.type === 'reaction_update') applyReactionUpdate(data.postId, data.reactions);
    } catch {}
  };

  es.onerror = () => {
    es.close();
    _sseSource = null;
    setTimeout(connectEvents, 5000);
  };
}

if (checkAuth()) {
  initTgProfile().finally(() => {
    renderFeedComposeAvatar();
    renderFeedPosts();
    connectEvents();
  });
}
