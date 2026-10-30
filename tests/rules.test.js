'use strict';
const test = require('node:test');
const assert = require('node:assert');
const R = require('../lib/rules.js');

test('missing or unknown rules fall back to the built-in ones', () => {
  assert.deepStrictEqual(R.cleanRules(null), R.DEFAULT_RULES);
  assert.deepStrictEqual(R.cleanRules({ v: 2, reelPath: '/x/' }), R.DEFAULT_RULES);
});

test('good fields are taken, bad ones are dropped one by one', () => {
  const r = R.cleanRules({
    v: 1,
    reelPath: '/clips/([a-z0-9]+)',
    feedPath: '([',               // broken pattern
    skipPath: 'x'.repeat(500),     // too long
    countAfterMs: 50               // too short
  });
  assert.strictEqual(r.reelPath, '/clips/([a-z0-9]+)');
  assert.strictEqual(r.feedPath, R.DEFAULT_RULES.feedPath);
  assert.strictEqual(r.skipPath, R.DEFAULT_RULES.skipPath);
  assert.strictEqual(r.countAfterMs, R.DEFAULT_RULES.countAfterMs);
});

test('only known fields survive', () => {
  const r = R.cleanRules({ v: 1, script: 'alert(1)', countAfterMs: 2000 });
  assert.strictEqual(r.script, undefined);
  assert.strictEqual(r.countAfterMs, 2000);
});

test('default patterns match Instagram reel addresses and skip chats and the feed', () => {
  const reel = new RegExp(R.DEFAULT_RULES.reelPath);
  const feed = new RegExp(R.DEFAULT_RULES.feedPath);
  const skip = new RegExp(R.DEFAULT_RULES.skipPath);
  assert.strictEqual(reel.exec('/reels/DAbc123xyz/')[1], 'DAbc123xyz');
  assert.strictEqual(reel.exec('/reel/DAbc123xyz/')[1], 'DAbc123xyz');
  assert.strictEqual(reel.exec('/someone/reel/DAbc123xyz/')[1], 'DAbc123xyz');
  assert.strictEqual(reel.test('/'), false);
  assert.strictEqual(feed.test('/reels/'), true);
  assert.strictEqual(feed.test('/'), false);
  assert.strictEqual(skip.test('/direct/t/123/'), true);
});

test('shipped rules.json is valid and equals the built-in rules', () => {
  const file = require('../rules.json');
  assert.deepStrictEqual(R.cleanRules(file), R.DEFAULT_RULES);
});
