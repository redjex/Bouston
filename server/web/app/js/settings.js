'use strict';

const ACCOUNTS_KEY = 'bouston_accounts';
const CUSTOMIZATION_KEY = 'bouston_customization';
const SESSION_LIMIT = 12;
const DEFAULT_CUSTOMIZATION = {
  gradientsEnabled: true,
  gradientColor1: '#4E7ADF',
  gradientColor2: '#144CCC',
  wallpaper: '',
};
let _customizationDraft = null;
let _wallpaperSaveExtra = {};

function getAccountId(user, profile) {
  return user?.username || profile?.tgUsername || profile?.username || 'local';
}

function getAccounts() {
  try { return JSON.parse(localStorage.getItem(ACCOUNTS_KEY)) || []; }
  catch { return []; }
}

function saveAccounts(accounts) {
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
}

function getDeviceInfo() {
  const ua = navigator.userAgent || '';
  const platform = navigator.userAgentData?.platform || navigator.platform || '';
  const isMobile = navigator.userAgentData?.mobile || /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
  let browser = 'Р‘СЂР°СѓР·РµСЂ';
  let os = platform || 'РЈСЃС‚СЂРѕР№СЃС‚РІРѕ';

  if (/Edg\//.test(ua)) browser = 'Microsoft Edge';
  else if (/OPR\//.test(ua)) browser = 'Opera';
  else if (/Chrome\//.test(ua) && !/Edg\//.test(ua)) browser = 'Chrome';
  else if (/Firefox\//.test(ua)) browser = 'Firefox';
  else if (/Safari\//.test(ua) && !/Chrome\//.test(ua)) browser = 'Safari';

  if (/Android/i.test(ua)) os = 'Android';
  else if (/iPhone|iPad|iPod/i.test(ua)) os = 'iOS';
  else if (/Windows/i.test(ua)) os = 'Windows';
  else if (/Mac OS X|Macintosh/i.test(ua)) os = 'macOS';
  else if (/Linux/i.test(ua)) os = 'Linux';

  return {
    device: `${browser} РЅР° ${os}`,
    type: isMobile ? 'РўРµР»РµС„РѕРЅ' : 'РљРѕРјРїСЊСЋС‚РµСЂ',
    fingerprint: `${browser}|${os}|${isMobile ? 'mobile' : 'desktop'}`,
  };
}

function getCurrentLoginSession() {
  const device = getDeviceInfo();
  return {
    id: `${device.fingerprint}|${getToken() || ''}`,
    createdAt: Date.now(),
    lastSeenAt: Date.now(),
    ...device,
  };
}

function mergeLoginSessions(previous = [], session = getCurrentLoginSession()) {
  const sessions = Array.isArray(previous) ? previous.filter(Boolean) : [];
  const existing = sessions.find(item => item.id === session.id);
  if (existing) {
    existing.lastSeenAt = Date.now();
    if (!existing.createdAt) existing.createdAt = session.createdAt;
    return sessions.slice(0, SESSION_LIMIT);
  }
  return [session, ...sessions].slice(0, SESSION_LIMIT);
}

function formatLoginTime(ts) {
  if (!ts) return 'Р’СЂРµРјСЏ РЅРµРёР·РІРµСЃС‚РЅРѕ';
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(ts));
}

async function fetchServerSessions() {
  const res = await apiFetch(`${API}/auth/sessions`);
  if (!res.ok) throw new Error('sessions');
  const data = await res.json();
  return data.sessions || [];
}

function getCurrentAccountSnapshot() {
  const token = getToken();
  const user = getStoredUser();
  const profile = getProfile();
  if (!token || !user) return null;
  return {
    id: getAccountId(user, profile),
    token,
    user,
    profile,
    savedAt: Date.now(),
  };
}

function rememberCurrentAccount() {
  const current = getCurrentAccountSnapshot();
  if (!current) return getAccounts();
  const oldAccounts = getAccounts();
  const previous = oldAccounts.find(acc => acc.id === current.id);
  current.savedAt = previous?.savedAt || current.savedAt;
  current.loginSessions = mergeLoginSessions(previous?.loginSessions, getCurrentLoginSession());
  const accounts = oldAccounts.filter(acc => acc.id !== current.id);
  accounts.unshift(current);
  saveAccounts(accounts);
  return accounts;
}

function getAccountLimit(profile = getProfile()) {
  return profile.verified ? 5 : 2;
}

function getCustomizationStorageKey() {
  const profile = getProfile();
  const user = getStoredUser();
  const id = getAccountId(user, profile);
  return `${CUSTOMIZATION_KEY}:${id}`;
}

function normalizeCustomization(raw = {}) {
  return {
    gradientsEnabled: raw.gradientsEnabled ?? raw.gradients_enabled ?? true,
    gradientColor1: raw.gradientColor1 || raw.gradient_color_1 || '#4E7ADF',
    gradientColor2: raw.gradientColor2 || raw.gradient_color_2 || '#144CCC',
    wallpaper: raw.wallpaper || raw.wallpaper_url || '',
    savedAt: raw.savedAt || raw.saved_at || 0,
  };
}

function getLocalCustomization() {
  try {
    const scoped = JSON.parse(localStorage.getItem(getCustomizationStorageKey()));
    if (scoped) return { ...DEFAULT_CUSTOMIZATION, ...normalizeCustomization(scoped) };
    return { ...DEFAULT_CUSTOMIZATION, ...normalizeCustomization(JSON.parse(localStorage.getItem(CUSTOMIZATION_KEY)) || {}) };
  } catch {
    return { ...DEFAULT_CUSTOMIZATION };
  }
}

function saveLocalCustomization(settings) {
  const value = { ...normalizeCustomization(settings), savedAt: Date.now() };
  localStorage.setItem(getCustomizationStorageKey(), JSON.stringify(value));
}

function applyCustomization(settings = getLocalCustomization()) {
  const normalized = normalizeCustomization(settings);
  document.body.classList.toggle('no-verified-gradients', !normalized.gradientsEnabled);
  document.documentElement.style.setProperty('--verified-gradient-1', normalized.gradientColor1);
  document.documentElement.style.setProperty('--verified-gradient-2', normalized.gradientColor2);
  if (normalized.wallpaper) {
    document.documentElement.style.setProperty('--app-wallpaper', `linear-gradient(rgba(0,0,0,0.68), rgba(0,0,0,0.68)), url("${normalized.wallpaper}")`);
  } else {
    document.documentElement.style.removeProperty('--app-wallpaper');
  }
}

async function loadCustomization() {
  const profile = getProfile();
  const local = getLocalCustomization();
  if (local.savedAt) {
    applyCustomization(local);
    return local;
  }
  if (!profile.verified) {
    applyCustomization(local);
    return local;
  }
  try {
    const res = await apiFetch(`${API}/profile/customization`);
    if (!res.ok) throw new Error('customization');
    const remote = normalizeCustomization(await res.json());
    const remoteIsDefault =
      remote.gradientsEnabled === true &&
      remote.gradientColor1 === DEFAULT_CUSTOMIZATION.gradientColor1 &&
      remote.gradientColor2 === DEFAULT_CUSTOMIZATION.gradientColor2 &&
      !remote.wallpaper;
    if (remoteIsDefault && local.savedAt) {
      applyCustomization(local);
      return local;
    }
    saveLocalCustomization(remote);
    applyCustomization(remote);
    return remote;
  } catch {
    applyCustomization(local);
    return local;
  }
}

async function persistCustomization(settings, extra = {}) {
  const normalized = normalizeCustomization(settings);
  saveLocalCustomization(normalized);
  applyCustomization(normalized);
  if (!getProfile().verified) return;

  const res = await apiFetch(`${API}/profile/customization`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      gradients_enabled: normalized.gradientsEnabled,
      gradient_color_1: normalized.gradientColor1,
      gradient_color_2: normalized.gradientColor2,
      ...extra,
    }),
  });
  if (!res.ok) throw new Error('customization-save');
  if (res.ok) {
    const remote = normalizeCustomization(await res.json());
    saveLocalCustomization(remote);
    applyCustomization(remote);
    renderCustomizationControls(remote);
  }
}

function renderCustomizationControls(settings = getLocalCustomization()) {
  const normalized = normalizeCustomization(settings);
  _customizationDraft = { ...normalized };
  const gradients = document.getElementById('settings-gradients-enabled');
  const color1 = document.getElementById('settings-gradient-color-1');
  const color2 = document.getElementById('settings-gradient-color-2');
  const preview1 = document.getElementById('settings-gradient-color-1-preview');
  const preview2 = document.getElementById('settings-gradient-color-2-preview');
  const gradientPreview = document.getElementById('settings-gradient-preview');
  const wallpaperPreview = document.getElementById('settings-wallpaper-preview');
  const wallpaperAction = document.getElementById('settings-wallpaper-action');
  const scope = document.getElementById('settings-customization-scope');

  if (gradients) gradients.checked = normalized.gradientsEnabled;
  if (color1) color1.value = normalized.gradientColor1;
  if (color2) color2.value = normalized.gradientColor2;
  if (preview1) preview1.style.background = normalized.gradientColor1;
  if (preview2) preview2.style.background = normalized.gradientColor2;
  if (gradientPreview) {
    gradientPreview.style.opacity = normalized.gradientsEnabled ? '1' : '0.45';
    gradientPreview.style.setProperty('--preview-gradient-1', normalized.gradientColor1);
    gradientPreview.style.setProperty('--preview-gradient-2', normalized.gradientColor2);
  }
  if (wallpaperPreview) wallpaperPreview.style.backgroundImage = normalized.wallpaper ? `url("${normalized.wallpaper}")` : '';
  if (wallpaperAction) {
    wallpaperAction.textContent = normalized.wallpaper ? 'Убрать обои' : 'Добавить обои';
    wallpaperAction.htmlFor = normalized.wallpaper ? '' : 'settings-wallpaper-input';
  }
  if (scope) scope.textContent = getProfile().verified
    ? 'Сохраняется на всех устройствах'
    : 'Без верификации сохраняется только на этом устройстве';
}

function getCustomizationDraft() {
  if (!_customizationDraft) _customizationDraft = getLocalCustomization();
  return { ..._customizationDraft };
}

function updateCustomizationDraft(patch) {
  _customizationDraft = { ...getCustomizationDraft(), ...patch };
  saveLocalCustomization(_customizationDraft);
  renderCustomizationControls(_customizationDraft);
  applyCustomization(_customizationDraft);
}

function escSettings(value) {
  return typeof escapeHtml === 'function'
    ? escapeHtml(String(value || ''))
    : String(value || '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

function renderSettings() {
  const profile = getProfile();
  const current = getCurrentAccountSnapshot();
  const accounts = rememberCurrentAccount();
  const limit = getAccountLimit(profile);

  const avatar = document.getElementById('settings-avatar');
  const name = document.getElementById('settings-name');
  const username = document.getElementById('settings-username');
  const verified = document.getElementById('settings-verified');
  const limitEl = document.getElementById('settings-account-limit');
  const list = document.getElementById('settings-accounts-list');
  const addBtn = document.getElementById('settings-add-account');

  if (avatar) avatar.src = profile.avatar || '/appimg/default_avatar.png';
  if (name) name.textContent = profile.name || 'Bouston';
  if (username) username.textContent = '@' + (profile.username || profile.tgUsername || current?.user?.username || '');
  if (verified) verified.hidden = !profile.verified;
  if (limitEl) limitEl.textContent = `${accounts.length}/${limit}`;

  if (list) {
    list.innerHTML = '';
    accounts.forEach(acc => {
      const accProfile = acc.profile || {};
      const accUser = acc.user || {};
      const isActive = current && acc.id === current.id;
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'account-row' + (isActive ? ' account-row--active' : '');
      const accName = accProfile.name || accUser.first_name || 'Bouston';
      const accUsername = accProfile.username || accProfile.tgUsername || accUser.username || '';
      row.innerHTML = `
        <img class="account-row__avatar" src="${accProfile.avatar || accUser.avatar_url || '/appimg/default_avatar.png'}" alt="" />
        <span class="account-row__body">
          <span class="account-row__namerow">
            <span class="account-row__name">${escSettings(accName)}</span>
            ${accProfile.verified ? '<img class="account-row__verified" src="/appimg/verided.svg" alt="" />' : ''}
          </span>
          <span class="account-row__username">@${escSettings(accUsername)}</span>
        </span>
      `;
      if (!isActive) row.addEventListener('click', () => switchAccount(acc.id));
      list.appendChild(row);
    });
  }

  if (addBtn) {
    const canAdd = accounts.length < limit;
    addBtn.disabled = !canAdd;
    addBtn.title = canAdd ? 'Р”РѕР±Р°РІРёС‚СЊ Р°РєРєР°СѓРЅС‚' : `Р›РёРјРёС‚ Р°РєРєР°СѓРЅС‚РѕРІ: ${limit}`;
  }

  renderPrivacySessions(current);
  loadCustomization().then(renderCustomizationControls);
}

async function renderPrivacySessions(current = getCurrentAccountSnapshot()) {
  const list = document.getElementById('settings-login-sessions');
  if (!list) return;
  list.innerHTML = '';

  let sessions = [];
  try {
    sessions = await fetchServerSessions();
  } catch {
    const account = getAccounts().find(acc => current && acc.id === current.id);
    sessions = account?.loginSessions?.length ? account.loginSessions : [getCurrentLoginSession()];
  }

  sessions.filter(session => session.active !== false && !session.revokedAt).forEach(session => {
    const row = document.createElement('div');
    const createdAt = session.createdAt || session.created_at;
    const lastSeenAt = session.lastSeenAt || session.last_seen_at || createdAt;
    const isActive = session.active !== false && !session.revokedAt;
    const isPhone = /Android|iOS|Телефон/i.test(session.device || session.type || '');
    const iconName = isPhone ? 'smartphone' : 'computer';
    row.className = 'login-session' + (session.current ? ' login-session--current' : '');
    row.innerHTML = `
      <span class="login-session__icon material-symbols-outlined">${iconName}</span>
      <span class="login-session__body">
        <span class="login-session__device">${escSettings(session.device || 'Устройство')}${session.current ? '<span class="login-session__status">Сейчас</span>' : ''}</span>
        <span class="login-session__meta">Вход: ${escSettings(formatLoginTime(createdAt))}</span>
        <span class="login-session__meta">Активность: ${escSettings(formatLoginTime(lastSeenAt))}</span>
        ${session.ip ? `<span class="login-session__meta">IP: ${escSettings(session.ip)}</span>` : ''}
      </span>
      ${session.id && isActive ? `<button class="login-session__revoke" data-session-id="${escSettings(session.id)}">Завершить</button>` : ''}
    `;
    list.appendChild(row);
  });

  list.querySelectorAll('.login-session__revoke').forEach(btn => {
    btn.addEventListener('click', async event => {
      event.stopPropagation();
      const sessionId = btn.dataset.sessionId;
      if (!sessionId) return;
      btn.disabled = true;
      btn.textContent = '...';
      try {
        const res = await apiFetch(`${API}/auth/sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('revoke');
        const currentRow = btn.closest('.login-session')?.classList.contains('login-session--current');
        if (currentRow) {
          logout();
          return;
        }
        await renderPrivacySessions();
      } catch {
        btn.disabled = false;
        btn.textContent = 'РћС€РёР±РєР°';
      }
    });
  });
}

function switchAccount(id) {
  const acc = getAccounts().find(item => item.id === id);
  if (!acc) return;
  localStorage.setItem('bouston_token', acc.token);
  localStorage.setItem('bouston_user', JSON.stringify(acc.user));
  localStorage.setItem('bouston_profile', JSON.stringify(acc.profile || {}));
  document.cookie = `bouston_token=${acc.token}; path=/; max-age=2592000; SameSite=Lax`;
  window.location.href = '/app';
}

function startAddAccount() {
  const accounts = rememberCurrentAccount();
  const limit = getAccountLimit();
  if (accounts.length >= limit) return;
  document.getElementById('account-auth-overlay')?.removeAttribute('hidden');
}

function continueAddAccountAuth() {
  rememberCurrentAccount();
  localStorage.removeItem('bouston_token');
  localStorage.removeItem('bouston_user');
  localStorage.removeItem('bouston_profile');
  document.cookie = 'bouston_token=; path=/; max-age=0; SameSite=Lax';
  window.location.href = '/app';
}

document.getElementById('settings-add-account')?.addEventListener('click', startAddAccount);
document.getElementById('settings-privacy-toggle')?.addEventListener('click', () => {
  const panel = document.getElementById('settings-privacy-panel');
  const toggle = document.getElementById('settings-privacy-toggle');
  if (!panel || !toggle) return;
  const willOpen = panel.hasAttribute('hidden');
  panel.toggleAttribute('hidden', !willOpen);
  toggle.classList.toggle('settings-action--open', willOpen);
  if (willOpen) renderPrivacySessions();
});
document.getElementById('settings-customization-toggle')?.addEventListener('click', () => {
  const panel = document.getElementById('settings-customization-panel');
  const toggle = document.getElementById('settings-customization-toggle');
  if (!panel || !toggle) return;
  const willOpen = panel.hasAttribute('hidden');
  panel.toggleAttribute('hidden', !willOpen);
  toggle.classList.toggle('settings-action--open', willOpen);
  if (willOpen) loadCustomization().then(renderCustomizationControls);
});
document.getElementById('settings-gradients-enabled')?.addEventListener('change', event => {
  updateCustomizationDraft({ gradientsEnabled: event.target.checked });
});
document.getElementById('settings-gradient-color-1')?.addEventListener('input', event => {
  updateCustomizationDraft({ gradientColor1: event.target.value });
});
document.getElementById('settings-gradient-color-2')?.addEventListener('input', event => {
  updateCustomizationDraft({ gradientColor2: event.target.value });
});
document.getElementById('settings-wallpaper-input')?.addEventListener('change', event => {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const wallpaper = String(reader.result || '');
    _wallpaperSaveExtra = { wallpaper_b64: wallpaper, clear_wallpaper: false };
    updateCustomizationDraft({ wallpaper });
  };
  reader.readAsDataURL(file);
  event.target.value = '';
});
document.getElementById('settings-wallpaper-action')?.addEventListener('click', event => {
  if (!getCustomizationDraft().wallpaper) {
    document.getElementById('settings-wallpaper-input')?.click();
    return;
  }
  event.preventDefault();
  _wallpaperSaveExtra = { clear_wallpaper: true };
  updateCustomizationDraft({ wallpaper: '' });
});
document.getElementById('settings-gradient-save')?.addEventListener('click', async event => {
  const btn = event.currentTarget;
  btn.disabled = true;
  btn.textContent = 'Сохранение...';
  try {
    await persistCustomization(getCustomizationDraft());
    btn.textContent = 'Сохранено';
    setTimeout(() => { btn.textContent = 'Сохранить градиент'; btn.disabled = false; }, 900);
  } catch {
    btn.textContent = 'Ошибка';
    setTimeout(() => { btn.textContent = 'Сохранить градиент'; btn.disabled = false; }, 1200);
  }
});
document.getElementById('settings-wallpaper-save')?.addEventListener('click', async event => {
  const btn = event.currentTarget;
  btn.disabled = true;
  btn.textContent = 'Сохранение...';
  try {
    await persistCustomization(getCustomizationDraft(), _wallpaperSaveExtra);
    _wallpaperSaveExtra = {};
    btn.textContent = 'Сохранено';
    setTimeout(() => { btn.textContent = 'Сохранить обои'; btn.disabled = false; }, 900);
  } catch {
    btn.textContent = 'Ошибка';
    setTimeout(() => { btn.textContent = 'Сохранить обои'; btn.disabled = false; }, 1200);
  }
});

document.getElementById('account-auth-cancel')?.addEventListener('click', () => {
  document.getElementById('account-auth-overlay')?.setAttribute('hidden', '');
});
document.getElementById('account-auth-continue')?.addEventListener('click', continueAddAccountAuth);

loadCustomization().then(renderCustomizationControls);

