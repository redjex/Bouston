'use strict';

const POSTS_KEY   = 'bouston_posts';
const PROFILE_KEY = 'bouston_profile';
const DEFAULT_PROFILE = {
  name: 'Bouston', bio: 'Web & UI/UX Designer',
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
  _profileCache = profile;
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

function invalidateProfileCache() {
  _profileCache = null;
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
    all[postId].push({ id: Date.now(), text, createdAt: Date.now() });
    localStorage.setItem(COMMENTS_KEY, JSON.stringify(all));
  } catch {}
}

function deleteComment(postId, commentId) {
  try {
    const all = JSON.parse(localStorage.getItem(COMMENTS_KEY)) || {};
    if (all[postId]) all[postId] = all[postId].filter(c => c.id !== commentId);
    localStorage.setItem(COMMENTS_KEY, JSON.stringify(all));
  } catch {}
}
