'use strict';

const _feedEl = document.getElementById('feed');

function renderFeedComposeAvatar() {
  const el = document.getElementById('feed-compose-avatar');
  const p = getProfile();
  if (el) el.src = getProfileAvatarPreview(p) || '../../img/default_avatar.png';
}

const FEED_PAGE = 20;
let _feedObserver = null;
let _feedPage     = 1;
let _feedLoading  = false;
let _feedDone     = false;

function attachFeedMenu(container) {
  container.querySelectorAll('.post__more-wrap:not([data-bound])').forEach(wrap => {
    wrap.dataset.bound = '1';
    const btn    = wrap.querySelector('.post__more');
    const id     = Number(btn.dataset.id);
    const postEl = wrap.closest('.post');
    btn.addEventListener('click', e => {
      e.stopPropagation();
      if (_openMenuId === id) { closeAllMenus(); return; }
      openPostMenu(id, postEl, _feedEl, [
        { src: '../../img/trash.svg', action: () => { closeAllMenus(); deletePost(id, renderFeedPosts); } },
        { src: '../../img/edit.svg',  action: () => { closeAllMenus(); startEditPost(id, postEl, renderFeedPosts); } },
        { src: '../../img/close.svg', action: () => closeAllMenus() },
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
  if (_feedObserver) { _feedObserver.disconnect(); _feedObserver = null; }
  _feedPage    = 1;
  _feedDone    = false;
  _feedLoading = false;

  const container = document.getElementById('posts-container');
  const cached = getFeedPostsCache();
  if (cached.length) {
    _renderFeedPostsList(container, cached);
    _feedPage = Math.floor(cached.length / FEED_PAGE) + 1;
    if (cached.length >= FEED_PAGE) _attachFeedSentinel(container);
  } else {
    container.innerHTML = '<p class="feed__empty">Загрузка...</p>';
  }

  let posts;
  try { posts = await fetchFeedPage(1); }
  catch {
    if (!cached.length) container.innerHTML = '<p class="feed__empty">Нет соединения с сервером</p>';
    return;
  }

  if (!posts.length) {
    if (!cached.length) container.innerHTML = '<p class="feed__empty">Постов пока нет - напишите первый!</p>';
    return;
  }

  const merged = mergeFeedPostsCache(posts);
  _renderFeedPostsList(container, merged);
  _feedPage = Math.floor(merged.length / FEED_PAGE) + 1;
  if (posts.length < FEED_PAGE) { _feedDone = true; return; }
  _attachFeedSentinel(container);
}

function _renderFeedPostsList(container, posts) {
  if (_feedObserver) { _feedObserver.disconnect(); _feedObserver = null; }
  container.innerHTML = '';
  container.dataset.lastDateKey = '';
  posts.forEach(p => registerServerPost(p));
  _appendPostsToFeed(container, posts, false);
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
      const posts = await fetchFeedPage(_feedPage);
      posts.forEach(p => registerServerPost(p));
      mergeFeedPostsCache(posts);
      const freshPosts = posts.filter(p => !container.querySelector(`.post[data-post-id="${p.id}"]`));
      _appendPostsToFeed(container, freshPosts, true);
      _feedPage++;
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
  if (document.querySelector(`.post[data-post-id="${post.id}"]`)) return;

  post.isOwn = post.author?.tgUsername === window._tgUsername;
  registerServerPost(post);
  mergeFeedPostsCache([post]);

  const postEl = buildPostEl(post, null, null, false, '', 0, false);
  postEl.classList.remove('post--enter');

  const todayKey = getDateKey(post.createdAt || post.id);
  const firstChild = container.firstElementChild;

  if (firstChild && firstChild.classList.contains('date-separator')) {
    const firstPost = container.querySelector('.post[data-post-id]');
    const firstPostTs = firstPost ? (_serverPostsMap.get(Number(firstPost.dataset.postId))?.createdAt || 0) : 0;
    const existingKey = firstPostTs ? getDateKey(firstPostTs) : null;
    if (existingKey === todayKey) {
      firstChild.after(postEl);
    } else {
      container.prepend(postEl);
      container.prepend(buildDateSeparator(post.createdAt || post.id));
    }
  } else {
    const emptyEl = container.querySelector('.feed__empty');
    if (emptyEl) emptyEl.remove();
    container.prepend(postEl);
    container.prepend(buildDateSeparator(post.createdAt || post.id));
  }

  attachFeedMenu(container);
}

document.getElementById('feed-btn-post').addEventListener('click', async () => {
  const text   = getComposeText('feed-compose-input').trim();
  const images = getComposeImages('feed');
  if (!text && !images.length) return;

  const btn = document.getElementById('feed-btn-post');
  btn.disabled = true;

  try {
    const u = window._tgUsername;
    if (!u) throw new Error('not logged in');

    const res = await apiFetch(`${API}/posts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        images: images.map(m => m.src),
      }),
    });
    if (res.status === 413) throw new Error('Файлы слишком большие, уменьши размер медиа');
    if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.detail || 'Ошибка сервера'); }

    const post = await res.json();
    clearComposeInput('feed-compose-input');
    clearComposeImages('feed');
    prependPostToFeed(post);
  } catch (err) {
    if (err.message === 'unauthorized') return;
    showPostError(err.message, btn);
  } finally {
    if (!btn.textContent.match(/^\d+с$/)) btn.disabled = false;
  }
});

document.getElementById('feed-compose-input').addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    document.getElementById('feed-btn-post').click();
  }
});
