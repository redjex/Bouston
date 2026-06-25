'use strict';

const API = '';

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
  const token = getToken();
  if (token) {
    options.headers = { ...options.headers, 'Authorization': 'Bearer ' + token };
  }
  const res = await fetch(url, options);
  if (res.status === 401) {
    logout();
    throw new Error('unauthorized');
  }
  return res;
}
