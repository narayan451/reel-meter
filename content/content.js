// Reel Meter content script for www.instagram.com.
//
// What it looks at: the page address (to know a reel is open), whether a
// <video> is playing, and where things sit on screen (so the counter never
// covers them). It never reads chats, captions, usernames or any page text,
// never touches a video, and never stores which reel was watched.
(() => {
  'use strict';
  if (window.top !== window || window.__reelMeter) return;
  window.__reelMeter = true;

  const S = globalThis.ReelStats;
  const R = globalThis.ReelRules;
  const FLUSH_MS = 15000;        // watch time is sent at most this often
  const TICK_MS = 500;
  const PLACE_MS = 1500;
  const MARGIN = 12;
  const SEEN_LIMIT = 300;
  const STUCK_AFTER_S = 90;      // this much reel time with zero counts = detection broke

  let settings = S.cleanSettings();
  let buckets = {};
  let alive = true;
  let rules = R.DEFAULT_RULES;
  let reelRe = null;
  let feedRe = null;
  let skipRe = null;

  function useRules(raw) {
    const r = R.cleanRules(raw);
    try {
      reelRe = new RegExp(r.reelPath);
      feedRe = new RegExp(r.feedPath);
      skipRe = new RegExp(r.skipPath);
      rules = r;
    } catch (e) {
      if (!reelRe) useRules(null);
    }
  }
  useRules(null);

  // Reels seen in this tab, kept only in memory so scrolling back up does not
  // count a reel twice. Gone when the tab closes; never saved anywhere.
  const seen = new Set();
  const videoIds = new WeakMap();
  let nextVideoId = 1;
  let current = null;
  let currentSince = 0;
  let pendingReels = 0;
  let pendingSeconds = 0;
  let lastTick = performance.now();
  let lastFlush = Date.now();
  let tabReels = 0;
  let tabReelSeconds = 0;
  let stuckReported = false;

  const timers = [];

  function extensionAlive() {
    try {
      return Boolean(chrome.runtime && chrome.runtime.id);
    } catch (e) {
      return false;
    }
  }

  // After an extension update the old copy of this script is cut off; it
  // quietly removes itself and the new copy takes over.
  function shutdown() {
    if (!alive) return;
    alive = false;
    timers.forEach(clearInterval);
    window.removeEventListener('resize', schedulePlace);
    window.removeEventListener('scroll', schedulePlace, true);
    document.removeEventListener('fullscreenchange', schedulePlace);
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('pagehide', flush);
    if (host) host.remove();
    window.__reelMeter = false;
  }

  function inChats() {
    return skipRe.test(location.pathname);
  }

  function playing(v) {
    return !v.paused && !v.ended && v.readyState > 2;
  }

  function videoPlaying() {
    const list = document.getElementsByTagName('video');
    for (let i = 0; i < list.length; i++) {
      if (playing(list[i])) return true;
    }
    return false;
  }

  // The biggest playing video on screen, as an in-memory key.
  function activeVideoKey() {
    const list = document.getElementsByTagName('video');
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let best = null;
    let bestArea = 0;
    for (let i = 0; i < list.length; i++) {
      const v = list[i];
      if (!playing(v)) continue;
      const b = v.getBoundingClientRect();
      const area = Math.max(0, Math.min(b.right, vw) - Math.max(b.left, 0)) *
        Math.max(0, Math.min(b.bottom, vh) - Math.max(b.top, 0));
      if (area > bestArea) {
        best = v;
        bestArea = area;
      }
    }
    if (!best) return null;
    if (best.currentSrc) return 'v:' + best.currentSrc;
    if (!videoIds.has(best)) videoIds.set(best, nextVideoId++);
    return 'e:' + videoIds.get(best);
  }

  // Which reel is open right now. First the address (/reels/<code>/); if
  // Instagram stops putting the code there, the playing video on the Reels tab.
  // The home feed is never counted.
  function reelKey() {
    const path = location.pathname;
    if (skipRe.test(path)) return null;
    const m = reelRe.exec(path);
    if (m) return 'c:' + (m[1] || m[0]);
    if (feedRe.test(path)) return activeVideoKey();
    return null;
  }

  function onReelPage() {
    const path = location.pathname;
    return !skipRe.test(path) && (reelRe.test(path) || feedRe.test(path));
  }

  // Lets the popup say "Instagram changed something" instead of silently
  // showing low numbers. Only a timestamp is saved.
  function checkStuck() {
    if (!stuckReported && tabReels === 0 && tabReelSeconds >= STUCK_AFTER_S) {
      stuckReported = true;
      chrome.storage.local.set({ health: { stuckAt: Date.now() } }).catch(() => {});
    } else if (stuckReported && tabReels > 0) {
      stuckReported = false;
      chrome.storage.local.remove('health').catch(() => {});
    }
  }

  function send(msg) {
    if (!extensionAlive()) return shutdown();
    try {
      chrome.runtime.sendMessage(msg).catch(() => {});
    } catch (e) {
      shutdown();
    }
  }

  function flush() {
    lastFlush = Date.now();
    const seconds = Math.min(Math.floor(pendingSeconds), 120);
    if (!pendingReels && !seconds) return;
    const reels = Math.min(pendingReels, 10);
    pendingReels -= reels;
    pendingSeconds -= seconds;
    send({ t: 'add', reels, seconds });
  }

  function tick() {
    const now = performance.now();
    const dt = Math.min(now - lastTick, 2000) / 1000;
    lastTick = now;

    const visible = document.visibilityState === 'visible';
    const key = visible ? reelKey() : null;
    if (key !== current) {
      current = key;
      currentSince = now;
    }

    if (!settings.paused && visible) {
      if (key && !seen.has(key) && now - currentSince >= rules.countAfterMs) {
        seen.add(key);
        if (seen.size > SEEN_LIMIT) seen.delete(seen.values().next().value);
        pendingReels++;
        tabReels++;
        flush();
      }
      if (onReelPage() && videoPlaying()) {
        pendingSeconds += dt;
        tabReelSeconds += dt;
      }
      checkStuck();
    }

    if (Date.now() - lastFlush >= FLUSH_MS) flush();
  }

  function onVisibility() {
    if (document.visibilityState === 'hidden') flush();
    schedulePlace();
  }

  // ---------- on-page counter ----------

  const CSS = `
    :host { all: initial; }
    .pill {
      display: inline-flex; align-items: center; gap: 6px;
      height: 26px; padding: 0 10px 0 8px; box-sizing: border-box;
      border-radius: 13px; white-space: nowrap;
      font: 600 12px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
      font-variant-numeric: tabular-nums; letter-spacing: .1px;
      color: #f2f5ea; background: rgba(18, 20, 14, .78);
      border: 1px solid rgba(200, 243, 74, .28);
      box-shadow: 0 2px 10px rgba(0, 0, 0, .25);
      backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
    }
    .dot { width: 7px; height: 7px; border-radius: 50%; background: #c8f34a; flex: none; }
    .paused .dot { background: #8a8a8a; }
    .sep { opacity: .45; }
    .win { opacity: .6; font-weight: 500; }
  `;

  let host = null;
  let pill = null;
  let countEl = null;
  let timeEl = null;
  let winEl = null;
  let spot = null; // { x, y } of the current free place

  function buildPill() {
    host = document.createElement('div');
    host.style.cssText =
      'all:initial;position:fixed;left:0;top:0;z-index:2147483646;' +
      'pointer-events:none;opacity:0;transition:opacity .2s;contain:layout style;';
    host.setAttribute('aria-hidden', 'true');
    const root = host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = CSS;
    pill = document.createElement('div');
    pill.className = 'pill';
    const dot = document.createElement('span');
    dot.className = 'dot';
    countEl = document.createElement('span');
    const sep = document.createElement('span');
    sep.className = 'sep';
    sep.textContent = '·';
    timeEl = document.createElement('span');
    winEl = document.createElement('span');
    winEl.className = 'win';
    pill.append(dot, countEl, sep, timeEl, winEl);
    root.append(style, pill);
    document.documentElement.appendChild(host);
  }

  function render() {
    if (!host) return;
    const t = S.totals(buckets, Date.now(), settings.windowHours);
    pill.classList.toggle('paused', settings.paused);
    countEl.textContent = settings.paused ? 'Paused' : S.formatCount(t.reels) + (t.reels === 1 ? ' reel' : ' reels');
    timeEl.textContent = S.formatDuration(t.seconds);
    winEl.textContent = settings.windowHours + 'h';
    schedulePlace();
  }

  // Things the counter must never sit on.
  const BLOCK_TAGS = new Set([
    'VIDEO', 'IMG', 'PICTURE', 'CANVAS', 'SVG', 'IFRAME', 'A', 'BUTTON', 'INPUT',
    'TEXTAREA', 'SELECT', 'LABEL', 'SPAN', 'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
    'TIME', 'NAV', 'HEADER', 'FOOTER', 'ASIDE', 'FORM', 'UL', 'OL', 'LI'
  ]);
  const BLOCK_ROLES = new Set([
    'button', 'link', 'textbox', 'menuitem', 'tab', 'tablist', 'img', 'slider',
    'checkbox', 'switch', 'search', 'navigation', 'banner', 'menu', 'listbox'
  ]);

  function blocked(el) {
    if (el === host || el === document.documentElement || el === document.body) return false;
    if (BLOCK_TAGS.has(el.tagName.toUpperCase())) return true;
    const role = el.getAttribute && el.getAttribute('role');
    if (role && BLOCK_ROLES.has(role)) return true;
    if (el.isContentEditable) return true;
    return false;
  }

  function overlaps(a, b, pad) {
    return a.x < b.right + pad && a.x + a.w > b.left - pad &&
      a.y < b.bottom + pad && a.y + a.h > b.top - pad;
  }

  function isFree(r, videos, vw, vh) {
    if (r.x < 0 || r.y < 0 || r.x + r.w > vw || r.y + r.h > vh) return false;
    for (const v of videos) if (overlaps(r, v, 8)) return false;
    const pts = [
      [r.x + 2, r.y + 2], [r.x + r.w - 2, r.y + 2],
      [r.x + 2, r.y + r.h - 2], [r.x + r.w - 2, r.y + r.h - 2],
      [r.x + r.w / 2, r.y + r.h / 2]
    ];
    for (const [x, y] of pts) {
      // The counter has pointer-events:none, so it never shows up here.
      for (const el of document.elementsFromPoint(x, y)) {
        if (blocked(el)) return false;
      }
    }
    return true;
  }

  function visibleVideos(vw, vh) {
    const out = [];
    const list = document.getElementsByTagName('video');
    for (let i = 0; i < list.length; i++) {
      const b = list[i].getBoundingClientRect();
      if (b.width > 0 && b.height > 0 && b.bottom > 0 && b.right > 0 && b.top < vh && b.left < vw) out.push(b);
    }
    return out;
  }

  function candidates(w, h, vw, vh) {
    const right = vw - w - MARGIN;
    const bottom = vh - h - MARGIN;
    const midX = Math.round((vw - w) / 2);
    const midY = Math.round((vh - h) / 2);
    return [
      { x: right, y: MARGIN }, { x: right, y: bottom },
      { x: MARGIN, y: MARGIN }, { x: MARGIN, y: bottom },
      { x: right, y: midY }, { x: midX, y: MARGIN },
      { x: midX, y: bottom }, { x: MARGIN, y: midY }
    ];
  }

  function hide() {
    host.style.opacity = '0';
    spot = null;
  }

  function place() {
    placeQueued = false;
    if (!host) return;
    if (!settings.showOnPage || inChats() || document.fullscreenElement ||
        document.visibilityState !== 'visible') return hide();

    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    const w = pill.offsetWidth;
    const h = pill.offsetHeight;
    if (!w || !h) return hide();
    const videos = visibleVideos(vw, vh);

    // Stay put while the current place is still free, so it does not jump.
    if (spot && isFree({ x: spot.x, y: spot.y, w, h }, videos, vw, vh)) return;

    for (const c of candidates(w, h, vw, vh)) {
      if (isFree({ x: c.x, y: c.y, w, h }, videos, vw, vh)) {
        spot = c;
        host.style.transform = `translate(${c.x}px, ${c.y}px)`;
        host.style.opacity = '1';
        return;
      }
    }
    // No empty corner (small window): hide. The toolbar badge still shows the count.
    hide();
  }

  let placeQueued = false;
  function schedulePlace() {
    if (placeQueued || !alive) return;
    placeQueued = true;
    requestAnimationFrame(place);
  }

  // ---------- wiring ----------

  function onStorage(changes, area) {
    if (!alive || area !== 'local') return;
    if (changes.settings) settings = S.cleanSettings(changes.settings.newValue);
    if (changes.buckets) buckets = changes.buckets.newValue || {};
    if (changes.rules) useRules(changes.rules.newValue);
    render();
  }

  function start() {
    buildPill();
    chrome.storage.local.get(['buckets', 'settings', 'rules']).then((d) => {
      settings = S.cleanSettings(d.settings);
      buckets = d.buckets || {};
      useRules(d.rules);
      render();
    }, () => {});
    chrome.storage.onChanged.addListener(onStorage);

    timers.push(setInterval(tick, TICK_MS));
    timers.push(setInterval(place, PLACE_MS));
    timers.push(setInterval(render, 30000)); // the 12/24 h window keeps rolling
    window.addEventListener('resize', schedulePlace);
    window.addEventListener('scroll', schedulePlace, true);
    document.addEventListener('fullscreenchange', schedulePlace);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', flush);
  }

  start();
})();
