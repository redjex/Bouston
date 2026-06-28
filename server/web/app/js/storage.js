'use strict';

const POSTS_KEY   = 'bouston_posts';
const PROFILE_KEY = 'bouston_profile';
const FEED_CACHE_KEY = 'bouston_feed_posts_cache_v3';
const PROFILE_POSTS_CACHE_KEY = 'bouston_profile_posts_cache_v3';
const PROFILE_CACHE_TTL = 10 * 60 * 1000;
const USER_PROFILES_KEY = 'bouston_user_profiles_cache_v3';
const DEFAULT_PROFILE = {
  name: 'Bouston', username: '', bio: '',
  avatar: null, avatarPreview: null, banner: null, bannerPreview: null, verified: false,
};

let _postsCache   = null;
let _profileCache = null;
let _postsCacheKey = null;

function getAccountCacheId() {
  try {
    const user = JSON.parse(localStorage.getItem('bouston_user') || 'null');
    if (user?.username) return String(user.username).toLowerCase();
    if (user?.id != null) return `id-${user.id}`;
  } catch {}
  const profile = _profileCache || (() => {
    try { return JSON.parse(localStorage.getItem(PROFILE_KEY) || 'null'); }
    catch { return null; }
  })();
  const id = profile?.tgUsername || profile?.username || window._tgUsername || 'local';
  return String(id).toLowerCase();
}

function scopedStorageKey(key) {
  return `${key}:${getAccountCacheId()}`;
}

function getPosts() {
  const key = scopedStorageKey(POSTS_KEY);
  if (_postsCacheKey !== key) {
    _postsCache = null;
    _postsCacheKey = key;
  }
  if (_postsCache) return _postsCache;
  try { _postsCache = JSON.parse(localStorage.getItem(key)) || []; }
  catch { _postsCache = []; }
  return _postsCache;
}

function savePosts(posts) {
  _postsCache = posts;
  _postsCacheKey = scopedStorageKey(POSTS_KEY);
  localStorage.setItem(_postsCacheKey, JSON.stringify(posts));
}

function mergePostsById(existing = [], incoming = []) {
  const map = new Map();
  [...existing, ...incoming].forEach(post => {
    if (post && post.id != null) map.set(Number(post.id), { ...(map.get(Number(post.id)) || {}), ...post });
  });
  return Array.from(map.values());
}

