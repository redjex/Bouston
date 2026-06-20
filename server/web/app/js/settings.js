'use strict';

const ACCOUNTS_KEY = 'bouston_accounts';
const SESSION_LIMIT = 12;

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
  let browser = 'Браузер';
  let os = platform || 'Устройство';

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
    device: `${browser} на ${os}`,
    type: isMobile ? 'Телефон' : 'Компьютер',
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
  if (!ts) return 'Время неизвестно';
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
        <span class="account-row__state">${isActive ? 'Сейчас' : 'Войти'}</span>
      `;
      if (!isActive) row.addEventListener('click', () => switchAccount(acc.id));
      list.appendChild(row);
    });
  }

  if (addBtn) {
    const canAdd = accounts.length < limit;
    addBtn.disabled = !canAdd;
    addBtn.title = canAdd ? 'Добавить аккаунт' : `Лимит аккаунтов: ${limit}`;
  }

  renderPrivacySessions(current);
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
    const isPhone = /Android|iOS|�������/i.test(session.device || session.type || '');
    const iconName = isPhone ? 'smartphone' : 'computer';
    row.className = 'login-session' + (session.current ? ' login-session--current' : '');
    row.innerHTML = `
      <span class="login-session__icon material-symbols-outlined">${iconName}</span>
      <span class="login-session__body">
        <span class="login-session__device">${escSettings(session.device || '����������')}${session.current ? '<span class="login-session__status">������</span>' : ''}</span>
        <span class="login-session__meta">����: ${escSettings(formatLoginTime(createdAt))}</span>
        <span class="login-session__meta">����������: ${escSettings(formatLoginTime(lastSeenAt))}</span>
        ${session.ip ? `<span class="login-session__meta">IP: ${escSettings(session.ip)}</span>` : ''}
      </span>
      ${session.id && isActive ? `<button class="login-session__revoke" data-session-id="${escSettings(session.id)}">���������</button>` : ''}
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
        btn.textContent = 'Ошибка';
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
document.getElementById('account-auth-cancel')?.addEventListener('click', () => {
  document.getElementById('account-auth-overlay')?.setAttribute('hidden', '');
});
document.getElementById('account-auth-continue')?.addEventListener('click', continueAddAccountAuth);
