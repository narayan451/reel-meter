// Shared, dependency-free math for Reel Meter.
// Loaded by the service worker (importScripts), the content script, the popup
// and the node tests. Only counts and seconds are stored - never which reel.
(function (root) {
  'use strict';

  const BUCKET_MS = 5 * 60 * 1000;          // one bucket = 5 minutes
  const KEEP_MS = 24 * 60 * 60 * 1000;      // anything older than 24 h is erased
  const WINDOWS = [12, 24];

  const DEFAULTS = Object.freeze({
    windowHours: 24,   // 24 or 12: what the badge and the on-page counter show
    showOnPage: true,  // small counter on instagram.com
    paused: false      // stop counting without uninstalling
  });

  function index(now) {
    return Math.floor(now / BUCKET_MS);
  }

  function cleanSettings(raw) {
    const s = Object.assign({}, DEFAULTS);
    if (raw && typeof raw === 'object') {
      if (WINDOWS.includes(raw.windowHours)) s.windowHours = raw.windowHours;
      if (typeof raw.showOnPage === 'boolean') s.showOnPage = raw.showOnPage;
      if (typeof raw.paused === 'boolean') s.paused = raw.paused;
    }
    return s;
  }

  function validBucket(v) {
    return Array.isArray(v) && v.length === 2 &&
      Number.isFinite(v[0]) && v[0] >= 0 && Number.isFinite(v[1]) && v[1] >= 0;
  }

  // Buckets look like { "<bucket index>": [reels, seconds] }.
  // Drops old buckets, broken values and buckets from the future (clock jumps).
  function prune(buckets, now) {
    const oldest = index(now - KEEP_MS);
    const newest = index(now) + 1;
    const out = {};
    if (!buckets || typeof buckets !== 'object') return out;
    for (const k of Object.keys(buckets)) {
      const i = Number(k);
      if (Number.isInteger(i) && i >= oldest && i <= newest && validBucket(buckets[k])) {
        out[k] = [buckets[k][0], buckets[k][1]];
      }
    }
    return out;
  }

  function add(buckets, now, reels, seconds) {
    const out = prune(buckets, now);
    const k = String(index(now));
    const cur = out[k] || [0, 0];
    out[k] = [cur[0] + reels, cur[1] + seconds];
    return out;
  }

  function totals(buckets, now, hours) {
    const from = index(now - hours * 3600 * 1000);
    const to = index(now);
    let reels = 0;
    let seconds = 0;
    for (const k of Object.keys(buckets || {})) {
      const i = Number(k);
      if (i >= from && i <= to && validBucket(buckets[k])) {
        reels += buckets[k][0];
        seconds += buckets[k][1];
      }
    }
    return { reels, seconds };
  }

  // Reels per hour for the sparkline, oldest hour first.
  function hourly(buckets, now, hours) {
    const out = new Array(hours).fill(0);
    const hourMs = 3600 * 1000;
    for (const k of Object.keys(buckets || {})) {
      if (!validBucket(buckets[k])) continue;
      const age = now - Number(k) * BUCKET_MS;
      const slot = hours - 1 - Math.floor(age / hourMs);
      if (slot >= 0 && slot < hours) out[slot] += buckets[k][0];
    }
    return out;
  }

  function formatDuration(seconds) {
    const m = Math.floor(seconds / 60);
    if (m < 60) return m + 'm';
    const h = Math.floor(m / 60);
    const rest = m % 60;
    return h + 'h ' + String(rest).padStart(2, '0') + 'm';
  }

  function formatCount(n) {
    if (n < 1000) return String(n);
    const k = Math.floor(n / 100) / 10;
    return (k >= 10 ? Math.floor(k) : k) + 'k';
  }

  const api = {
    BUCKET_MS, KEEP_MS, WINDOWS, DEFAULTS,
    cleanSettings, prune, add, totals, hourly, formatDuration, formatCount
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ReelStats = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
