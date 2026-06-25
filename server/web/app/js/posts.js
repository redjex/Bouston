'use strict';

/* в”Ђв”Ђ Lightbox в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ */
(function () {
  const lb             = document.getElementById('lightbox');
  const lbImg          = document.getElementById('lightbox-img');
  const lbVideo        = document.getElementById('lightbox-video');
  const lbToolbarPhoto = document.getElementById('lb-toolbar-photo');
  const lbToolbarVideo = document.getElementById('lb-toolbar-video');

  (function () {
    const playBtn = document.getElementById('lb-play-btn');
    const muteBtn = document.getElementById('lb-mute-btn');
    const progress = document.getElementById('lb-progress');
    const bar      = document.getElementById('lb-bar');
    const thumb    = document.getElementById('lb-thumb');
    const timeCur  = document.getElementById('lb-time');
    const timeDur  = document.getElementById('lb-duration');

    function syncPlay() {
      playBtn.querySelector('.icon-play') .style.display = lbVideo.paused ? '' : 'none';
      playBtn.querySelector('.icon-pause').style.display = lbVideo.paused ? 'none' : '';
    }
    function syncMute() {
      muteBtn.querySelector('.icon-vol') .style.display = lbVideo.muted ? 'none' : '';
      muteBtn.querySelector('.icon-mute').style.display = lbVideo.muted ? '' : 'none';
    }
    function syncProgress() {
      const pct = lbVideo.duration ? (lbVideo.currentTime / lbVideo.duration * 100) : 0;
      bar.style.width   = pct + '%';
      thumb.style.left  = pct + '%';
      timeCur.textContent = fmtTime(lbVideo.currentTime);
    }
    function seekTo(clientX) {
      const r = progress.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
      lbVideo.currentTime = pct * lbVideo.duration;
      syncProgress();
    }

    lbVideo.addEventListener('play',  syncPlay);
    lbVideo.addEventListener('pause', syncPlay);
    lbVideo.addEventListener('ended', () => { lbVideo.currentTime = 0; syncPlay(); });
    lbVideo.addEventListener('loadedmetadata', () => { timeDur.textContent = fmtTime(lbVideo.duration); });
    lbVideo.addEventListener('timeupdate', syncProgress);
    playBtn.addEventListener('click', e => { e.stopPropagation(); lbVideo.paused ? lbVideo.play() : lbVideo.pause(); });
    muteBtn.addEventListener('click', e => { e.stopPropagation(); lbVideo.muted = !lbVideo.muted; syncMute(); });

    let dragging = false;
    progress.addEventListener('mousedown', e => { e.stopPropagation(); dragging = true; progress.classList.add('dragging'); seekTo(e.clientX); });
    document.addEventListener('mousemove', e => { if (dragging) seekTo(e.clientX); });
    document.addEventListener('mouseup', () => { dragging = false; progress.classList.remove('dragging'); });

    const volWrap  = document.getElementById('lb-volume-wrap');
    const volTrack = document.getElementById('lb-volume-track');
    const volBar   = document.getElementById('lb-volume-bar');
    const volThumb = document.getElementById('lb-volume-thumb');
    let _volume = parseFloat(localStorage.getItem('lb-volume') ?? '1');

    function applyVolume(v) {
      _volume = Math.max(0, Math.min(1, v));
      localStorage.setItem('lb-volume', _volume);
      lbVideo.volume = _volume;
      lbVideo.muted  = _volume === 0;
      volBar.style.width  = (_volume * 100) + '%';
      volThumb.style.left = (_volume * 100) + '%';
      syncMute();
    }
    function seekVolume(clientX) {
      const r = volTrack.getBoundingClientRect();
      applyVolume((clientX - r.left) / r.width);
    }

    let volDragging = false;
    volTrack.addEventListener('mousedown', e => { e.stopPropagation(); volDragging = true; volWrap.classList.add('dragging'); seekVolume(e.clientX); });
    document.addEventListener('mousemove', e => { if (volDragging) seekVolume(e.clientX); });
    document.addEventListener('mouseup', () => { volDragging = false; volWrap.classList.remove('dragging'); });

    window._lbApplyVolume = applyVolume;
    window._lbGetVolume   = () => _volume;
  })();

  let scale = 1, tx = 0, ty = 0, rotation = 0, flipH = 1, flipV = 1;
  let _isVideo = false;
  let _lbItems = [];
  let _lbIndex = 0;

  function activeEl() { return _isVideo ? lbVideo : lbImg; }

  function applyTransform() {
    activeEl().style.transform =
      `translate(${tx}px, ${ty}px) rotate(${rotation}deg) scale(${scale * flipH}, ${scale * flipV})`;
  }

  function resetTransform() {
    scale = 1; tx = 0; ty = 0; rotation = 0; flipH = 1; flipV = 1;
    lbImg.style.transform   = '';
    lbVideo.style.transform = '';
  }

  function openLightbox(src, isVideo, items, index) {
    _lbItems = items || [];
    _lbIndex = index ?? 0;
    resetTransform();
    _isVideo = !!isVideo;
    if (_isVideo) {
      lbVideo.src = src;
      lbVideo.preload = 'auto';
      lbVideo.style.display = '';
      lbImg.style.display = 'none';
      lbToolbarPhoto.style.display = 'none';
      lbToolbarVideo.style.display = '';
      lb.style.paddingBottom = '105px';
      if (window._lbApplyVolume) window._lbApplyVolume(window._lbGetVolume());
    } else {
      lbImg.src = src;
      lbImg.style.display = '';
      lbVideo.style.display = 'none';
      lbVideo.pause?.();
      lbVideo.src = '';
      lbToolbarPhoto.style.display = '';
      lbToolbarVideo.style.display = 'none';
      lb.style.paddingBottom = '';
    }
    lb.style.display = 'flex';
  }

  function closeLightbox() {
    lb.style.display = 'none';
    lbImg.src = '';
    lbVideo.pause?.();
    lbVideo.src = '';
    lbVideo.style.display = 'none';
    lbImg.style.display = '';
    lbToolbarPhoto.style.display = '';
    lbToolbarVideo.style.display = 'none';
    lb.style.paddingBottom = '';
    resetTransform();
    _isVideo = false;
    _lbItems = [];
    _lbIndex = 0;
  }

  function lbGoTo(idx) {
    if (!_lbItems.length) return;
    _lbIndex = (idx + _lbItems.length) % _lbItems.length;
    const item = _lbItems[_lbIndex];
    openLightbox(item.src, item.isVideo, _lbItems, _lbIndex);
  }

  function saveMedia() {
    if (_isVideo) {
      const a = document.createElement('a');
      a.href = lbVideo.src; a.download = 'video.mp4'; a.click();
      return;
    }
    const img = lbImg;
    const rad = rotation * Math.PI / 180;
    const sw = img.naturalWidth, sh = img.naturalHeight;
    const cos = Math.abs(Math.cos(rad)), sin = Math.abs(Math.sin(rad));
    const canvas = document.createElement('canvas');
    canvas.width  = Math.round(sw * cos + sh * sin);
    canvas.height = Math.round(sw * sin + sh * cos);
    const ctx = canvas.getContext('2d');
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(rad);
    ctx.scale(flipH, flipV);
    ctx.drawImage(img, -sw / 2, -sh / 2);
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png'); a.download = 'photo.png'; a.click();
  }

  function collectPostItems(clickedEl) {
    const postEl = clickedEl.closest('.post');
    if (!postEl) return { items: [], index: 0 };
    const items = [];
    postEl.querySelectorAll('.post__images .post__image, .post__images .post__video').forEach(el => {
      const isVideo = el.classList.contains('post__video') || el.classList.contains('vplayer');
      items.push({ src: el.dataset.fullSrc || el.dataset.src || el.src, isVideo });
    });
    const clickedSrc = clickedEl.dataset.fullSrc || clickedEl.dataset.src || clickedEl.src;
    const index = items.findIndex(it => it.src === clickedSrc);
    return { items, index: index === -1 ? 0 : index };
  }

  document.addEventListener('click', e => {
    if (e.target.closest('.lightbox__close') || e.target.closest('.lightbox__tool')) return;
    const playControl = e.target.closest('.vplayer__control');
    if (playControl) {
      e.preventDefault();
      e.stopPropagation();
      toggleInlineVideo(playControl.closest('.vplayer'));
      return;
    }
    const vidWrap = e.target.closest('.post__video');
    if (vidWrap) {
      const { items, index } = collectPostItems(vidWrap);
      openLightbox(vidWrap.dataset.fullSrc || vidWrap.dataset.src, true, items, index);
      return;
    }
    const img = e.target.closest('.post__image:not(.post__video)');
    if (img) {
      const { items, index } = collectPostItems(img);
      openLightbox(img.dataset.fullSrc || img.src, false, items, index);
      return;
    }
    if (lb.style.display !== 'none' && e.target === lb) closeLightbox();
  });

  document.getElementById('lightbox-close').addEventListener('click', closeLightbox);
  document.getElementById('lb-rotate-ccw').addEventListener('click', () => { rotation -= 90; applyTransform(); });
  document.getElementById('lb-rotate-cw') .addEventListener('click', () => { rotation += 90; applyTransform(); });
  document.getElementById('lb-flip-h')    .addEventListener('click', () => { flipH *= -1; applyTransform(); });
  document.getElementById('lb-flip-v')    .addEventListener('click', () => { flipV *= -1; applyTransform(); });
  document.getElementById('lb-save')      .addEventListener('click', saveMedia);
  document.getElementById('lb-rotate-ccw-v').addEventListener('click', () => { rotation -= 90; applyTransform(); });
  document.getElementById('lb-rotate-cw-v') .addEventListener('click', () => { rotation += 90; applyTransform(); });
  document.getElementById('lb-flip-h-v')    .addEventListener('click', () => { flipH *= -1; applyTransform(); });
  document.getElementById('lb-flip-v-v')    .addEventListener('click', () => { flipV *= -1; applyTransform(); });
  document.getElementById('lb-save-video').addEventListener('click', () => {
    const a = document.createElement('a');
    a.href = lbVideo.src; a.download = 'video.mp4'; a.click();
  });

  document.addEventListener('keydown', e => {
    if (lb.style.display === 'none') return;
    if (e.key === 'Escape') { closeLightbox(); return; }
    if (e.key === 'ArrowLeft')  { lbGoTo(_lbIndex - 1); return; }
    if (e.key === 'ArrowRight') { lbGoTo(_lbIndex + 1); return; }
  });

  lb.addEventListener('wheel', e => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    const factor   = e.deltaY < 0 ? 1.1 : 1 / 1.1;
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

/* в”Ђв”Ђ Emoji insert panel в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ */
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
    const after = document.createTextNode('вЂ‹');

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

/* в”Ђв”Ђ Video player в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ */
function fmtTime(s) {
  if (!isFinite(s)) return '0:00';
  const m = Math.floor(s / 60), ss = Math.floor(s % 60);
  return `${m}:${String(ss).padStart(2, '0')}`;
}

function buildVideoPlayer(src, extraClass = '', fullSrc = src) {
  const wrap = document.createElement('div');
  wrap.className = 'vplayer' + (extraClass ? ' ' + extraClass : '');
  wrap.dataset.src = src;
  wrap.dataset.fullSrc = fullSrc || src;
  wrap.dataset.ready = '0';

  const vid = document.createElement('video');
  vid.className   = 'vplayer__video';
  vid.src          = fullSrc || src;
  vid.poster      = src;
  vid.preload     = 'metadata';
  vid.muted       = true;
  vid.loop        = false;
  vid.playsInline = true;
  wrap.appendChild(vid);

  const control = document.createElement('button');
  control.type = 'button';
  control.className = 'vplayer__control vplayer__control--loading';
  control.setAttribute('aria-label', 'Загрузка видео');
  control.innerHTML = `
    <span class="vplayer__spinner" aria-hidden="true"></span>
    <img class="vplayer__play" src="/appimg/play.svg" alt="" aria-hidden="true" />
    <img class="vplayer__stop" src="/appimg/stop.svg" alt="" aria-hidden="true" />
  `;
  wrap.appendChild(control);

  vid.addEventListener('play', () => wrap.classList.add('vplayer--playing'));
  vid.addEventListener('pause', () => wrap.classList.remove('vplayer--playing'));
  vid.addEventListener('ended', () => {
    wrap.classList.remove('vplayer--playing');
    vid.currentTime = 0;
  });

  return wrap;
}

function createMediaProgress() {
  const el = document.createElement('div');
  el.className = 'media-progress';
  el.innerHTML = `
    <svg class="media-progress__svg" viewBox="0 0 44 44" aria-hidden="true">
      <circle class="media-progress__track" cx="22" cy="22" r="18"></circle>
      <circle class="media-progress__bar" cx="22" cy="22" r="18"></circle>
    </svg>
    <span class="media-progress__text">0%</span>
  `;
  setMediaProgress(el, 0);
  return el;
}

function setMediaProgress(el, value) {
  if (!el) return;
  const pct = Math.max(0, Math.min(100, Math.round(value || 0)));
  el.style.setProperty('--media-progress', pct);
  const text = el.querySelector('.media-progress__text');
  if (text) text.textContent = pct + '%';
}

function loadMediaBlobWithProgress(url, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.responseType = 'blob';
    xhr.onprogress = event => {
      if (event.lengthComputable) onProgress((event.loaded / event.total) * 100);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100);
        resolve(URL.createObjectURL(xhr.response));
      } else {
        reject(new Error('media load failed'));
      }
    };
    xhr.onerror = reject;
    xhr.send();
  });
}

