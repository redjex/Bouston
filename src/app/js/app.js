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

function applyUserDataToLocalProfile(profile, data, canUpdateAvatar = true) {
  if (!data) return;
  if (data.banner_url) profile.banner = data.banner_url;
  if (canUpdateAvatar && data.avatar_url) profile.avatar = data.avatar_url;
  if (canUpdateAvatar && (data.avatar_preview_url || data.avatar_url)) {
    profile.avatarPreview = data.avatar_preview_url || getAvatarPreviewSrc(data.avatar_url);
  }
  if (data.bio) profile.bio = data.bio;
  if (data.display_name) profile.name = data.display_name;
  if (data.profile_username) profile.username = data.profile_username;
  if (data.verified != null) profile.verified = !!data.verified;
}

async function initTgProfile() {
  try {
    const tgUser = await window.electronAPI?.getTgUser();
    if (!tgUser) return;

    // _tgUsername нужен всегда — устанавливаем до любых ранних выходов
    window._tgUsername = tgUser.username || null;

    let p = getProfile();
    // Если в кэше данные другого пользователя — сбрасываем
    if (p.tgUsername && p.tgUsername !== tgUser.username) {
      clearProfile();
      p = getProfile();
    }

    if (!p.name || p.name === 'Bouston') {
      if (tgUser.first_name) {
        p.name = tgUser.last_name
          ? tgUser.first_name + ' ' + tgUser.last_name
          : tgUser.first_name;
      }
    }
    if (!p.username) {
      if (tgUser.profile_username) p.username = tgUser.profile_username;
      else if (tgUser.username) p.username = tgUser.username;
    }
    if (!p.bio || p.bio === DEFAULT_PROFILE.bio) p.bio = tgUser.bio || 'Привет, я использую Bouston';
    if (tgUser.verified) p.verified = true;
    if (tgUser.avatar_b64) {
      p.avatar = tgUser.avatar_b64;
      p.avatarPreview = tgUser.avatar_b64;
    } else if (tgUser.avatar_url && !p.avatar) {
      p.avatar = tgUser.avatar_url;
      p.avatarPreview = tgUser.avatar_preview_url || getAvatarPreviewSrc(tgUser.avatar_url);
    } else if (!p.avatar) {
      p.avatar = '../../img/default_avatar.png';
      p.avatarPreview = p.avatar;
    }

    const cachedUser = getCachedUserProfile(tgUser.username);
    if (cachedUser) applyUserDataToLocalProfile(p, cachedUser, !tgUser.avatar_b64);

    if (!isProfileCacheFresh(p)) {
      try {
        const uData = await fetchUserProfileCached(tgUser.username, { force: true });
        if (uData) applyUserDataToLocalProfile(p, uData, !tgUser.avatar_b64);
      } catch {}
    }

    p.tgSynced   = true;
    p.tgUsername = tgUser.username || null;
    saveProfile(p);

    const avatarSrc = p.avatar || '../../img/default_avatar.png';
    const avatarPreviewSrc = p.avatarPreview || avatarSrc;
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
  document.querySelectorAll(`[data-author="${username}"] .avatar`).forEach(img => {
    img.src = avatarPreviewUrl || avatarUrl;
  });
  if (username === window._tgUsername) {
    const p = getProfile();
    p.avatar = avatarUrl || p.avatar;
    p.avatarPreview = avatarPreviewUrl || avatarUrl || p.avatarPreview;
    saveProfile(p);
    ['feed-compose-avatar', 'profile-compose-avatar', 'thread-compose-avatar'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.src = avatarPreviewUrl || avatarUrl;
    });
    const profileAvatar = document.getElementById('profile-avatar');
    if (profileAvatar) profileAvatar.src = avatarUrl;
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

checkAuth().then(ok => {
  if (!ok) return;
  initTgProfile().finally(() => {
    renderFeedComposeAvatar();
    renderFeedPosts();
    connectEvents();
  });
});

/* ── Auto-updater overlay ────────────────────── */
(function () {
  const overlay = document.getElementById('update-overlay');
  const btnInstall = document.getElementById('btn-update-install');
  const btnLater   = document.getElementById('btn-update-later');

  if (window.electronAPI?.onUpdateReady) {
    window.electronAPI.onUpdateReady(() => {
      overlay.classList.add('update-overlay--visible');
    });
  }

  btnInstall.addEventListener('click', () => {
    window.electronAPI?.installUpdate();
  });

  btnLater.addEventListener('click', () => {
    overlay.classList.remove('update-overlay--visible');
  });
})();
