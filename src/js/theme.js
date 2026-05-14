(function () {
  'use strict';

  const ROOT = document.documentElement;
  const STORAGE_KEY = 'app-theme';

  function getInitialTheme() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function applyTheme(theme) {
    ROOT.setAttribute('data-theme', theme);
    localStorage.setItem(STORAGE_KEY, theme);
    setTimeout(() => window.electronAPI?.setTheme(theme), 300);
  }

  function toggleTheme() {
    const current = ROOT.getAttribute('data-theme') || 'light';
    applyTheme(current === 'light' ? 'dark' : 'light');
  }

  applyTheme(getInitialTheme());

  document.querySelectorAll('.btn-theme').forEach(btn => {
    btn.addEventListener('click', toggleTheme);
  });

  window.AppTheme = { toggle: toggleTheme, apply: applyTheme };
})();
