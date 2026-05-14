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