function getPostSortTime(post) {
  const raw = post?.createdAt ?? post?.created_at ?? 0;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  const numeric = Number(raw);
  if (Number.isFinite(numeric)) return numeric;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getPostSortId(post) {
  const id = Number(post?.id ?? 0);
  return Number.isFinite(id) ? id : 0;
}

function comparePostsByTimeAndId(a, b) {
  const timeDiff = getPostSortTime(b) - getPostSortTime(a);
  if (timeDiff) return timeDiff;
  return getPostSortId(b) - getPostSortId(a);
}

function sortFeedPosts(posts) {
  return [...posts].sort(comparePostsByTimeAndId);
}

function sortProfilePosts(posts) {
  return [...posts].sort((a, b) => {
    if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
    if ((b.pinnedAt || 0) !== (a.pinnedAt || 0)) return (b.pinnedAt || 0) - (a.pinnedAt || 0);
    return comparePostsByTimeAndId(a, b);
  });
}

function readPostsCache(key) {
  try {
    const data = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function writePostsCache(key, posts, limit = 120) {
  localStorage.setItem(key, JSON.stringify(posts.slice(0, limit)));
}

function getFeedPostsCache() {
  return sortFeedPosts(readPostsCache(scopedStorageKey(FEED_CACHE_KEY)));
}

function saveFeedPostsCache(posts) {
  writePostsCache(scopedStorageKey(FEED_CACHE_KEY), sortFeedPosts(posts));
}

function mergeFeedPostsCache(posts) {
  const merged = sortFeedPosts(mergePostsById(getFeedPostsCache(), posts));
  saveFeedPostsCache(merged);
  return merged;
}

function reconcileFeedPostsCache(serverPosts, pageLimit = 20) {
  const serverIds = new Set(serverPosts.map(post => Number(post.id)));
  let next = getFeedPostsCache();

  if (!serverPosts.length) {
    next = [];
  } else if (serverPosts.length < pageLimit) {
    next = next.filter(post => serverIds.has(Number(post.id)));
  } else {
    const oldestServerTs = Math.min(...serverPosts.map(getPostSortTime));
    next = next.filter(post => {
      const ts = getPostSortTime(post);
      return ts < oldestServerTs || serverIds.has(Number(post.id));
    });
  }

  saveFeedPostsCache(next);
  return mergeFeedPostsCache(serverPosts);
}

function getProfilePostsCache(username = getProfile().tgUsername || window._tgUsername || '') {
  const all = readPostsCache(scopedStorageKey(PROFILE_POSTS_CACHE_KEY));
  return sortProfilePosts(all.filter(post => !username || post.author?.tgUsername === username || post.isOwn));
}

function saveProfilePostsCache(username, posts) {
  const current = readPostsCache(scopedStorageKey(PROFILE_POSTS_CACHE_KEY));
  const other = current.filter(post => post.author?.tgUsername !== username && !post.isOwn);
  writePostsCache(scopedStorageKey(PROFILE_POSTS_CACHE_KEY), sortProfilePosts([...other, ...posts]));
}

function mergeProfilePostsCache(username, posts) {
  const merged = sortProfilePosts(mergePostsById(getProfilePostsCache(username), posts));
  saveProfilePostsCache(username, merged);
  return merged;
}

function reconcileProfilePostsCache(username, serverPosts) {
  saveProfilePostsCache(username, serverPosts);
  return getProfilePostsCache(username);
}

function removePostFromPostsCaches(id) {
  const postId = Number(id);
  saveFeedPostsCache(getFeedPostsCache().filter(post => Number(post.id) !== postId));
  const profilePostsKey = scopedStorageKey(PROFILE_POSTS_CACHE_KEY);
  const profilePosts = readPostsCache(profilePostsKey).filter(post => Number(post.id) !== postId);
  writePostsCache(profilePostsKey, sortProfilePosts(profilePosts));
}

function getProfile() {
  if (_profileCache) return _profileCache;
  try {
    const s = JSON.parse(localStorage.getItem(PROFILE_KEY));
    _profileCache = s ? { ...DEFAULT_PROFILE, ...s } : { ...DEFAULT_PROFILE };
  } catch { _profileCache = { ...DEFAULT_PROFILE }; }
  return _profileCache;
}

function saveProfile(profile) {
  _profileCache = { ...profile, cachedAt: Date.now() };
  localStorage.setItem(PROFILE_KEY, JSON.stringify(_profileCache));
}

function getAvatarPreviewSrc(src) {
  if (!src || src.startsWith('data:') || src.startsWith('blob:')) return src || null;
  if (src.includes('/img/avatar_low/')) return src;
  if (src.includes('/appimg/')) return src;
  const [base, query = ''] = src.split('?');
  const next = base.replace(/\/img\/([^/?#]+)\.(?:jpg|jpeg|png|webp)$/i, '/img/avatar_low/$1.jpg');
  return next === base ? src : next + (query ? '?' + query : '');
}

function getProfileAvatarPreview(profile = getProfile()) {
  return getAvatarPreviewSrc(profile.avatarPreview) || getAvatarPreviewSrc(profile.avatar) || profile.avatar;
}

function getProfileBannerSrc(profile = getProfile()) {
  return profile.bannerPreview || profile.banner || null;
}

function invalidateProfileCache() { _profileCache = null; }

function isProfileCacheFresh(profile = getProfile()) {
  return !!(profile.cachedAt && Date.now() - profile.cachedAt < PROFILE_CACHE_TTL);
}

function clearProfile() {
  _profileCache = null;
  localStorage.removeItem(PROFILE_KEY);
}

function getUserProfilesCache() {
  try { return JSON.parse(localStorage.getItem(USER_PROFILES_KEY)) || {}; }
  catch { return {}; }
}

function getCachedUserProfile(username) {
  if (!username) return null;
  const cache = getUserProfilesCache();
  const entry = cache[String(username).toLowerCase()];
  if (!entry || !entry.cachedAt || Date.now() - entry.cachedAt > PROFILE_CACHE_TTL) return null;
  return entry.data || null;
}

function saveCachedUserProfile(username, data) {
  if (!username || !data) return;
  const cache = getUserProfilesCache();
  cache[String(username).toLowerCase()] = { data, cachedAt: Date.now() };
  localStorage.setItem(USER_PROFILES_KEY, JSON.stringify(cache));
}

async function fetchUserProfileCached(username, options = {}) {
  const normalized = String(username || '').toLowerCase();
  if (!normalized) return null;
  if (!options.force) {
    const cached = getCachedUserProfile(normalized);
    if (cached) return cached;
  }
  const res = await apiFetch(`${API}/users/${encodeURIComponent(normalized)}`);
  if (!res.ok) return null;
  const data = await res.json();
  saveCachedUserProfile(normalized, data);
  return data;
}

const COMMENTS_KEY = 'bouston_comments';

function getComments(postId) {
  try {
    const all = JSON.parse(localStorage.getItem(COMMENTS_KEY)) || {};
    return all[postId] || [];
  } catch { return []; }
}

function saveComment(postId, text) {
  try {
    const all = JSON.parse(localStorage.getItem(COMMENTS_KEY)) || {};
    if (!all[postId]) all[postId] = [];
    all[postId].push({ id: Date.now(), text, createdAt: Date.now(), likes: 0, liked: false });
    localStorage.setItem(COMMENTS_KEY, JSON.stringify(all));
  } catch {}
}

function toggleCommentLike(postId, commentId) {
  try {
    const all = JSON.parse(localStorage.getItem(COMMENTS_KEY)) || {};
    const comment = (all[postId] || []).find(c => c.id === commentId);
    if (!comment) return null;
    comment.liked  = !comment.liked;
    comment.likes += comment.liked ? 1 : -1;
    localStorage.setItem(COMMENTS_KEY, JSON.stringify(all));
    return comment;
  } catch { return null; }
}

function deleteComment(postId, commentId) {
  try {
    const all = JSON.parse(localStorage.getItem(COMMENTS_KEY)) || {};
    if (all[postId]) all[postId] = all[postId].filter(c => c.id !== commentId);
    localStorage.setItem(COMMENTS_KEY, JSON.stringify(all));
  } catch {}
}
