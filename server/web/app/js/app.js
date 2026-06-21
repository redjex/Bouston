'use strict';

/* ── Navigation ─────────────────────────────── */
let _currentView = 'feed';

function showView(name) {
  if (_currentView === name) return;
  _currentView = name;
  document.getElementById('view-feed').classList.toggle('view--active', name === 'feed');
  document.getElementById('view-profile').classList.toggle('view--active', name === 'profile');
  document.getElementById('view-settings').classList.toggle('view--active', name === 'settings');
  document.getElementById('view-user-profile').classList.toggle('view--active', name === 'user-profile');
  document.getElementById('nav-home').classList.toggle('active', name === 'feed');
  document.getElementById('nav-profile').classList.toggle('active', name === 'profile');
  if (name === 'feed') {
    renderFeedPosts();
    setScrollTopVisible(_feedEl.scrollTop > 300);
  } else if (name === 'profile') {
    renderProfile();
    renderProfilePosts();
    setScrollTopVisible(_profileWrap.scrollTop > 300);
  } else if (name === 'settings') {
    renderSettings();
    const settingsWrap = document.getElementById('settings-wrap');
    setScrollTopVisible(settingsWrap.scrollTop > 300);
  } else if (name === 'user-profile') {
    setScrollTopVisible(document.getElementById('user-profile-wrap').scrollTop > 300);
  }
  setProfileSettingsVisible(name === 'profile');
  updateNavIndicator();
  updateFloatingNavLayout();
}

document.getElementById('nav-home').addEventListener('click', () => showView('feed'));
document.getElementById('nav-profile').addEventListener('click', () => showView('profile'));

/* ── Scroll to top ───────────────────────────── */
const _scrollTopBtn = document.getElementById('btn-scroll-top');
const _profileSettingsBtn = document.getElementById('btn-profile-settings');
const _bottomNav = document.querySelector('.bottom-nav');
const _bottomNavIndicator = document.getElementById('bottom-nav-indicator');
const FLOATING_NAV_GAP = 8;

function updateFloatingNavLayout() {
  const items = [];
  const settingsVisible = document.body.classList.contains('profile-settings-visible');
  const scrollVisible = document.body.classList.contains('scroll-top-visible');

  if (settingsVisible) items.push({ el: _profileSettingsBtn, kind: 'settings' });
  items.push({ el: _bottomNav, kind: 'nav' });
  if (scrollVisible) items.push({ el: _scrollTopBtn, kind: 'scroll' });

  const widths = items.map(item => item.el.offsetWidth);
  const totalWidth = widths.reduce((sum, width) => sum + width, 0) + FLOATING_NAV_GAP * (items.length - 1);
  let x = Math.round((window.innerWidth - totalWidth) / 2);

  items.forEach((item, index) => {
    const width = widths[index];
    if (item.kind === 'nav') {
      document.documentElement.style.setProperty('--bottom-nav-left', `${x + width / 2}px`);
    } else if (item.kind === 'settings') {
      document.documentElement.style.setProperty('--profile-settings-left', `${x}px`);
    } else if (item.kind === 'scroll') {
      document.documentElement.style.setProperty('--scroll-top-left', `${x}px`);
    }
    x += width + FLOATING_NAV_GAP;
  });
}

function updateNavIndicator() {
  const activeBtn = _bottomNav.querySelector('.nav-btn.active');
  if (!activeBtn) {
    _bottomNavIndicator.classList.remove('visible');
    return;
  }

  const navRect = _bottomNav.getBoundingClientRect();
  const btnRect = activeBtn.getBoundingClientRect();
  const x = btnRect.left - navRect.left - 10;
  _bottomNavIndicator.style.width = `${btnRect.width}px`;
  _bottomNavIndicator.style.height = `${btnRect.height}px`;
  _bottomNavIndicator.style.setProperty('--nav-indicator-x', `${x}px`);
  _bottomNavIndicator.classList.add('visible');
}

requestAnimationFrame(() => {
  updateFloatingNavLayout();
  updateNavIndicator();
});
window.addEventListener('resize', () => {
  updateFloatingNavLayout();
  updateNavIndicator();
});

function setScrollTopVisible(visible) {
  _scrollTopBtn.classList.toggle('visible', visible);
  document.body.classList.toggle('scroll-top-visible', visible);
  updateFloatingNavLayout();
}

function setProfileSettingsVisible(visible) {
  _profileSettingsBtn.classList.toggle('visible', visible);
  document.body.classList.toggle('profile-settings-visible', visible);
  updateFloatingNavLayout();
}

_profileSettingsBtn.addEventListener('click', () => showView('settings'));

_feedEl.addEventListener('scroll', () => {
  if (_currentView === 'feed') {
    setScrollTopVisible(_feedEl.scrollTop > 300);
    document.getElementById('view-feed').classList.toggle('view--scrolled', _feedEl.scrollTop > 10);
  }
});
_profileWrap.addEventListener('scroll', () => {
  if (_currentView === 'profile') {
    setScrollTopVisible(_profileWrap.scrollTop > 300);
    document.getElementById('view-profile').classList.toggle('view--scrolled', _profileWrap.scrollTop > 10);
  }
});
document.getElementById('settings-wrap').addEventListener('scroll', () => {
  if (_currentView === 'settings') {
    const settingsWrap = document.getElementById('settings-wrap');
    setScrollTopVisible(settingsWrap.scrollTop > 300);
    document.getElementById('view-settings').classList.toggle('view--scrolled', settingsWrap.scrollTop > 10);
  }
});
document.getElementById('user-profile-wrap').addEventListener('scroll', () => {
  if (_currentView === 'user-profile') {
    setScrollTopVisible(document.getElementById('user-profile-wrap').scrollTop > 300);
    document.getElementById('view-user-profile').classList.toggle('view--scrolled', document.getElementById('user-profile-wrap').scrollTop > 10);
  }
});
_scrollTopBtn.addEventListener('click', () => {
  if (_currentView === 'feed') _feedEl.scrollTo({ top: 0, behavior: 'smooth' });
  else if (_currentView === 'profile') _profileWrap.scrollTo({ top: 0, behavior: 'smooth' });
  else if (_currentView === 'settings') document.getElementById('settings-wrap').scrollTo({ top: 0, behavior: 'smooth' });
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

    if (!isProfileCacheFresh(p)) {
      try {
        const uData = await fetchUserProfileCached(tgUser.username, { force: true });
        if (uData) {
        if (uData.banner_url) p.banner = uData.banner_url;
        if (uData.avatar_url && !tgUser.avatar_b64) p.avatar = uData.avatar_url;
        if (uData.bio) p.bio = uData.bio;
        if (uData.display_name) p.name = uData.display_name;
        if (uData.profile_username) p.username = uData.profile_username;
        if (uData.verified) p.verified = uData.verified;
        }
      } catch {}
    } else {
      const uData = getCachedUserProfile(tgUser.username);
      if (uData) {
        if (uData.banner_url) p.banner = uData.banner_url;
        if (uData.avatar_url && !tgUser.avatar_b64) p.avatar = uData.avatar_url;
        if (uData.bio) p.bio = uData.bio;
        if (uData.display_name) p.name = uData.display_name;
        if (uData.profile_username) p.username = uData.profile_username;
        if (uData.verified) p.verified = uData.verified;
      }
    }

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
