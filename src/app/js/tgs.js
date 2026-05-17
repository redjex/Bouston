'use strict';

const TGS_BASE = '../../img/emoji/';
let _emojiEntries = [];

async function loadEmojiList() {
  if (_emojiEntries.length) return _emojiEntries;
  _emojiEntries = await window.electronAPI.listEmoji();
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

/* ── Shared IntersectionObserver для всех TGS-контейнеров ── */
const _tgsObserverMap = new Map(); // container → { mount, unmount }

const _tgsSharedObserver = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    const cb = _tgsObserverMap.get(entry.target);
    if (!cb) return;
    if (entry.isIntersecting) cb.mount();
    else cb.unmount();
  });
}, { threshold: 0.1 });

function createTgsPlayer(file, size = 40, autoplay = false, loop = true) {
  const container = document.createElement('div');
  container.style.cssText = `width:${size}px;height:${size}px;flex-shrink:0;overflow:visible;`;

  let animation = null;

  function mount() {
    if (animation) return;
    fetchTgsData(file).then(json => {
      if (!container.isConnected) return;
      animation = lottie.loadAnimation({
        container,
        animationData: structuredClone(json),
        renderer:  'svg',
        loop,
        autoplay,
        rendererSettings: {
          progressiveLoad: true,
          preserveAspectRatio: 'xMidYMid meet',
        },
      });
      if (!autoplay) animation.goToAndStop(0, true);
      if (!loop) {
        animation.addEventListener('complete', () => {
          animation?.goToAndStop(animation.totalFrames - 1, true);
        });
      }
    }).catch(() => {});
  }

  function unmount() {
    if (!animation) return;
    animation.destroy();
    animation = null;
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
  _tgsSharedObserver.observe(container);

  container.destroy = () => {
    unmount();
    _tgsSharedObserver.unobserve(container);
    _tgsObserverMap.delete(container);
  };
  return container;
}
