'use strict';

const _feedEl = document.getElementById('feed');

function renderFeedComposeAvatar() {
  const el = document.getElementById('feed-compose-avatar');
  if (el) el.src = getProfile().avatar || '../../img/logo_blue.png';
}

function renderFeedPosts() {
  closeAllMenus();
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

  let lastDateKey = null;
  posts.forEach((post, i) => {
    const ts = post.createdAt || post.id;
    const dateKey = getDateKey(ts);
    if (dateKey !== lastDateKey) {
      container.appendChild(buildDateSeparator(ts));
      lastDateKey = dateKey;
    }
    const el = buildPostEl(post, profile, avatarSrc, isVerified, badgeHtml, i, false);
    container.appendChild(el);
  });

  container.querySelectorAll('.post__more-wrap').forEach(wrap => {
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

document.getElementById('feed-btn-post').addEventListener('click', () => {
  const input = document.getElementById('feed-compose-input');
  const text  = input.value.trim();
  if (!text) return;
  const now = Date.now();
  const posts = getPosts();
  posts.unshift({ id: now, text, likes: 0, liked: false, createdAt: now });
  savePosts(posts);
  input.value = '';
  input.style.height = 'auto';
  renderFeedPosts();
});

document.getElementById('feed-compose-input').addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    document.getElementById('feed-btn-post').click();
  }
});
document.getElementById('feed-compose-input').addEventListener('input', function () {
  this.style.height = 'auto';
  this.style.height = this.scrollHeight + 'px';
});
