'use strict';

const _profileWrap = document.getElementById('profile-wrap');

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

  document.getElementById('profile-name').textContent        = p.name;
  document.getElementById('profile-bio').textContent         = p.bio;
  const badge = document.getElementById('profile-verified-badge');
  if (badge) badge.style.display = p.verified ? 'inline-block' : 'none';

  document.getElementById('input-name').value        = p.name;
  document.getElementById('input-bio').value         = p.bio;
  document.getElementById('toggle-verified').checked = !!p.verified;

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
function renderProfilePosts() {
  closeAllMenus();
  const container  = document.getElementById('profile-posts-container');
  const profile    = getProfile();
  const posts      = getPosts();
  const avatarSrc  = profile.avatar || '../../img/logo_blue.png';
  const isVerified = profile.verified === true;
  const badgeHtml  = isVerified
    ? `<img class="post__verified-badge" src="../../img/verided.svg" alt="verified" />`
    : '';

  if (!posts.length) {
    container.innerHTML = '<p class="feed__empty">Постов пока нет</p>';
    return;
  }

  container.innerHTML = '';

  const sorted = [...posts].sort((a, b) => {
    if (a.pinned && b.pinned) return (b.pinnedAt || 0) - (a.pinnedAt || 0);
    if (a.pinned) return -1;
    if (b.pinned) return  1;
    return 0;
  });

  sorted.forEach((post, i) => {
    const el = buildPostEl(post, profile, avatarSrc, isVerified, badgeHtml, i, true);
    container.appendChild(el);
  });

  container.querySelectorAll('.post__more-wrap').forEach(wrap => {
    const btn    = wrap.querySelector('.post__more');
    const id     = Number(btn.dataset.id);
    const postEl = wrap.closest('.post');
    btn.addEventListener('click', e => {
      e.stopPropagation();
      if (_openMenuId === id) { closeAllMenus(); return; }
      openPostMenu(id, postEl, _profileWrap, [
        { src: '../../img/trash.svg', action: () => { closeAllMenus(); deletePost(id, renderProfilePosts); } },
        { src: '../../img/edit.svg',  action: () => { closeAllMenus(); startEditPost(id, postEl, renderProfilePosts); } },
        { src: '../../img/pin.svg',   action: () => { closeAllMenus(); pinPost(id, renderProfilePosts); } },
        { src: '../../img/close.svg', action: () => closeAllMenus() },
      ]);
    });
  });
}

/* ── Modal ───────────────────────────────────── */
let _pendingAvatar = undefined;
let _pendingBanner = undefined;

function openModal() {
  _pendingAvatar = undefined;
  _pendingBanner = undefined;
  const p = getProfile();
  document.getElementById('input-name').value        = p.name;
  document.getElementById('input-bio').value         = p.bio;
  document.getElementById('toggle-verified').checked = !!p.verified;

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

document.getElementById('btn-edit-profile').addEventListener('click', openModal);
document.getElementById('btn-banner-settings').addEventListener('click', openModal);
document.getElementById('btn-close-modal').addEventListener('click', closeModal);

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

document.getElementById('btn-save').addEventListener('click', () => {
  const p = getProfile();
  p.name     = document.getElementById('input-name').value.trim()  || p.name;
  p.bio      = document.getElementById('input-bio').value.trim()   || p.bio;
  p.verified = document.getElementById('toggle-verified').checked;
  if (_pendingAvatar !== undefined) p.avatar = _pendingAvatar;
  if (_pendingBanner !== undefined) p.banner = _pendingBanner;
  invalidateProfileCache();
  saveProfile(p);
  closeModal();
  renderProfile();
});

/* ── Profile compose ─────────────────────────── */
document.getElementById('profile-btn-post').addEventListener('click', () => {
  const input = document.getElementById('profile-compose-input');
  const text  = input.value.trim();
  if (!text) return;
  const now = Date.now();
  const posts = getPosts();
  posts.unshift({ id: now, text, likes: 0, liked: false, createdAt: now });
  savePosts(posts);
  input.value = '';
  input.style.height = 'auto';
  renderProfilePosts();
});

document.getElementById('profile-compose-input').addEventListener('keydown', e => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey))
    document.getElementById('profile-btn-post').click();
});
document.getElementById('profile-compose-input').addEventListener('input', function () {
  this.style.height = 'auto';
  this.style.height = this.scrollHeight + 'px';
});