function hydratePostImage(img) {
  const fullSrc = img.dataset.fullSrc;
  if (!fullSrc || fullSrc === img.src || img.dataset.loadingFull === '1') return;
  img.dataset.loadingFull = '1';
  img.classList.add('post__image--previewing');
  const progress = createMediaProgress();
  img.parentElement?.appendChild(progress);
  loadMediaBlobWithProgress(fullSrc, pct => setMediaProgress(progress, pct))
    .then(blobUrl => {
      img.onload = () => {
        img.classList.remove('post__image--previewing');
        progress.remove();
      };
      img.src = blobUrl;
    })
    .catch(() => {
      img.classList.remove('post__image--previewing');
      progress.remove();
    });
}

function hydratePostVideo(player) {
  const vid = player.querySelector('.vplayer__video');
  const fullSrc = player.dataset.fullSrc;
  const control = player.querySelector('.vplayer__control');
  if (!vid || !fullSrc || player.dataset.loadingFull === '1') return;
  player.dataset.loadingFull = '1';
  player.classList.add('vplayer--previewing');
  if (control) {
    control.classList.add('vplayer__control--loading');
    control.setAttribute('aria-label', 'Загрузка видео');
  }
  loadMediaBlobWithProgress(fullSrc, () => {})
    .then(blobUrl => {
      vid.onloadedmetadata = () => {
        vid.currentTime = 0;
      };
      vid.onloadeddata = () => {
        player.classList.remove('vplayer--previewing');
        player.dataset.ready = '1';
        if (control) {
          control.classList.remove('vplayer__control--loading');
          control.setAttribute('aria-label', 'Включить видео');
        }
      };
      vid.src = blobUrl;
      vid.load();
    })
    .catch(() => {
      player.classList.remove('vplayer--previewing');
      player.dataset.ready = '1';
      if (control) {
        control.classList.remove('vplayer__control--loading');
        control.setAttribute('aria-label', 'Включить видео');
      }
    });
}

function toggleInlineVideo(player) {
  if (!player || player.dataset.ready !== '1') return;
  const vid = player.querySelector('.vplayer__video');
  if (!vid) return;
  if (vid.paused) {
    document.querySelectorAll('.vplayer__video').forEach(other => {
      if (other !== vid && !other.paused) other.pause();
    });
    vid.play().catch(() => {});
  } else {
    vid.pause();
  }
}

function mountVideoPlayers(container) {
  container.querySelectorAll('.post__video-wrap[data-src]').forEach(wrap => {
    const src = wrap.dataset.src;
    const player = buildVideoPlayer(src, 'post__video', wrap.dataset.fullSrc || src);
    wrap.replaceWith(player);
    hydratePostVideo(player);
  });
  container.querySelectorAll('.post__image[data-full-src]').forEach(hydratePostImage);
}

