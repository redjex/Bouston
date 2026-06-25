'use strict';

const _profileWrap = document.getElementById('profile-wrap');

function linkifyBio(text) {
  if (!text) return '';
  const escaped = text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  return escaped.replace(
    /(?:https?:\/\/|www\.)[^\s<>"']+|[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?(?:\.[a-zA-Z]{2,})+(?:\/[^\s<>"']*)?/g,
    url => {
      const href = /^https?:\/\//i.test(url) ? url : 'https://' + url;
      return `<a class="bio-link" href="${href}" target="_blank" rel="noopener noreferrer">${url}</a>`;
    }
  );
}

function renderProfile() {
  const p = getProfile();

  const profileAvatar = document.getElementById('profile-avatar');
  profileAvatar.onerror = () => { profileAvatar.onerror = null; profileAvatar.src = '/appimg/default_avatar.png'; };
  profileAvatar.src = p.avatar || '/appimg/default_avatar.png';

  const bannerImg = document.getElementById('banner-img');
  const bannerPH  = document.getElementById('banner-placeholder');
  bannerImg.onerror = () => {
    bannerImg.onerror = null;
    bannerImg.src = '/appimg/baner.png';
    bannerImg.classList.add('loaded');
    bannerPH.style.display = 'none';
  };
  if (p.banner) {
    bannerImg.src = p.banner;
    bannerImg.classList.add('loaded');
    bannerPH.style.display = 'none';
  } else {
    bannerImg.classList.remove('loaded');
    bannerPH.style.display = '';
  }

  document.getElementById('profile-name').textContent = p.name;
  const usernameEl = document.getElementById('profile-username');
  if (usernameEl) usernameEl.textContent = p.username ? '@' + p.username : '';
  document.getElementById('profile-bio').innerHTML = linkifyBio(p.bio);
  const badge = document.getElementById('profile-verified-badge');
  if (badge) badge.style.display = p.verified ? 'inline-block' : 'none';

  document.getElementById('input-name').value             = p.name;
  document.getElementById('input-username-profile').value = p.username ? '@' + p.username : '';
  document.getElementById('input-bio').value              = p.bio;
  syncModalPreview('modal-avatar-preview', 'btn-pick-avatar', p.avatar || '/appimg/default_avatar.png', true);
  if (p.banner) syncModalPreview('modal-banner-preview', 'btn-pick-banner', p.banner, false);

  const composeAvatar = document.getElementById('profile-compose-avatar');
  if (composeAvatar) composeAvatar.src = getProfileAvatarPreview(p) || '/appimg/default_avatar.png';
  renderProfileStickyCard(p);
}

function renderProfileStickyCard(p = getProfile()) {
  const avatar = document.getElementById('profile-sticky-avatar');
  const name = document.getElementById('profile-sticky-name');
  const username = document.getElementById('profile-sticky-username');
  const badge = document.getElementById('profile-sticky-verified');
  if (!avatar || !name || !username || !badge) return;

  avatar.onerror = () => { avatar.onerror = null; avatar.src = '/appimg/default_avatar.png'; };
  avatar.src = getProfileAvatarPreview(p) || p.avatar || '/appimg/default_avatar.png';
  name.textContent = p.name || 'Bouston';
  username.textContent = p.username ? '@' + p.username : '';
  badge.style.display = p.verified ? 'block' : 'none';
}

function syncModalPreview(imgId, btnId, src, alwaysShow) {
  const img = document.getElementById(imgId);
  const btn = document.getElementById(btnId);
  if (!img || !btn) return;
  if (src || alwaysShow) {
    img.src = src || '';
    img.style.display = 'block';
    btn.classList.add('has-image');
  }
}

let _profileObserver = null;
let _profilePostsRendered = false;
let _profilePostsRefreshPromise = null;
let _profileRenderToken = 0;

function attachProfileMenu(container) {
  container.querySelectorAll('.post__more-wrap:not([data-bound])').forEach(wrap => {
    wrap.dataset.bound = '1';
    const btn    = wrap.querySelector('.post__more');
    const id     = Number(btn.dataset.id);
    const postEl = wrap.closest('.post');
    wrap.addEventListener('click', e => {
      e.stopPropagation();
      if (_openMenuId === id) { closeAllMenus(); return; }
      openPostMenu(id, postEl, _profileWrap, [
        { src: '/appimg/trash.svg', action: () => { closeAllMenus(); deletePost(id, renderProfilePosts); } },
        { src: '/appimg/pin.svg',   action: () => { closeAllMenus(); pinPost(id, renderProfilePosts); } },
        { src: '/appimg/edit.svg',  action: () => { closeAllMenus(); startEditPost(id, postEl, renderProfilePosts); } },
        { src: '/appimg/close.svg', action: () => closeAllMenus() },
      ]);
    });
  });
}

async function renderProfilePosts() {
  closeAllMenus();
  if (_profileObserver) { _profileObserver.disconnect(); _profileObserver = null; }

  const container = document.getElementById('profile-posts-container');
  const u = window._tgUsername;

  if (_profilePostsRendered && container.querySelector('.post[data-post-id]')) {
    refreshProfilePostsFromServer(container, u);
    return;
  }

  if (!u) {
    container.innerHTML = '<p class="feed__empty">Постов пока нет</p>';
    return;
  }

  const cached = getProfilePostsCache(u);
  if (cached.length) {
    _renderProfilePostsList(container, cached);
    _profilePostsRendered = true;
  } else {
    renderPostSkeletons(container, 3);
  }

  await refreshProfilePostsFromServer(container, u, { allowInitialRender: true, hadCache: !!cached.length });
}

async function refreshProfilePostsFromServer(container, username, options = {}) {
  if (!username) return;
  if (_profilePostsRefreshPromise) return _profilePostsRefreshPromise;

  _profilePostsRefreshPromise = (async () => {
    let posts;
    try {
      const res = await apiFetch(`${API}/posts?author=${encodeURIComponent(username)}&limit=100`);
      if (!res.ok) throw new Error();
      posts = await res.json();
    } catch {
      if (!options.hadCache && !container.querySelector('.post[data-post-id]')) {
        container.innerHTML = '<p class="feed__empty">Нет соединения с сервером</p>';
      }
      return;
    }

    if (!posts.length) {
      reconcileProfilePostsCache(username, posts);
      container.querySelectorAll('.post[data-post-id]').forEach(removePostElWithSeparator);
      if (!options.hadCache && !container.querySelector('.post[data-post-id]')) {
        container.innerHTML = '<p class="feed__empty">Постов пока нет</p>';
      }
      return;
    }

    const merged = reconcileProfilePostsCache(username, posts);
    if (options.allowInitialRender && !options.hadCache) {
      _renderProfilePostsList(container, merged);
    } else {
      posts.forEach(post => registerServerPost(post));
      renderProfileIfMissingPosts(container, merged);
    }
    _profilePostsRendered = true;
  })().finally(() => { _profilePostsRefreshPromise = null; });

  return _profilePostsRefreshPromise;
}
function _renderProfilePostsList(container, posts) {
  const token = ++_profileRenderToken;
  container.innerHTML = '';
  container.dataset.lastDateKey = '';
  const first = posts.slice(0, 6);
  const rest = posts.slice(6);
  let lastDateKey = container.dataset.lastDateKey || null;
  first.forEach((post, i) => {
    registerServerPost(post);
    const ts = post.createdAt || post.id;
    const dateKey = getDateKey(ts);
    if (dateKey !== lastDateKey) {
      container.appendChild(buildDateSeparator(ts));
      lastDateKey = dateKey;
    }
    container.appendChild(buildPostEl(post, null, null, false, '', i, true));
  });
  container.dataset.lastDateKey = lastDateKey || '';
  attachProfileMenu(container);
  appendProfilePostsInChunks(container, rest, token);
}

function appendProfilePostsInChunks(container, posts, token) {
  if (!posts.length) return;
  let index = 0;
  const chunkSize = 5;
  const appendChunk = () => {
    if (!container.isConnected || token !== _profileRenderToken) return;
    let lastDateKey = container.dataset.lastDateKey || null;
    const chunk = posts.slice(index, index + chunkSize)
      .filter(post => !container.querySelector(`.post[data-post-id="${post.id}"]`));
    chunk.forEach((post, i) => {
      registerServerPost(post);
      const ts = post.createdAt || post.id;
      const dateKey = getDateKey(ts);
      if (dateKey !== lastDateKey) {
        container.appendChild(buildDateSeparator(ts));
        lastDateKey = dateKey;
      }
      container.appendChild(buildPostEl(post, null, null, false, '', i, true));
    });
    container.dataset.lastDateKey = lastDateKey || '';
    attachProfileMenu(container);
    index += chunkSize;
    if (index < posts.length) runWhenIdle(appendChunk);
  };
  runWhenIdle(appendChunk);
}

function renderProfileIfMissingPosts(container, posts) {
  const missing = posts.filter(post => !container.querySelector(`.post[data-post-id="${post.id}"]`));
  const domOrder = Array.from(container.querySelectorAll('.post[data-post-id]')).map(el => Number(el.dataset.postId));
  const nextOrder = posts.map(post => Number(post.id));
  const orderChanged = domOrder.length !== nextOrder.length || nextOrder.some((id, index) => domOrder[index] !== id);
  if (missing.length || orderChanged) _renderProfilePostsList(container, posts);
}

function prependPostToProfile(post) {
  const container = document.getElementById('profile-posts-container');
  if (!container) return;
  if (container.querySelector(`.post[data-post-id="${post.id}"]`)) return;

  post.isOwn = post.author?.tgUsername === window._tgUsername;
  registerServerPost(post);
  if (window._tgUsername) mergeProfilePostsCache(window._tgUsername, [post]);

  const emptyEl = container.querySelector('.feed__empty');
  if (emptyEl) emptyEl.remove();

  const postEl = buildPostEl(post, null, null, false, '', 0, true);
  postEl.classList.remove('post--enter');

  const postKey = getDateKey(post.createdAt || post.id);
  const firstPost = container.querySelector('.post[data-post-id]');
  const firstPostTs = firstPost ? (_serverPostsMap.get(Number(firstPost.dataset.postId))?.createdAt || 0) : 0;
  const firstKey = firstPostTs ? getDateKey(firstPostTs) : null;
  const firstChild = container.firstElementChild;

  if (firstChild && firstChild.classList.contains('date-separator') && firstKey === postKey) {
    firstChild.after(postEl);
  } else {
    container.prepend(postEl);
    container.prepend(buildDateSeparator(post.createdAt || post.id));
  }

  attachProfileMenu(container);
  _profilePostsRendered = true;
}

/* в”Ђв”Ђ Modal в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ */
let _pendingAvatar    = undefined;
let _pendingBanner    = undefined;
let _originalUsername = '';

function openModal() {
  _pendingAvatar = undefined;
  _pendingBanner = undefined;
  const p = getProfile();
  _originalUsername = p.username || '';
  document.getElementById('input-name').value             = p.name;
  document.getElementById('input-username-profile').value = p.username ? '@' + p.username : '';
  document.getElementById('input-bio').value              = p.bio;
  const avatarImg = document.getElementById('modal-avatar-preview');
  avatarImg.src = p.avatar || '/appimg/default_avatar.png';
  avatarImg.style.display = 'block';
  document.getElementById('btn-pick-avatar').classList.add('has-image');

  const bannerImg = document.getElementById('modal-banner-preview');
  if (p.banner) {
    bannerImg.src = p.banner;
    bannerImg.style.display = 'block';
    document.getElementById('btn-pick-banner').classList.add('has-image');
  }

  document.getElementById('edit-modal').removeAttribute('hidden');
}

function closeModal() {
  document.getElementById('edit-modal').setAttribute('hidden', '');
  _pendingAvatar = undefined;
  _pendingBanner = undefined;
  clearFieldError('input-username-profile');
}

function pickImage(onLoad) {
  const input = document.createElement('input');
  input.type = 'file'; input.accept = 'image/*';
  input.addEventListener('change', () => {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => onLoad(e.target.result);
    reader.readAsDataURL(file);
  });
  input.click();
}

function showFieldError(inputId, message) {
  const inp = document.getElementById(inputId);
  if (!inp) return;
  inp.classList.add('input--error');
  inp.addEventListener('animationend', () => inp.classList.remove('input--error'), { once: true });
  const field = inp.closest('.edit-field');
  if (!field) return;
  clearFieldError(inputId);
  const err = document.createElement('span');
  err.className = 'edit-field__error';
  err.dataset.for = inputId;
  err.textContent = message;
  field.appendChild(err);
}

function clearFieldError(inputId) {
  document.querySelectorAll(`.edit-field__error[data-for="${inputId}"]`).forEach(e => e.remove());
}

document.getElementById('btn-banner-settings').addEventListener('click', openModal);
document.getElementById('btn-close-modal').addEventListener('click', closeModal);

document.getElementById('btn-logout').addEventListener('click', () => {
  document.getElementById('confirm-logout-overlay').removeAttribute('hidden');
});

document.getElementById('confirm-logout-no').addEventListener('click', () => {
  document.getElementById('confirm-logout-overlay').setAttribute('hidden', '');
});

document.getElementById('confirm-logout-yes').addEventListener('click', () => {
  document.getElementById('confirm-logout-overlay').setAttribute('hidden', '');
  closeModal();
  clearProfile();
  localStorage.clear();
  logout();
});

document.getElementById('input-username-profile').addEventListener('input', function () {
  let val = this.value.replace(/^@/, '').replace(/[^a-zA-Z0-9_.]/g, '');
  if (!val) { this.value = ''; return; }
  this.value = '@' + val;
  const pos = this.value.length;
  this.setSelectionRange(pos, pos);
});

document.getElementById('btn-pick-avatar').addEventListener('click', () => {
  pickImage(dataUrl => {
    _pendingAvatar = dataUrl;
    const img = document.getElementById('modal-avatar-preview');
    img.src = dataUrl; img.style.display = 'block';
    document.getElementById('btn-pick-avatar').classList.add('has-image');
  });
});

document.getElementById('btn-pick-banner').addEventListener('click', () => {
  pickImage(dataUrl => {
    _pendingBanner = dataUrl;
    const img = document.getElementById('modal-banner-preview');
    img.src = dataUrl; img.style.display = 'block';
    document.getElementById('btn-pick-banner').classList.add('has-image');
  });
});

document.getElementById('btn-save').addEventListener('click', async () => {
  const p        = getProfile();
  const newName  = document.getElementById('input-name').value.trim();
  const newUser  = document.getElementById('input-username-profile').value.trim().replace(/^@/, '');
  const newBio   = document.getElementById('input-bio').value.trim();
  const newAvatar  = _pendingAvatar;
  const newBanner  = _pendingBanner;

  if (newUser) {
    if (newUser.length < 3) { showFieldError('input-username-profile', 'Минимум 3 символа'); return; }
    if (newUser.length > 20) { showFieldError('input-username-profile', 'Максимум 20 символов'); return; }
  }
  clearFieldError('input-username-profile');

  const usernameChanged = newUser !== _originalUsername;

  const btn = document.getElementById('btn-save');
  btn.disabled = true;

  try {
    const tgUsername = window._tgUsername;
    if (tgUsername) {
      const res = await apiFetch(`${API}/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tg_username:      tgUsername,
          display_name:     newName || p.name,
          profile_username: newUser || null,
          bio:              newBio  || p.bio,
          avatar_b64:       newAvatar !== undefined ? newAvatar : null,
          banner_b64:       newBanner !== undefined ? newBanner : null,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        showFieldError('input-username-profile', d.detail || 'Ошибка сервера');
        return;
      }

      if (usernameChanged && newUser && window._tgUsername) {
        const handle = '@' + newUser.toLowerCase();
        document.querySelectorAll(`[data-author="${window._tgUsername}"] .post__handle`).forEach(el => {
          el.textContent = handle;
        });
      }
    }
  } catch (err) {
    if (err.message !== 'unauthorized') showFieldError('input-username-profile', 'Нет соединения с сервером');
    return;
  } finally {
    btn.disabled = false;
  }

  p.name = newName || p.name;
  p.username = newUser || p.username;
  p.bio      = newBio  || p.bio;
  if (newAvatar !== undefined) {
    p.avatar = newAvatar;
    p.avatarPreview = newAvatar;
  }
  if (newBanner !== undefined) p.banner = newBanner;

  invalidateProfileCache();
  saveProfile(p);
  if (window._tgUsername) {
    saveCachedUserProfile(window._tgUsername, {
      username: window._tgUsername,
      display_name: p.name,
      profile_username: p.username,
      bio: p.bio,
      verified: p.verified,
      avatar_url: p.avatar,
      avatar_preview_url: getProfileAvatarPreview(p) || p.avatar,
      banner_url: p.banner,
    });
  }
  closeModal();
  renderProfile();
  refreshPostsVerifiedState(p.verified);

  if (window._tgUsername) {
    if (newAvatar !== undefined) {
      document.querySelectorAll(`[data-author="${window._tgUsername}"] .avatar`).forEach(img => {
        img.src = newAvatar;
      });
    }
    document.querySelectorAll(`[data-author="${window._tgUsername}"] .post__name`).forEach(el => {
      el.textContent = p.name;
    });
    document.querySelectorAll(`[data-author="${window._tgUsername}"] .comment__name`).forEach(el => {
      el.textContent = p.name;
    });
  }
});

/* в”Ђв”Ђ Profile compose в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ */
document.getElementById('profile-btn-post').addEventListener('click', async () => {
  const text   = getComposeText('profile-compose-input').trim();
  const images = getComposeImages('profile');
  if (!text && !images.length) return;

  const btn = document.getElementById('profile-btn-post');
  setButtonBusy(btn, true, 'Публикация...');

  try {
    const res = await apiFetch(`${API}/posts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, images: images.map(m => m.src) }),
    });
    if (res.status === 413) throw new Error('Файлы слишком большие, уменьши размер медиа');
    if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.detail || 'Ошибка сервера'); }

    const post = await res.json();
    clearComposeInput('profile-compose-input');
    clearComposeImages('profile');
    prependPostToProfile(post);
    if (typeof prependPostToFeed === 'function') prependPostToFeed(post);
  } catch (err) {
    if (err.message === 'unauthorized') return;
    showPostError(err.message, btn);
  } finally {
    if (!btn.textContent.match(/^\d+с$/)) setButtonBusy(btn, false);
  }
});

document.getElementById('profile-compose-input').addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    document.getElementById('profile-btn-post').click();
  }
});
