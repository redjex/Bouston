'use strict';

/* ── Lightbox ───────────────────────────────── */
(function () {
  const lb    = document.getElementById('lightbox');
  const lbImg = document.getElementById('lightbox-img');

  let scale = 1, tx = 0, ty = 0, rotation = 0, flipH = 1, flipV = 1;

  function applyTransform() {
    lbImg.style.transform =
      `translate(${tx}px, ${ty}px) rotate(${rotation}deg) scale(${scale * flipH}, ${scale * flipV})`;
  }

  function resetTransform() {
    scale = 1; tx = 0; ty = 0; rotation = 0; flipH = 1; flipV = 1;
    lbImg.style.transform = '';
  }

  function openLightbox(src) {
    resetTransform();
    lbImg.src = src;
    lb.style.display = 'flex';
  }

  function closeLightbox() {
    lb.style.display = 'none';
    lbImg.src = '';
    resetTransform();
  }

  function saveImage() {
    const canvas = document.createElement('canvas');
    const img = lbImg;
    const rad = rotation * Math.PI / 180;
    const sw = img.naturalWidth, sh = img.naturalHeight;
    const cos = Math.abs(Math.cos(rad)), sin = Math.abs(Math.sin(rad));
    canvas.width  = Math.round(sw * cos + sh * sin);
    canvas.height = Math.round(sw * sin + sh * cos);
    const ctx = canvas.getContext('2d');
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(rad);
    ctx.scale(flipH, flipV);
    ctx.drawImage(img, -sw / 2, -sh / 2);
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = 'photo.png';
    a.click();
  }

  document.addEventListener('click', e => {
    if (e.target.closest('.lightbox__close') || e.target.closest('.lightbox__tool')) return;
    const img = e.target.closest('.post__image');
    if (img) { openLightbox(img.src); return; }
    if (lb.style.display !== 'none' && e.target === lb) closeLightbox();
  });

  document.getElementById('lightbox-close').addEventListener('click', closeLightbox);

  document.getElementById('lb-rotate-ccw').addEventListener('click', () => { rotation -= 90; applyTransform(); });
  document.getElementById('lb-rotate-cw') .addEventListener('click', () => { rotation += 90; applyTransform(); });
  document.getElementById('lb-flip-h')    .addEventListener('click', () => { flipH *= -1; applyTransform(); });
  document.getElementById('lb-flip-v')    .addEventListener('click', () => { flipV *= -1; applyTransform(); });
  document.getElementById('lb-save')      .addEventListener('click', saveImage);

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeLightbox();
  });

  lb.addEventListener('wheel', e => {
    if (!e.ctrlKey) return;
    e.preventDefault();

    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    const newScale = Math.min(10, Math.max(0.2, scale * factor));

    const rect = lb.getBoundingClientRect();
    const cx = e.clientX - rect.left - rect.width  / 2;
    const cy = e.clientY - rect.top  - rect.height / 2;

    tx = cx - (cx - tx) * (newScale / scale);
    ty = cy - (cy - ty) * (newScale / scale);
    scale = newScale;

    applyTransform();
  }, { passive: false });
})();

