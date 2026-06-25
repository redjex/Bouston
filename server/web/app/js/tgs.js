'use strict';

const TGS_BASE = '/emoji/';
let _emojiEntries = [];

async function loadEmojiList() {
  if (_emojiEntries.length) return _emojiEntries;
  try {
    const res = await fetch(`${API}/emoji`);
    if (res.ok) _emojiEntries = await res.json();
  } catch {}
  return _emojiEntries;
}

const _tgsCache = new Map();

async function fetchTgsData(file) {
  if (_tgsCache.has(file)) return _tgsCache.get(file);
  const res  = await fetch(TGS_BASE + encodeURIComponent(file));
  if (!res.ok) throw new Error(res.status);
  const buf  = await res.arrayBuffer();
  const json = JSON.parse(pako.inflate(new Uint8Array(buf), { to: 'string' }));
  _tgsCache.set(file, json);
  return json;
}

const _tgsObserverMap = new Map();

const _tgsSharedObserver = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    const cb = _tgsObserverMap.get(entry.target);
    if (!cb) return;
    if (entry.isIntersecting) cb.mount();
    else cb.unmount();
  });
}, { threshold: 0.1 });

function createTgsPlayer(file, size = 40, autoplay = false, loop = true, lazyVisible = true) {
  const container = document.createElement('div');
  container.style.cssText = `width:${size}px;height:${size}px;flex-shrink:0;overflow:visible;`;

  let animation = null;
  let mounting = false;
  let playWhenReady = false;
  let resolvePlay = null;

  function finishPlay() {
    animation?.goToAndStop(animation.totalFrames - 1, true);
    if (resolvePlay) {
      resolvePlay();
      resolvePlay = null;
    }
  }

  function mount() {
    if (animation || mounting) return;
    mounting = true;
    fetchTgsData(file).then(json => {
      if (!container.isConnected) return;
      container.innerHTML = '';
      animation = lottie.loadAnimation({
        container,
        animationData: structuredClone(json),
        renderer: 'svg',
        loop,
        autoplay,
        rendererSettings: { progressiveLoad: true, preserveAspectRatio: 'xMidYMid meet' },
      });
      if (!autoplay) {
        animation.stop();
        animation.goToAndStop(0, true);
        animation.pause();
      }
      if (!loop) {
        animation.addEventListener('complete', finishPlay);
      }
      if (playWhenReady) {
        playWhenReady = false;
        animation.goToAndPlay(0, true);
      }
    }).catch(() => {
      if (resolvePlay) {
        resolvePlay();
        resolvePlay = null;
      }
    }).finally(() => {
      mounting = false;
    });
  }

  function unmount() {
    if (!animation) return;
    animation.destroy();
    animation = null;
    mounting = false;
    container.innerHTML = '';
  }

  if (!autoplay && loop) {
    container.addEventListener('mouseenter', () => animation?.goToAndPlay(0, true));
    container.addEventListener('mouseleave', () => {
      animation?.stop();
      animation?.goToAndStop(0, true);
    });
  }

  _tgsObserverMap.set(container, { mount, unmount });
  if (lazyVisible) _tgsSharedObserver.observe(container);
  else mount();

  container.destroy = () => {
    unmount();
    if (lazyVisible) _tgsSharedObserver.unobserve(container);
    _tgsObserverMap.delete(container);
  };

  container.playOnce = () => new Promise(resolve => {
    if (!container.isConnected) {
      resolve();
      return;
    }
    resolvePlay = resolve;
    if (animation) {
      animation.goToAndPlay(0, true);
      return;
    }
    playWhenReady = true;
    mount();
  });

  container.showFirstFrame = () => {
    playWhenReady = false;
    animation?.stop();
    animation?.goToAndStop(0, true);
    animation?.pause();
  };

  return container;
}
