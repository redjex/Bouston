'use strict';

const POSTS_KEY   = 'bouston_posts';
const PROFILE_KEY = 'bouston_profile';
const PROFILE_CACHE_TTL = 10 * 60 * 1000;
const USER_PROFILES_KEY = 'bouston_user_profiles_cache';
const DEFAULT_PROFILE = {
  name: 'Bouston', username: '', bio: '',
  avatar: null, banner: null, verified: false,
};

let _postsCache   = null;
let _profileCache = null;

function getPosts() {
  if (_postsCache) return _postsCache;
  try { _postsCache = JSON.parse(localStorage.getItem(POSTS_KEY)) || []; }
  catch { _postsCache = []; }
  return _postsCache;
}

function savePosts(posts) {
  _postsCache = posts;
  localStorage.setItem(POSTS_KEY, JSON.stringify(posts));
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
