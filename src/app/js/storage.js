'use strict';

const API = 'https://bouston.xyz';

async function apiFetch(url, options = {}) {
  const token = await window.electronAPI?.getAuthToken();
  if (token) {
    options.headers = { ...options.headers, 'Authorization': 'Bearer ' + token };
  }
  const res = await fetch(url, options);
  if (res.status === 401) {
    window.electronAPI?.logout();
    throw new Error('unauthorized');
  }
  return res;
}

const POSTS_KEY   = 'bouston_posts';
const PROFILE_KEY = 'bouston_profile';
const DEFAULT_PROFILE = {
  name: 'Bouston', username: '', bio: 'Web & UI/UX Designer',
  avatar: null, banner: '../../img/baner.png', verified: false,
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
  _profileCache = profile;
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

function invalidateProfileCache() {
  _profileCache = null;
}

function clearProfile() {
  _profileCache = null;
  localStorage.removeItem(PROFILE_KEY);
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