/* в”Ђв”Ђ Compose helpers в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ */
function getComposeText(id) {
  const el = document.getElementById(id);
  if (!el) return '';
  let text = '';
  el.childNodes.forEach(node => {
    if (node.nodeType === Node.TEXT_NODE) text += node.textContent.replace(/вЂ‹/g, '');
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

function watchComposeEmpty(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('input', () => {
    const isEmpty = el.innerHTML === '' || el.innerHTML === '<br>' ||
      el.textContent.replace(/вЂ‹/g, '').trim() === '' && !el.querySelector('span[data-emoji]');
    if (isEmpty) el.innerHTML = '';
  });
}

/* в”Ђв”Ђ Compose photo в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ */
const _composeImages = { feed: [], profile: [] };
const _composeReplyTargets = { feed: null, profile: null };
let _selectedReplyPostEl = null;

function getComposeImages(ns) { return _composeImages[ns] || []; }
function clearComposeImages(ns) {
  _composeImages[ns] = [];
  const el = document.getElementById(`${ns}-compose-previews`);
  if (el) el.innerHTML = '';
}

function buildOptimisticPost(text, images = [], replyToPostId = null) {
  const profile = getProfile();
  const id = Date.now();
  const replyTo = replyToPostId ? getPostById(Number(replyToPostId)) : null;
  return {
    id,
    text,
    createdAt: id,
    images: images.map(m => ({ ...m })),
    reactions: {},
    myReactions: [],
    likes: 0,
    liked: false,
    commentCount: 0,
    isOwn: true,
    pending: true,
    replyTo: replyTo ? {
      id: replyTo.id,
      text: replyTo.text,
      hasMedia: !!(replyTo.images && replyTo.images.length),
      author: replyTo.author || {
        displayName: profile.name,
        profileUsername: profile.username,
        tgUsername: window._tgUsername,
      },
    } : null,
    author: {
      displayName: profile.name,
      profileUsername: profile.username,
      tgUsername: window._tgUsername,
      avatarUrl: profile.avatar,
      avatarPreviewUrl: getProfileAvatarPreview(profile) || profile.avatar,
      isVerified: profile.verified === true,
    },
  };
}

function getComposeReplyTargetId(ns) {
  return _composeReplyTargets[ns]?.id || null;
}

function makeReplySnippet(post) {
  const text = (post?.text || '').replace(/\s+/g, ' ').trim();
  if (text) return text.length > 96 ? text.slice(0, 93) + '...' : text;
  if (post?.hasMedia || (post?.images && post.images.length)) return '\u041c\u0435\u0434\u0438\u0430';
  return '\u041f\u043e\u0441\u0442';
}

function makeReplyAuthorName(post) {
  const author = post?.author || {};
  return author.displayName || author.profileUsername || author.tgUsername || '\u041f\u043e\u0441\u0442';
}

let _replyDockEl = null;

function ensureReplyDock() {
  if (_replyDockEl) return _replyDockEl;
  _replyDockEl = document.createElement('div');
  _replyDockEl.className = 'reply-dock';
  document.body.appendChild(_replyDockEl);
  return _replyDockEl;
}

function renderReplyDock(ns, post) {
  const dock = ensureReplyDock();
  if (!post) {
    dock.classList.remove('reply-dock--visible');
    dock.innerHTML = '';
    return;
  }
  dock.innerHTML = `
    <button class="reply-dock__body" type="button">
      <span class="reply-dock__label">\u041e\u0442\u0432\u0435\u0447\u0430\u0435\u043c \u043d\u0430 \u043f\u043e\u0441\u0442</span>
      <span class="reply-dock__author">${escapeHtml(makeReplyAuthorName(post))}</span>
      <span class="reply-dock__text">${escapeHtml(makeReplySnippet(post))}</span>
    </button>
    <button class="reply-dock__close" type="button" aria-label="Close">&times;</button>
  `;
  dock.querySelector('.reply-dock__body').addEventListener('click', () => {
    const input = document.getElementById(`${ns}-compose-input`);
    input?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    input?.focus();
  });
  dock.querySelector('.reply-dock__close').addEventListener('click', () => clearComposeReplyTarget(ns));
  dock.classList.add('reply-dock--visible');
}

function renderComposeReplyTarget(ns) {
  const compose = document.getElementById(`${ns}-compose-input`)?.closest('.compose');
  if (!compose) return;
  compose.querySelector('.compose-reply')?.remove();

  const post = _composeReplyTargets[ns];
  compose.classList.toggle('compose--replying', !!post);
  renderReplyDock(ns, null);
  if (!post) return;

  const box = document.createElement('div');
  box.className = 'compose-reply';
  box.innerHTML = `
    <div class="compose-reply__bar"></div>
    <div class="compose-reply__body">
      <div class="compose-reply__label">\u041e\u0442\u0432\u0435\u0447\u0430\u0435\u043c \u043d\u0430 \u043f\u043e\u0441\u0442</div>
      <div class="compose-reply__author">${escapeHtml(makeReplyAuthorName(post))}</div>
      <div class="compose-reply__text">${escapeHtml(makeReplySnippet(post))}</div>
    </div>
    <button class="compose-reply__close" type="button" aria-label="Close">&times;</button>
  `;
  box.querySelector('.compose-reply__close').addEventListener('click', () => clearComposeReplyTarget(ns));
  compose.insertBefore(box, compose.firstElementChild);
}

function clearComposeReplyTarget(ns) {
  _composeReplyTargets[ns] = null;
  renderComposeReplyTarget(ns);
  if (_selectedReplyPostEl) {
    _selectedReplyPostEl.classList.remove('post--reply-selected');
    _selectedReplyPostEl = null;
  }
}

function setComposeReplyTarget(ns, postId) {
  const post = getPostById(Number(postId));
  if (!post) return;
  _composeReplyTargets[ns] = post;
  renderComposeReplyTarget(ns);
  if (_selectedReplyPostEl) _selectedReplyPostEl.classList.remove('post--reply-selected');
  _selectedReplyPostEl = document.querySelector(`.post[data-post-id="${Number(postId)}"]`);
  _selectedReplyPostEl?.classList.add('post--reply-selected');
  const input = document.getElementById(`${ns}-compose-input`);
  input?.focus();
  input?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function getComposeScopeFromPostEl(postEl) {
  if (postEl.closest('#view-profile, #profile-posts-container')) return 'profile';
  return 'feed';
}

function initComposePhoto(ns) {
  const input    = document.getElementById(`${ns}-photo-input`);
  const previews = document.getElementById(`${ns}-compose-previews`);
  if (!input || !previews) return;

  function addFile(file) {
    if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) return;
    const isVideo = file.type.startsWith('video/');
    const reader  = new FileReader();
    const wrap = document.createElement('div');
    wrap.className = 'compose__preview-wrap compose__preview-wrap--loading';
    const progress = createMediaProgress();
    wrap.appendChild(progress);
    previews.appendChild(wrap);

    reader.onprogress = e => {
      if (e.lengthComputable) setMediaProgress(progress, (e.loaded / e.total) * 100);
    };
    reader.onload = e => {
      const dataUrl = e.target.result;
      _composeImages[ns].push({ src: dataUrl, type: isVideo ? 'video' : 'image', mime: file.type });
      if (isVideo) {
        const vid = document.createElement('video');
        vid.src = dataUrl; vid.muted = true; vid.playsInline = true;
        wrap.insertBefore(vid, progress);
      } else {
        const img = document.createElement('img');
        img.src = dataUrl;
        wrap.insertBefore(img, progress);
      }
      setMediaProgress(progress, 100);
      setTimeout(() => {
        wrap.classList.remove('compose__preview-wrap--loading');
        progress.remove();
      }, 180);

      const rm = document.createElement('button');
      rm.className = 'compose__preview-remove';
      rm.textContent = '\u00d7';
      rm.addEventListener('click', () => {
        const idx = _composeImages[ns].findIndex(m => m.src === dataUrl);
        if (idx !== -1) _composeImages[ns].splice(idx, 1);
        wrap.remove();
      });
      wrap.appendChild(rm);
    };
    reader.onerror = () => wrap.remove();
    reader.readAsDataURL(file);
  }

  input.addEventListener('change', () => {
    Array.from(input.files).forEach(addFile);
    input.value = '';
  });

  const composeEl = document.getElementById(`${ns}-compose-input`);
  (composeEl || document).addEventListener('paste', e => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const mediaItems = Array.from(items).filter(i => i.kind === 'file' && (i.type.startsWith('image/') || i.type.startsWith('video/')));
    if (!mediaItems.length) return;
    e.preventDefault();
    mediaItems.forEach(i => addFile(i.getAsFile()));
  });

  const dropZone = (composeEl || previews).closest('.compose') || previews;
  let _dragCounter = 0;

  dropZone.addEventListener('dragenter', e => {
    e.preventDefault();
    _dragCounter++;
    dropZone.classList.add('compose--drag-over');
  });
  dropZone.addEventListener('dragleave', () => {
    _dragCounter--;
    if (_dragCounter <= 0) { _dragCounter = 0; dropZone.classList.remove('compose--drag-over'); }
  });
  dropZone.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
  dropZone.addEventListener('drop', e => {
    e.preventDefault();
    _dragCounter = 0;
    dropZone.classList.remove('compose--drag-over');
    Array.from(e.dataTransfer.files).forEach(addFile);
  });
}

initComposePhoto('feed');
initComposePhoto('profile');
watchComposeEmpty('feed-compose-input');
watchComposeEmpty('profile-compose-input');

/* в”Ђв”Ђ Post context menu в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ */
(function () {
  const menu    = document.getElementById('post-ctx-menu');
  const btnCopy = document.getElementById('post-ctx-copy-link');
  const btnReply = document.getElementById('post-ctx-reply');
  let _postId   = null;
  let _scope    = 'feed';

  function openMenu(x, y, postId, scope) {
    _postId = postId;
    _scope = scope || 'feed';
    const mw = 220, mh = 108;
    const px = x + mw > window.innerWidth  ? x - mw : x;
    const py = y + mh > window.innerHeight ? y - mh : y;
    menu.style.left = px + 'px';
    menu.style.top  = py + 'px';
    menu.classList.add('post-ctx-menu--visible');
  }

  function closeMenu() {
    menu.classList.remove('post-ctx-menu--visible');
    _postId = null;
  }

  document.addEventListener('contextmenu', e => {
    const postEl = e.target.closest('.post[data-post-id]');
    if (!postEl) { closeMenu(); return; }
    e.preventDefault();
    openMenu(e.clientX, e.clientY, postEl.dataset.postId, getComposeScopeFromPostEl(postEl));
  });

  document.addEventListener('mousedown', e => { if (!menu.contains(e.target)) closeMenu(); });
  document.addEventListener('scroll', closeMenu, true);

  btnCopy.addEventListener('click', () => {
    if (!_postId) return;
    const url = `https://bouston.xyz/post/${_postId}`;
    navigator.clipboard.writeText(url).catch(() => {});
    closeMenu();
  });

  btnReply?.addEventListener('click', () => {
    if (!_postId) return;
    setComposeReplyTarget(_scope, _postId);
    closeMenu();
  });
})();

(function () {
  let active = null;

  function resetActive() {
    if (!active) return;
    active.el.classList.remove('post--swiping', 'post--swipe-armed');
    active.el.style.transform = '';
    active = null;
  }

  document.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' || !window.matchMedia('(max-width: 640px)').matches) return;
    if (e.target.closest('button, a, input, textarea, [contenteditable]')) return;
    const el = e.target.closest('.post[data-post-id]');
    if (!el) return;
    active = { el, id: el.dataset.postId, scope: getComposeScopeFromPostEl(el), x: e.clientX, y: e.clientY, dx: 0, locked: false };
    el.setPointerCapture?.(e.pointerId);
  }, { passive: true });

  document.addEventListener('pointermove', e => {
    if (!active) return;
    const dx = e.clientX - active.x;
    const dy = e.clientY - active.y;
    if (!active.locked && Math.abs(dy) > 42 && Math.abs(dy) > Math.abs(dx)) { resetActive(); return; }
    if (dx >= 0) return;
    if (Math.abs(dx) > 10) active.locked = true;
    active.dx = dx;
    const offset = Math.max(-58, dx * 0.48);
    active.el.classList.add('post--swiping');
    active.el.classList.toggle('post--swipe-armed', Math.abs(dx) > 44);
    active.el.style.transform = `translateX(${offset}px)`;
  }, { passive: true });

  document.addEventListener('pointerup', () => {
    if (!active) return;
    const picked = Math.abs(active.dx) > 44;
    const { el, id, scope } = active;
    resetActive();
    if (!picked) return;
    setComposeReplyTarget(scope, id);
    el.classList.add('post--reply-picked');
    setTimeout(() => el.classList.remove('post--reply-picked'), 950);
  }, { passive: true });

  document.addEventListener('pointercancel', resetActive, { passive: true });
})();

