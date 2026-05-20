'use strict';

const _profileWrap = document.getElementById('profile-wrap');

/* ── Утилита: ссылки в bio ───────────────────── */
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

document.getElementById('profile-bio').addEventListener('click', e => {
  const a = e.target.closest('.bio-link');
  if (!a) return;
  e.preventDefault();
  window.electronAPI?.openExternal(a.href);
});

/* ── Render card ─────────────────────────────── */
function renderProfile() {
  const p = getProfile();

  document.getElementById('profile-avatar').src = p.avatar || '../../img/logo_blue.png';

  const bannerImg = document.getElementById('banner-img');
  const bannerPH  = document.getElementById('banner-placeholder');
  if (p.banner) {
    bannerImg.src = p.banner;
    bannerImg.classList.add('loaded');
    bannerPH.style.display = 'none';
  } else {
    bannerImg.classList.remove('loaded');
    bannerPH.style.display = 'flex';
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
  syncModalPreview('modal-avatar-preview', 'btn-pick-avatar', p.avatar || '../../img/logo_blue.png', true);
  if (p.banner) syncModalPreview('modal-banner-preview', 'btn-pick-banner', p.banner, false);

  const composeAvatar = document.getElementById('profile-compose-avatar');
  if (composeAvatar) composeAvatar.src = p.avatar || '../../img/logo_blue.png';
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

/* ── Render profile posts ───────────────────── */
let _profileObserver = null;

function attachProfileMenu(container) {
  container.querySelectorAll('.post__more-wrap:not([data-bound])').forEach(wrap => {
    wrap.dataset.bound = '1';
    const btn    = wrap.querySelector('.post__more');
    const id     = Number(btn.dataset.id);
    const postEl = wrap.closest('.post');
    btn.addEventListener('click', e => {
      e.stopPropagation();
      if (_openMenuId === id) { closeAllMenus(); return; }
      openPostMenu(id, postEl, _profileWrap, [
        { src: '../../img/trash.svg', action: () => { closeAllMenus(); deletePost(id, renderProfilePosts); } },
        { src: '../../img/pin.svg',   action: () => { closeAllMenus(); pinPost(id, renderProfilePosts); } },
        { src: '../../img/edit.svg',  action: () => { closeAllMenus(); startEditPost(id, postEl, renderProfilePosts); } },
        { src: '../../img/close.svg', action: () => closeAllMenus() },
      ]);
    });
  });
}

async function renderProfilePosts() {
  closeAllMenus();
  if (_profileObserver) { _profileObserver.disconnect(); _profileObserver = null; }

  const container = document.getElementById('profile-posts-container');
  const u = window._tgUsername;

  if (!u) {
    container.innerHTML = '<p class="feed__empty">Постов пока нет</p>';
    return;
  }

  container.innerHTML = '<p class="feed__empty">Загрузка...</p>';

  let posts;
  try {
    const res = await fetch(`${API}/posts?viewer=${encodeURIComponent(u)}&author=${encodeURIComponent(u)}&limit=100`);
    if (!res.ok) throw new Error();
    posts = await res.json();
  } catch {
    container.innerHTML = '<p class="feed__empty">Нет соединения с сервером</p>';
    return;
  }

  if (!posts.length) {
    container.innerHTML = '<p class="feed__empty">Постов пока нет</p>';
    return;
  }

  container.innerHTML = '';
  let lastDateKey = null;
  posts.forEach((post, i) => {
    registerServerPost(post);
    const ts = post.createdAt || post.id;
    const dateKey = getDateKey(ts);
    if (dateKey !== lastDateKey) {
      container.appendChild(buildDateSeparator(ts));
      lastDateKey = dateKey;
    }
    container.appendChild(buildPostEl(post, null, null, false, '', i, true));
  });
  attachProfileMenu(container);
}

/* ── Modal ───────────────────────────────────── */
let _pendingAvatar = undefined;
let _pendingBanner = undefined;

function openModal() {
  _pendingAvatar = undefined;
  _pendingBanner = undefined;
  const p = getProfile();
  document.getElementById('input-name').value             = p.name;
  document.getElementById('input-username-profile').value = p.username ? '@' + p.username : '';
  document.getElementById('input-bio').value              = p.bio;
  const avatarImg = document.getElementById('modal-avatar-preview');
  avatarImg.src = p.avatar || '../../img/logo_blue.png';
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
  window.electronAPI?.logout();
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

  p.name = newName || p.name;

  if (newUser) {
    if (newUser.length < 3) {
      showFieldError('input-username-profile', 'Минимум 3 символа');
      return;
    }
    if (newUser.length > 20) {
      showFieldError('input-username-profile', 'Максимум 20 символов');
      return;
    }
  }
  clearFieldError('input-username-profile');
  p.username = newUser || p.username;
  p.bio      = newBio  || p.bio;
  const newAvatar = _pendingAvatar;
  if (newAvatar !== undefined) p.avatar = newAvatar;
  if (_pendingBanner !== undefined) p.banner = _pendingBanner;

  invalidateProfileCache();
  saveProfile(p);
  closeModal();
  renderProfile();
  refreshPostsVerifiedState(p.verified);

  if (window._tgUsername) {
    // Мгновенно обновляем аватарки на своих постах и комментариях
    if (newAvatar !== undefined) {
      document.querySelectorAll(`[data-author="${window._tgUsername}"] .avatar`).forEach(img => {
        img.src = newAvatar;
      });
    }

    // Мгновенно обновляем имя на своих постах и комментариях
    document.querySelectorAll(`[data-author="${window._tgUsername}"] .post__name`).forEach(el => {
      el.textContent = p.name;
    });
    document.querySelectorAll(`[data-author="${window._tgUsername}"] .comment__name`).forEach(el => {
      el.textContent = p.name;
    });
  }

  // Отправляем изменения на сервер
  try {
    const tgUser = await window.electronAPI?.getTgUser();
    if (tgUser?.username) {
      await apiFetch('https://bouston.xyz/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tg_username:      tgUser.username,
          display_name:     p.name,
          profile_username: p.username,
          bio:              p.bio,
          avatar_b64:       newAvatar !== undefined ? newAvatar : null,
        }),
      });
    }
  } catch {}
});

/* ── Profile compose ─────────────────────────── */
document.getElementById('profile-btn-post').addEventListener('click', async () => {
  const text   = getComposeText('profile-compose-input').trim();
  const images = getComposeImages('profile');
  if (!text && !images.length) return;

  const btn = document.getElementById('profile-btn-post');
  btn.disabled = true;

  try {
    const u = window._tgUsername;
    if (!u) throw new Error('not logged in');

    const res = await apiFetch(`${API}/posts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tg_username: u,
        text,
        images: images.map(m => m.src),
      }),
    });
    if (res.status === 413) throw new Error('Файлы слишком большие, уменьши размер медиа');
    if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.detail || 'Ошибка сервера'); }

    clearComposeInput('profile-compose-input');
    clearComposeImages('profile');
    renderProfilePosts();
  } catch (err) {
    if (err.message !== 'unauthorized') alert(err.message);
  } finally {
    btn.disabled = false;
  }
});

document.getElementById('profile-compose-input').addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    document.getElementById('profile-btn-post').click();
  }
});
