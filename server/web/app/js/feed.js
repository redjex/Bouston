'use strict';

const _feedEl = document.getElementById('feed');

function renderFeedComposeAvatar() {
  const el = document.getElementById('feed-compose-avatar');
  const p = getProfile();
  if (el) el.src = getProfileAvatarPreview(p) || '/appimg/default_avatar.png';
}

const FEED_PAGE = 10;
let _feedObserver = null;
let _feedPage     = 1;
let _feedLoading  = false;
let _feedDone     = false;
let _feedRendered = false;
let _feedRefreshPromise = null;
let _feedGapFillPromise = null;
let _feedRenderToken = 0;

function renderPostSkeletons(container, count = 4) {
  container.innerHTML = '';
  container.dataset.lastDateKey = '';
  for (let i = 0; i < count; i++) {
    const skeleton = document.createElement('div');
    skeleton.className = 'post-skeleton';
    skeleton.innerHTML = `
      <div class="post-skeleton__header">
        <span class="post-skeleton__avatar"></span>
        <span class="post-skeleton__meta">
          <span class="post-skeleton__line post-skeleton__line--name"></span>
          <span class="post-skeleton__line post-skeleton__line--handle"></span>
        </span>
      </div>
      <span class="post-skeleton__line post-skeleton__line--wide"></span>
      <span class="post-skeleton__line post-skeleton__line--mid"></span>
      <div class="post-skeleton__footer">
        <span class="post-skeleton__pill"></span>
        <span class="post-skeleton__pill post-skeleton__pill--small"></span>
      </div>
    `;
    container.appendChild(skeleton);
  }
}

function runWhenIdle(fn, timeout = 600) {
  if ('requestIdleCallback' in window) {
    requestIdleCallback(fn, { timeout });
    return;
  }
  setTimeout(fn, 32);
}

function waitForIdle(timeout = 900) {
  return new Promise(resolve => runWhenIdle(resolve, timeout));
}

function attachFeedMenu(container) {
  container.querySelectorAll('.post__more-wrap:not([data-bound])').forEach(wrap => {
    wrap.dataset.bound = '1';
    const btn    = wrap.querySelector('.post__more');
    const id     = Number(btn.dataset.id);
    const postEl = wrap.closest('.post');
    wrap.addEventListener('click', e => {
      e.stopPropagation();
      if (_openMenuId === id) { closeAllMenus(); return; }
      openPostMenu(id, postEl, _feedEl, [
        { src: '/appimg/trash.svg', action: () => { closeAllMenus(); deletePost(id, renderFeedPosts); } },
        { src: '/appimg/edit.svg',  action: () => { closeAllMenus(); startEditPost(id, postEl, renderFeedPosts); } },
        { src: '/appimg/close.svg', action: () => closeAllMenus() },
      ]);
    });
  });
}

async function fetchFeedPage(page) {
  const res = await apiFetch(`${API}/posts?page=${page}&limit=${FEED_PAGE}`);
  if (!res.ok) throw new Error('fetch failed');
  return res.json();
}

async function renderFeedPosts() {
  closeAllMenus();
  const container = document.getElementById('posts-container');

  if (_feedRendered && container.querySelector('.post[data-post-id]')) {
    refreshFeedFromServer(container);
    return;
  }

  if (_feedObserver) { _feedObserver.disconnect(); _feedObserver = null; }
  _feedPage    = 1;
  _feedDone    = false;
  _feedLoading = false;

  const cached = getFeedPostsCache();
  if (cached.length) {
    _renderFeedPostsList(container, cached);
    _feedRendered = true;
    _feedPage = 1;
    if (cached.length >= FEED_PAGE) _attachFeedSentinel(container);
  } else {
    renderPostSkeletons(container, 4);
  }

  await refreshFeedFromServer(container, { allowInitialRender: true, hadCache: !!cached.length });
}

