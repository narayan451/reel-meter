// Detection rules. The defaults ship inside the extension; a newer copy can be
// downloaded from rules.json in the public repo, so a change on Instagram's
// side can be fixed the same day without waiting for a Web Store review.
// Rules are plain data (two path patterns and a delay) - never code.
(function (root) {
  'use strict';

  const DEFAULT_RULES = Object.freeze({
    v: 1,
    reelPath: '/reels?/([A-Za-z0-9_-]{5,})', // address of one open reel, group 1 = its code
    feedPath: '^/reels/',                    // the Reels tab, where a playing video is a reel
    skipPath: '^/direct/',                   // chats: do nothing at all
    countAfterMs: 1500
  });

  const MAX_PATTERN = 200;

  function pattern(value, fallback) {
    if (typeof value !== 'string' || !value || value.length > MAX_PATTERN) return fallback;
    try {
      new RegExp(value);
      return value;
    } catch (e) {
      return fallback;
    }
  }

  function cleanRules(raw) {
    const r = Object.assign({}, DEFAULT_RULES);
    if (!raw || typeof raw !== 'object' || raw.v !== 1) return r;
    r.reelPath = pattern(raw.reelPath, r.reelPath);
    r.feedPath = pattern(raw.feedPath, r.feedPath);
    r.skipPath = pattern(raw.skipPath, r.skipPath);
    if (Number.isInteger(raw.countAfterMs) && raw.countAfterMs >= 500 && raw.countAfterMs <= 10000) {
      r.countAfterMs = raw.countAfterMs;
    }
    return r;
  }

  const api = { DEFAULT_RULES, cleanRules };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ReelRules = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
