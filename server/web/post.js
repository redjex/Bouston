'use strict';

const root   = document.getElementById('root');
const postId = location.pathname.split('/').filter(Boolean).pop();

const MONTHS = ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'];

function formatDate(ms) {
  const d = new Date(ms);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

function formatTime(ms) {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

const VERIFIED_SVG = `<img class="badge" src="/web/verided.svg" alt="" />`;

const VERIFIED_BG_SVG = `<svg class="post__verified-bg" viewBox="0 0 531 287" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
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

/* ── TGS ── */
const _tgsCache = new Map();

async function fetchTgs(url) {
  if (_tgsCache.has(url)) return _tgsCache.get(url);
  const res  = await fetch(url);
  if (!res.ok) throw new Error(res.status);
  const buf  = await res.arrayBuffer();
  const json = JSON.parse(pako.inflate(new Uint8Array(buf), { to: 'string' }));
  _tgsCache.set(url, json);
  return json;
}

function makeTgsPlayer(url) {
  const wrap = document.createElement('div');
  wrap.className = 'btn-like__icon';
  let anim = null;

  fetchTgs(url).then(json => {
    if (!wrap.isConnected) return;
    anim = lottie.loadAnimation({
      container:     wrap,
      animationData: structuredClone(json),
      renderer:      'svg',
      loop:          true,
      autoplay:      true,
      rendererSettings: { preserveAspectRatio: 'xMidYMid meet' },
    });
  }).catch(() => {});

  return wrap;
}

/* ── Media ── */
function isVideo(src) { return /\.(mp4|webm|ogg)$/i.test(src); }

function buildMedia(images) {
  if (!images?.length) return null;
  if (images.length === 1) {
    const src = images[0];
    const el  = document.createElement(isVideo(src) ? 'video' : 'img');
    el.className = 'media-single';
    el.src = src;
    if (isVideo(src)) { el.controls = true; el.playsInline = true; el.muted = true; }
    return el;
  }
  const count = Math.min(images.length, 4);
  const grid  = document.createElement('div');
  grid.className = `media-grid media-grid--${count}`;
  images.slice(0, 4).forEach(src => {
    const el = document.createElement(isVideo(src) ? 'video' : 'img');
    el.className = 'media-grid__item';
    el.src = src;
    if (isVideo(src)) { el.controls = true; el.playsInline = true; el.muted = true; }
    grid.appendChild(el);
  });
  return grid;
}

/* ── Reactions ── */
function buildReactions(reactions, emojiMap) {
  const entries = Object.entries(reactions || {});
  if (!entries.length) return null;

  const wrap = document.createElement('div');
  wrap.className = 'reactions-wrap';

  entries.forEach(([emoji, count]) => {
    const btn = document.createElement('div');
    btn.className = 'btn-like';

    const url = emojiMap[emoji];
    if (url) {
      btn.appendChild(makeTgsPlayer(url));
    } else {
      const span = document.createElement('span');
      span.style.cssText = 'font-size:13px;line-height:1;';
      span.textContent = emoji;
      btn.appendChild(span);
    }

    const cnt = document.createElement('span');
    cnt.textContent = count;
    btn.appendChild(cnt);
    wrap.appendChild(btn);
  });

  return wrap;
}

/* ── Render ── */
function render(post, emojiMap) {
  const a        = post.author;
  const verified = a.isVerified;

  document.title = `${a.displayName} — Bouston`;
  document.getElementById('og-title').content       = `${a.displayName} в Bouston`;
  document.getElementById('og-description').content = (post.text || '').slice(0, 200);
  if (a.avatarUrl) document.getElementById('og-image').content = a.avatarUrl;

  root.innerHTML = '';

  // Date island
  const dateEl = document.createElement('div');
  dateEl.className = 'date-island';
  dateEl.textContent = formatDate(post.createdAt);
  root.appendChild(dateEl);

  // Card wrap
  const hasImages = post.images && post.images.length > 0;
  const isTall = verified && (hasImages || (post.text && (post.text.length > 150 || post.text.includes('\n'))));

  const wrap = document.createElement('div');
  wrap.className = 'card-wrap' + (verified ? ' card-wrap--verified' + (isTall ? ' card-wrap--verified-tall' : '') : '');

  // Card
  const card = document.createElement('div');
  card.className = 'card';

  if (verified) {
    card.insertAdjacentHTML('afterbegin', VERIFIED_BG_SVG);
  }

  // Header
  const header = document.createElement('div');
  header.className = 'card__header';

  const avatar = document.createElement('img');
  avatar.className = 'avatar';
  avatar.src = a.avatarUrl || '';

  const meta = document.createElement('div');
  meta.className = 'meta';

  const nameRow = document.createElement('div');
  nameRow.className = 'name-row';
  nameRow.innerHTML = `<span class="name">${a.displayName || a.tgUsername}</span>${verified ? VERIFIED_SVG : ''}`;

  const usernameEl = document.createElement('span');
  usernameEl.className = 'username';
  usernameEl.textContent = '@' + (a.profileUsername || a.tgUsername);

  meta.appendChild(nameRow);
  meta.appendChild(usernameEl);
  header.appendChild(avatar);
  header.appendChild(meta);
  card.appendChild(header);

  // Text
  if (post.text) {
    const textEl = document.createElement('p');
    textEl.className = 'card__text';
    textEl.textContent = post.text;
    card.appendChild(textEl);
  }

  // Media
  const media = buildMedia(post.images);
  if (media) card.appendChild(media);

  // Footer
  const footer = document.createElement('div');
  footer.className = 'card__footer';

  const rxEl = buildReactions(post.reactions, emojiMap);
  if (rxEl) footer.appendChild(rxEl);

  const timeEl = document.createElement('div');
  timeEl.className = 'post__time';
  if (post.editedAt) {
    const dot = document.createElement('span');
    dot.className = 'post__time-edit';
    dot.textContent = '•';
    timeEl.appendChild(dot);
  }
  const timeSpan = document.createElement('span');
  timeSpan.textContent = formatTime(post.createdAt);
  timeEl.appendChild(timeSpan);
  footer.appendChild(timeEl);

  card.appendChild(footer);
  wrap.appendChild(card);
  root.appendChild(wrap);
}

function renderError(msg) {
  root.innerHTML = `<div class="error">${msg}</div>`;
}

async function load() {
  if (!postId || isNaN(Number(postId))) { renderError('Неверная ссылка'); return; }
  try {
    const [postRes, emojiRes] = await Promise.all([
      fetch(`/api/posts/${postId}`),
      fetch('/api/emoji'),
    ]);
    if (postRes.status === 404) { renderError('Пост не найден'); return; }
    if (!postRes.ok) throw new Error();
    const post     = await postRes.json();
    const emojiMap = emojiRes.ok ? await emojiRes.json() : {};
    render(post, emojiMap);
  } catch {
    renderError('Не удалось загрузить пост');
  }
}

load();
