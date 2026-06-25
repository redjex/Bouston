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
    updateProfileStickyCard();
  } else if (name === 'settings') {
    renderSettings();
    const settingsWrap = document.getElementById('settings-wrap');
    setScrollTopVisible(settingsWrap.scrollTop > 300);
  } else if (name === 'user-profile') {
    setScrollTopVisible(document.getElementById('user-profile-wrap').scrollTop > 300);
  }
  setProfileSettingsVisible(name === 'profile');
  if (name !== 'profile') setProfileStickyVisible(false);
  requestAnimationFrame(updateNavIndicator);
}

document.getElementById('nav-home').addEventListener('click', () => showView('feed'));
document.getElementById('nav-profile').addEventListener('click', () => showView('profile'));

/* ── Scroll to top ───────────────────────────── */
const _scrollTopBtn = document.getElementById('btn-scroll-top');
const _profileSettingsBtn = document.getElementById('btn-profile-settings');
const _bottomNav = document.querySelector('.bottom-nav');
const _bottomNavIndicator = document.getElementById('bottom-nav-indicator');
const _profileStickyCard = document.getElementById('profile-sticky-card');
let _scrollTopVisibleState = false;
let _profileSettingsVisibleState = false;
let _profileStickyVisibleState = false;

function normalizeStaticLabels() {
  [
    ['feed-compose-input', 'Напишите что нибудь...'],
    ['profile-compose-input', 'Напишите что нибудь...'],
  ].forEach(([id, text]) => {
    const el = document.getElementById(id);
    if (el) el.dataset.placeholder = text;
  });
  const feedPostBtn = document.getElementById('feed-btn-post');
  const profilePostBtn = document.getElementById('profile-btn-post');
  if (feedPostBtn) feedPostBtn.textContent = 'Выставить';
  if (profilePostBtn) profilePostBtn.textContent = 'Выставить';
  document.querySelectorAll('label[for$="-photo-input"]').forEach(el => { el.title = 'Добавить фото'; });
  document.querySelectorAll('.btn-emoji-open').forEach(el => { el.title = 'Добавить эмодзи'; });
  const settingsBtn = document.getElementById('btn-profile-settings');
  if (settingsBtn) settingsBtn.title = 'Настройки';
  const navHome = document.getElementById('nav-home');
  const navProfile = document.getElementById('nav-profile');
  if (navHome) navHome.title = 'Главная';
  if (navProfile) navProfile.title = 'Профиль';
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

requestAnimationFrame(updateNavIndicator);
window.addEventListener('resize', updateNavIndicator);

function setScrollTopVisible(visible) {
  if (_scrollTopVisibleState === visible) return;
  _scrollTopVisibleState = visible;
  _scrollTopBtn.classList.toggle('visible', visible);
  document.body.classList.toggle('scroll-top-visible', visible);
}

function setProfileSettingsVisible(visible) {
  if (_profileSettingsVisibleState === visible) return;
  _profileSettingsVisibleState = visible;
  _profileSettingsBtn.classList.toggle('visible', visible);
  document.body.classList.toggle('profile-settings-visible', visible);
}

function setProfileStickyVisible(visible) {
  if (!_profileStickyCard || _profileStickyVisibleState === visible) return;
  _profileStickyVisibleState = visible;
  _profileStickyCard.classList.toggle('visible', visible);
  _profileStickyCard.setAttribute('aria-hidden', visible ? 'false' : 'true');
}

function updateProfileStickyCard() {
  if (_currentView !== 'profile') {
    setProfileStickyVisible(false);
    return;
  }

  const card = document.getElementById('profile-card');
  if (!card) return;
  const threshold = Math.max(120, card.offsetTop + card.offsetHeight - 54);
  setProfileStickyVisible(_profileWrap.scrollTop > threshold);
}

function warmUpInterface() {
  const run = () => {
    loadEmojiList?.().catch?.(() => {});
    ['/appimg/up.svg', '/appimg/settings.svg', '/appimg/comments.svg', '/appimg/default_avatar.png'].forEach(src => {
      const img = new Image();
      img.src = src;
    });
    updateNavIndicator();
  };
  if ('requestIdleCallback' in window) requestIdleCallback(run, { timeout: 1200 });
  else setTimeout(run, 120);
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
    updateProfileStickyCard();
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
      p.avatarPreview = tgUser.avatar_b64;
    } else if (tgUser.avatar_url) {
      p.avatar = tgUser.avatar_url;
      p.avatarPreview = tgUser.avatar_preview_url || getAvatarPreviewSrc(tgUser.avatar_url);
    }

    if (!isProfileCacheFresh(p)) {
      try {
        const uData = await fetchUserProfileCached(tgUser.username, { force: true });
        if (uData) {
        if (uData.banner_url) p.banner = uData.banner_url;
        if (uData.avatar_url) p.avatar = uData.avatar_url;
        if (uData.avatar_preview_url || uData.avatar_url) p.avatarPreview = uData.avatar_preview_url || getAvatarPreviewSrc(uData.avatar_url);
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
        if (uData.avatar_url) p.avatar = uData.avatar_url;
        if (uData.avatar_preview_url || uData.avatar_url) p.avatarPreview = uData.avatar_preview_url || getAvatarPreviewSrc(uData.avatar_url);
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
    const avatarPreviewSrc = getProfileAvatarPreview(p) || '/appimg/default_avatar.png';
    ['feed-compose-avatar', 'profile-compose-avatar', 'thread-compose-avatar'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.src = avatarPreviewSrc;
    });
    const profileAvatar = document.getElementById('profile-avatar');
    if (profileAvatar) profileAvatar.src = avatarSrc;
  } catch {}
}

/* ── Real-time avatar updates (SSE) ─────────────── */
function updateAvatarsInDom(username, avatarUrl, avatarPreviewUrl) {
  const previewSrc = avatarPreviewUrl || getAvatarPreviewSrc(avatarUrl) || avatarUrl;
  document.querySelectorAll(`[data-author="${username}"] .avatar`).forEach(img => {
    img.src = previewSrc;
  });
  if (username === window._tgUsername) {
    const p = getProfile();
    p.avatar = avatarUrl || p.avatar;
    p.avatarPreview = previewSrc || p.avatarPreview;
    saveProfile(p);
    ['feed-compose-avatar', 'profile-compose-avatar', 'thread-compose-avatar'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.src = previewSrc;
    });
    const profileAvatar = document.getElementById('profile-avatar');
    if (profileAvatar) profileAvatar.src = avatarUrl;
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
      if (data.type === 'avatar_update')   updateAvatarsInDom(data.username, data.avatarUrl, data.avatarPreviewUrl);
      if (data.type === 'new_post')        prependPostToFeed(data.post);
      if (data.type === 'new_comment')     handleNewCommentEvent(data);
      if (data.type === 'post_deleted')    handleDeletedPost(data.postId);
      if (data.type === 'reaction_update') applyReactionUpdate(data.postId, data.reactions);
    } catch {}
  };

  es.onerror = () => {
    es.close();
    _sseSource = null;
    setTimeout(connectEvents, 5000);
  };
}

normalizeStaticLabels();

if (checkAuth()) {
  initTgProfile().finally(() => {
    renderFeedComposeAvatar();
    renderFeedPosts();
    connectEvents();
    warmUpInterface();
  });
}
