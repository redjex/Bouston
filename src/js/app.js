/* ─────────────────────────────────────────
   app.js — главная логика приложения
   Здесь вся бизнес-логика регистрации
───────────────────────────────────────── */

(function () {
  'use strict';

  // ── Шаг 1: Юзернейм ──────────────────

  const inputUsername = document.getElementById('input-username');
  const btnNext1      = document.getElementById('btn-next-1');

  // Автоподстановка @ при вводе
  inputUsername.addEventListener('input', () => {
    let val = inputUsername.value;

    // Убираем кириллицу — только латиница и цифры
    val = val.replace(/[^a-zA-Z0-9@_.\-]/g, '');

    // Поле пустое — возвращаем в исходное состояние
    if (!val) {
      inputUsername.value = '';
      return;
    }

    // Подставляем @ в начало
    if (!val.startsWith('@')) {
      val = '@' + val.replace(/@/g, '');
    }

    // Остался только @ (удалили последний символ) — очищаем
    if (val === '@') {
      inputUsername.value = '';
      return;
    }

    inputUsername.value = val;
  });

  inputUsername.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleStep1();
  });

  // Кнопка «Дальше» на шаге 1
  btnNext1.addEventListener('click', handleStep1);

  function handleStep1() {
    const username = inputUsername.value.trim();

    // ── Валидация ─────────────────────────
    if (!username) {
      shakeInput(inputUsername);
      return;
    }

    // TODO: здесь можно добавить проверку юзернейма через API
    // Например: await checkUsernameAvailable(username)

    console.log('[app] Юзернейм:', username);

    // Переходим на шаг 2
    window.AppNav.goTo('screen-2');
  }

  // ── Шаг 2: Код подтверждения ──────────

  const inputCode = document.getElementById('input-code');
  const btnNext2  = document.getElementById('btn-next-2');
  const btnBack   = document.getElementById('btn-back');

  // Кнопка назад — возврат на экран юзернейма
  btnBack.addEventListener('click', () => {
    inputCode.value = '';
    window.AppNav.goTo('screen-1');
  });

  // Автокапитализация кода
  inputCode.addEventListener('input', function () {
    const pos = this.selectionStart;
    this.value = this.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    this.setSelectionRange(pos, pos);
  });

  // Кнопка «Дальше» на шаге 2
  btnNext2.addEventListener('click', handleStep2);

  // Enter в поле кода
  inputCode.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleStep2();
  });

  function handleStep2() {
    const code = inputCode.value.trim();

    // ── Валидация ─────────────────────────
    if (code.length < 6) {
      shakeInput(inputCode);
      return;
    }

    console.log('[app] Код подтверждения:', code);

    // Сохраняем position: 1 и переходим в главное меню
    window.electronAPI?.authComplete();
  }

  // ── Утилиты ───────────────────────────

  /**
   * Анимация тряски поля при ошибке
   * @param {HTMLInputElement} input
   */
  function shakeInput(input) {
    const wrap = input.closest('.field__wrap');
    if (!wrap) return;

    wrap.style.animation = 'none';
    wrap.offsetHeight;    // reflow
    wrap.style.animation = 'shake 0.35s ease';

    wrap.addEventListener('animationend', () => {
      wrap.style.animation = '';
    }, { once: true });
  }

  // CSS-анимация тряски — добавляем в <head> программно
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

  // Фокус на первый инпут при старте
  setTimeout(() => inputUsername.focus(), 100);

})();