async function refreshFeedFromServer(container, options = {}) {
  if (_feedRefreshPromise) return _feedRefreshPromise;

  _feedRefreshPromise = (async () => {
    let posts;
    try { posts = await fetchFeedPage(1); }
    catch {
      if (!options.hadCache && !container.querySelector('.post[data-post-id]')) {
        container.innerHTML = '<p class="feed__empty">Нет соединения с сервером</p>';
      }
      return;
    }

    if (!posts.length) {
      reconcileFeedPostsCache(posts, FEED_PAGE);
      handleDeletedPostsMissingFromDom(container);
      if (!options.hadCache && !container.querySelector('.post[data-post-id]')) {
        container.innerHTML = '<p class="feed__empty">Постов пока нет - напишите первый!</p>';
      }
      return;
    }

    const merged = reconcileFeedPostsCache(posts, FEED_PAGE);
    handleDeletedPostsMissingFromDom(container);
    if (options.allowInitialRender && !options.hadCache) {
      _renderFeedPostsList(container, merged);
    } else {
      posts.forEach(p => registerServerPost(p));
      renderFeedIfMissingPosts(container, merged);
    }
    _feedRendered = true;
    _feedPage = 2;
    if (posts.length < FEED_PAGE) { _feedDone = true; return; }
    const cachedPageCount = Math.min(3, Math.max(1, Math.ceil(getFeedPostsCache().length / FEED_PAGE)));
    fillFeedGapsFromServer(container, 2, cachedPageCount);
    if (!container.querySelector('.feed-sentinel')) _attachFeedSentinel(container);
  })().finally(() => { _feedRefreshPromise = null; });

  return _feedRefreshPromise;
}

function _renderFeedPostsList(container, posts) {
  const token = ++_feedRenderToken;
  if (_feedObserver) { _feedObserver.disconnect(); _feedObserver = null; }
  container.innerHTML = '';
  container.dataset.lastDateKey = '';
  const first = posts.slice(0, FEED_PAGE);
  const rest = posts.slice(FEED_PAGE);
  first.forEach(p => registerServerPost(p));
  _appendPostsToFeed(container, first, false);
  appendFeedPostsInChunks(container, rest, token);
}

function appendFeedPostsInChunks(container, posts, token) {
  if (!posts.length) return;
  let index = 0;
  const chunkSize = 5;
  const appendChunk = () => {
    if (!container.isConnected || token !== _feedRenderToken) return;
    const chunk = posts.slice(index, index + chunkSize)
      .filter(post => !container.querySelector(`.post[data-post-id="${post.id}"]`));
    chunk.forEach(p => registerServerPost(p));
    _appendPostsToFeed(container, chunk, true);
    index += chunkSize;
    if (index < posts.length) runWhenIdle(appendChunk);
  };
  runWhenIdle(appendChunk);
}

function renderFeedIfMissingPosts(container, posts) {
  syncFeedPostsIntoDom(container, posts);
}

function findFeedPostEl(container, id) {
  return container.querySelector(`.post[data-post-id="${id}"]`);
}

async function fillFeedGapsFromServer(container, startPage, maxPage) {
  if (_feedGapFillPromise || startPage > maxPage || _feedDone) return _feedGapFillPromise;

  _feedGapFillPromise = (async () => {
    for (let page = startPage; page <= maxPage; page++) {
      if (!container.isConnected || _feedDone) break;
      let posts;
      try { posts = await fetchFeedPage(page); }
      catch { break; }
      if (!posts.length) { _feedDone = true; break; }
      posts.forEach(p => registerServerPost(p));
      const merged = mergeFeedPostsCache(posts);
      syncFeedPostsIntoDom(container, merged);
      _feedPage = Math.max(_feedPage, page + 1);
      if (posts.length < FEED_PAGE) { _feedDone = true; break; }
      await waitForIdle(1200);
    }
    if (!_feedDone && !container.querySelector('.feed-sentinel')) _attachFeedSentinel(container);
  })().finally(() => { _feedGapFillPromise = null; });

  return _feedGapFillPromise;
}

function handleDeletedPostsMissingFromDom(container) {
  const cachedIds = new Set(getFeedPostsCache().map(post => Number(post.id)));
  container.querySelectorAll('.post[data-post-id]').forEach(postEl => {
    if (!cachedIds.has(Number(postEl.dataset.postId))) removePostElWithSeparator(postEl);
  });
}

function syncFeedPostsIntoDom(container, posts) {
  const missing = [];

  posts.forEach(post => {
    registerServerPost(post);
    if (!findFeedPostEl(container, post.id)) missing.push(post);
  });

  if (!missing.length) return;

  container.querySelector('.feed__empty')?.remove();
  container.querySelectorAll('.post-skeleton').forEach(el => el.remove());

  missing.forEach(post => {
    const postEl = buildPostEl(post, null, null, false, '', 0, false);
    postEl.classList.remove('post--enter');

    const postIndex = posts.findIndex(item => Number(item.id) === Number(post.id));
    const nextPostEl = posts
      .slice(postIndex + 1)
      .map(item => findFeedPostEl(container, item.id))
      .find(Boolean);
    const sentinel = container.querySelector('.feed-sentinel');

    if (nextPostEl) container.insertBefore(postEl, nextPostEl);
    else if (sentinel) container.insertBefore(postEl, sentinel);
    else container.appendChild(postEl);
  });

  normalizeFeedDateSeparators(container);
  attachFeedMenu(container);
}

