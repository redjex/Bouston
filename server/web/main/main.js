'use strict';

(() => {
  const video = document.getElementById('scroll-video');
  const hero = document.querySelector('.hero');
  const pageSteps = Array.from(document.querySelectorAll('.page-step'));
  const sections = Array.from(document.querySelectorAll('.hero, .intro, .features, .details, .open-source, .final'));
  if (!video || !hero) return;

  const SEEK_INTERVAL_MS = 58;
  const MIN_TIME_STEP = 0.035;
  const CATCH_UP = 0.38;

  let duration = 0;
  let targetTime = 0;
  let displayedTime = 0;
  let lastSeekAt = 0;
  let seekTimer = 0;

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function heroProgress() {
    const rect = hero.getBoundingClientRect();
    const travel = Math.max(1, rect.height - window.innerHeight);
    return clamp(-rect.top / travel, 0, 1);
  }

  function scheduleSeek(delay = 0) {
    if (seekTimer) return;
    seekTimer = window.setTimeout(runSeek, delay);
  }

  function runSeek() {
    seekTimer = 0;
    if (!duration || video.seeking) {
      scheduleSeek(SEEK_INTERVAL_MS);
      return;
    }

    const now = performance.now();
    const elapsed = now - lastSeekAt;
    if (elapsed < SEEK_INTERVAL_MS) {
      scheduleSeek(SEEK_INTERVAL_MS - elapsed);
      return;
    }

    const delta = targetTime - displayedTime;
    if (Math.abs(delta) < MIN_TIME_STEP) return;

    const nearEdge = targetTime === 0 || targetTime === duration;
    displayedTime = nearEdge ? targetTime : displayedTime + delta * CATCH_UP;
    lastSeekAt = now;
    video.currentTime = displayedTime;
  }

  function updateTarget() {
    if (!duration) return;
    targetTime = duration * heroProgress();
    scheduleSeek();
  }

  function updatePageSteps() {
    if (!pageSteps.length || !sections.length) return;

    const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    const atPageEnd = window.scrollY >= maxScroll - 4;
    const marker = window.scrollY + window.innerHeight * 0.48;
    let activeIndex = atPageEnd ? sections.length - 1 : 0;

    if (!atPageEnd) {
      sections.forEach((section, index) => {
        if (marker >= section.offsetTop) {
          activeIndex = index;
        }
      });
    }

    pageSteps.forEach((step, index) => {
      const distance = Math.min(4, Math.abs(index - activeIndex));
      step.className = `page-step page-step--level-${distance}`;
    });
  }

  function syncImmediately() {
    if (!duration) return;

    targetTime = duration * heroProgress();
    displayedTime = targetTime;
    window.clearTimeout(seekTimer);
    seekTimer = 0;
    lastSeekAt = performance.now();
    video.currentTime = displayedTime;
  }

  video.addEventListener('loadedmetadata', () => {
    duration = Number.isFinite(video.duration) ? video.duration : 0;
    video.pause();
    syncImmediately();
  });

  video.addEventListener('seeked', () => {
    if (Math.abs(targetTime - displayedTime) >= MIN_TIME_STEP) {
      scheduleSeek();
    }
  });

  video.addEventListener('error', () => {
    video.style.opacity = '0.08';
  });

  window.addEventListener('scroll', updateTarget, { passive: true });
  window.addEventListener('scroll', updatePageSteps, { passive: true });
  window.addEventListener('resize', () => {
    syncImmediately();
    updatePageSteps();
  });
  syncImmediately();
  updatePageSteps();
})();
