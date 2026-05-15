'use strict';

/* ── Navigation ─────────────────────────────── */
let _currentView = 'feed';

function showView(name) {
  if (_currentView === name) return;
  _currentView = name;
  document.getElementById('view-feed').classList.toggle('view--active', name === 'feed');
  document.getElementById('view-profile').classList.toggle('view--active', name === 'profile');
  document.getElementById('nav-home').classList.toggle('active', name === 'feed');
  document.getElementById('nav-profile').classList.toggle('active', name === 'profile');
  if (name === 'feed') {
    renderFeedPosts();
    _scrollTopBtn.classList.toggle('visible', _feedEl.scrollTop > 300);
  } else {
    renderProfile();
    renderProfilePosts();
    _scrollTopBtn.classList.toggle('visible', _profileWrap.scrollTop > 300);
  }
}

document.getElementById('nav-home').addEventListener('click', () => showView('feed'));
document.getElementById('nav-profile').addEventListener('click', () => showView('profile'));

/* ── Scroll to top ───────────────────────────── */
const _scrollTopBtn = document.getElementById('btn-scroll-top');

_feedEl.addEventListener('scroll', () => {
  if (_currentView === 'feed')
    _scrollTopBtn.classList.toggle('visible', _feedEl.scrollTop > 300);
});
_profileWrap.addEventListener('scroll', () => {
  if (_currentView === 'profile')
    _scrollTopBtn.classList.toggle('visible', _profileWrap.scrollTop > 300);
});
_scrollTopBtn.addEventListener('click', () => {
  (_currentView === 'feed' ? _feedEl : _profileWrap).scrollTo({ top: 0, behavior: 'smooth' });
});

/* ── Close menu on outside click ────────────── */
document.addEventListener('click', closeAllMenus);

/* ── Init ────────────────────────────────────── */
renderFeedComposeAvatar();
renderFeedPosts();
