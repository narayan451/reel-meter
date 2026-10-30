// Reel Meter service worker. The only place that writes the counts, so two
// Instagram tabs can never overwrite each other. No network, no remote code.
importScripts('lib/stats.js', 'lib/rules.js');

const S = self.ReelStats;
const R = self.ReelRules;
const IG_ORIGIN = 'https://www.instagram.com/';
// Raw link to rules.json in the public repo. Empty = only the built-in rules.
// The request carries nothing about the user; only the file comes back.
const RULES_URL = 'https://raw.githubusercontent.com/narayan451/reel-meter/main/rules.json';
const RULES_MAX_BYTES = 4096;
const MAX_REELS_PER_MSG = 10;
const MAX_SECONDS_PER_MSG = 120;

let chain = Promise.resolve();

// Run storage read-modify-write jobs one at a time.
function serial(job) {
  const next = chain.then(job, job);
  chain = next.catch(() => {});
  return next;
}

async function load() {
  const d = await chrome.storage.local.get(['buckets', 'settings']);
  return { buckets: d.buckets || {}, settings: S.cleanSettings(d.settings) };
}

async function paintBadge(buckets, settings) {
  const t = S.totals(buckets, Date.now(), settings.windowHours);
  const text = settings.paused ? '||' : (t.reels ? S.formatCount(t.reels) : '');
  await chrome.action.setBadgeBackgroundColor({ color: settings.paused ? '#6b6b6b' : '#1f2a0a' });
  if (chrome.action.setBadgeTextColor) {
    await chrome.action.setBadgeTextColor({ color: settings.paused ? '#ffffff' : '#c8f34a' });
  }
  await chrome.action.setBadgeText({ text });
  await chrome.action.setTitle({
    title: settings.paused
      ? 'Reel Meter - paused'
      : `Reel Meter - ${t.reels} reels, ${S.formatDuration(t.seconds)} in the last ${settings.windowHours}h`
  });
}

function record(reels, seconds) {
  return serial(async () => {
    const { buckets, settings } = await load();
    if (settings.paused) return;
    const next = S.add(buckets, Date.now(), reels, seconds);
    await chrome.storage.local.set({ buckets: next });
    await paintBadge(next, settings);
  });
}

// Erase data older than 24 h even when Instagram is not open.
function sweep() {
  return serial(async () => {
    const { buckets, settings } = await load();
    const next = S.prune(buckets, Date.now());
    if (Object.keys(next).length !== Object.keys(buckets).length) {
      await chrome.storage.local.set({ buckets: next });
    }
    await paintBadge(next, settings);
  });
}

function reset() {
  return serial(async () => {
    const { settings } = await load();
    await chrome.storage.local.set({ buckets: {} });
    await paintBadge({}, settings);
  });
}

async function refreshRules() {
  if (!RULES_URL) return;
  try {
    const res = await fetch(RULES_URL, { cache: 'no-store', credentials: 'omit', redirect: 'error' });
    if (!res.ok) return;
    const text = await res.text();
    if (text.length > RULES_MAX_BYTES) return;
    await chrome.storage.local.set({ rules: R.cleanRules(JSON.parse(text)) });
  } catch (e) {
    // offline or a bad file: keep the rules we already have
  }
}

function ensureAlarms() {
  chrome.alarms.create('sweep', { periodInMinutes: 5 });
  chrome.alarms.create('rules', { periodInMinutes: 360 });
}

chrome.runtime.onInstalled.addListener(async () => {
  const d = await chrome.storage.local.get('settings');
  await chrome.storage.local.set({ settings: S.cleanSettings(d.settings) });
  ensureAlarms();
  sweep();
  refreshRules();
});

chrome.runtime.onStartup.addListener(() => {
  ensureAlarms();
  sweep();
  refreshRules();
});

chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === 'sweep') sweep();
  if (a.name === 'rules') refreshRules();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.settings) sweep();
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || !msg || typeof msg !== 'object') return;
  const from = sender.url || '';

  // Counts are accepted only from our content script on instagram.com.
  if (msg.t === 'add' && from.startsWith(IG_ORIGIN)) {
    const reels = Number.isInteger(msg.reels) ? msg.reels : 0;
    const seconds = Number.isInteger(msg.seconds) ? msg.seconds : 0;
    if (reels < 0 || reels > MAX_REELS_PER_MSG || seconds < 0 || seconds > MAX_SECONDS_PER_MSG) return;
    if (reels === 0 && seconds === 0) return;
    record(reels, seconds);
    return;
  }

  // Reset is accepted only from our own popup.
  if (msg.t === 'reset' && from.startsWith(chrome.runtime.getURL(''))) {
    reset().then(() => sendResponse({ ok: true }), () => sendResponse({ ok: false }));
    return true;
  }
});
