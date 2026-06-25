'use strict';

const BOUSTON_NOTIFICATION_AUDIO = 'audio/notification.mp3';
const BOUSTON_NOTIFICATION_GAIN = 1.8;
const _boustonNotificationSeen = new Set();
let _boustonNotificationAudioCtx = null;
let _boustonNotificationBufferPromise = null;
let _boustonNotificationAudioUnlocked = false;

function normalizeNotificationUsername(value) {
  return String(value || '').trim().replace(/^@+/, '').toLowerCase();
}

function getCurrentBoustonUsername() {
  return normalizeNotificationUsername(getProfile().username);
}

function textMentionsCurrentBoustonUser(text) {
  const username = getCurrentBoustonUsername();
  if (!username || !text) return false;
  const mentionRe = /(^|[^a-z0-9_])@([a-z0-9_]{3,20})(?=$|[^a-z0-9_])/gi;
  let match;
  while ((match = mentionRe.exec(String(text))) !== null) {
    if (normalizeNotificationUsername(match[2]) === username) return true;
  }
  return false;
}

function markNotificationSeen(key) {
  if (!key) return false;
  if (_boustonNotificationSeen.has(key)) return false;
  _boustonNotificationSeen.add(key);
  if (_boustonNotificationSeen.size > 300) {
    const first = _boustonNotificationSeen.values().next().value;
    _boustonNotificationSeen.delete(first);
  }
  return true;
}

function getNotificationAudioContext() {
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextCtor) return null;
  if (!_boustonNotificationAudioUnlocked) return null;
  if (!_boustonNotificationAudioCtx) _boustonNotificationAudioCtx = new AudioContextCtor();
  return _boustonNotificationAudioCtx;
}

function getNotificationBuffer(ctx) {
  if (_boustonNotificationBufferPromise) return _boustonNotificationBufferPromise;
  _boustonNotificationBufferPromise = fetch(BOUSTON_NOTIFICATION_AUDIO)
    .then(res => {
      if (!res.ok) throw new Error('notification audio not found');
      return res.arrayBuffer();
    })
    .then(data => ctx.decodeAudioData(data));
  return _boustonNotificationBufferPromise;
}

function unlockBoustonNotificationAudio() {
  try {
    _boustonNotificationAudioUnlocked = true;
    const ctx = getNotificationAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    getNotificationBuffer(ctx).catch(() => {});
  } catch {}
}

document.addEventListener('pointerdown', unlockBoustonNotificationAudio, { once: true, capture: true });
document.addEventListener('keydown', unlockBoustonNotificationAudio, { once: true, capture: true });

async function playBoustonNotification(key) {
  if (!markNotificationSeen(key)) return;

  try {
    const ctx = getNotificationAudioContext();
    if (!ctx) throw new Error('web audio unavailable');
    if (ctx.state === 'suspended') await ctx.resume();
    const buffer = await getNotificationBuffer(ctx);
    const source = ctx.createBufferSource();
    const gain = ctx.createGain();
    gain.gain.value = BOUSTON_NOTIFICATION_GAIN;
    source.buffer = buffer;
    source.connect(gain);
    gain.connect(ctx.destination);
    source.start(0);
  } catch {
    try {
      const audio = new Audio(BOUSTON_NOTIFICATION_AUDIO);
      audio.volume = 1;
      await audio.play();
    } catch {}
  }
}

function notifyAboutPostMention(post) {
  if (!post || !textMentionsCurrentBoustonUser(post.text)) return;
  playBoustonNotification(`post:${post.id || post.createdAt || post.text}`);
}

function notifyAboutComment(post, comment) {
  if (!comment) return;
  const authorUsername = comment.author?.tgUsername || '';
  const isOwnComment = !!authorUsername && authorUsername === window._tgUsername;
  const isOwnPost = !!(post?.isOwn || (post?.author?.tgUsername && post.author.tgUsername === window._tgUsername));
  const mentionsMe = textMentionsCurrentBoustonUser(comment.text);
  if (!mentionsMe && !(isOwnPost && !isOwnComment)) return;
  playBoustonNotification(`comment:${comment.id || comment.createdAt || comment.text}`);
}