/* ── Emoji insert panel ─────────────────────── */
(function () {
  const panel   = document.getElementById('emoji-panel');
  const grid    = document.getElementById('emoji-panel-grid');
  let _target   = null;
  let _activBtn = null;
  let _loaded   = false;

  function positionPanel(triggerBtn) {
    const compose = triggerBtn.closest('.compose');
    const r  = (compose || triggerBtn).getBoundingClientRect();
    const pw = 280;
    let left = r.right + 12;
    let top  = r.top;
    left = Math.max(8, Math.min(left, window.innerWidth - pw - 8));
    top  = Math.max(8, top);
    panel.style.top  = top  + 'px';
    panel.style.left = left + 'px';
  }

  async function populateGrid() {
    if (_loaded) return;
    _loaded = true;
    const entries = await loadEmojiList();
    const itemSz = Math.floor((280 - 16) / 6) - 2;
    const io = new IntersectionObserver(obs => {
      obs.forEach(entry => {
        if (!entry.isIntersecting) return;
        const btn = entry.target;
        if (btn.dataset.tgsLoaded) return;
        btn.dataset.tgsLoaded = '1';
        io.unobserve(btn);
        const player = createTgsPlayer(btn.dataset.file, itemSz, false);
        player.dataset.tgs = '1';
        btn.appendChild(player);
      });
    }, { root: grid, rootMargin: '80px' });

    entries.forEach(({ file, emoji }) => {
      const btn = document.createElement('button');
      btn.className = 'emoji-panel__btn';
      btn.dataset.file  = file;
      btn.dataset.emoji = emoji;
      btn.addEventListener('click', () => {
        insertEmoji(emoji, file);
        btn.style.transform = 'scale(1.25)';
        setTimeout(() => { btn.style.transform = ''; }, 120);
      });
      grid.appendChild(btn);
      io.observe(btn);
    });
  }

  function insertEmoji(emoji, file) {
    if (!_target) return;
    const el = document.getElementById(_target);
    if (!el) return;
    el.focus();

    const wrap = document.createElement('span');
    wrap.className = 'compose__emoji-node';
    wrap.contentEditable = 'false';
    wrap.dataset.emoji = emoji;
    const player = createTgsPlayer(file, 26, true, true);
    wrap.appendChild(player);

    const after = document.createTextNode('​');

    const sel = window.getSelection();
    let inserted = false;
    if (sel && sel.rangeCount) {
      const range = sel.getRangeAt(0);
      if (el.contains(range.commonAncestorContainer)) {
        range.deleteContents();
        range.insertNode(wrap);
        range.setStartAfter(wrap);
        range.collapse(true);
        range.insertNode(after);
        range.setStart(after, 1);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
        inserted = true;
      }
    }
    if (!inserted) {
      el.appendChild(wrap);
      el.appendChild(after);
      const r = document.createRange();
      r.setStart(after, 1);
      r.collapse(true);
      sel.removeAllRanges();
      sel.addRange(r);
    }
  }

  function openPanel(targetId, triggerBtn) {
    _target   = targetId;
    _activBtn = triggerBtn;
    triggerBtn.classList.add('active');
    positionPanel(triggerBtn);
    panel.classList.add('emoji-panel--open');
    populateGrid();
  }

  function closePanel() {
    panel.classList.remove('emoji-panel--open');
    if (_activBtn) { _activBtn.classList.remove('active'); _activBtn = null; }
    _target = null;
  }

  document.querySelectorAll('.btn-emoji-open').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      if (_activBtn === btn) { closePanel(); return; }
      if (_activBtn) closePanel();
      openPanel(btn.dataset.target, btn);
    });
  });

  document.addEventListener('click', e => {
    if (!panel.contains(e.target) && !e.target.closest('.btn-emoji-open')) closePanel();
  });
})();

/* ── Compose contenteditable helpers ───────── */
function getComposeText(id) {
  const el = document.getElementById(id);
  if (!el) return '';
  let text = '';
  el.childNodes.forEach(node => {
    if (node.nodeType === Node.TEXT_NODE) text += node.textContent.replace(/​/g, '');
    else if (node.dataset?.emoji) text += node.dataset.emoji;
    else if (node.nodeName === 'BR') text += '\n';
    else text += node.textContent;
  });
  return text;
}

function clearComposeInput(id) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = '';
}

/* ── Compose photo ──────────────────────────── */
const _composeImages = { feed: [], profile: [] };

function getComposeImages(ns) { return _composeImages[ns] || []; }
function clearComposeImages(ns) {
  _composeImages[ns] = [];
  const el = document.getElementById(`${ns}-compose-previews`);
  if (el) el.innerHTML = '';
}

function initComposePhoto(ns) {
  const input    = document.getElementById(`${ns}-photo-input`);
  const previews = document.getElementById(`${ns}-compose-previews`);
  if (!input || !previews) return;

  input.addEventListener('change', () => {
    Array.from(input.files).forEach(file => {
      const reader = new FileReader();
      reader.onload = e => {
        const dataUrl = e.target.result;
        _composeImages[ns].push(dataUrl);

        const wrap = document.createElement('div');
        wrap.className = 'compose__preview-wrap';
        const img = document.createElement('img');
        img.src = dataUrl;
        const rm = document.createElement('button');
        rm.className = 'compose__preview-remove';
        rm.textContent = '×';
        rm.addEventListener('click', () => {
          const idx = _composeImages[ns].indexOf(dataUrl);
          if (idx !== -1) _composeImages[ns].splice(idx, 1);
          wrap.remove();
        });
        wrap.append(img, rm);
        previews.appendChild(wrap);
      };
      reader.readAsDataURL(file);
    });
    input.value = '';
  });
}

initComposePhoto('feed');
initComposePhoto('profile');

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

