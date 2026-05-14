'use strict';

/* ── Utils ─────────────────────────────────── */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/\n/g, '<br>');
}
function getHandle(name) { return '@' + name.toLowerCase().replace(/\s+/g, ''); }
function formatPostTime(ts) {
  if (!ts) return '';
  const d = new Date(ts), now = new Date();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  if (d.toDateString() === now.toDateString()) return `${hh}:${mm}`;
  return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')} ${hh}:${mm}`;
}
function isHeartOnly(text) {
  return /^[\s]*[❤️🤍💕💗💓💞💘💝🖤🤎💜💙💚💛🧡♥❤️]+[\s]*$/u.test(text.trim());
}

/* ── Heart animation ────────────────────────
   Preload once — new <img> element always
   restarts a webp animation from frame 0    */
const HEART_WEBP    = '../../img/heard_animation.webp';
const HEART_ANIM_MS = 2000;

const _heartPreload = new Image();
_heartPreload.src = HEART_WEBP;

const _stopHeartAnim = new Map();

function playHeartAnimation(sourceEl) {
  if (!sourceEl) return () => {};
  const feedEl = document.getElementById('feed');
  if (!feedEl) return () => {};

  const GIF_DISPLAY = 150, GIF_NATIVE = 512, scale = GIF_DISPLAY / GIF_NATIVE;
  const feedRect = feedEl.getBoundingClientRect();
  const srcRect  = sourceEl.getBoundingClientRect();
  const gifLeft  = srcRect.left - feedRect.left + srcRect.width  / 2 - 362 * scale;
  const gifTop   = srcRect.top  - feedRect.top  + feedEl.scrollTop + srcRect.height / 2 - 190 * scale;

  let stopped = false, img = null, timer = null;

  img = document.createElement('img');
  img.className  = 'heart-anim-inner';
  img.style.left = gifLeft + 'px';
  img.style.top  = gifTop  + 'px';
  img.src        = HEART_WEBP;
  feedEl.appendChild(img);

  timer = setTimeout(() => {
    if (img) { img.remove(); img = null; }
  }, HEART_ANIM_MS);

  return function stop() {
    stopped = true;
    clearTimeout(timer);
    if (img) { img.remove(); img = null; }
  };
}

/* ── Menu ───────────────────────────────────── */
let _openMenuId        = null;
let _menuScrollCleanup = null;

function closeAllMenus() {
  document.querySelectorAll('.post__menu').forEach(m => m.remove());
  _openMenuId = null;
  if (_menuScrollCleanup) { _menuScrollCleanup(); _menuScrollCleanup = null; }
}

function openPostMenu(id, postEl, scrollContainer, menuItems) {
  closeAllMenus();
  if (!getPosts().find(p => p.id === id)) return;

  const menu = document.createElement('div');
  menu.className = 'post__menu';

  function updatePos() {
    const r = postEl.getBoundingClientRect();
    menu.style.left = (r.right + 8) + 'px';
    menu.style.top  = r.top + 'px';
  }
  updatePos();
  scrollContainer.addEventListener('scroll', updatePos);
  _menuScrollCleanup = () => scrollContainer.removeEventListener('scroll', updatePos);

  menuItems.forEach(({ src, action }) => {
    const btn = document.createElement('button');
    btn.className = 'post__menu-item';
    btn.innerHTML = `<img class="post__menu-icon" src="${src}" alt="" />`;
    btn.addEventListener('click', e => { e.stopPropagation(); action(); });
    menu.appendChild(btn);
  });

  document.body.appendChild(menu);
  _openMenuId = id;
}