/* в”Ђв”Ђ Spam toast в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ */
let _toastTimer = null;

function restorePostButton(btnEl, text = null) {
  if (!btnEl) return;
  const idleText = text || btnEl.dataset.idleText || btnEl.dataset.origText || '\u0412\u044b\u0441\u0442\u0430\u0432\u0438\u0442\u044c';
  btnEl.textContent = idleText;
  btnEl.disabled = false;
  btnEl.classList.remove('btn-post--loading');
  delete btnEl.dataset.idleText;
  delete btnEl.dataset.origText;
  delete btnEl.dataset.cooldownTimer;
}

function startPostButtonCooldown(btnEl, seconds = 5, text = null) {
  if (!btnEl) return;
  if (btnEl.dataset.cooldownTimer) clearInterval(Number(btnEl.dataset.cooldownTimer));
  const restoreText = text || btnEl.dataset.idleText || btnEl.dataset.origText || btnEl.textContent || '\u0412\u044b\u0441\u0442\u0430\u0432\u0438\u0442\u044c';
  let secs = seconds;
  btnEl.dataset.origText = restoreText;
  btnEl.classList.remove('btn-post--loading');
  btnEl.disabled = true;
  btnEl.textContent = `${secs}\u0441`;
  const cooldownTimer = setInterval(() => {
    secs--;
    if (secs <= 0) {
      clearInterval(cooldownTimer);
      restorePostButton(btnEl, restoreText);
    } else {
      btnEl.textContent = `${secs}\u0441`;
    }
  }, 1000);
  btnEl.dataset.cooldownTimer = String(cooldownTimer);
}

function showPostError(message, btnEl) {
  let toast = document.getElementById('post-error-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'post-error-toast';
    toast.className = 'post-error-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add('post-error-toast--visible');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => toast.classList.remove('post-error-toast--visible'), 3500);

  if (!btnEl) return;
  const cooldownMatch = String(message).match(/(\d+)\s*(?:\u0441\u0435\u043a|\u0441\b|sec|seconds?)/i);
  if (!cooldownMatch) return;
  let cooldownSecs = parseInt(cooldownMatch[1]);
  const restoreText = btnEl.dataset.idleText || btnEl.dataset.origText || '\u0412\u044b\u0441\u0442\u0430\u0432\u0438\u0442\u044c';
  if (btnEl.dataset.cooldownTimer) clearInterval(Number(btnEl.dataset.cooldownTimer));
  btnEl.dataset.origText = restoreText;
  btnEl.classList.remove('btn-post--loading');
  btnEl.disabled = true;
  btnEl.textContent = `${cooldownSecs}\u0441`;
  const cooldownTimer = setInterval(() => {
    cooldownSecs--;
    if (cooldownSecs <= 0) {
      clearInterval(cooldownTimer);
      restorePostButton(btnEl, restoreText);
    } else {
      btnEl.textContent = `${cooldownSecs}\u0441`;
    }
  }, 1000);
  btnEl.dataset.cooldownTimer = String(cooldownTimer);
  return;

  if (!btnEl) return;
  const match = message.match(/(\d+)\s*СЃРµРє/);
  if (!match) return;
  let secs = parseInt(match[1]);
  const origText = btnEl.dataset.origText || btnEl.textContent;
  btnEl.dataset.origText = origText;
  btnEl.disabled = true;
  btnEl.textContent = `${secs}СЃ`;
  const iv = setInterval(() => {
    secs--;
    if (secs <= 0) {
      clearInterval(iv);
      btnEl.disabled = false;
      btnEl.textContent = origText;
    } else {
      btnEl.textContent = `${secs}СЃ`;
    }
  }, 1000);
}

/* в”Ђв”Ђ Utils в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ */
function escapeHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');
}
function getHandle(profile) {
  const u = profile.username || profile.name || '';
  return '@' + u.toLowerCase().replace(/\s+/g,'');
}
function formatPostTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

const MONTHS_RU = [
  '\u044f\u043d\u0432\u0430\u0440\u044f', '\u0444\u0435\u0432\u0440\u0430\u043b\u044f',
  '\u043c\u0430\u0440\u0442\u0430', '\u0430\u043f\u0440\u0435\u043b\u044f',
  '\u043c\u0430\u044f', '\u0438\u044e\u043d\u044f', '\u0438\u044e\u043b\u044f',
  '\u0430\u0432\u0433\u0443\u0441\u0442\u0430', '\u0441\u0435\u043d\u0442\u044f\u0431\u0440\u044f',
  '\u043e\u043a\u0442\u044f\u0431\u0440\u044f', '\u043d\u043e\u044f\u0431\u0440\u044f',
  '\u0434\u0435\u043a\u0430\u0431\u0440\u044f',
];

function getDateKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function formatDateLabel(ts) {
  const d = new Date(ts), now = new Date();
  if (d.toDateString() === now.toDateString()) return '\u0421\u0435\u0433\u043e\u0434\u043d\u044f';
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return '\u0412\u0447\u0435\u0440\u0430';
  return `${d.getDate()} ${MONTHS_RU[d.getMonth()]}`;
}

function buildDateSeparator(ts) {
  const el = document.createElement('div');
  el.className = 'date-separator';
  el.innerHTML = `<span>${formatDateLabel(ts)}</span>`;
  return el;
}

