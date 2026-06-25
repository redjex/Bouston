'use strict';

const API = '';
let _apiRateLimitedUntil = 0;

function getApiRateLimitDelay(res) {
  const retryAfter = res.headers?.get?.('Retry-After');
  if (!retryAfter) return 15000;
  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds)) return Math.max(1000, seconds * 1000);
  const retryAt = Date.parse(retryAfter);
  return Number.isFinite(retryAt) ? Math.max(1000, retryAt - Date.now()) : 15000;
}

function getApiRateLimitRemainingMs() {
  return Math.max(0, (_apiRateLimitedUntil || 0) - Date.now());
}

function getToken() {
  return localStorage.getItem('bouston_token');
}

function getStoredUser() {
  try { return JSON.parse(localStorage.getItem('bouston_user')) || null; }
  catch { return null; }
}

function logout() {
  localStorage.removeItem('bouston_token');
  localStorage.removeItem('bouston_user');
  localStorage.removeItem('bouston_profile');
  document.cookie = 'bouston_token=; path=/; max-age=0; SameSite=Lax';
  window.location.href = '/app';
}

async function apiFetch(url, options = {}) {
  if (_apiRateLimitedUntil && Date.now() < _apiRateLimitedUntil) {
    const err = new Error('rate_limited');
    err.status = 429;
    throw err;
  }
  const token = getToken();
  if (token) {
    options.headers = { ...options.headers, 'Authorization': 'Bearer ' + token };
  }
  const res = await fetch(url, options);
  if (res.status === 401) {
    logout();
    throw new Error('unauthorized');
  }
  if (res.status === 429) {
    _apiRateLimitedUntil = Date.now() + getApiRateLimitDelay(res);
  }
  return res;
}
