/* ─────────────────────────────────────────
   app.js — главная логика приложения
───────────────────────────────────────── */

(function () {
  'use strict';

  const API = 'https://bouston.xyz';

  // ── Экран 1: QR-код ──────────────────

  const btnNext1    = document.getElementById('btn-next-1');
  const btnOpenBot  = document.getElementById('btn-open-bot');

  btnOpenBot.addEventListener('click', (e) => {
    e.preventDefault();
    window.electronAPI?.openExternal('https://t.me/bouston_bot');
  });

  btnNext1.addEventListener('click', () => {
    window.AppNav.goTo('screen-2');
    setTimeout(() => inputUsername.focus(), 300);
  });

  // ── Экран 2: Юзернейм ────────────────

  const inputUsername = document.getElementById('input-username');
  const btnNext2      = document.getElementById('btn-next-2');
  const btnBack2      = document.getElementById('btn-back-2');

  btnBack2.addEventListener('click', () => {
    clearError(inputUsername);
    window.AppNav.goTo('screen-1');
  });

  inputUsername.addEventListener('input', () => {
    let val = inputUsername.value;
    val = val.replace(/[^a-zA-Z0-9@_.\-]/g, '');
    if (!val) { inputUsername.value = ''; return; }
    if (!val.startsWith('@')) val = '@' + val.replace(/@/g, '');
    if (val === '@') { inputUsername.value = ''; return; }
    inputUsername.value = val;
  });

  inputUsername.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleStep2();
  });

  btnNext2.addEventListener('click', handleStep2);

  async function handleStep2() {
    const username = inputUsername.value.trim();
    if (!username) { shakeInput(inputUsername); return; }

    setLoading(btnNext2, true);
    try {
      const res = await fetch(`${API}/send-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      });

      if (!res.ok) {
        const text = await res.text();
        let detail = 'Ошибка сервера';
        try { detail = JSON.parse(text).detail || detail; } catch {}
        showError(inputUsername, detail);
        shakeInput(inputUsername);
        return;
      }

      window.AppNav.goTo('screen-3');
      setTimeout(() => inputCode.focus(), 300);

    } catch {
      showError(inputUsername, 'Нет соединения с сервером');
      shakeInput(inputUsername);
    } finally {
      setLoading(btnNext2, false);
    }
  }

  // ── Экран 3: Код подтверждения ───────

  const inputCode = document.getElementById('input-code');
  const btnNext3  = document.getElementById('btn-next-3');
  const btnBack3  = document.getElementById('btn-back-3');

  btnBack3.addEventListener('click', () => {
    inputCode.value = '';
    clearError(inputCode);
    window.AppNav.goTo('screen-2');
  });

  inputCode.addEventListener('input', function () {
    const pos = this.selectionStart;
    this.value = this.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    this.setSelectionRange(pos, pos);
  });

  btnNext3.addEventListener('click', handleStep3);
  inputCode.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleStep3();
  });

  async function handleStep3() {
    const code     = inputCode.value.trim();
    const username = inputUsername.value.trim();

    if (code.length < 6) { shakeInput(inputCode); return; }

    setLoading(btnNext3, true);
    try {
      const res = await fetch(`${API}/verify-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, code }),
      });

      if (!res.ok) {
        const text = await res.text();
        let detail = 'Неверный код';
        try { detail = JSON.parse(text).detail || detail; } catch {}
        showError(inputCode, detail);
        shakeInput(inputCode);
        return;
      }

      window.electronAPI?.authComplete();

    } catch {
      showError(inputCode, 'Нет соединения с сервером');
      shakeInput(inputCode);
    } finally {
      setLoading(btnNext3, false);
    }
  }

  // ── Утилиты ───────────────────────────

  function setLoading(btn, on) {
    btn.disabled = on;
    btn.querySelector('.btn-next__label').textContent = on ? '...' : 'Дальше';
  }

  function showError(input, message) {
    clearError(input);
    const wrap = input.closest('.field__wrap');
    if (!wrap) return;
    const el = document.createElement('span');
    el.className = 'field__error';
    el.textContent = message;
    wrap.after(el);
  }

  function clearError(input) {
    const wrap = input.closest('.field__wrap');
    if (!wrap) return;
    wrap.nextElementSibling?.classList.contains('field__error') &&
      wrap.nextElementSibling.remove();
  }

  function shakeInput(input) {
    const wrap = input.closest('.field__wrap');
    if (!wrap) return;
    wrap.style.animation = 'none';
    wrap.offsetHeight;
    wrap.style.animation = 'shake 0.35s ease';
    wrap.addEventListener('animationend', () => {
      wrap.style.animation = '';
    }, { once: true });
  }

  const shakeStyle = document.createElement('style');
  shakeStyle.textContent = `
    @keyframes shake {
      0%   { transform: translateX(0); }
      20%  { transform: translateX(-0.6rem); }
      40%  { transform: translateX(0.6rem); }
      60%  { transform: translateX(-0.4rem); }
      80%  { transform: translateX(0.4rem); }
      100% { transform: translateX(0); }
    }
  `;
  document.head.appendChild(shakeStyle);

})();
