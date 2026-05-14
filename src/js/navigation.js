(function () {
  'use strict';

  let currentScreenId = 'screen-1';

  function goTo(nextId) {
    if (nextId === currentScreenId) return;

    const current = document.getElementById(currentScreenId);
    const next    = document.getElementById(nextId);

    if (!current || !next) return;

    current.classList.remove('screen--active');
    current.classList.add('screen--exit');

    current.addEventListener('transitionend', function cleanup() {
      current.classList.remove('screen--exit');
      current.removeEventListener('transitionend', cleanup);
    });

    next.classList.add('screen--active');
    currentScreenId = nextId;

    setTimeout(() => {
      const input = next.querySelector('.field__input');
      if (input) input.focus();
    }, 380);
  }

  window.AppNav = { goTo };
})();
