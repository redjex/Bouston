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

  const vid = document.createElement('video');
  vid.className   = 'vplayer__video';
  vid.src         = src;
  vid.preload     = 'metadata';
  vid.muted       = true;
  vid.loop        = true;
  vid.playsInline = true;
  wrap.appendChild(vid);

  return wrap;
}

function mountVideoPlayers(container) {
  container.querySelectorAll('.post__video-wrap[data-src]').forEach(wrap => {
    const src = wrap.dataset.src;
    const player = buildVideoPlayer(src, 'post__video', wrap.dataset.fullSrc || src);
    wrap.replaceWith(player);
  });
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

  function addFile(file) {
    if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) return;
    const isVideo = file.type.startsWith('video/');
    const reader  = new FileReader();
    reader.onload = e => {
      const dataUrl = e.target.result;
      _composeImages[ns].push({ src: dataUrl, type: isVideo ? 'video' : 'image', mime: file.type });

      const wrap = document.createElement('div');
      wrap.className = 'compose__preview-wrap';

      if (isVideo) {
        const vid = document.createElement('video');
        vid.src = dataUrl; vid.muted = true; vid.playsInline = true;
        wrap.appendChild(vid);
      } else {
        const img = document.createElement('img');
        img.src = dataUrl;
        wrap.appendChild(img);
      }

      const rm = document.createElement('button');
      rm.className = 'compose__preview-remove';
      rm.textContent = 'Г—';
      rm.addEventListener('click', () => {
        const idx = _composeImages[ns].findIndex(m => m.src === dataUrl);
        if (idx !== -1) _composeImages[ns].splice(idx, 1);
        wrap.remove();
      });
      wrap.appendChild(rm);
      previews.appendChild(wrap);
    };
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
  let _postId   = null;

  function openMenu(x, y, postId) {
    _postId = postId;
    const mw = 200, mh = 60;
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
    openMenu(e.clientX, e.clientY, postEl.dataset.postId);
  });

  document.addEventListener('mousedown', e => { if (!menu.contains(e.target)) closeMenu(); });
  document.addEventListener('scroll', closeMenu, true);

  btnCopy.addEventListener('click', () => {
    if (!_postId) return;
    const url = `https://bouston.xyz/post/${_postId}`;
    navigator.clipboard.writeText(url).catch(() => {});
    closeMenu();
  });
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

  // Р Р°Р·Р±РёРІР°РµРј С‚РµРєСЃС‚ РїРѕ РїРµСЂРµРЅРѕСЃР°Рј СЃС‚СЂРѕРє Рё РґРѕР±Р°РІР»СЏРµРј <br>
  const lines = text.split('\n');
  lines.forEach((line, index) => {
    p.appendChild(document.createTextNode(line));
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
      } else {
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
  cancelBtn.textContent = 'РћС‚РјРµРЅР°';

  const saveBtn = document.createElement('button');
  saveBtn.className   = 'post__edit-btn post__edit-btn--save';
  saveBtn.textContent = 'РЎРѕС…СЂР°РЅРёС‚СЊ';

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
  };
  const failSave = message => {
    saveBtn.disabled = false;
    saveBtn.textContent = saveBtn.dataset.idleText || 'РЎРѕС…СЂР°РЅРёС‚СЊ';
    delete saveBtn.dataset.idleText;
    showPostError(message || 'РќРµ СѓРґР°Р»РѕСЃСЊ СЃРѕС…СЂР°РЅРёС‚СЊ РїРѕСЃС‚', saveBtn);
  };

  cancelBtn.addEventListener('click', e => {
    e.preventDefault();
    closeEditor(originalText);
    onDone();
  });
  saveBtn.addEventListener('click', async e => {
    e.preventDefault();
    const newText = textarea.value.trim();
    if (!newText) { failSave('РўРµРєСЃС‚ РЅРµ РјРѕР¶РµС‚ Р±С‹С‚СЊ РїСѓСЃС‚С‹Рј'); return; }
    saveBtn.dataset.idleText = saveBtn.textContent;
    saveBtn.textContent = 'РЎРѕС…СЂР°РЅРµРЅРёРµ...';
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
          let message = 'РќРµ СѓРґР°Р»РѕСЃСЊ СЃРѕС…СЂР°РЅРёС‚СЊ РїРѕСЃС‚';
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
          failSave('РЎРµСЂРІРµСЂ РЅРµ РѕС‚РІРµС‚РёР», РїРѕРїСЂРѕР±СѓР№ РµС‰С‘ СЂР°Р·');
          return;
        }
        failSave('РќРµС‚ СЃРѕРµРґРёРЅРµРЅРёСЏ СЃ СЃРµСЂРІРµСЂРѕРј');
        return;
      }
    } else {
      const posts = getPosts();
      const p = posts.find(p => p.id === id);
      if (p) { p.text = newText; p.editedAt = Date.now(); savePosts(posts); }
    }
    saveBtn.textContent = saveBtn.dataset.idleText || 'РЎРѕС…СЂР°РЅРёС‚СЊ';
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
    apiFetch(`${API}/posts/${id}/pin`, { method: 'PUT' })
      .then(r => r.ok ? r.json() : null)
      .then(updated => {
        if (updated) {
          const nextPost = { ..._serverPostsMap.get(id), ...updated };
          _serverPostsMap.set(id, nextPost);
          mergeFeedPostsCache([nextPost]);
          if (nextPost.author?.tgUsername) mergeProfilePostsCache(nextPost.author.tgUsername, [nextPost]);
        }
        onDone();
      })
      .catch(() => onDone());
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