function normalizeFeedDateSeparators(container) {
  container.querySelectorAll('.date-separator').forEach(el => el.remove());
  let lastDateKey = null;

  container.querySelectorAll('.post[data-post-id]').forEach(postEl => {
    const id = Number(postEl.dataset.postId);
    const post = _serverPostsMap.get(id);
    const ts = post?.createdAt || id;
    const dateKey = getDateKey(ts);

    if (dateKey !== lastDateKey) {
      container.insertBefore(buildDateSeparator(ts), postEl);
      lastDateKey = dateKey;
    }
  });

  container.dataset.lastDateKey = lastDateKey || '';
}

function _appendPostsToFeed(container, posts, append) {
  let lastDateKey = append ? (container.dataset.lastDateKey || null) : null;

  posts.forEach((post, i) => {
    const ts = post.createdAt || post.id;
    const dateKey = getDateKey(ts);
    if (dateKey !== lastDateKey) {
      container.appendChild(buildDateSeparator(ts));
      lastDateKey = dateKey;
    }
    container.appendChild(buildPostEl(post, null, null, false, '', i, false));
  });

  container.dataset.lastDateKey = lastDateKey || '';
  attachFeedMenu(container);
}

function _attachFeedSentinel(container) {
  const sentinel = container.querySelector('.feed-sentinel');
  if (sentinel) sentinel.remove();

  const s = document.createElement('div');
  s.className = 'feed-sentinel';
  container.appendChild(s);
  _feedObserver = new IntersectionObserver(async ([e]) => {
    if (!e.isIntersecting || _feedLoading || _feedDone) return;
    _feedLoading = true;
    _feedObserver.disconnect();
    s.remove();
    try {
      const page = _feedPage;
      const posts = await fetchFeedPage(page);
      posts.forEach(p => registerServerPost(p));
      const merged = mergeFeedPostsCache(posts);
      syncFeedPostsIntoDom(container, merged);
      _feedPage = page + 1;
      if (posts.length < FEED_PAGE) { _feedDone = true; }
      else _attachFeedSentinel(container);
    } catch {}
    _feedLoading = false;
  }, { rootMargin: '200px' });
  _feedObserver.observe(s);
}

function prependPostToFeed(post) {
  const container = document.getElementById('posts-container');
  if (!container) return;
  post.isOwn = post.author?.tgUsername === window._tgUsername;
  registerServerPost(post);
  notifyAboutPostMention(post);
  const merged = mergeFeedPostsCache([post]);
  if (container.querySelector('.post[data-post-id]')) {
    syncFeedPostsIntoDom(container, merged);
  } else {
    _renderFeedPostsList(container, merged);
  }
  _feedRendered = true;
}

function setButtonBusy(btn, busy, text = 'Загрузка...') {
  if (!btn) return;
  if (busy) {
    if (!btn.dataset.idleText) btn.dataset.idleText = btn.textContent || 'Выставить';
    btn.textContent = text;
    btn.classList.add('btn-post--loading');
    btn.disabled = true;
    return;
  }
  if (typeof restorePostButton === 'function') restorePostButton(btn, btn.dataset.idleText || 'Выставить');
  else {
    btn.textContent = btn.dataset.idleText || 'Выставить';
    delete btn.dataset.idleText;
    btn.classList.remove('btn-post--loading');
    btn.disabled = false;
  }
}

document.getElementById('feed-btn-post').addEventListener('click', async () => {
  const text   = getComposeText('feed-compose-input').trim();
  const images = getComposeImages('feed');
  const replyToPostId = getComposeReplyTargetId('feed');
  if (!text && !images.length) return;

  const btn = document.getElementById('feed-btn-post');
  setButtonBusy(btn, true, 'Публикация...');

  try {
    const res = await apiFetch(`${API}/posts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, images: images.map(m => m.src), replyToPostId }),
    });
    if (res.status === 413) throw new Error('Файлы слишком большие, уменьши размер медиа');
    if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.detail || 'Ошибка сервера'); }

    const post = await res.json();
    clearComposeInput('feed-compose-input');
    clearComposeImages('feed');
    clearComposeReplyTarget('feed');
    prependPostToFeed(post);
  } catch (err) {
    if (err.message === 'unauthorized') return;
    showPostError(err.message, btn);
  } finally {
    if (!btn.dataset.cooldownTimer) setButtonBusy(btn, false);
  }
});

document.getElementById('feed-compose-input').addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    document.getElementById('feed-btn-post').click();
  }
});
