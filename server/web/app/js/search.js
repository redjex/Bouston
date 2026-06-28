'use strict';

const SEARCH_POSTS_PAGE = 8;
let _searchQuery = '';
let _searchPage = 1;
let _searchLoading = false;
let _searchDone = true;
let _searchObserver = null;
let _searchToken = 0;
let _searchInputTimer = null;

function getSearchRouteQuery() {
  return new URLSearchParams(window.location.search).get('q') || '';
}

function normalizeSearchQuery(value) {
  return String(value || '').trim().slice(0, 80);
}

function setSearchInputs(value) {
  const normalized = normalizeSearchQuery(value);
  const searchInput = document.getElementById('search-input');
  const feedInput = document.getElementById('feed-search-input');
  if (searchInput && searchInput.value !== normalized) searchInput.value = normalized;
  if (feedInput && feedInput.value !== normalized) feedInput.value = normalized;
  document.getElementById('search-clear').hidden = !normalized;
  document.getElementById('feed-search-clear').hidden = !normalized;
}

function navigateSearch(value) {
  const query = normalizeSearchQuery(value);
  const url = query ? `/search?q=${encodeURIComponent(query)}` : '/search';
  const wasSearch = _currentView === 'search';
  showView('search', { url });
  if (wasSearch) renderSearch(query, { reset: true });
}

function resetSearchResults(message = '') {
  if (_searchObserver) { _searchObserver.disconnect(); _searchObserver = null; }
  _searchPage = 1;
  _searchDone = true;
  _searchLoading = false;
  document.getElementById('search-users').innerHTML = '';
  document.getElementById('search-posts').innerHTML = '';
  document.getElementById('search-users-section').hidden = true;
  document.getElementById('search-posts-section').hidden = true;
  const empty = document.getElementById('search-empty');
  empty.textContent = message;
  empty.hidden = !message;
}

function renderSearchUsers(users) {
  const section = document.getElementById('search-users-section');
  const container = document.getElementById('search-users');
  container.innerHTML = '';
  section.hidden = !users.length;

  users.slice(0, 5).forEach(user => {
    const publicUsername = user.profile_username || user.profileUsername || user.username || '';
    const item = document.createElement('button');
    item.className = 'search-user';
    item.type = 'button';
    item.dataset.username = publicUsername;
    item.innerHTML = `
      <img class="search-user__avatar" src="${user.avatar_preview_url || user.avatar_url || '/appimg/default_avatar.png'}" alt="" />
      <span class="search-user__body">
        <span class="search-user__name">
          ${escapeHtml(user.display_name || user.displayName || publicUsername)}
          ${user.verified ? '<img class="post__verified-badge" src="/appimg/verided.svg" alt="verified" />' : ''}
        </span>
        <span class="search-user__username">@${escapeHtml(publicUsername)}</span>
      </span>
    `;
    item.addEventListener('click', () => {
      const profile = getProfile();
      const ownNames = [profile.username, profile.tgUsername, window._tgUsername]
        .filter(Boolean)
        .map(value => String(value).toLowerCase());
      const resultNames = [publicUsername, user.username]
        .filter(Boolean)
        .map(value => String(value).toLowerCase());
      if (resultNames.some(name => ownNames.includes(name))) {
        showView('profile');
        return;
      }
      openUserProfile(publicUsername);
    });
    container.appendChild(item);
  });
}

function highlightSearchText(postEl, query) {
  const textEl = postEl.querySelector('.post__text');
  const needle = normalizeSearchQuery(query);
  if (!textEl || !needle) return;

  const needleLower = needle.toLowerCase();
  const walker = document.createTreeWalker(textEl, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue || !node.nodeValue.toLowerCase().includes(needleLower)) return NodeFilter.FILTER_REJECT;
      if (node.parentElement?.closest('a, mark')) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);

  nodes.forEach(node => {
    const value = node.nodeValue;
    const lower = value.toLowerCase();
    const fragment = document.createDocumentFragment();
    let last = 0;
    let index = lower.indexOf(needleLower);
    while (index !== -1) {
      if (index > last) fragment.appendChild(document.createTextNode(value.slice(last, index)));
      const mark = document.createElement('mark');
      mark.className = 'search-highlight';
      mark.textContent = value.slice(index, index + needle.length);
      fragment.appendChild(mark);
      last = index + needle.length;
      index = lower.indexOf(needleLower, last);
    }
    if (last < value.length) fragment.appendChild(document.createTextNode(value.slice(last)));
    node.replaceWith(fragment);
  });
}

