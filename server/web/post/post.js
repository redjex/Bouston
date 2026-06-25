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

const VERIFIED_SVG = `<img class="badge" src="/web/post/verided.svg?v=9" alt="" />`;

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

function makeTgsPlayer(url, autoplay = true, loop = true) {
  const wrap = document.createElement('div');
  wrap.className = 'btn-like__icon';
  let anim = null;
  let mounting = true;
  let playWhenReady = false;
  let resolvePlay = null;

  function finishPlay() {
    anim?.goToAndStop(anim.totalFrames - 1, true);
    if (resolvePlay) {
      resolvePlay();
      resolvePlay = null;
    }
  }

  fetchTgs(url).then(json => {
    if (!wrap.isConnected) return;
    wrap.innerHTML = '';
    anim = lottie.loadAnimation({
      container:     wrap,
      animationData: structuredClone(json),
      renderer:      'svg',
      loop,
      autoplay,
      rendererSettings: { preserveAspectRatio: 'xMidYMid meet' },
    });
    if (!autoplay) {
      anim.stop();
      anim.goToAndStop(0, true);
      anim.pause();
    }
    if (!loop) anim.addEventListener('complete', finishPlay);
    if (playWhenReady) {
      playWhenReady = false;
      anim.goToAndPlay(0, true);
    }
  }).catch(() => {
    if (resolvePlay) {
      resolvePlay();
      resolvePlay = null;
    }
  }).finally(() => {
    mounting = false;
  });

  wrap.playOnce = () => new Promise(resolve => {
    if (!wrap.isConnected) {
      resolve();
      return;
    }
    resolvePlay = resolve;
    if (anim) {
      anim.goToAndPlay(0, true);
      return;
    }
    if (mounting) {
      playWhenReady = true;
      return;
    }
    playWhenReady = true;
  });

  wrap.showFirstFrame = () => {
    playWhenReady = false;
    anim?.stop();
    anim?.goToAndStop(0, true);
    anim?.pause();
  };

  return wrap;
}

const REACTION_ANIMATION_BATCH_SIZE = 5;

async function runBatchedTgsAnimations(players, wrapper) {
  for (let i = 0; i < players.length && wrapper.isConnected; i += REACTION_ANIMATION_BATCH_SIZE) {
    const batch = players.slice(i, i + REACTION_ANIMATION_BATCH_SIZE);
    await Promise.all(batch.map(player => player.playOnce?.() || Promise.resolve()));
  }
}

/* ── Media ── */
function normalizeMedia(item) {
  if (typeof item === 'string') {
    return {
      src: item,
      fullSrc: item,
      previewSrc: item,
      type: /\.(mp4|webm|mov|ogg)$/i.test(item) ? 'video' : 'image',
    };
  }
  return {
    src: item.src || item.previewSrc || item.fullSrc,
    fullSrc: item.fullSrc || item.src,
    previewSrc: item.previewSrc || item.src || item.fullSrc,
    type: item.type || (/\.(mp4|webm|mov|ogg)$/i.test(item.fullSrc || item.src || '') ? 'video' : 'image'),
  };
}

function isVideo(item) { return normalizeMedia(item).type === 'video'; }

function buildMedia(images) {
  if (!images?.length) return null;
  if (images.length === 1) {
    const media = normalizeMedia(images[0]);
    const el  = document.createElement(media.type === 'video' ? 'video' : 'img');
    el.className = 'media-single';
    el.src = media.type === 'video' ? media.fullSrc : media.previewSrc;
    if (media.type === 'image') {
      el.loading = 'lazy';
      el.decoding = 'async';
    }
    if (media.type === 'video') { el.controls = true; el.playsInline = true; el.muted = true; el.preload = 'metadata'; }
    return el;
  }
  const count = Math.min(images.length, 4);
  const grid  = document.createElement('div');
  grid.className = `media-grid media-grid--${count}`;
  images.slice(0, 4).forEach(item => {
    const media = normalizeMedia(item);
    const el = document.createElement(media.type === 'video' ? 'video' : 'img');
    el.className = 'media-grid__item';
    el.src = media.type === 'video' ? media.fullSrc : media.previewSrc;
    if (media.type === 'image') {
      el.loading = 'lazy';
      el.decoding = 'async';
    }
    if (media.type === 'video') { el.controls = true; el.playsInline = true; el.muted = true; el.preload = 'metadata'; }
    grid.appendChild(el);
  });
  return grid;
}

/* ── Text with inline animated emoji ── */
const EMOJI_RE = /\p{Emoji_Presentation}|\p{Extended_Pictographic}/gu;

function buildTextNode(text, emojiMap) {
  const p = document.createElement('p');
  p.className = 'card__text';
  const players = [];

  const parts = [];
  let last = 0;
  for (const m of text.matchAll(EMOJI_RE)) {
    if (m.index > last) parts.push({ type: 'text', value: text.slice(last, m.index) });
    parts.push({ type: 'emoji', value: m[0] });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ type: 'text', value: text.slice(last) });

  parts.forEach(part => {
    if (part.type === 'text') {
      // Разбиваем текст по переносам строк и добавляем <br>
      const lines = part.value.split('\n');
      lines.forEach((line, index) => {
        p.appendChild(document.createTextNode(line));
        if (index < lines.length - 1) {
          p.appendChild(document.createElement('br'));
        }
      });
    } else {
      const url = emojiMap[part.value];
      if (url) {
        const player = makeTgsPlayer(url, false, false);
        player.classList.add('inline-emoji');
        player.showFirstFrame?.();
        players.push(player);
        p.appendChild(player);
      } else {
        p.appendChild(document.createTextNode(part.value));
      }
    }
  });

  setTimeout(() => runBatchedTgsAnimations(players, p), 0);

  return p;
}

/* ── Reactions ── */
function buildReactions(reactions, emojiMap) {
  const entries = Object.entries(reactions || {});
  if (!entries.length) {
    const wrap = document.createElement('div');
    wrap.className = 'reactions-wrap';
    const btn = document.createElement('div');
    btn.className = 'btn-like';
    const url = emojiMap['❤️'];
    if (url) {
      btn.appendChild(makeTgsPlayer(url, false, false));
    } else {
      const span = document.createElement('span');
      span.style.cssText = 'font-size:13px;line-height:1;';
      span.textContent = '❤️';
      btn.appendChild(span);
    }
    const cnt = document.createElement('span');
    cnt.textContent = '0';
    btn.appendChild(cnt);
    wrap.appendChild(btn);
    return wrap;
  }

  const wrap = document.createElement('div');
  wrap.className = 'reactions-wrap';
  const players = [];

  entries.forEach(([emoji, count]) => {
    const btn = document.createElement('div');
    btn.className = 'btn-like';

    const url = emojiMap[emoji];
    if (url) {
      const player = makeTgsPlayer(url, false, false);
      player.showFirstFrame?.();
      players.push(player);
      btn.appendChild(player);
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

  setTimeout(() => runBatchedTgsAnimations(players, wrap), 0);

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
  const newlineCount = (post.text ? post.text.match(/\n/g) || [] : []).length;
  const hasImages = post.images && post.images.length > 0;
  const isTall = verified && (hasImages || newlineCount >= 2 || (post.text && post.text.length > 150));

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
    card.appendChild(buildTextNode(post.text, emojiMap));
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
