'use strict';

let _threadPostId = null;

function openThread(postId) {
  _threadPostId = postId;
  const overlay = document.getElementById('thread-overlay');
  overlay.removeAttribute('hidden');
  renderThread();
}

function closeThread() {
  document.getElementById('thread-overlay').setAttribute('hidden', '');
  _threadPostId = null;
}

function renderThread() {
  if (_threadPostId === null) return;

  const posts      = getPosts();
  const post       = posts.find(p => p.id === _threadPostId);
  const profile    = getProfile();
  const avatarSrc  = profile.avatar || '../../img/logo_blue.png';
  const isVerified = profile.verified === true;
  const badgeHtml  = isVerified ? `<img class="post__verified-badge" src="../../img/verided.svg" alt="verified" />` : '';

  if (!post) { closeThread(); return; }

  const postEl = buildPostEl(post, profile, avatarSrc, isVerified, badgeHtml, -1, false);
  if (isVerified) postEl.classList.add('post--verified-tall');
  postEl.querySelectorAll('.btn-comments').forEach(b => b.remove());
  postEl.querySelectorAll('.post__more-wrap').forEach(b => b.remove());
  const threadPost = document.getElementById('thread-post');
  threadPost.innerHTML = '';
  threadPost.appendChild(postEl);

  document.getElementById('thread-compose-avatar').src = avatarSrc;

  renderComments();
}

function renderComments() {
  const container = document.getElementById('thread-comments');
  const comments  = getComments(_threadPostId);
  const profile   = getProfile();
  const avatarSrc  = profile.avatar || '../../img/logo_blue.png';
  const isVerified = profile.verified === true;
  const badgeHtml  = isVerified ? `<img class="post__verified-badge" src="../../img/verided.svg" alt="verified" />` : '';

  container.innerHTML = '';

  if (!comments.length) {
    container.innerHTML = '<p class="thread-empty">Комментариев пока нет</p>';
    return;
  }

  comments.forEach(c => {
    const el = document.createElement('div');
    el.className = 'comment';
    el.innerHTML = `
      <img class="avatar" src="${avatarSrc}" alt="" />
      <div class="comment__body">
        <div class="comment__namerow">
          <span class="comment__name">${escapeHtml(profile.name)}</span>
          ${badgeHtml}
          <span class="comment__time">${formatPostTime(c.createdAt)}</span>
          <button class="comment__delete" data-id="${c.id}">
            <img src="../../img/close.svg" alt="" />
          </button>
        </div>
        <p class="comment__text">${escapeHtml(c.text)}</p>
        <div class="comment__footer">
          <button class="comment__like ${c.liked ? 'comment__like--active' : ''}" data-id="${c.id}">
            <img src="../../img/${c.liked ? 'like.svg' : 'like_n.svg'}" alt="" />
            ${c.likes ? `<span>${c.likes}</span>` : ''}
          </button>
        </div>
      </div>
    `;
    el.querySelector('.comment__delete').addEventListener('click', () => {
      deleteComment(_threadPostId, c.id);
      renderComments();
      refreshCommentCount(_threadPostId);
    });

    el.querySelector('.comment__like').addEventListener('click', function () {
      const updated = toggleCommentLike(_threadPostId, c.id);
      if (!updated) return;
      const icon = this.querySelector('img');
      let countEl = this.querySelector('span');
      if (icon) icon.src = `../../img/${updated.liked ? 'like.svg' : 'like_n.svg'}`;
      this.classList.toggle('comment__like--active', updated.liked);
      if (updated.likes) {
        if (countEl) countEl.textContent = updated.likes;
        else { const s = document.createElement('span'); s.textContent = updated.likes; this.appendChild(s); }
      } else if (countEl) countEl.remove();
    });

    container.appendChild(el);
  });
}

function refreshCommentCount(postId) {
  document.querySelectorAll(`.btn-comments`).forEach(btn => {
    const onclick = btn.getAttribute('onclick') || '';
    if (onclick.includes(postId)) {
      const count = getComments(postId).length;
      const countEl = btn.querySelector('.btn-comments__count');
      if (count) {
        if (countEl) countEl.textContent = count;
        else {
          const span = document.createElement('span');
          span.className = 'btn-comments__count';
          span.textContent = count;
          btn.appendChild(span);
        }
      } else {
        if (countEl) countEl.remove();
      }
    }
  });
}

document.getElementById('thread-back').addEventListener('click', closeThread);

document.getElementById('thread-overlay').addEventListener('click', e => {
  if (e.target === document.getElementById('thread-overlay')) closeThread();
});

document.getElementById('thread-btn-post').addEventListener('click', () => {
  const input = document.getElementById('thread-compose-input');
  const text  = input.value.trim();
  if (!text || _threadPostId === null) return;
  saveComment(_threadPostId, text);
  input.value = '';
  input.style.height = 'auto';
  input.closest('.thread-panel__compose')?.classList.remove('multiline');
  renderComments();
  refreshCommentCount(_threadPostId);
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
