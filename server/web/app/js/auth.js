'use strict';

    const API = '';

    if (localStorage.getItem('bouston_token')) {
      window.location.href = '/web/app/app.html';
    }

    // Theme
    const html = document.documentElement;
    const savedTheme = localStorage.getItem('bouston_theme') || 'light';
    html.dataset.theme = savedTheme;
    updateThemeIcon(savedTheme);

    document.getElementById('btn-theme').addEventListener('click', () => {
      const next = html.dataset.theme === 'light' ? 'dark' : 'light';
      html.dataset.theme = next;
      localStorage.setItem('bouston_theme', next);
      updateThemeIcon(next);
    });

    function updateThemeIcon(theme) {
      document.getElementById('icon-moon').style.display = theme === 'light' ? '' : 'none';
      document.getElementById('icon-sun').style.display  = theme === 'dark'  ? '' : 'none';
    }

    // State
    let _step     = 1;
    let _username = '';
    let _codeSent = false;
    let _resendTimer = null;

    const steps = {
      1: document.getElementById('step-1'),
      2: document.getElementById('step-2'),
    };

    const codeReveal = document.getElementById('code-reveal');
    const btnNext    = document.getElementById('btn-next');

    function goStep(n) {
      Object.values(steps).forEach(el => el.classList.add('auth-step--hidden'));
      steps[n].classList.remove('auth-step--hidden');
      _step = n;
    }

    function showCodeInput() {
      codeReveal.classList.add('visible');
      btnNext.textContent = 'Войти';
    }

    function hideCodeInput() {
      codeReveal.classList.remove('visible');
      _codeSent = false;
      btnNext.textContent = 'Далее';
      document.getElementById('input-code').value = '';
      setProgress('progress-3', 0);
      clearError('error-code');
    }

    // Error helpers
    function showError(id, msg) {
      const el = document.getElementById(id);
      el.textContent = msg;
      el.style.display = 'block';
    }
    function clearError(id) {
      const el = document.getElementById(id);
      el.textContent = '';
      el.style.display = 'none';
    }

    // Progress fill
    function setProgress(id, pct) {
      const el = document.getElementById(id);
      if (el) el.style.width = pct + '%';
    }

    const usernameInput = document.getElementById('input-username');

    usernameInput.addEventListener('input', function () {
      const raw = this.value.replace(/^@/, '').replace(/[^a-zA-Z0-9_]/g, '');
      this.value = raw.length > 0 ? '@' + raw : '';
      clearError('error-username');
    });

    document.getElementById('input-code').addEventListener('input', function () {
      this.value = this.value.replace(/[^0-9A-Z]/gi, '').toUpperCase().slice(0, 6);
      setProgress('progress-3', (this.value.length / 6) * 100);
    });

    // Send code
    async function sendCode(username) {
      clearError('error-username');
      btnNext.disabled = true;
      btnNext.textContent = '...';
      try {
        const res = await fetch(`${API}/send-code`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.detail || 'Ошибка сервера');
        _username = username;
        _codeSent = true;
        showCodeInput();
        document.getElementById('input-code').focus();
        startResendTimer(300);
      } catch (err) {
        showError('error-username', err.message);
      } finally {
        btnNext.disabled = false;
        btnNext.textContent = 'Войти';
      }
    }

    // Resend timer
    function startResendTimer(secs) {
      clearInterval(_resendTimer);
      let s = secs;
      _resendTimer = setInterval(() => {
        s--;
        if (s <= 0) clearInterval(_resendTimer);
      }, 1000);
    }

    // Verify code
    async function verifyCode(code) {
      clearError('error-code');
      btnNext.disabled = true;
      btnNext.textContent = '...';
      try {
        const res = await fetch(`${API}/verify-code`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: _username, code }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.detail || 'Неверный код');
        localStorage.setItem('bouston_token', data.token);
        localStorage.setItem('bouston_user', JSON.stringify(data.user));
        document.cookie = `bouston_token=${data.token}; path=/; max-age=${60 * 60 * 24 * 30}; SameSite=Lax`;
        window.location.href = '/web/app/app.html';
      } catch (err) {
        showError('error-code', err.message);
      } finally {
        btnNext.disabled = false;
        btnNext.textContent = 'Войти';
      }
    }

    // Next button
    btnNext.addEventListener('click', () => {
      if (_step === 1) {
        goStep(2);
        document.getElementById('input-username').focus();
      } else if (_step === 2) {
        const val = document.getElementById('input-username').value.trim().replace(/^@/, '');
        if (!val) { showError('error-username', 'Введи юзернейм'); return; }
        if (val.length < 3) { showError('error-username', 'Минимум 3 символа'); return; }
        const code = document.getElementById('input-code').value.trim();
        if (_codeSent) {
          if (code.length !== 6) { showError('error-code', 'Введи 6-значный код'); return; }
          verifyCode(code);
        } else {
          sendCode(val);
        }
      }
    });

    // Back buttons
    document.getElementById('btn-back-2').addEventListener('click', () => {
      clearError('error-username');
      hideCodeInput();
      goStep(1);
    });

    // Enter key
    document.getElementById('input-username').addEventListener('keydown', e => {
      if (e.key === 'Enter') btnNext.click();
    });
    document.getElementById('input-code').addEventListener('keydown', e => {
      if (e.key === 'Enter') btnNext.click();
    });

