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
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

const MONTHS_RU = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];

function getDateKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function formatDateLabel(ts) {
  const d = new Date(ts), now = new Date();
  if (d.toDateString() === now.toDateString()) return 'Сегодня';
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Вчера';
  return `${d.getDate()} ${MONTHS_RU[d.getMonth()]}`;
}

function buildDateSeparator(ts) {
  const el = document.createElement('div');
  el.className = 'date-separator';
  el.innerHTML = `<span>${formatDateLabel(ts)}</span>`;
  return el;
}
function isHeartOnly(text) {
  return /^[\s]*[❤️🤍💕💗💓💞💘💝🖤🤎💜💙💚💛🧡♥❤️]+[\s]*$/u.test(text.trim());
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
  window.addEventListener('resize', updatePos);
  _menuScrollCleanup = () => {
    scrollContainer.removeEventListener('scroll', updatePos);
    window.removeEventListener('resize', updatePos);
  };

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

  postEl.classList.add('post--verified-tall');

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

function getDominantEmoji(post) {
  const r = post.reactions || {};
  let top = null, max = 0;
  for (const [emoji, cnt] of Object.entries(r)) {
    if (cnt > max) { max = cnt; top = emoji; }
  }
  return top;
}

function getTotalReactions(post) {
  return Object.values(post.reactions || {}).reduce((s, v) => s + v, 0);
}

function migrateReactions(post) {
  if (!post.reactions) post.reactions = {};
  if (!Array.isArray(post.myReactions)) {
    post.myReactions = post.myReaction ? [post.myReaction] : [];
    delete post.myReaction;
  }
}

function removeReaction(post, emoji) {
  post.reactions[emoji] = Math.max(0, (post.reactions[emoji] || 0) - 1);
  if (!post.reactions[emoji]) delete post.reactions[emoji];
  post.myReactions = post.myReactions.filter(e => e !== emoji);
}

function addReaction(post, emoji) {
  post.reactions[emoji] = (post.reactions[emoji] || 0) + 1;
  post.myReactions.push(emoji);
}

let _emojiFileMap = null;
async function getEmojiFileMap() {
  if (_emojiFileMap) return _emojiFileMap;
  const entries = await loadEmojiList();
  _emojiFileMap = Object.fromEntries(entries.map(({ file, emoji }) => [emoji, file]));
  return _emojiFileMap;
}

function buildReactionBtn(emoji, count, active, id) {
  const btn = document.createElement('button');
  btn.className = 'btn-like' + (active ? ' btn-like--active' : '');
  btn.dataset.id = id;
  btn.dataset.emoji = emoji;

  const iconWrap = document.createElement('span');
  iconWrap.className = 'btn-like__icon btn-like__icon--emoji';

  getEmojiFileMap().then(map => {
    const file = map[emoji];
    if (file) {
      const player = createTgsPlayer(file, 20, true);
      iconWrap.appendChild(player);
    } else {
      iconWrap.textContent = emoji;
    }
  });

  const counter = document.createElement('span');
  counter.textContent = count;

  btn.appendChild(iconWrap);
  btn.appendChild(counter);
  return btn;
}

function buildReactionsEl(post) {
  migrateReactions(post);
  const id = post.id;

  const wrapper = document.createElement('div');
  wrapper.className = 'post__reactions';
  wrapper.dataset.postId = id;

  const others = Object.keys(post.reactions)
    .filter(e => e !== '❤️' && (post.reactions[e] || 0) > 0)
    .sort((a, b) => (post.reactions[b] || 0) - (post.reactions[a] || 0));

  ['❤️', ...others].forEach(emoji => {
    const count = post.reactions[emoji] || 0;
    const active = post.myReactions.includes(emoji);

    const btn = buildReactionBtn(emoji, count, active, id);

    btn.addEventListener('click', () => toggleReaction(id, emoji));
    btn.addEventListener('contextmenu', e => {
      e.preventDefault();
      e.stopPropagation();
      const sc = btn.closest('.feed') || btn.closest('.profile-wrap') || document.body;
      openEmojiMenu(id, btn, sc);
    });

    wrapper.appendChild(btn);
  });

  return wrapper;
}

function syncReactions(id, post) {
  document.querySelectorAll(`.post__reactions[data-post-id="${id}"]`).forEach(w => {
    w.replaceWith(buildReactionsEl(post));
  });
}

function reactionLimit() {
  return getProfile().verified ? 3 : 1;
}

function toggleReaction(id, emoji) {
  const posts = getPosts();
  const post  = posts.find(p => p.id === id);
  if (!post) return;
  migrateReactions(post);

  if (post.myReactions.includes(emoji)) {
    removeReaction(post, emoji);
  } else {
    const activeTypes = new Set(['❤️', ...Object.keys(post.reactions).filter(e => post.reactions[e] > 0)]);
    if (!activeTypes.has(emoji) && activeTypes.size >= 3) return;
    if (post.myReactions.length >= reactionLimit()) {
      removeReaction(post, post.myReactions[0]);
    }
    addReaction(post, emoji);
  }

  post.liked = post.myReactions.length > 0;
  post.likes = getTotalReactions(post);
  savePosts(posts);
  syncReactions(id, post);
}

/* ── Emoji picker ───────────────────────────── */
let _emojiMenuCleanup = null;

function closeEmojiMenu() {
  document.querySelectorAll('.post__emoji-menu').forEach(m => {
    m.querySelectorAll('[data-tgs]').forEach(el => el.destroy?.());
    m.remove();
  });
  if (_emojiMenuCleanup) { _emojiMenuCleanup(); _emojiMenuCleanup = null; }
}

const GRID_COLS    = 5;
const GRID_ITEM_SZ = 52;
const GRID_GAP     = 4;
const GRID_ROWS    = 4;
const GRID_PAD     = 8;
const MENU_W = GRID_COLS * GRID_ITEM_SZ + (GRID_COLS - 1) * GRID_GAP + GRID_PAD * 2;
const MENU_H = GRID_ROWS * GRID_ITEM_SZ + (GRID_ROWS - 1) * GRID_GAP + GRID_PAD * 2;

async function openEmojiMenu(id, likeBtn, scrollContainer) {
  closeEmojiMenu();
  const posts = getPosts();
  const post  = posts.find(p => p.id === id);
  if (!post) return;
  migrateReactions(post);

  const entries = await loadEmojiList();

  const menu = document.createElement('div');
  menu.className = 'post__emoji-menu';

  const postEl = likeBtn.closest('.post');

  function updatePos() {
    const r = (postEl || likeBtn).getBoundingClientRect();
    menu.style.left = (r.left - MENU_W - 8) + 'px';
    menu.style.top  = r.top + 'px';
  }

  entries.forEach(({ file, emoji }) => {
    const btn = document.createElement('button');
    btn.className = 'post__emoji-item' + (post.myReactions.includes(emoji) ? ' post__emoji-item--active' : '');
    btn.dataset.emoji = emoji;

    const player = createTgsPlayer(file, GRID_ITEM_SZ - 8);
    player.dataset.tgs = '1';
    btn.appendChild(player);

    btn.addEventListener('click', e => {
      e.stopPropagation();
      toggleReaction(id, emoji);
      closeEmojiMenu();
    });
    menu.appendChild(btn);
  });

  document.body.appendChild(menu);
  updatePos();
  scrollContainer.addEventListener('scroll', updatePos);
  window.addEventListener('resize', updatePos);
  _emojiMenuCleanup = () => {
    scrollContainer.removeEventListener('scroll', updatePos);
    window.removeEventListener('resize', updatePos);
  };

  setTimeout(() => document.addEventListener('click', closeEmojiMenu, { once: true }), 0);
}

/* ── Build post element ─────────────────────── */
function buildPostEl(post, profile, avatarSrc, isVerified, badgeHtml, i, showPin) {
  const newlineCount = (post.text.match(/\n/g) || []).length;
  const isTall = isVerified && (newlineCount >= 2 || post.text.length > 150);
  const extra = isVerified ? ' post--verified' + (isTall ? ' post--verified-tall' : '') : '';
  const el = document.createElement('div');
  el.className = 'post' + extra;
  const verifiedGradientSvg = isVerified ? `
    <svg class="post__verified-bg" viewBox="0 0 531 287" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <filter id="vbg-f0" x="31.8573" y="-18.3" width="517.444" height="323.6" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
          <feFlood flood-opacity="0" result="BackgroundImageFix"/>
          <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape"/>
          <feGaussianBlur stdDeviation="9.15" result="effect1_foregroundBlur"/>
        </filter>
        <filter id="vbg-f1" x="-18.299" y="-16.7062" width="543.612" height="322.006" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
          <feFlood flood-opacity="0" result="BackgroundImageFix"/>
          <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape"/>
          <feGaussianBlur stdDeviation="9.15" result="effect1_foregroundBlur"/>
        </filter>
      </defs>
      <g filter="url(#vbg-f0)">
        <path d="M292.991 0C-16.3546 135.528 310.205 245.193 531.001 263.083L69.8857 287L50.1567 30.8316L292.991 0Z" fill="#4E7ADF"/>
      </g>
      <g filter="url(#vbg-f1)">
        <path d="M195.173 1.59445C-81.7762 243.95 286.217 237.221 507.013 255.111L19.7289 287L0 30.8316L195.173 1.59445Z" fill="#144CCC"/>
      </g>
    </svg>` : '';
  el.innerHTML = `
    ${verifiedGradientSvg}
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
      <div class="post__reactions" data-post-id="${post.id}"></div>
      <button class="btn-comments" onclick="openThread(${post.id})">
        <img class="btn-comments__icon" src="../../img/comments.svg" alt="" />
        ${getComments(post.id).length ? `<span class="btn-comments__count">${getComments(post.id).length}</span>` : ''}
      </button>
      <div class="post__time">
        ${post.editedAt ? `<img class="post__time-edit" src="../../img/edit.svg" alt="" />` : ''}
        <span>${formatPostTime(post.createdAt || post.id)}</span>
      </div>
    </div>
  `;
  el.querySelector('.post__reactions').replaceWith(buildReactionsEl(post));
  return el;
}

const _verifiedBgSvg = `<svg class="post__verified-bg" viewBox="0 0 531 287" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs>
    <filter id="vbg-f0" x="31.8573" y="-18.3" width="517.444" height="323.6" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
      <feFlood flood-opacity="0" result="BackgroundImageFix"/>
      <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape"/>
      <feGaussianBlur stdDeviation="9.15" result="effect1_foregroundBlur"/>
    </filter>
    <filter id="vbg-f1" x="-18.299" y="-16.7062" width="543.612" height="322.006" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
      <feFlood flood-opacity="0" result="BackgroundImageFix"/>
      <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape"/>
      <feGaussianBlur stdDeviation="9.15" result="effect1_foregroundBlur"/>
    </filter>
  </defs>
  <g filter="url(#vbg-f0)">
    <path d="M292.991 0C-16.3546 135.528 310.205 245.193 531.001 263.083L69.8857 287L50.1567 30.8316L292.991 0Z" fill="#4E7ADF"/>
  </g>
  <g filter="url(#vbg-f1)">
    <path d="M195.173 1.59445C-81.7762 243.95 286.217 237.221 507.013 255.111L19.7289 287L0 30.8316L195.173 1.59445Z" fill="#144CCC"/>
  </g>
</svg>`;

function refreshPostsVerifiedState(isVerified) {
  const badgeSrc = '../../img/verided.svg';
  document.querySelectorAll('.post').forEach(postEl => {
    const textEl = postEl.querySelector('.post__text');
    const text = textEl ? textEl.textContent : '';
    const newlineCount = (text.match(/\n/g) || []).length;
    const isTall = isVerified && (newlineCount >= 2 || text.length > 150);

    postEl.classList.toggle('post--verified', isVerified);
    postEl.classList.toggle('post--verified-tall', isVerified && isTall);

    const existingBg = postEl.querySelector('.post__verified-bg');
    if (isVerified && !existingBg) {
      postEl.insertAdjacentHTML('afterbegin', _verifiedBgSvg);
    } else if (!isVerified && existingBg) {
      existingBg.remove();
    }

    const badge = postEl.querySelector('.post__verified-badge');
    if (isVerified && !badge) {
      const namerow = postEl.querySelector('.post__namerow');
      if (namerow) namerow.insertAdjacentHTML('beforeend', `<img class="post__verified-badge" src="${badgeSrc}" alt="verified" />`);
    } else if (!isVerified && badge) {
      badge.remove();
    }
  });
}