function isHeartOnly(text) {
  return /^[\s]*(?:[\u2764\u2665]|\uFE0F|\uD83E\uDD0D|\uD83E\uDD0E|\uD83E\uDDE1|\uD83D\uDC95|\uD83D\uDC97|\uD83D\uDC93|\uD83D\uDC9E|\uD83D\uDC98|\uD83D\uDC9D|\uD83D\uDDA4|\uD83D\uDC9C|\uD83D\uDC99|\uD83D\uDC9A|\uD83D\uDC9B)+[\s]*$/u.test(text.trim());
}

let _emojiRegex = null;
let _emojiMap   = null;
const HEART_EMOJI = '\u2764\uFE0F';

async function getEmojiRegex() {
  if (_emojiRegex) return { regex: _emojiRegex, map: _emojiMap };
  const entries = await loadEmojiList();
  if (!entries.length) return null;
  _emojiMap = new Map(entries.map(e => [e.emoji, e.file]));
  const sorted  = [..._emojiMap.keys()].sort((a, b) => b.length - a.length);
  const escaped = sorted.map(e => e.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  _emojiRegex = new RegExp(escaped.join('|'), 'gu');
  return { regex: _emojiRegex, map: _emojiMap };
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

  function appendTextWithLinks(target, value) {
    const urlRe = /((?:https?:\/\/|www\.)[^\s<>"']+)/gi;
    let last = 0, match;
    while ((match = urlRe.exec(value)) !== null) {
      const raw = match[0];
      const clean = raw.replace(/[),.!?;:]+$/g, '');
      const trailing = raw.slice(clean.length);
      if (match.index > last) target.appendChild(document.createTextNode(value.slice(last, match.index)));
      const a = document.createElement('a');
      a.className = 'post__link';
      a.href = clean.startsWith('www.') ? `https://${clean}` : clean;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = clean;
      target.appendChild(a);
      if (trailing) target.appendChild(document.createTextNode(trailing));
      last = match.index + raw.length;
    }
    if (last < value.length) target.appendChild(document.createTextNode(value.slice(last)));
  }

  // Р Р°Р·Р±РёРІР°РµРј С‚РµРєСЃС‚ РїРѕ РїРµСЂРµРЅРѕСЃР°Рј СЃС‚СЂРѕРє Рё РґРѕР±Р°РІР»СЏРµРј <br>
  const lines = text.split('\n');
  lines.forEach((line, index) => {
    appendTextWithLinks(p, line);
    if (index < lines.length - 1) {
      p.appendChild(document.createElement('br'));
    }
  });

  getEmojiRegex().then(result => {
    if (!result) return;
    const { regex, map: emojiMap } = result;

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
            const player = createTgsPlayer(file, 20, false, false, false);
            player.classList.add('post__text-tgs');
            frag.appendChild(player);
            registerBatchedTgsPlayer(p, player);
          } else {
            frag.appendChild(document.createTextNode(m[0]));
          }
          last = m.index + m[0].length;
        }
        if (last < val.length) frag.appendChild(document.createTextNode(val.slice(last)));
        node.replaceWith(frag);
      } else if (node.nodeName !== 'A') {
        Array.from(node.childNodes).forEach(processNode);
      }
    }
    Array.from(p.childNodes).forEach(processNode);
  });

  return p;
}

/* в”Ђв”Ђ Server posts cache в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ */
const _serverPostsMap = new Map();
const _editingPostIds = new Set();

function refreshPostLayoutFlags(postEl) {
  if (!postEl) return;
  const isVerified = postEl.classList.contains('post--verified');
  const textEl = postEl.querySelector('.post__text');
  const footerEl = postEl.querySelector('.post__footer');
  let textTall = false;
  if (textEl) {
    const lh = parseFloat(getComputedStyle(textEl).lineHeight) || 22;
    textTall = textEl.offsetHeight > lh * 1.8;
  }
  const verifiedTall = isVerified && (
    textTall ||
    !!postEl.querySelector('.post__pinned') ||
    !!postEl.querySelector('.post__images') ||
    !!postEl.querySelector('.post-reply') ||
    (footerEl && footerEl.offsetHeight > 44)
  );
  postEl.classList.toggle('post--text-tall', textTall);
  postEl.classList.toggle('post--verified-tall', verifiedTall);
}

function registerServerPost(post) {
  if (!post.reactions)   post.reactions   = {};
  if (!post.myReactions) post.myReactions = [];
  _serverPostsMap.set(post.id, post);

  // РџСЂРѕРІРµСЂСЏРµРј СѓРїРѕРјРёРЅР°РЅРёРµ РїСЂРё СЂРµРіРёСЃС‚СЂР°С†РёРё РїРѕСЃС‚Р°
}

function getPostById(id) {
  const local = getPosts().find(p => p.id === id);
  return local || _serverPostsMap.get(id) || null;
}

/* в”Ђв”Ђ Menu в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ */
let _openMenuId        = null;
let _menuScrollCleanup = null;

function closeAllMenus() {
  document.querySelectorAll('.post__menu').forEach(m => m.remove());
  document.querySelectorAll('.post--menu-open').forEach(p => p.classList.remove('post--menu-open'));
  _openMenuId = null;
  if (_menuScrollCleanup) { _menuScrollCleanup(); _menuScrollCleanup = null; }
}

function openPostMenu(id, postEl, scrollContainer, menuItems) {
  closeAllMenus();
  if (!getPostById(id)) return;

  postEl.classList.add('post--menu-open');

  const menu = document.createElement('div');
  menu.className = 'post__menu';
  let menuTrackRaf = null;

  function updatePos() {
    const r = postEl.getBoundingClientRect();
    const menuWidth = menu.offsetWidth || 55;
    const left = Math.min(r.right + 8, window.innerWidth - menuWidth - 8);
    menu.style.left = Math.max(8, left) + 'px';
    menu.style.top  = r.top + 'px';
  }
  updatePos();
  scrollContainer.addEventListener('scroll', updatePos);
  window.addEventListener('resize', updatePos);
  _menuScrollCleanup = () => {
    scrollContainer.removeEventListener('scroll', updatePos);
    window.removeEventListener('resize', updatePos);
    if (menuTrackRaf) cancelAnimationFrame(menuTrackRaf);
  };

  menuItems.forEach(({ src, action }) => {
    const btn = document.createElement('button');
    btn.className = 'post__menu-item';
    btn.innerHTML = `<img class="post__menu-icon" src="${src}" alt="" />`;
    btn.addEventListener('click', e => { e.stopPropagation(); action(); });
    menu.appendChild(btn);
  });

  document.body.appendChild(menu);
  const trackUntil = performance.now() + 280;
  function trackMenuPosition() {
    updatePos();
    if (performance.now() < trackUntil) {
      menuTrackRaf = requestAnimationFrame(trackMenuPosition);
    }
  }
  menuTrackRaf = requestAnimationFrame(trackMenuPosition);
  _openMenuId = id;
}

