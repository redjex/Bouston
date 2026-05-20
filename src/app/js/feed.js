'use strict';

const _feedEl = document.getElementById('feed');

function renderFeedComposeAvatar() {
  const el = document.getElementById('feed-compose-avatar');
  if (el) el.src = getProfile().avatar || '../../img/default_avatar.png';
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
  const u = window._tgUsername || '';
  const res = await fetch(`${API}/posts?viewer=${encodeURIComponent(u)}&page=${page}&limit=${FEED_PAGE}`);
  if (!res.ok) throw new Error('fetch failed');
  return res.json();
}

async function renderFeedPosts() {
  closeAllMenus();
  if (_feedObserver) { _feedObserver.disconnect(); _feedObserver = null; }
  _feedPage   = 1;
  _feedDone   = false;
  _feedLoading = false;

  const container = document.getElementById('posts-container');
  container.innerHTML = '<p class="feed__empty">Загрузка...</p>';

  let posts;
  try { posts = await fetchFeedPage(1); }
  catch { container.innerHTML = '<p class="feed__empty">Нет соединения с сервером</p>'; return; }

  if (!posts.length) {
    container.innerHTML = '<p class="feed__empty">Постов пока нет — напишите первый!</p>';
    return;
  }

  container.innerHTML = '';
  posts.forEach(p => registerServerPost(p));
  _appendPostsToFeed(container, posts, false);
  _feedPage = 2;
  if (posts.length < FEED_PAGE) { _feedDone = true; return; }
  _attachFeedSentinel(container);
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
      _appendPostsToFeed(container, posts, true);
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

  // Не дублируем пост если он уже отрисован
  if (document.querySelector(`.post[data-post-id="${post.id}"]`)) return;

  post.isOwn = post.author?.tgUsername === window._tgUsername;
  registerServerPost(post);

  const postEl = buildPostEl(post, null, null, false, '', 0, false);
  postEl.classList.remove('post--enter');

  const todayKey = getDateKey(post.createdAt || post.id);
  const firstChild = container.firstElementChild;

  if (firstChild && firstChild.classList.contains('date-separator')) {
    const firstPost = container.querySelector('.post[data-post-id]');
    const firstPostTs = firstPost ? (_serverPostsMap.get(Number(firstPost.dataset.postId))?.createdAt || 0) : 0;
    const existingKey = firstPostTs ? getDateKey(firstPostTs) : null;
    if (existingKey === todayKey) {
      // Уже есть разделитель за сегодня — вставляем пост после него
      firstChild.after(postEl);
    } else {
      // Разделитель другого дня — вставляем свой разделитель + пост в начало
      container.prepend(postEl);
      container.prepend(buildDateSeparator(post.createdAt || post.id));
    }
  } else {
    // Нет разделителей вообще (пустой фид или только текст загрузки)
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
        tg_username: u,
        text,
        images: images.map(m => m.src),
      }),
    });
    if (res.status === 413) throw new Error('Файлы слишком большие, уменьши размер медиа');
    if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.detail || 'Ошибка сервера'); }

    clearComposeInput('feed-compose-input');
    clearComposeImages('feed');
    renderFeedPosts();
  } catch (err) {
    if (err.message === 'unauthorized') return;
    showPostError(err.message, btn);
  } finally {
    // Кнопку разблокирует showPostError (при кулдауне) или сразу здесь
    if (!btn.textContent.match(/^\d+с$/)) btn.disabled = false;
  }
});

document.getElementById('feed-compose-input').addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    document.getElementById('feed-btn-post').click();
  }
});