function attachSearchPostMenu(container) {
  container.querySelectorAll('.post__more-wrap:not([data-bound])').forEach(wrap => {
    wrap.dataset.bound = '1';
    const btn = wrap.querySelector('.post__more');
    const id = Number(btn.dataset.id);
    const postEl = wrap.closest('.post');
    wrap.addEventListener('click', e => {
      e.stopPropagation();
      if (_openMenuId === id) { closeAllMenus(); return; }
      openPostMenu(id, postEl, document.getElementById('search-wrap'), [
        { src: '/appimg/trash.svg', action: () => { closeAllMenus(); deletePost(id, () => renderSearch(_searchQuery, { reset: true })); } },
        { src: '/appimg/edit.svg',  action: () => { closeAllMenus(); startEditPost(id, postEl, () => renderSearch(_searchQuery, { reset: true })); } },
        { src: '/appimg/close.svg', action: () => closeAllMenus() },
      ]);
    });
  });
}

function appendSearchPosts(posts, query) {
  if (!posts.length) return;
  const section = document.getElementById('search-posts-section');
  const container = document.getElementById('search-posts');
  section.hidden = false;
  container.querySelector('.search-sentinel')?.remove();

  posts.forEach((post, index) => {
    registerServerPost(post);
    const result = document.createElement('div');
    result.className = 'search-post-result';
    const postEl = buildPostEl(post, null, null, false, '', index, false);
    highlightSearchText(postEl, query);
    result.appendChild(postEl);
    container.appendChild(result);
  });

  attachSearchPostMenu(container);
}

function attachSearchSentinel() {
  const container = document.getElementById('search-posts');
  container.querySelector('.search-sentinel')?.remove();
  if (_searchObserver) { _searchObserver.disconnect(); _searchObserver = null; }
  if (_searchDone) return;

  const sentinel = document.createElement('div');
  sentinel.className = 'search-sentinel';
  container.appendChild(sentinel);
  _searchObserver = new IntersectionObserver(([entry]) => {
    if (!entry.isIntersecting || _searchLoading || _searchDone) return;
    renderSearch(_searchQuery, { reset: false });
  }, { root: document.getElementById('search-wrap'), rootMargin: '240px' });
  _searchObserver.observe(sentinel);
}

async function renderSearch(query = getSearchRouteQuery(), options = {}) {
  const reset = options.reset !== false;
  const normalized = normalizeSearchQuery(query);
  setSearchInputs(normalized);

  if (reset) {
    _searchToken += 1;
    _searchQuery = normalized;
    resetSearchResults(normalized ? 'Загрузка...' : '');
  }

  if (!normalized || _searchLoading || (!reset && _searchDone)) return;

  const token = _searchToken;
  const page = reset ? 1 : _searchPage;
  _searchLoading = true;

  try {
    const res = await apiFetch(`${API}/api/search?q=${encodeURIComponent(normalized)}&page=${page}&limit=${SEARCH_POSTS_PAGE}`);
    if (!res.ok) throw new Error('search failed');
    const data = await res.json();
    if (token !== _searchToken) return;

    if (reset) {
      renderSearchUsers(data.users || []);
      document.getElementById('search-posts').innerHTML = '';
      document.getElementById('search-posts-section').hidden = !(data.posts || []).length;
      document.getElementById('search-empty').hidden = !!((data.users || []).length || (data.posts || []).length);
    }

    appendSearchPosts(data.posts || [], normalized);
    _searchPage = page + 1;
    _searchDone = !data.hasMore;

    const hasAny = !!document.querySelector('#search-users .search-user, #search-posts .post');
    const empty = document.getElementById('search-empty');
    empty.hidden = hasAny;
    if (!hasAny) empty.textContent = 'Ничего не найдено';
    attachSearchSentinel();
  } catch {
    if (token === _searchToken && reset) resetSearchResults('Не удалось загрузить поиск');
    else _searchDone = true;
  } finally {
    _searchLoading = false;
  }
}

document.getElementById('search-form').addEventListener('submit', e => {
  e.preventDefault();
  navigateSearch(document.getElementById('search-input').value);
});

document.getElementById('feed-search-bar').addEventListener('submit', e => {
  e.preventDefault();
  navigateSearch(document.getElementById('feed-search-input').value);
});

document.getElementById('search-input').addEventListener('input', e => {
  document.getElementById('search-clear').hidden = !normalizeSearchQuery(e.target.value);
  if (_currentView !== 'search') return;
  clearTimeout(_searchInputTimer);
  _searchInputTimer = setTimeout(() => navigateSearch(e.target.value), 260);
});

document.getElementById('feed-search-input').addEventListener('input', e => {
  document.getElementById('feed-search-clear').hidden = !normalizeSearchQuery(e.target.value);
});

document.getElementById('search-clear').addEventListener('click', () => {
  navigateSearch('');
  document.getElementById('search-input').focus();
});

document.getElementById('feed-search-clear').addEventListener('click', () => {
  setSearchInputs('');
  document.getElementById('feed-search-input').focus();
});
