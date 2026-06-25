'use strict';

let _threadPostId  = null;
let _threadIsServer = false;
const THREAD_COMMENTS_CACHE_KEY = 'bouston_thread_comments_cache';
const THREAD_COMMENTS_CACHE_LIMIT = 10;

function readThreadCommentsCache() {
  try {
    const raw = JSON.parse(localStorage.getItem(THREAD_COMMENTS_CACHE_KEY) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function getCachedThreadComments(postId) {
  const entry = readThreadCommentsCache().find(item => Number(item.postId) === Number(postId));
  return Array.isArray(entry?.comments) ? entry.comments : null;
}

function saveCachedThreadComments(postId, comments) {
  if (!postId || !Array.isArray(comments)) return;
  const next = readThreadCommentsCache().filter(item => Number(item.postId) !== Number(postId));
  next.unshift({ postId: Number(postId), comments, cachedAt: Date.now() });
  localStorage.setItem(THREAD_COMMENTS_CACHE_KEY, JSON.stringify(next.slice(0, THREAD_COMMENTS_CACHE_LIMIT)));
}

function upsertCachedThreadComment(postId, comment) {
  if (!postId || !comment?.id) return;
  const comments = getCachedThreadComments(postId) || [];
  const index = comments.findIndex(item => Number(item.id) === Number(comment.id));
  if (index >= 0) comments[index] = { ...comments[index], ...comment };
  else comments.push(comment);
  saveCachedThreadComments(postId, comments);
}

function removeCachedThreadComment(postId, commentId) {
  const comments = getCachedThreadComments(postId);
  if (!comments) return;
  saveCachedThreadComments(postId, comments.filter(item => Number(item.id) !== Number(commentId)));
}

function openThread(postId, options = {}) {
  _threadPostId   = postId;
  _threadIsServer = _serverPostsMap.has(postId);
  document.getElementById('thread-overlay').removeAttribute('hidden');
  if (!options.skipRoute) {
    const url = new URL(window.location.href);
    url.pathname = '/feed';
    url.searchParams.set('comments', String(postId));
    history.pushState({ view: 'feed', comments: postId }, '', url.pathname + url.search);
  }
  renderThread();
}

function closeThread(options = {}) {
  document.getElementById('thread-overlay').setAttribute('hidden', '');
  _threadPostId   = null;
  _threadIsServer = false;
  if (!options.skipRoute && window.location.pathname === '/feed' && new URLSearchParams(window.location.search).has('comments')) {
    history.pushState({ view: 'feed' }, '', '/feed');
  }
}

async function openThreadFromRoute(postId) {
  const id = Number(postId);
  if (!id) return;
  if (!_serverPostsMap.has(id)) {
    try {
      const res = await apiFetch(`${API}/posts/${id}`);
      if (res.ok) {
        const post = await res.json();
        registerServerPost(post);
        mergeFeedPostsCache([post]);
      }
    } catch {}
  }
  openThread(id, { skipRoute: true });
}

function renderThread() {
  if (_threadPostId === null) return;

  const profile    = getProfile();
  const avatarSrc  = getProfileAvatarPreview(profile) || '/appimg/default_avatar.png';
  const isVerified = profile.verified === true;
  const badgeHtml  = isVerified
    ? `<img class="post__verified-badge" src="/appimg/verided.svg" alt="verified" />`
    : '';

  let post, postEl;
  if (_threadIsServer) {
    post = _serverPostsMap.get(_threadPostId);
    if (!post) { closeThread(); return; }
    postEl = buildPostEl(post, null, null, false, '', -1, false);
  } else {
    const posts = getPosts();
    post = posts.find(p => p.id === _threadPostId);
    if (!post) { closeThread(); return; }
    postEl = buildPostEl(post, profile, avatarSrc, isVerified, badgeHtml, -1, false);
    if (isVerified) postEl.classList.add('post--verified-tall');
  }

  postEl.querySelectorAll('.btn-comments').forEach(b => b.remove());
  postEl.querySelectorAll('.post__more-wrap').forEach(b => b.remove());

  const threadPost = document.getElementById('thread-post');
  threadPost.innerHTML = '';
  threadPost.appendChild(postEl);

  document.getElementById('thread-compose-avatar').src = avatarSrc;
  renderComments();
}

async function renderComments() {
  const container = document.getElementById('thread-comments');
  container.innerHTML = '<p class="thread-empty">\u0417\u0430\u0433\u0440\u0443\u0437\u043a\u0430...</p>';

  if (_threadIsServer) {
    const cached = getCachedThreadComments(_threadPostId);
    if (cached) {
      container.innerHTML = '';
      if (!cached.length) {
        container.innerHTML = '<p class="thread-empty">\u041a\u043e\u043c\u043c\u0435\u043d\u0442\u0430\u0440\u0438\u0435\u0432 \u043f\u043e\u043a\u0430 \u043d\u0435\u0442</p>';
        return;
      }
      cached.forEach(c => container.appendChild(buildCommentEl(c, true)));
      updateServerCommentCountFromCache(_threadPostId);
      return;
    }

    let comments = [];
    let loaded = false;
    try {
      const res = await apiFetch(`${API}/posts/${_threadPostId}/comments`);
      if (res.ok) {
        comments = await res.json();
        loaded = true;
      }
    } catch {}

    if (loaded) saveCachedThreadComments(_threadPostId, comments);
    container.innerHTML = '';
    if (!comments.length) {
      container.innerHTML = '<p class="thread-empty">\u041a\u043e\u043c\u043c\u0435\u043d\u0442\u0430\u0440\u0438\u0435\u0432 \u043f\u043e\u043a\u0430 \u043d\u0435\u0442</p>';
      return;
    }
    comments.forEach(c => container.appendChild(buildCommentEl(c, true)));
    return;
  }

  const profile    = getProfile();
  const avatarSrc  = getProfileAvatarPreview(profile) || '/appimg/default_avatar.png';
  const isVerified = profile.verified === true;
  const comments   = getComments(_threadPostId);

  container.innerHTML = '';
  if (!comments.length) {
    container.innerHTML = '<p class="thread-empty">\u041a\u043e\u043c\u043c\u0435\u043d\u0442\u0430\u0440\u0438\u0435\u0432 \u043f\u043e\u043a\u0430 \u043d\u0435\u0442</p>';
    return;
  }

  comments.forEach(c => {
    const mapped = {
      id: c.id, text: c.text, createdAt: c.createdAt,
      likesCount: c.likes, myLike: c.liked, isOwn: true,
      author: { displayName: profile.name, avatarUrl: avatarSrc, isVerified },
    };
    container.appendChild(buildCommentEl(mapped, false));
  });
}

function animateRemoveRow(row) {
  const h  = row.offsetHeight;
  const mb = parseInt(getComputedStyle(row).marginBottom) || 0;

  row.style.transition = 'opacity 0.35s ease';
  void row.offsetHeight;
  row.style.opacity = '0';

  row.addEventListener('transitionend', function onFade(e) {
    if (e.propertyName !== 'opacity') return;
    row.removeEventListener('transitionend', onFade);

    row.style.height       = h + 'px';
    row.style.marginBottom = mb + 'px';
    row.style.overflow     = 'hidden';

    void row.offsetHeight;

    row.style.transition   = 'height 0.4s cubic-bezier(0.4, 0, 0.2, 1), margin-bottom 0.4s cubic-bezier(0.4, 0, 0.2, 1)';
    row.style.height       = '0';
    row.style.marginBottom = '0';

    row.addEventListener('transitionend', function onCollapse(e) {
      if (e.propertyName !== 'height') return;
      row.removeEventListener('transitionend', onCollapse);
      row.remove();
    });
  });
}

function buildCommentEl(c, isServer) {
  const row = document.createElement('div');
  row.className = 'comment-row';
  if (c.author?.tgUsername) row.dataset.author = c.author.tgUsername;
  else if (c.isOwn && window._tgUsername) row.dataset.author = window._tgUsername;

  const el = document.createElement('div');
  el.className = 'comment';
  row.appendChild(el);

  const _lp       = c.isOwn ? getProfile() : null;
  const avatarSrc = c.isOwn
    ? (getProfileAvatarPreview(_lp) || c.author.avatarPreviewUrl || getAvatarPreviewSrc(c.author.avatarUrl) || c.author.avatarUrl || '/appimg/default_avatar.png')
    : (c.author.avatarPreviewUrl || getAvatarPreviewSrc(c.author.avatarUrl) || c.author.avatarUrl || '/appimg/default_avatar.png');
  const displayName = c.isOwn ? _lp.name : c.author.displayName;
  const badgeHtml = c.author.isVerified
    ? `<img class="post__verified-badge" src="/appimg/verided.svg" alt="verified" />`
    : '';

  el.innerHTML = `
    <img class="avatar" src="${avatarSrc}" alt="" />
    <div class="comment__body">
      <div class="comment__namerow">
        <span class="comment__name">${escapeHtml(displayName)}</span>
        ${badgeHtml}
        ${c.isOwn ? `<button class="comment__menu-btn" aria-label="Меню"><span></span><span></span><span></span></button>` : ''}
      </div>
      <p class="comment__text">${escapeHtml(c.text)}</p>
      <div class="comment__footer">
        <button class="comment__like ${c.myLike ? 'comment__like--active' : ''}" data-id="${c.id}">
          <img src="/appimg/${c.myLike ? 'like.svg' : 'like_n.svg'}" alt="" />
          ${c.likesCount ? `<span>${c.likesCount}</span>` : ''}
        </button>
        <span class="comment__time">${formatPostTime(c.createdAt)}</span>
      </div>
    </div>
  `;

  if (c.isOwn) {
    const island    = document.createElement('div');
    island.className = 'comment__island';

    const trashBtn  = document.createElement('button');
    trashBtn.className = 'comment__trash-btn';
    trashBtn.innerHTML = `<img src="/appimg/trash.svg" alt="" />`;
    island.appendChild(trashBtn);
    row.appendChild(island);

    el.querySelector('.comment__menu-btn').addEventListener('click', e => {
      e.stopPropagation();
      const isOpen = row.classList.contains('comment-row--open');
      document.querySelectorAll('.comment-row--open').forEach(r => r.classList.remove('comment-row--open'));
      if (!isOpen) row.classList.add('comment-row--open');
    });

    trashBtn.addEventListener('click', async e => {
      e.stopPropagation();
      row.classList.remove('comment-row--open');

      if (isServer) {
        apiFetch(`${API}/posts/${_threadPostId}/comments/${c.id}`, { method: 'DELETE' }).catch(() => {});
        removeCachedThreadComment(_threadPostId, c.id);
        updateServerCommentCountFromCache(_threadPostId);
      } else {
        deleteComment(_threadPostId, c.id);
        refreshCommentCount(_threadPostId);
      }

      animateRemoveRow(row);
    });
  }

  el.querySelector('.comment__like').addEventListener('click', async function () {
    if (isServer) {
      try {
        const res = await apiFetch(`${API}/posts/${_threadPostId}/comments/${c.id}/like`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });
        if (res.ok) {
          const data = await res.json();
          c.myLike     = data.myLike;
          c.likesCount = data.likesCount;
          _applyLikeToBtn(this, c.myLike, c.likesCount);
          upsertCachedThreadComment(_threadPostId, c);
        }
      } catch {}
    } else {
      const updated = toggleCommentLike(_threadPostId, c.id);
      if (!updated) return;
      _applyLikeToBtn(this, updated.liked, updated.likes);
    }
  });

  return row;
}

function appendThreadComment(comment, isServer) {
  const container = document.getElementById('thread-comments');
  if (!container || !comment?.id) return false;
  if (container.querySelector(`.comment__like[data-id="${comment.id}"]`)) return false;
  container.querySelector('.thread-empty')?.remove();
  container.appendChild(buildCommentEl(comment, isServer));
  if (isServer && _threadPostId !== null) upsertCachedThreadComment(_threadPostId, comment);
  container.scrollTop = container.scrollHeight;
  return true;
}

function removeThreadCommentEl(commentId) {
  const btn = document.querySelector(`.comment__like[data-id="${commentId}"]`);
  btn?.closest('.comment-row')?.remove();
}

function _applyLikeToBtn(btn, liked, count) {
  const icon    = btn.querySelector('img');
  let   countEl = btn.querySelector('span');
  if (icon) icon.src = `/appimg/${liked ? 'like.svg' : 'like_n.svg'}`;
  btn.classList.toggle('comment__like--active', liked);
  if (count) {
    if (countEl) countEl.textContent = count;
    else { const s = document.createElement('span'); s.textContent = count; btn.appendChild(s); }
  } else if (countEl) countEl.remove();
}

function _updateCommentCountEl(btn, count) {
  const countEl = btn.querySelector('.btn-comments__count');
  if (count) {
    if (countEl) countEl.textContent = count;
    else {
      const span = document.createElement('span');
      span.className = 'btn-comments__count';
      span.textContent = count;
      btn.appendChild(span);
    }
  } else if (countEl) countEl.remove();
}

function refreshCommentCount(postId) {
  document.querySelectorAll('.btn-comments').forEach(btn => {
    if (Number(btn.dataset.thread) === postId) _updateCommentCountEl(btn, getComments(postId).length);
  });
}

function updateServerCommentCountFromCache(postId) {
  const comments = getCachedThreadComments(postId);
  if (!comments) return;
  document.querySelectorAll('.btn-comments').forEach(btn => {
    if (Number(btn.dataset.thread) === Number(postId)) _updateCommentCountEl(btn, comments.length);
  });
}

function handleNewCommentEvent(data) {
  const postId = Number(data.postId);
  const comment = data.comment;
  if (!postId || !comment) return;

  const post = _serverPostsMap.get(postId) || {
    isOwn: data.postOwner === window._tgUsername,
    author: { tgUsername: data.postOwner },
  };
  comment.isOwn = comment.author?.tgUsername === window._tgUsername;
  notifyAboutComment(post, comment);

  if (_threadIsServer && Number(_threadPostId) === postId) {
    appendThreadComment(comment, true);
  } else {
    upsertCachedThreadComment(postId, comment);
  }

  updateServerCommentCountFromCache(postId);
}

document.addEventListener('click', e => {
  const btn = e.target.closest('.btn-comments[data-thread]');
  if (btn) openThread(Number(btn.dataset.thread));
});

document.getElementById('thread-back').addEventListener('click', closeThread);

document.getElementById('thread-overlay').addEventListener('click', e => {
  if (e.target === document.getElementById('thread-overlay')) closeThread();
});

function syncThreadComposeInput() {
  const input = document.getElementById('thread-compose-input');
  const field = document.getElementById('thread-compose-field');
  const compose = input.closest('.thread-panel__compose');
  const hasValue = input.value.length > 0;

  input.style.height = '40px';
  const nextHeight = Math.min(input.scrollHeight, 120);
  const multiline = hasValue && (input.value.includes('\n') || nextHeight > 40);

  if (multiline) {
    input.style.height = `${nextHeight}px`;
  } else {
    input.style.height = '40px';
  }

  field?.classList.toggle('has-value', hasValue);
  field?.classList.toggle('multiline', multiline);
  compose?.classList.toggle('multiline', multiline);
}

let _threadPosting = false;
let _threadCooldownTimer = null;
const _pendingThreadCommentRetries = new Map();

function startThreadSendCooldown(btn, seconds = 5) {
  if (!btn) return;
  if (_threadCooldownTimer) clearInterval(_threadCooldownTimer);
  if (!btn.dataset.idleHtml) btn.dataset.idleHtml = btn.innerHTML;
  let secs = seconds;
  btn.disabled = true;
  btn.classList.add('thread-compose__btn--cooldown');
  btn.textContent = String(secs);
  _threadCooldownTimer = setInterval(() => {
    secs--;
    if (secs <= 0) {
      clearInterval(_threadCooldownTimer);
      _threadCooldownTimer = null;
      btn.classList.remove('thread-compose__btn--cooldown');
      btn.innerHTML = btn.dataset.idleHtml || '<img src="/appimg/up.svg" alt="" />';
      delete btn.dataset.idleHtml;
      btn.disabled = false;
      return;
    }
    btn.textContent = String(secs);
  }, 1000);
}

function getThreadRetryDelay() {
  const ms = typeof getApiRateLimitRemainingMs === 'function' ? getApiRateLimitRemainingMs() : 0;
  return Math.max(5000, ms || 5000);
}

function scheduleThreadCommentRetry(postId, tempComment, text) {
  const key = String(tempComment.id);
  if (_pendingThreadCommentRetries.has(key)) clearTimeout(_pendingThreadCommentRetries.get(key));
  const delay = getThreadRetryDelay();
  const timer = setTimeout(() => {
    _pendingThreadCommentRetries.delete(key);
    sendPendingThreadComment(postId, tempComment, text);
  }, delay);
  _pendingThreadCommentRetries.set(key, timer);
}

async function sendPendingThreadComment(postId, tempComment, text) {
  try {
    const res = await apiFetch(`${API}/posts/${postId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (res.status === 429) {
      scheduleThreadCommentRetry(postId, tempComment, text);
      return;
    }
    if (!res.ok) throw new Error('comment failed');
    const newComment = await res.json();
    removeThreadCommentEl(tempComment.id);
    removeCachedThreadComment(postId, tempComment.id);
    appendThreadComment(newComment, true);
    notifyAboutComment(_serverPostsMap.get(postId), newComment);
    updateServerCommentCountFromCache(postId);
  } catch (err) {
    if (err.status === 429 || err.message === 'rate_limited') {
      scheduleThreadCommentRetry(postId, tempComment, text);
      return;
    }
    removeThreadCommentEl(tempComment.id);
    removeCachedThreadComment(postId, tempComment.id);
    updateServerCommentCountFromCache(postId);
  }
}

async function submitThreadComment() {
  if (_threadCooldownTimer) return;
  if (_threadPosting) return;
  const input = document.getElementById('thread-compose-input');
  const text  = input.value.trim();
  if (!text || _threadPostId === null) return;
  if (_threadIsServer && !window._tgUsername) return;

  const btn = document.getElementById('thread-btn-post');
  _threadPosting = true;
  startThreadSendCooldown(btn, 5);

  const container = document.getElementById('thread-comments');
  const profile = getProfile();
  const tempComment = {
    id: Date.now(),
    text,
    createdAt: Date.now(),
    likesCount: 0,
    myLike: false,
    isOwn: true,
    pending: true,
    author: {
      displayName: profile.name,
      avatarUrl: profile.avatar || '/appimg/default_avatar.png',
      avatarPreviewUrl: getProfileAvatarPreview(profile) || '/appimg/default_avatar.png',
      isVerified: profile.verified === true,
    },
  };
  input.value = '';
  syncThreadComposeInput();
  appendThreadComment(tempComment, _threadIsServer);
  if (_threadIsServer) updateServerCommentCountFromCache(_threadPostId);
  else refreshCommentCount(_threadPostId);

  try {
    if (_threadIsServer) {
      await sendPendingThreadComment(_threadPostId, tempComment, text);
    } else {
      saveComment(_threadPostId, text);
      refreshCommentCount(_threadPostId);
    }
  } catch {
    removeThreadCommentEl(tempComment.id);
    if (_threadIsServer) {
      removeCachedThreadComment(_threadPostId, tempComment.id);
      updateServerCommentCountFromCache(_threadPostId);
    } else {
      refreshCommentCount(_threadPostId);
    }
  } finally {
    _threadPosting = false;
  }
}

const threadPostBtn = document.getElementById('thread-btn-post');
threadPostBtn.addEventListener('click', submitThreadComment);
threadPostBtn.addEventListener('pointerup', e => {
  if (e.pointerType !== 'touch') return;
  e.preventDefault();
  submitThreadComment();
});
threadPostBtn.addEventListener('touchend', e => {
  e.preventDefault();
  submitThreadComment();
}, { passive: false });

document.getElementById('thread-compose-input').addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    submitThreadComment();
  }
});

document.getElementById('thread-compose-input').addEventListener('input', function () {
  syncThreadComposeInput();
});

syncThreadComposeInput();

document.addEventListener('click', () => {
  document.querySelectorAll('.comment-row--open').forEach(r => r.classList.remove('comment-row--open'));
});
