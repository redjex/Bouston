'use strict';

let _threadPostId  = null;
let _threadIsServer = false;

function openThread(postId) {
  _threadPostId   = postId;
  _threadIsServer = _serverPostsMap.has(postId);
  document.getElementById('thread-overlay').removeAttribute('hidden');
  renderThread();
}

function closeThread() {
  document.getElementById('thread-overlay').setAttribute('hidden', '');
  _threadPostId   = null;
  _threadIsServer = false;
}

function renderThread() {
  if (_threadPostId === null) return;

  const profile    = getProfile();
  const avatarSrc  = profile.avatar || '../../img/default_avatar.png';
  const isVerified = profile.verified === true;
  const badgeHtml  = isVerified
    ? `<img class="post__verified-badge" src="../../img/verided.svg" alt="verified" />`
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
  container.innerHTML = '<p class="thread-empty">Загрузка...</p>';

  if (_threadIsServer) {
    const u = window._tgUsername || '';
    let comments = [];
    try {
      const res = await fetch(`${API}/posts/${_threadPostId}/comments?viewer=${encodeURIComponent(u)}`);
      if (res.ok) comments = await res.json();
    } catch {}

    container.innerHTML = '';
    if (!comments.length) {
      container.innerHTML = '<p class="thread-empty">Комментариев пока нет</p>';
      return;
    }
    comments.forEach(c => container.appendChild(buildCommentEl(c, true)));
    return;
  }

  // local post
  const profile    = getProfile();
  const avatarSrc  = profile.avatar || '../../img/default_avatar.png';
  const isVerified = profile.verified === true;
  const comments   = getComments(_threadPostId);

  container.innerHTML = '';
  if (!comments.length) {
    container.innerHTML = '<p class="thread-empty">Комментариев пока нет</p>';
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

function buildCommentEl(c, isServer) {
  const el = document.createElement('div');
  el.className = 'comment';
  const avatarSrc = c.author.avatarUrl || '../../img/default_avatar.png';
  const badgeHtml = c.author.isVerified
    ? `<img class="post__verified-badge" src="../../img/verided.svg" alt="verified" />`
    : '';

  el.innerHTML = `
    <img class="avatar" src="${avatarSrc}" alt="" />
    <div class="comment__body">
      <div class="comment__namerow">
        <span class="comment__name">${escapeHtml(c.author.displayName)}</span>
        ${badgeHtml}
        <span class="comment__time">${formatPostTime(c.createdAt)}</span>
        ${c.isOwn ? `<button class="comment__delete" data-id="${c.id}">
          <img src="../../img/close.svg" alt="" />
        </button>` : ''}
      </div>
      <p class="comment__text">${escapeHtml(c.text)}</p>
      <div class="comment__footer">
        <button class="comment__like ${c.myLike ? 'comment__like--active' : ''}" data-id="${c.id}">
          <img src="../../img/${c.myLike ? 'like.svg' : 'like_n.svg'}" alt="" />
          ${c.likesCount ? `<span>${c.likesCount}</span>` : ''}
        </button>
      </div>
    </div>
  `;

  const deleteBtn = el.querySelector('.comment__delete');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', async () => {
      if (isServer) {
        const u = window._tgUsername || '';
        await fetch(
          `${API}/posts/${_threadPostId}/comments/${c.id}?tg_username=${encodeURIComponent(u)}`,
          { method: 'DELETE' }
        ).catch(() => {});
        await renderComments();
        await _refreshServerCommentCount(_threadPostId);
      } else {
        deleteComment(_threadPostId, c.id);
        renderComments();
        refreshCommentCount(_threadPostId);
      }
    });
  }

  el.querySelector('.comment__like').addEventListener('click', async function () {
    if (isServer) {
      const u = window._tgUsername || '';
      try {
        const res = await fetch(`${API}/posts/${_threadPostId}/comments/${c.id}/like`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tg_username: u }),
        });
        if (res.ok) {
          const data = await res.json();
          c.myLike     = data.myLike;
          c.likesCount = data.likesCount;
          _applyLikeToBtn(this, c.myLike, c.likesCount);
        }
      } catch {}
    } else {
      const updated = toggleCommentLike(_threadPostId, c.id);
      if (!updated) return;
      _applyLikeToBtn(this, updated.liked, updated.likes);
    }
  });

  return el;
}

function _applyLikeToBtn(btn, liked, count) {
  const icon    = btn.querySelector('img');
  let   countEl = btn.querySelector('span');
  if (icon) icon.src = `../../img/${liked ? 'like.svg' : 'like_n.svg'}`;
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
    const onclick = btn.getAttribute('onclick') || '';
    if (onclick.includes(postId)) _updateCommentCountEl(btn, getComments(postId).length);
  });
}

async function _refreshServerCommentCount(postId) {
  try {
    const res = await fetch(`${API}/posts/${postId}/comments?viewer=`);
    if (!res.ok) return;
    const comments = await res.json();
    document.querySelectorAll('.btn-comments').forEach(btn => {
      const onclick = btn.getAttribute('onclick') || '';
      if (onclick.includes(postId)) _updateCommentCountEl(btn, comments.length);
    });
  } catch {}
}

document.getElementById('thread-back').addEventListener('click', closeThread);

document.getElementById('thread-overlay').addEventListener('click', e => {
  if (e.target === document.getElementById('thread-overlay')) closeThread();
});

document.getElementById('thread-btn-post').addEventListener('click', async () => {
  const input = document.getElementById('thread-compose-input');
  const text  = input.value.trim();
  if (!text || _threadPostId === null) return;

  const btn = document.getElementById('thread-btn-post');
  btn.disabled = true;

  if (_threadIsServer) {
    const u = window._tgUsername;
    if (!u) { btn.disabled = false; return; }
    try {
      const res = await fetch(`${API}/posts/${_threadPostId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tg_username: u, text }),
      });
      if (res.ok) {
        input.value = '';
        input.style.height = 'auto';
        input.closest('.thread-panel__compose')?.classList.remove('multiline');
        await renderComments();
        await _refreshServerCommentCount(_threadPostId);
      }
    } catch {}
  } else {
    saveComment(_threadPostId, text);
    input.value = '';
    input.style.height = 'auto';
    input.closest('.thread-panel__compose')?.classList.remove('multiline');
    renderComments();
    refreshCommentCount(_threadPostId);
  }

  btn.disabled = false;
});

document.getElementById('thread-compose-input').addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    document.getElementById('thread-btn-post').click();
  }
});

document.getElementById('thread-compose-input').addEventListener('input', function () {
  this.style.height = 'auto';
  this.style.height = this.scrollHeight + 'px';
  const compose = this.closest('.thread-panel__compose');
  if (compose) compose.classList.toggle('multiline', this.scrollHeight > 40);
});
