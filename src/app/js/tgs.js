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

function createTgsPlayer(file, size = 40, autoplay = false) {
  const container = document.createElement('div');
  container.style.cssText = `width:${size}px;height:${size}px;flex-shrink:0;overflow:visible;`;

  let animation = null;

  function mount() {
    if (animation) return;
    fetchTgsData(file).then(json => {
      if (!container.isConnected) return;
      animation = lottie.loadAnimation({
        container,
        animationData: JSON.parse(JSON.stringify(json)),
        renderer:  'svg',
        loop:      true,
        autoplay,
        rendererSettings: {
          progressiveLoad: true,
          preserveAspectRatio: 'xMidYMid meet',
        },
      });
      if (!autoplay) animation.goToAndStop(0, true);
    }).catch(() => {});
  }

  function unmount() {
    if (!animation) return;
    animation.destroy();
    animation = null;
    const canvas = container.querySelector('canvas');
    if (canvas) canvas.remove();
  }

  if (!autoplay) {
    container.addEventListener('mouseenter', () => animation?.goToAndPlay(0, true));
    container.addEventListener('mouseleave', () => {
      animation?.stop();
      animation?.goToAndStop(0, true);
    });
  }

  const observer = new IntersectionObserver(entries => {
    if (entries[0].isIntersecting) mount();
    else unmount();
  }, { threshold: 0.1 });

  observer.observe(container);
  container.destroy = () => { unmount(); observer.disconnect(); };
  return container;
}
