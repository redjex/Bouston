'use strict';

const _feedEl = document.getElementById('feed');

function renderFeedComposeAvatar() {
  const el = document.getElementById('feed-compose-avatar');
  if (el) el.src = getProfile().avatar || '../../img/logo_blue.png';
}

const FEED_PAGE = 5;
let _feedObserver = null;

function attachFeedMenu(container) {
  const profile = getProfile();
  const isVerified = profile.verified === true;
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

function renderFeedPosts() {
  closeAllMenus();
  if (_feedObserver) { _feedObserver.disconnect(); _feedObserver = null; }

  const container = document.getElementById('posts-container');
  const profile   = getProfile();
  const posts     = getPosts();

  if (!posts.length) {
    container.innerHTML = '<p class="feed__empty">Постов пока нет — напишите первый!</p>';
    return;
  }

  container.innerHTML = '';
  const avatarSrc  = profile.avatar || '../../img/logo_blue.png';
  const isVerified = profile.verified === true;
  const badgeHtml  = isVerified
    ? `<img class="post__verified-badge" src="../../img/verided.svg" alt="verified" />`
    : '';

  let rendered = 0;
  let lastDateKey = null;

  function renderBatch() {
    const batch = posts.slice(rendered, rendered + FEED_PAGE);
    batch.forEach((post, i) => {
      const ts = post.createdAt || post.id;
      const dateKey = getDateKey(ts);
      if (dateKey !== lastDateKey) {
        container.appendChild(buildDateSeparator(ts));
        lastDateKey = dateKey;
      }
      container.appendChild(buildPostEl(post, profile, avatarSrc, isVerified, badgeHtml, rendered + i, false));
    });
    rendered += batch.length;
    attachFeedMenu(container);

    const sentinel = container.querySelector('.feed-sentinel');
    if (sentinel) sentinel.remove();

    if (rendered < posts.length) {
      const s = document.createElement('div');
      s.className = 'feed-sentinel';
      container.appendChild(s);
      _feedObserver = new IntersectionObserver(([e]) => {
        if (e.isIntersecting) { _feedObserver.disconnect(); renderBatch(); }
      }, { rootMargin: '200px' });
      _feedObserver.observe(s);
    }
  }

  renderBatch();
}

document.getElementById('feed-btn-post').addEventListener('click', () => {
  const text   = getComposeText('feed-compose-input').trim();
  const images = getComposeImages('feed');
  if (!text && !images.length) return;
  const now = Date.now();
  const posts = getPosts();
  posts.unshift({ id: now, text, images, likes: 0, liked: false, createdAt: now });
  savePosts(posts);
  clearComposeInput('feed-compose-input');
  clearComposeImages('feed');
  renderFeedPosts();
});

document.getElementById('feed-compose-input').addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    document.getElementById('feed-btn-post').click();
  }
});
