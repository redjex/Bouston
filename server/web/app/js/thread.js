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
  container.innerHTML = '<p class="thread-empty">Загрузка...</p>';

  if (_threadIsServer) {
    let comments = [];
    try {
      const res = await apiFetch(`${API}/posts/${_threadPostId}/comments`);
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

  const profile    = getProfile();
  const avatarSrc  = getProfileAvatarPreview(profile) || '/appimg/default_avatar.png';
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
        _refreshServerCommentCount(_threadPostId);
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

async function _refreshServerCommentCount(postId) {
  try {
    const res = await apiFetch(`${API}/posts/${postId}/comments`);
    if (!res.ok) return;
    const comments = await res.json();
    document.querySelectorAll('.btn-comments').forEach(btn => {
      if (Number(btn.dataset.thread) === postId) _updateCommentCountEl(btn, comments.length);
    });
  } catch {}
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
    const container = document.getElementById('thread-comments');
    if (container && !container.querySelector(`.comment__like[data-id="${comment.id}"]`)) {
      container.querySelector('.thread-empty')?.remove();
      container.appendChild(buildCommentEl(comment, true));
      container.scrollTop = container.scrollHeight;
    }
  }

  _refreshServerCommentCount(postId);
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

document.getElementById('thread-btn-post').addEventListener('click', async () => {
  const input = document.getElementById('thread-compose-input');
  const text  = input.value.trim();
  if (!text || _threadPostId === null) return;

  const btn = document.getElementById('thread-btn-post');
  btn.disabled = true;

  const container = document.getElementById('thread-comments');
  const emptyMsg  = container.querySelector('.thread-empty');

  if (_threadIsServer) {
    if (!window._tgUsername) { btn.disabled = false; return; }
    try {
      const res = await apiFetch(`${API}/posts/${_threadPostId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (res.ok) {
        const newComment = await res.json();
        input.value = '';
        syncThreadComposeInput();
        if (emptyMsg) emptyMsg.remove();
        container.appendChild(buildCommentEl(newComment, true));
        container.scrollTop = container.scrollHeight;
        notifyAboutComment(_serverPostsMap.get(_threadPostId), newComment);
        await _refreshServerCommentCount(_threadPostId);
      }
    } catch {}
  } else {
    const id  = Date.now();
    saveComment(_threadPostId, text);
    input.value = '';
    syncThreadComposeInput();
    const profile = getProfile();
    const mapped  = {
      id, text, createdAt: id, likesCount: 0, myLike: false, isOwn: true,
      author: {
        displayName: profile.name,
        avatarUrl:   profile.avatar || '/appimg/default_avatar.png',
        avatarPreviewUrl: getProfileAvatarPreview(profile) || '/appimg/default_avatar.png',
        isVerified:  profile.verified === true,
      },
    };
    if (emptyMsg) emptyMsg.remove();
    container.appendChild(buildCommentEl(mapped, false));
    container.scrollTop = container.scrollHeight;
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
  syncThreadComposeInput();
});

syncThreadComposeInput();

document.addEventListener('click', () => {
  document.querySelectorAll('.comment-row--open').forEach(r => r.classList.remove('comment-row--open'));
});