const REACTION_ANIMATION_BATCH_SIZE = 5;
const _batchedTgsAnimationStates = new WeakMap();

function registerBatchedTgsPlayer(wrapper, player, index = null) {
  let state = _batchedTgsAnimationStates.get(wrapper);
  if (!state) {
    state = { players: [], timer: null, running: false };
    _batchedTgsAnimationStates.set(wrapper, state);
  }

  player.showFirstFrame?.();
  if (index === null) state.players.push(player);
  else state.players[index] = player;
  clearTimeout(state.timer);
  state.timer = setTimeout(() => {
    const run = () => runBatchedTgsAnimations(wrapper);
    if ('requestIdleCallback' in window) requestIdleCallback(run, { timeout: 900 });
    else setTimeout(run, 120);
  }, 80);
}

async function runBatchedTgsAnimations(wrapper) {
  const state = _batchedTgsAnimationStates.get(wrapper);
  if (!state || state.running || !wrapper.isConnected) return;

  state.running = true;
  const players = state.players.filter(Boolean);
  for (let i = 0; i < players.length && wrapper.isConnected; i += REACTION_ANIMATION_BATCH_SIZE) {
    const batch = players.slice(i, i + REACTION_ANIMATION_BATCH_SIZE);
    await Promise.all(batch.map(player => player.playOnce?.() || Promise.resolve()));
  }
  state.running = false;
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
    ${showPin && post.pinned ? `<div class="post__pinned"><img class="post__pinned-icon" src="/appimg/pin.svg" alt="" /><span>Р—Р°РєСЂРµРїР»РµРЅРѕ</span></div>` : ''}
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
        return `<img class="post__image${isGif ? ' post__image--gif' : ''}" src="${previewSrc}" data-full-src="${fullSrc}" loading="lazy" decoding="async" alt="" />`;
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
  mountVideoPlayers(el);

  const markTallPost = () => {
    const textEl = el.querySelector('.post__text');
    const footerEl = el.querySelector('.post__footer');
    if (textEl) {
      const lh = parseFloat(getComputedStyle(textEl).lineHeight) || 22;
      if (textEl.offsetHeight > lh * 1.8) el.classList.add('post--text-tall');
      if (isVerified && textEl.offsetHeight > lh * 1.8) el.classList.add('post--verified-tall');
    }
    if (isVerified && footerEl && footerEl.offsetHeight > 44) el.classList.add('post--verified-tall');
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