/* ── Shared post actions ────────────────────── */
function startEditPost(id, postEl, onDone) {
  const post = getPosts().find(p => p.id === id);
  if (!post) return;

  const textEl   = postEl.querySelector('.post__text');
  const textarea = document.createElement('textarea');
  textarea.className = 'post__edit-area';
  textarea.value     = post.text;

  const actions   = document.createElement('div');
  actions.className = 'post__edit-actions';

  const cancelBtn = document.createElement('button');
  cancelBtn.className   = 'post__edit-btn post__edit-btn--cancel';
  cancelBtn.textContent = 'Отмена';

  const saveBtn = document.createElement('button');
  saveBtn.className   = 'post__edit-btn post__edit-btn--save';
  saveBtn.textContent = 'Сохранить';

  actions.append(cancelBtn, saveBtn);
  textEl.replaceWith(textarea);
  textarea.after(actions);

  textarea.addEventListener('input', () => {
    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 'px';
  });
  textarea.dispatchEvent(new Event('input'));
  textarea.focus();
  textarea.selectionStart = textarea.selectionEnd = textarea.value.length;

  cancelBtn.addEventListener('click', onDone);
  saveBtn.addEventListener('click', () => {
    const newText = textarea.value.trim();
    if (!newText) return;
    const posts = getPosts();
    const p = posts.find(p => p.id === id);
    if (p) { p.text = newText; p.editedAt = Date.now(); savePosts(posts); }
    onDone();
  });
}

function deletePost(id, onDone) {
  savePosts(getPosts().filter(p => p.id !== id));
  onDone();
}

function pinPost(id, onDone) {
  const posts = getPosts();
  const post  = posts.find(p => p.id === id);
  if (!post) return;
  post.pinned   = !post.pinned;
  post.pinnedAt = post.pinned ? Date.now() : null;
  savePosts(posts);
  onDone();
}

function toggleLike(id, btn) {
  const posts = getPosts();
  const post  = posts.find(p => p.id === id);
  if (!post) return;
  post.liked  = !post.liked;
  post.likes += post.liked ? 1 : -1;
  savePosts(posts);

  if (typeof _currentView !== 'undefined' && _currentView === 'feed') {
    if (post.liked) {
      const stop = playHeartAnimation(btn);
      _stopHeartAnim.set(id, stop);
    } else {
      const stop = _stopHeartAnim.get(id);
      if (stop) { stop(); _stopHeartAnim.delete(id); }
    }
    renderFeedPosts();
  } else {
    renderProfilePosts();
  }
}

/* ── Build post element ─────────────────────── */
function buildPostEl(post, profile, avatarSrc, isVerified, badgeHtml, i, showPin) {
  const extra = isVerified ? ' post--verified' : (i === 0 ? ' post--featured' : '');
  const el = document.createElement('div');
  el.className = 'post' + extra;
  el.innerHTML = `
    ${showPin && post.pinned ? `<div class="post__pinned"><img class="post__pinned-icon" src="../../img/pin.svg" alt="" /><span>Закреплено</span></div>` : ''}
    <div class="post__header">
      <img class="avatar" src="${avatarSrc}" alt="" />
      <div class="post__meta">
        <div class="post__namerow">
          <span class="post__name">${escapeHtml(profile.name)}</span>
          ${badgeHtml}
        </div>
        <span class="post__handle">${escapeHtml(getHandle(profile.name))}</span>
      </div>
      <div class="post__more-wrap">
        <button class="post__more" data-id="${post.id}">
          <span class="post__more-dot"></span>
          <span class="post__more-dot"></span>
          <span class="post__more-dot"></span>
        </button>
      </div>
    </div>
    <p class="post__text">${
      isHeartOnly(post.text)
        ? `<span class="heart-source">${escapeHtml(post.text)}</span>`
        : escapeHtml(post.text)
    }</p>
    <div class="post__footer">
      <button class="btn-like" onclick="toggleLike(${post.id}, this)">
        <span class="btn-like__icon">${post.liked ? '❤️' : '🤍'}</span>
        <span>${post.likes}</span>
      </button>
      <div class="post__time">
        ${post.editedAt ? `<img class="post__time-edit" src="../../img/edit.svg" alt="" />` : ''}
        <span>${formatPostTime(post.createdAt || post.id)}</span>
      </div>
    </div>
  `;
  return el;
}