/* в”Ђв”Ђ Post actions в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ */
function startEditPost(id, postEl, onDone) {
  const existingEditor = postEl.querySelector('.post__edit-area');
  if (_editingPostIds.has(id) || postEl.classList.contains('post--editing') || existingEditor) {
    existingEditor?.focus();
    return;
  }

  const isServer = _serverPostsMap.has(id);
  const post = isServer ? _serverPostsMap.get(id) : getPosts().find(p => p.id === id);
  if (!post) return;
  _editingPostIds.add(id);
  postEl.classList.add('post--editing');

  const textWrap = postEl.querySelector('.post__text-wrap') || postEl.querySelector('.post__text');
  const originalText = post.text || '';
  const textarea = document.createElement('textarea');
  textarea.className = 'post__edit-area';
  textarea.value     = originalText;

  const actions   = document.createElement('div');
  actions.className = 'post__edit-actions';

  const cancelBtn = document.createElement('button');
  cancelBtn.className   = 'post__edit-btn post__edit-btn--cancel';
  cancelBtn.textContent = '\u041e\u0442\u043c\u0435\u043d\u0430';

  const saveBtn = document.createElement('button');
  saveBtn.className   = 'post__edit-btn post__edit-btn--save';
  saveBtn.textContent = '\u0421\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c';

  actions.append(cancelBtn, saveBtn);
  if (textWrap) textWrap.replaceWith(textarea);
  else postEl.querySelector('.post__header').after(textarea);
  textarea.after(actions);

  textarea.addEventListener('input', () => {
    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 'px';
  });
  textarea.dispatchEvent(new Event('input'));
  textarea.focus();
  textarea.selectionStart = textarea.selectionEnd = textarea.value.length;

  const closeEditor = text => {
    postEl.querySelectorAll('.post__edit-actions').forEach(el => el.remove());
    postEl.querySelectorAll('.post__edit-area').forEach((el, index) => {
      if (index === 0) el.replaceWith(buildPostTextEl(text));
      else el.remove();
    });
    if (!postEl.querySelector('.post__text')) {
      postEl.querySelector('.post__header')?.after(buildPostTextEl(text));
    }
    postEl.classList.remove('post--editing');
    _editingPostIds.delete(id);
    requestAnimationFrame(() => refreshPostLayoutFlags(postEl));
  };
  const failSave = message => {
    saveBtn.disabled = false;
    saveBtn.textContent = saveBtn.dataset.idleText || '\u0421\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c';
    delete saveBtn.dataset.idleText;
    showPostError(message || '\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0441\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c \u043f\u043e\u0441\u0442', saveBtn);
  };

  cancelBtn.addEventListener('click', e => {
    e.preventDefault();
    closeEditor(originalText);
    onDone();
  });
  saveBtn.addEventListener('click', async e => {
    e.preventDefault();
    const newText = textarea.value.trim();
    if (!newText) { failSave('\u0422\u0435\u043a\u0441\u0442 \u043d\u0435 \u043c\u043e\u0436\u0435\u0442 \u0431\u044b\u0442\u044c \u043f\u0443\u0441\u0442\u044b\u043c'); return; }
    saveBtn.dataset.idleText = saveBtn.textContent;
    saveBtn.textContent = '\u0421\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u0438\u0435...';
    saveBtn.disabled = true;

    if (isServer) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12000);
      try {
        const res = await apiFetch(`${API}/posts/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: newText }),
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (res.ok) {
          const updated = await res.json();
          const nextPost = { ..._serverPostsMap.get(id), ...updated };
          _serverPostsMap.set(id, nextPost);
          mergeFeedPostsCache([nextPost]);
          if (nextPost.author?.tgUsername) mergeProfilePostsCache(nextPost.author.tgUsername, [nextPost]);
        } else {
          let message = '\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0441\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c \u043f\u043e\u0441\u0442';
          try {
            const data = await res.json();
            if (data?.detail) message = data.detail;
          } catch {}
          failSave(message);
          return;
        }
      } catch (err) {
        clearTimeout(timeout);
        if (err.name === 'AbortError') {
          failSave('\u0421\u0435\u0440\u0432\u0435\u0440 \u043d\u0435 \u043e\u0442\u0432\u0435\u0442\u0438\u043b, \u043f\u043e\u043f\u0440\u043e\u0431\u0443\u0439 \u0435\u0449\u0435 \u0440\u0430\u0437');
          return;
        }
        failSave('\u041d\u0435\u0442 \u0441\u043e\u0435\u0434\u0438\u043d\u0435\u043d\u0438\u044f \u0441 \u0441\u0435\u0440\u0432\u0435\u0440\u043e\u043c');
        return;
      }
    } else {
      const posts = getPosts();
      const p = posts.find(p => p.id === id);
      if (p) { p.text = newText; p.editedAt = Date.now(); savePosts(posts); }
    }
    saveBtn.textContent = saveBtn.dataset.idleText || '\u0421\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c';
    delete saveBtn.dataset.idleText;
    closeEditor(isServer ? (_serverPostsMap.get(id)?.text || newText) : newText);
    onDone();
  });
}

function deletePost(id, onDone) {
  if (_serverPostsMap.has(id)) {
    apiFetch(`${API}/posts/${id}`, { method: 'DELETE' }).catch(() => {});
  } else {
    savePosts(getPosts().filter(p => p.id !== id));
  }

  handleDeletedPost(id);
  onDone();
}

function removeCachedCommentsForPost(id) {
  try {
    const all = JSON.parse(localStorage.getItem(COMMENTS_KEY)) || {};
    delete all[id];
    localStorage.setItem(COMMENTS_KEY, JSON.stringify(all));
  } catch {}
}

function removePostElWithSeparator(postEl) {
  const container = postEl.parentElement;
  const prev = postEl.previousElementSibling;
  const next = postEl.nextElementSibling;
  postEl.remove();

  if (prev?.classList.contains('date-separator') &&
      (!next || next.classList.contains('date-separator') || next.classList.contains('feed-sentinel'))) {
    prev.remove();
  }

  if (container?.id === 'posts-container' && typeof normalizeFeedDateSeparators === 'function') {
    normalizeFeedDateSeparators(container);
  }
}

function handleDeletedPost(id) {
  const postId = Number(id);
  if (!postId) return;

  removePostFromPostsCaches(postId);
  savePosts(getPosts().filter(p => Number(p.id) !== postId));
  removeCachedCommentsForPost(postId);
  _serverPostsMap.delete(postId);

  document.querySelectorAll(`.post[data-post-id="${postId}"]`).forEach(removePostElWithSeparator);

  if (typeof _threadPostId !== 'undefined' && Number(_threadPostId) === postId) {
    closeThread?.();
  }
}

function pinPost(id, onDone) {
  if (_serverPostsMap.has(id)) {
    const current = _serverPostsMap.get(id);
    const previous = { ...current };
    const nextPost = {
      ...current,
      pinned: !current.pinned,
      pinnedAt: current.pinned ? null : Date.now(),
    };
    _serverPostsMap.set(id, nextPost);
    mergeFeedPostsCache([nextPost]);
    if (nextPost.author?.tgUsername) mergeProfilePostsCache(nextPost.author.tgUsername, [nextPost]);
    onDone();

    apiFetch(`${API}/posts/${id}/pin`, { method: 'PUT' })
      .then(r => r.ok ? r.json() : null)
      .then(updated => {
        if (updated) {
          const serverPost = { ..._serverPostsMap.get(id), ...updated };
          _serverPostsMap.set(id, serverPost);
          mergeFeedPostsCache([serverPost]);
          if (serverPost.author?.tgUsername) mergeProfilePostsCache(serverPost.author.tgUsername, [serverPost]);
        } else {
          _serverPostsMap.set(id, previous);
          mergeFeedPostsCache([previous]);
          if (previous.author?.tgUsername) mergeProfilePostsCache(previous.author.tgUsername, [previous]);
          onDone();
        }
      })
      .catch(() => {
        _serverPostsMap.set(id, previous);
        mergeFeedPostsCache([previous]);
        if (previous.author?.tgUsername) mergeProfilePostsCache(previous.author.tgUsername, [previous]);
        onDone();
      });
    return;
  }
  const posts = getPosts();
  const post  = posts.find(p => p.id === id);
  if (!post) return;
  post.pinned   = !post.pinned;
  post.pinnedAt = post.pinned ? Date.now() : null;
  savePosts(posts);
  onDone();
}

/* в”Ђв”Ђ Reactions в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ */
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

let _reactionToPlayOnce = null;

function registerBatchedTgsPlayer(wrapper, player, index = null) {
  player.showFirstFrame?.();
}

function shouldPlayReactionOnce(id, emoji) {
  if (!_reactionToPlayOnce) return false;
  return Number(_reactionToPlayOnce.id) === Number(id) && _reactionToPlayOnce.emoji === emoji;
}

function consumeReactionToPlayOnce(id, emoji) {
  if (!shouldPlayReactionOnce(id, emoji)) return false;
  _reactionToPlayOnce = null;
  return true;
}

function buildReactionBtn(emoji, count, active, id, wrapper = null, index = 0) {
  const btn = document.createElement('button');
  btn.className = 'btn-like' + (active ? ' btn-like--active' : '');
  btn.dataset.id = id;
  btn.dataset.emoji = emoji;

  const iconWrap = document.createElement('span');
  iconWrap.className = 'btn-like__icon btn-like__icon--emoji';

  getEmojiFileMap().then(map => {
    const file = map[emoji];
    if (file) {
      const player = createTgsPlayer(file, 20, false, false, false);
      player.dataset.tgs = '1';
      iconWrap.appendChild(player);
      if (wrapper) registerBatchedTgsPlayer(wrapper, player, index);
      if (consumeReactionToPlayOnce(id, emoji)) player.playOnce?.();
    } else {
      consumeReactionToPlayOnce(id, emoji);
      iconWrap.textContent = emoji;
    }
  }).catch(() => { consumeReactionToPlayOnce(id, emoji); });

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
    .filter(e => e !== HEART_EMOJI && (post.reactions[e] || 0) > 0)
    .sort((a, b) => (post.reactions[b] || 0) - (post.reactions[a] || 0));

  const heartCount = post.reactions[HEART_EMOJI] || 0;
  let ordered;
  if (heartCount > 0) {
    const heartIdx = others.findIndex(e => (post.reactions[e] || 0) <= heartCount);
    const insertAt = heartIdx === -1 ? others.length : heartIdx;
    ordered = [...others.slice(0, insertAt), HEART_EMOJI, ...others.slice(insertAt)];
  } else if (others.length === 0) {
    ordered = [HEART_EMOJI];
  } else {
    ordered = others;
  }

  ordered.forEach((emoji, index) => {
    const count  = post.reactions[emoji] || 0;
    const active = post.myReactions.includes(emoji);
    const btn = buildReactionBtn(emoji, count, active, id, wrapper, index);
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

function applyReactionUpdate(postId, reactions) {
  const post = _serverPostsMap.get(postId);
  if (!post) return;
  post.reactions = reactions;
  post.likes = getTotalReactions(post);
  syncReactions(postId, post);
}

function reactionLimit() {
  return getProfile().verified ? 3 : 1;
}

async function toggleReaction(id, emoji) {
  _reactionToPlayOnce = { id, emoji };
  const isServer = _serverPostsMap.has(id);

  if (isServer) {
    const post = _serverPostsMap.get(id);
    if (!post) return;
    migrateReactions(post);

    if (post.myReactions.includes(emoji)) {
      removeReaction(post, emoji);
    } else {
      const existingTypes = Object.keys(post.reactions).filter(e => post.reactions[e] > 0);
      if (!existingTypes.includes(emoji) && existingTypes.length >= 6) return;
      const HEART = HEART_EMOJI;
      if (!existingTypes.includes(emoji) && existingTypes.length === 5 && emoji !== HEART && existingTypes.includes(HEART)) {
        delete post.reactions[HEART];
        post.myReactions = post.myReactions.filter(e => e !== HEART);
      }
      if (post.myReactions.length >= reactionLimit()) removeReaction(post, post.myReactions[0]);
      addReaction(post, emoji);
    }
    post.liked = post.myReactions.length > 0;
    post.likes = getTotalReactions(post);
    syncReactions(id, post);

    try {
      const res = await apiFetch(`${API}/posts/${id}/react`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emoji }),
      });
      if (res.ok) {
        const data = await res.json();
        post.reactions   = data.reactions;
        post.myReactions = data.myReactions;
        post.liked = post.myReactions.length > 0;
        post.likes = getTotalReactions(post);
        syncReactions(id, post);
      }
    } catch {}
    return;
  }

  const posts = getPosts();
  const post  = posts.find(p => p.id === id);
  if (!post) return;
  migrateReactions(post);

  if (post.myReactions.includes(emoji)) {
    removeReaction(post, emoji);
  } else {
    const activeTypes = new Set([HEART_EMOJI, ...Object.keys(post.reactions).filter(e => post.reactions[e] > 0)]);
    if (!activeTypes.has(emoji) && activeTypes.size >= 3) return;
    if (post.myReactions.length >= reactionLimit()) removeReaction(post, post.myReactions[0]);
    addReaction(post, emoji);
  }

  post.liked = post.myReactions.length > 0;
  post.likes = getTotalReactions(post);
  savePosts(posts);
  syncReactions(id, post);
}

/* в”Ђв”Ђ Emoji picker в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ */
let _emojiMenuCleanup = null;

function closeEmojiMenu() {
  document.querySelectorAll('.post__emoji-menu').forEach(m => {
    m.querySelectorAll('[data-tgs]').forEach(el => el.destroy?.());
    m.remove();
  });
  if (_emojiMenuCleanup) { _emojiMenuCleanup(); _emojiMenuCleanup = null; }
}

async function openEmojiMenu(id, likeBtn, scrollContainer) {
  closeEmojiMenu();
  const post = getPostById(id);
  if (!post) return;
  migrateReactions(post);

  const entries = await loadEmojiList();

  const menu = document.createElement('div');
  menu.className = 'post__emoji-menu';

  const postEl = likeBtn.closest('.post');
  const ITEM_SZ = 36;
  const GRID_COLS = 2, GRID_GAP = 4, GRID_PAD = 8;
  const MENU_W  = GRID_COLS * ITEM_SZ + (GRID_COLS - 1) * GRID_GAP + GRID_PAD * 2;
  menu.style.setProperty('--item-sz', ITEM_SZ + 'px');

  function updatePos() {
    const r = (postEl || likeBtn).getBoundingClientRect();
    menu.style.left = (r.left - MENU_W - 8) + 'px';
    menu.style.top  = r.top + 'px';
  }

  const io = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const btn = entry.target;
      if (btn.dataset.tgsLoaded) return;
      btn.dataset.tgsLoaded = '1';
      io.unobserve(btn);
      const player = createTgsPlayer(btn.dataset.file, ITEM_SZ - 4);
      player.dataset.tgs = '1';
      btn.prepend(player);
    });
  }, { root: menu, rootMargin: '60px' });

  const existingTypes = Object.keys(post.reactions).filter(e => post.reactions[e] > 0);
  const postFull = _serverPostsMap.has(id) && existingTypes.length >= 6;

  entries.forEach(({ file, emoji }) => {
    const isActive  = post.myReactions.includes(emoji);
    const isBlocked = postFull && !existingTypes.includes(emoji);
    if (isBlocked) return;

    const btn = document.createElement('button');
    btn.className = 'post__emoji-item' + (isActive ? ' post__emoji-item--active' : '');
    btn.dataset.emoji = emoji;
    btn.dataset.file  = file;

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

/* в”Ђв”Ђ Build post element в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ */
function buildReplyPreviewHtml(replyTo) {
  const author = makeReplyAuthorName(replyTo);
  const text = makeReplySnippet(replyTo);
  return `
    <div class="post-reply" data-reply-id="${replyTo.id || ''}">
      <div class="post-reply__line"></div>
      <div class="post-reply__body">
        <div class="post-reply__label">\u041e\u0442\u0432\u0435\u0442</div>
        <div class="post-reply__author">${escapeHtml(author)}</div>
        <div class="post-reply__text">${escapeHtml(text)}</div>
      </div>
    </div>
  `;
}

function getPostScrollContainer(postEl) {
  return postEl.closest('.feed, .profile-wrap, .thread-panel__body, #user-profile-wrap') || document.scrollingElement;
}

function flashTargetPost(postEl) {
  postEl.classList.remove('post--reply-target');
  void postEl.offsetWidth;
  postEl.classList.add('post--reply-target');
  setTimeout(() => postEl.classList.remove('post--reply-target'), 1300);
}

function scrollToPostEl(postEl) {
  postEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
  flashTargetPost(postEl);
}

async function fetchPostById(postId) {
  const res = await apiFetch(`${API}/posts/${postId}`);
  if (!res.ok) throw new Error('post not found');
  return res.json();
}

async function jumpToReplyPost(postId) {
  const id = Number(postId);
  if (!id) return;

  let target = document.querySelector(`.post[data-post-id="${id}"]`);
  if (target) { scrollToPostEl(target); return; }

  let post = getPostById(id);
  if (!post) {
    try { post = await fetchPostById(id); }
    catch { return; }
  }
  registerServerPost(post);

  const feedContainer = document.getElementById('posts-container');
  if (feedContainer) {
    if (typeof showView === 'function') showView('feed');
    const merged = mergeFeedPostsCache([post]);
    if (typeof syncFeedPostsIntoDom === 'function') syncFeedPostsIntoDom(feedContainer, merged);
    else if (!feedContainer.querySelector(`.post[data-post-id="${id}"]`)) {
      const postEl = buildPostEl(post, null, null, false, '', 0, false);
      postEl.classList.remove('post--enter');
      feedContainer.prepend(postEl);
    }
  }

  requestAnimationFrame(() => {
    target = document.querySelector(`.post[data-post-id="${id}"]`);
    if (target) scrollToPostEl(target);
  });
}

function buildPostEl(post, profile, avatarSrc, isVerified, badgeHtml, i, showPin) {
  if (post.author) {
    const a   = post.author;
    const own = post.isOwn;
    const lp  = own ? getProfile() : null;
    profile    = own
      ? { name: lp.name, username: lp.username || a.profileUsername, verified: a.isVerified }
      : { name: a.displayName, username: a.profileUsername, verified: a.isVerified };
    avatarSrc  = own
      ? (a.avatarPreviewUrl || getAvatarPreviewSrc(a.avatarUrl) || getProfileAvatarPreview(lp) || a.avatarUrl || '/appimg/default_avatar.png')
      : (a.avatarPreviewUrl || getAvatarPreviewSrc(a.avatarUrl) || a.avatarUrl || '/appimg/default_avatar.png');
    isVerified = a.isVerified;
    badgeHtml  = isVerified
      ? `<img class="post__verified-badge" src="/appimg/verided.svg" alt="verified" />`
      : '';
  }

  const newlineCount = (post.text ? post.text.match(/\n/g) || [] : []).length;
  const hasImages = post.images && post.images.length > 0;
  const hasPinnedLabel = showPin && post.pinned;
  const reactionCount = Object.keys(post.reactions || {}).length;
  const hasWrappedReactions = reactionCount > 3;
  const isTall = isVerified && (hasPinnedLabel || hasImages || hasWrappedReactions || newlineCount >= 2 || (post.text && post.text.length > 150));
  const extra = isVerified ? ' post--verified' + (isTall ? ' post--verified-tall' : '') : '';
  const el = document.createElement('div');
  el.className = 'post post--enter' + extra;
  if (post.replyTo) el.classList.add('post--has-reply');
  el.dataset.postId = post.id;
  if (post.author) el.dataset.author = post.author.tgUsername;
  else if (window._tgUsername) el.dataset.author = window._tgUsername;

  const delay = (i % 5) * 50;
  el.style.animationDelay = delay + 'ms';

  const verifiedGradientSvg = isVerified ? `
    <svg class="post__verified-bg" viewBox="0 0 531 287" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <filter id="vbg-f0" x="31.8573" y="-18.3" width="517.444" height="323.6" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB"><feFlood flood-opacity="0" result="BackgroundImageFix"/><feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape"/><feGaussianBlur stdDeviation="9.15" result="effect1_foregroundBlur"/></filter>
        <filter id="vbg-f1" x="-18.299" y="-16.7062" width="543.612" height="322.006" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB"><feFlood flood-opacity="0" result="BackgroundImageFix"/><feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape"/><feGaussianBlur stdDeviation="9.15" result="effect1_foregroundBlur"/></filter>
      </defs>
      <g filter="url(#vbg-f0)"><path d="M292.991 0C-16.3546 135.528 310.205 245.193 531.001 263.083L69.8857 287L50.1567 30.8316L292.991 0Z" fill="var(--verified-gradient-1, #4E7ADF)"/></g>
      <g filter="url(#vbg-f1)"><path d="M195.173 1.59445C-81.7762 243.95 286.217 237.221 507.013 255.111L19.7289 287L0 30.8316L195.173 1.59445Z" fill="var(--verified-gradient-2, #144CCC)"/></g>
    </svg>` : '';

  el.innerHTML = `
    ${verifiedGradientSvg}
    ${showPin && post.pinned ? `<div class="post__pinned"><img class="post__pinned-icon" src="/appimg/pin.svg" alt="" /><span>\u0417\u0430\u043a\u0440\u0435\u043f\u043b\u0435\u043d\u043e</span></div>` : ''}
    <div class="post__header">
      <img class="avatar" src="${avatarSrc}" alt="" />
      <div class="post__meta">
        <div class="post__namerow">
          <span class="post__name">${escapeHtml(profile.name)}</span>
          ${badgeHtml}
        </div>
        <span class="post__handle">${escapeHtml(getHandle(profile))}</span>
      </div>
      ${post.isOwn !== false ? `<div class="post__more-wrap">
        <button class="post__more" data-id="${post.id}">
          <span class="post__more-dot"></span>
          <span class="post__more-dot"></span>
          <span class="post__more-dot"></span>
        </button>
      </div>` : ''}
    </div>
    ${post.replyTo ? buildReplyPreviewHtml(post.replyTo) : ''}
    ${post.text ? `<div class="post__text-wrap"></div>` : ''}
    ${post.images && post.images.length ? `
    <div class="post__images post__images--${Math.min(post.images.length, 4)}">
      ${post.images.slice(0, 4).map(m => {
        const item = typeof m === 'string'
          ? { src: m, fullSrc: m, previewSrc: m, type: /\.(mp4|webm|mov)$/i.test(m) ? 'video' : 'image', mime: '' }
          : m;
        const previewSrc = item.previewSrc || item.src;
        const fullSrc = item.fullSrc || item.src;
        if (item.type === 'video') return `<div class="post__video-wrap" data-src="${previewSrc}" data-full-src="${fullSrc}"></div>`;
        const isGif = item.mime === 'image/gif' || item.src.startsWith('data:image/gif');
        return `<div class="post__media-item${isGif ? ' post__media-item--gif' : ''}"><img class="post__image${isGif ? ' post__image--gif' : ''}" src="${previewSrc}" data-full-src="${fullSrc}" loading="lazy" decoding="async" alt="" /></div>`;
      }).join('')}
    </div>` : ''}
    <div class="post__footer">
      <div class="post__reactions-wrap">
        <div class="post__reactions" data-post-id="${post.id}"></div>
        <button class="btn-comments" data-thread="${post.id}">
          <img class="btn-comments__icon" src="/appimg/comments.svg" alt="" />
          ${(() => { const cnt = post.author ? (post.commentCount || 0) : getComments(post.id).length; return cnt ? `<span class="btn-comments__count">${cnt}</span>` : ''; })()}
        </button>
      </div>
      <div class="post__time">
        ${post.editedAt ? `<img class="post__time-edit" src="/appimg/edit.svg" alt="" />` : ''}
        <span>${formatPostTime(post.createdAt || post.id)}</span>
      </div>
    </div>
  `;

  el.querySelector('.post__reactions').replaceWith(buildReactionsEl(post));
  const textWrap = el.querySelector('.post__text-wrap');
  if (textWrap && post.text) textWrap.replaceWith(buildPostTextEl(post.text));
  el.querySelector('.post-reply')?.addEventListener('click', e => {
    e.preventDefault();
    e.stopPropagation();
    jumpToReplyPost(e.currentTarget.dataset.replyId);
  });
  mountVideoPlayers(el);

  const markTallPost = () => {
    refreshPostLayoutFlags(el);
  };
  if ('requestIdleCallback' in window) requestIdleCallback(markTallPost, { timeout: 900 });
  else requestAnimationFrame(markTallPost);

  return el;
}

function refreshPostsVerifiedState(isVerified) {
  const badgeSrc = '/appimg/verided.svg';
  const bgSvg = `<svg class="post__verified-bg" viewBox="0 0 531 287" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><defs><filter id="vbg-f0" x="31.8573" y="-18.3" width="517.444" height="323.6" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB"><feFlood flood-opacity="0" result="BackgroundImageFix"/><feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape"/><feGaussianBlur stdDeviation="9.15" result="effect1_foregroundBlur"/></filter><filter id="vbg-f1" x="-18.299" y="-16.7062" width="543.612" height="322.006" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB"><feFlood flood-opacity="0" result="BackgroundImageFix"/><feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape"/><feGaussianBlur stdDeviation="9.15" result="effect1_foregroundBlur"/></filter></defs><g filter="url(#vbg-f0)"><path d="M292.991 0C-16.3546 135.528 310.205 245.193 531.001 263.083L69.8857 287L50.1567 30.8316L292.991 0Z" fill="var(--verified-gradient-1, #4E7ADF)"/></g><g filter="url(#vbg-f1)"><path d="M195.173 1.59445C-81.7762 243.95 286.217 237.221 507.013 255.111L19.7289 287L0 30.8316L195.173 1.59445Z" fill="var(--verified-gradient-2, #144CCC)"/></g></svg>`;

  document.querySelectorAll('.post').forEach(postEl => {
    const textEl = postEl.querySelector('.post__text');
    const text = textEl ? textEl.textContent : '';
    const newlineCount = (text.match(/\n/g) || []).length;
    const hasPinnedLabel = !!postEl.querySelector('.post__pinned');
    const reactionCount = postEl.querySelectorAll('.post__reactions .btn-like').length;
    const footerEl = postEl.querySelector('.post__footer');
    const hasWrappedReactions = reactionCount > 3 || (footerEl && footerEl.offsetHeight > 44);
    const isTall = isVerified && (hasPinnedLabel || hasWrappedReactions || newlineCount >= 2 || text.length > 150);

    postEl.classList.toggle('post--verified', isVerified);
    postEl.classList.toggle('post--verified-tall', isVerified && isTall);

    const existingBg = postEl.querySelector('.post__verified-bg');
    if (isVerified && !existingBg) postEl.insertAdjacentHTML('afterbegin', bgSvg);
    else if (!isVerified && existingBg) existingBg.remove();

    const badge = postEl.querySelector('.post__verified-badge');
    if (isVerified && !badge) {
      const namerow = postEl.querySelector('.post__namerow');
      if (namerow) namerow.insertAdjacentHTML('beforeend', `<img class="post__verified-badge" src="${badgeSrc}" alt="verified" />`);
    } else if (!isVerified && badge) {
      badge.remove();
    }
  });
}
