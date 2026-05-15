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

function toggleLike(id, btn) {
  const posts = getPosts();
  const post  = posts.find(p => p.id === id);
  if (!post) return;

  if (!post.reactions) post.reactions = {};
  if (post.myReaction === undefined) post.myReaction = null;

  const EMOJI = '❤️';
  if (post.myReaction) {
    post.reactions[post.myReaction] = Math.max(0, (post.reactions[post.myReaction] || 0) - 1);
    if (!post.reactions[post.myReaction]) delete post.reactions[post.myReaction];
    post.myReaction = null;
    post.liked = false;
  } else {
    post.reactions[EMOJI] = (post.reactions[EMOJI] || 0) + 1;
    post.myReaction = EMOJI;
    post.liked = true;
  }
  post.likes = getTotalReactions(post);
  savePosts(posts);

  const dominant = getDominantEmoji(post);
  document.querySelectorAll(`.btn-like[data-id="${id}"]`).forEach(b => {
    const icon = b.querySelector('.btn-like__icon');
    const counter = b.querySelector('span');
    if (icon) {
      if (dominant) {
        icon.replaceWith(Object.assign(document.createElement('span'), { className: 'btn-like__icon btn-like__icon--emoji', textContent: dominant }));
      } else {
        const isImg = icon.tagName === 'IMG';
        if (isImg) icon.src = `../../img/${post.liked ? 'like.svg' : 'like_n.svg'}`;
        else icon.replaceWith(Object.assign(document.createElement('img'), { className: 'btn-like__icon', src: `../../img/like_n.svg`, alt: '' }));
      }
    }
    if (counter) counter.textContent = post.likes;
    b.classList.toggle('btn-like--active', post.liked);
  });
}

/* ── Emoji picker ───────────────────────────── */
const EMOJI_LIST = ['❤️','😂','🔥','😮','😢','👍','💀','🎉'];
let _emojiMenuCleanup = null;

function closeEmojiMenu() {
  document.querySelectorAll('.post__emoji-menu').forEach(m => m.remove());
  if (_emojiMenuCleanup) { _emojiMenuCleanup(); _emojiMenuCleanup = null; }
}

const EMOJI_ITEM_H  = 43;
const EMOJI_ITEM_GAP = 3;
const EMOJI_PADDING  = 6;
const EMOJI_VISIBLE  = 3;
const EMOJI_MENU_H   = EMOJI_VISIBLE * EMOJI_ITEM_H + (EMOJI_VISIBLE - 1) * EMOJI_ITEM_GAP + EMOJI_PADDING * 2;

function openEmojiMenu(id, likeBtn, scrollContainer) {
  closeEmojiMenu();
  const posts = getPosts();
  const post  = posts.find(p => p.id === id);
  if (!post) return;
  if (!post.reactions) post.reactions = {};
  if (post.myReaction === undefined) post.myReaction = null;

  const menu = document.createElement('div');
  menu.className = 'post__emoji-menu';
  menu.style.height = EMOJI_MENU_H + 'px';

  const postEl = likeBtn.closest('.post');

  function updatePos() {
    const r = (postEl || likeBtn).getBoundingClientRect();
    menu.style.left = (r.left - EMOJI_ITEM_H - EMOJI_PADDING * 2 - 8) + 'px';
    menu.style.top  = r.top + 'px';
  }

  EMOJI_LIST.forEach(emoji => {
    const btn = document.createElement('button');
    btn.className = 'post__emoji-item' + (post.myReaction === emoji ? ' post__emoji-item--active' : '');
    btn.textContent = emoji;
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const ps = getPosts();
      const p  = ps.find(p => p.id === id);
      if (!p) return;
      if (!p.reactions) p.reactions = {};

      if (p.myReaction === emoji) {
        p.reactions[emoji] = Math.max(0, (p.reactions[emoji] || 0) - 1);
        if (!p.reactions[emoji]) delete p.reactions[emoji];
        p.myReaction = null;
        p.liked = false;
      } else {
        if (p.myReaction) {
          p.reactions[p.myReaction] = Math.max(0, (p.reactions[p.myReaction] || 0) - 1);
          if (!p.reactions[p.myReaction]) delete p.reactions[p.myReaction];
        }
        p.reactions[emoji] = (p.reactions[emoji] || 0) + 1;
        p.myReaction = emoji;
        p.liked = true;
      }
      p.likes = getTotalReactions(p);
      savePosts(ps);

      const dominant = getDominantEmoji(p);
      document.querySelectorAll(`.btn-like[data-id="${id}"]`).forEach(b => {
        const iconEl = b.querySelector('.btn-like__icon');
        const counter = b.querySelector('span');
        if (iconEl) {
          if (dominant) {
            const span = document.createElement('span');
            span.className = 'btn-like__icon btn-like__icon--emoji';
            span.textContent = dominant;
            iconEl.replaceWith(span);
          } else {
            const img = document.createElement('img');
            img.className = 'btn-like__icon';
            img.src = '../../img/like_n.svg';
            img.alt = '';
            iconEl.replaceWith(img);
          }
        }
        if (counter) counter.textContent = p.likes;
        b.classList.toggle('btn-like--active', p.liked);
      });

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
      <button class="btn-like ${post.liked ? 'btn-like--active' : ''}" data-id="${post.id}" onclick="toggleLike(${post.id}, this)">
        ${getDominantEmoji(post)
          ? `<span class="btn-like__icon btn-like__icon--emoji">${getDominantEmoji(post)}</span>`
          : `<img class="btn-like__icon" src="../../img/${post.liked ? 'like.svg' : 'like_n.svg'}" alt="" />`}
        <span>${post.likes}</span>
      </button>
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
