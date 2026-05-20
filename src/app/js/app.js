'use strict';

/* ── Navigation ─────────────────────────────── */
let _currentView = 'feed';

function showView(name) {
  if (_currentView === name) return;
  _currentView = name;
  document.getElementById('view-feed').classList.toggle('view--active', name === 'feed');
  document.getElementById('view-profile').classList.toggle('view--active', name === 'profile');
  document.getElementById('nav-home').classList.toggle('active', name === 'feed');
  document.getElementById('nav-profile').classList.toggle('active', name === 'profile');
  if (name === 'feed') {
    renderFeedPosts();
    _scrollTopBtn.classList.toggle('visible', _feedEl.scrollTop > 300);
  } else {
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
_scrollTopBtn.addEventListener('click', () => {
  (_currentView === 'feed' ? _feedEl : _profileWrap).scrollTo({ top: 0, behavior: 'smooth' });
});

/* ── Close menu on outside click ────────────── */
document.addEventListener('click', closeAllMenus);

/* ── Init ────────────────────────────────────── */
window._tgUsername = null;

async function checkAuth() {
  const token = await window.electronAPI?.getAuthToken();
  if (!token) { window.electronAPI?.logout(); return false; }
  try {
    const res = await fetch(`${API}/posts?limit=1`, {
      headers: { 'Authorization': 'Bearer ' + token },
    });
    if (res.status === 401) { window.electronAPI?.logout(); return false; }
  } catch {}
  return true;
}

async function initTgProfile() {
  try {
    const tgUser = await window.electronAPI?.getTgUser();
    if (!tgUser) return;

    // _tgUsername нужен всегда — устанавливаем до любых ранних выходов
    window._tgUsername = tgUser.username || null;

    const p = getProfile();
    if (p.tgSynced) return;

    if (tgUser.first_name) {
      p.name = tgUser.last_name
        ? tgUser.first_name + ' ' + tgUser.last_name
        : tgUser.first_name;
    }
    if (tgUser.profile_username) p.username = tgUser.profile_username;
    else if (tgUser.username) p.username = tgUser.username;
    if (tgUser.bio) p.bio = tgUser.bio;
    if (tgUser.verified) p.verified = true;
    if (tgUser.avatar_b64) {
      p.avatar = tgUser.avatar_b64;
    } else {
      const resp = await fetch('../../img/default_avatar.png');
      const blob = await resp.blob();
      p.avatar = await new Promise(res => {
        const r = new FileReader();
        r.onload = e => res(e.target.result);
        r.readAsDataURL(blob);
      });
    }
    p.tgSynced = true;
    saveProfile(p);

    const avatarSrc = p.avatar || '../../img/default_avatar.png';
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

async function connectEvents() {
  if (_sseSource) { _sseSource.close(); _sseSource = null; }
  const token = await window.electronAPI?.getAuthToken();
  if (!token) return;

  const es = new EventSource(`${API}/events?token=${encodeURIComponent(token)}`);
  _sseSource = es;

  es.onmessage = e => {
    try {
      const data = JSON.parse(e.data);
      if (data.type === 'avatar_update') updateAvatarsInDom(data.username, data.avatarUrl);
    } catch {}
  };

  es.onerror = () => {
    es.close();
    _sseSource = null;
    setTimeout(connectEvents, 5000);
  };
}

checkAuth().then(ok => {
  if (!ok) return;
  initTgProfile().finally(() => {
    renderFeedComposeAvatar();
    renderFeedPosts();
    connectEvents();
  });
});