function buildPostTextEl(text) {
  const p = document.createElement('p');
  p.className = 'post__text';

  if (isHeartOnly(text)) {
    const span = document.createElement('span');
    span.className = 'heart-source';
    span.textContent = text;
    p.appendChild(span);
    return p;
  }

  // Render immediately as plain text, then async-swap TGS emojis
  p.textContent = text;

  loadEmojiList().then(entries => {
    if (!entries.length) return;
    const emojiMap = new Map(entries.map(e => [e.emoji, e.file]));
    const sorted   = [...emojiMap.keys()].sort((a, b) => b.length - a.length);
    const escaped  = sorted.map(e => e.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    if (!escaped.length) return;
    const regex = new RegExp(escaped.join('|'), 'gu');

    function processNode(node) {
      if (node.nodeType === Node.TEXT_NODE) {
        const val = node.nodeValue;
        regex.lastIndex = 0;
        if (!regex.test(val)) return;
        regex.lastIndex = 0;
        const frag = document.createDocumentFragment();
        let last = 0, m;
        while ((m = regex.exec(val)) !== null) {
          if (m.index > last) frag.appendChild(document.createTextNode(val.slice(last, m.index)));
          const file = emojiMap.get(m[0]);
          if (file) {
            // placeholder — TGS загружается лениво через IntersectionObserver внутри createTgsPlayer
            const player = createTgsPlayer(file, 28, true, false);
            player.classList.add('post__text-tgs');
            frag.appendChild(player);
          } else {
            frag.appendChild(document.createTextNode(m[0]));
          }
          last = m.index + m[0].length;
        }
        if (last < val.length) frag.appendChild(document.createTextNode(val.slice(last)));
        node.replaceWith(frag);
      } else {
        Array.from(node.childNodes).forEach(processNode);
      }
    }

    Array.from(p.childNodes).forEach(processNode);
  });

  return p;
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

  const heartCount = post.reactions['❤️'] || 0;
  const heartIdx = others.findIndex(e => (post.reactions[e] || 0) <= heartCount);
  const insertAt = heartIdx === -1 ? others.length : heartIdx;
  const ordered = [...others.slice(0, insertAt), '❤️', ...others.slice(insertAt)];

  ordered.forEach(emoji => {
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

const GRID_COLS = 2;
const GRID_GAP  = 4;
const GRID_PAD  = 8;
const GRID_ROWS = 5;

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

  const ITEM_SZ = 36;
  const MENU_W  = GRID_COLS * ITEM_SZ + (GRID_COLS - 1) * GRID_GAP + GRID_PAD * 2;
  menu.style.setProperty('--item-sz', ITEM_SZ + 'px');

  function updatePos() {
    const r = (postEl || likeBtn).getBoundingClientRect();
    menu.style.left = (r.left - MENU_W - 8) + 'px';
    menu.style.top  = r.top + 'px';
  }

  const visibleCount = GRID_COLS * GRID_ROWS;
  const io = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const btn = entry.target;
      if (btn.dataset.tgsLoaded) return;
      btn.dataset.tgsLoaded = '1';
      io.unobserve(btn);
      const itemSz = parseInt(menu.style.getPropertyValue('--item-sz')) || 44;
      const player = createTgsPlayer(btn.dataset.file, itemSz - 4);
      player.dataset.tgs = '1';
      btn.prepend(player);
    });
  }, { root: menu, rootMargin: '60px' });

  entries.forEach(({ file, emoji }) => {
    const btn = document.createElement('button');
    btn.className = 'post__emoji-item' + (post.myReactions.includes(emoji) ? ' post__emoji-item--active' : '');
    btn.dataset.emoji = emoji;
    btn.dataset.file = file;

    btn.addEventListener('click', e => {
      e.stopPropagation();
      toggleReaction(id, emoji);
      closeEmojiMenu();
    });
    menu.appendChild(btn);
    io.observe(btn);
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
  const newlineCount = (post.text ? post.text.match(/\n/g) || [] : []).length;
  const hasImages = post.images && post.images.length > 0;
  const isTall = isVerified && (hasImages || newlineCount >= 2 || (post.text && post.text.length > 150));
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
    ${post.text ? `<div class="post__text-wrap"></div>` : ''}
    ${post.images && post.images.length ? `
    <div class="post__images post__images--${Math.min(post.images.length, 4)}">
      ${post.images.slice(0, 4).map(src => `<img class="post__image" src="${src}" alt="" />`).join('')}
    </div>` : ''}
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
  const textWrap = el.querySelector('.post__text-wrap');
  if (textWrap && post.text) textWrap.replaceWith(buildPostTextEl(post.text));
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
