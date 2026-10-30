'use strict';
const test = require('node:test');
const assert = require('node:assert');
const S = require('../lib/stats.js');

const H = 3600 * 1000;
const NOW = Date.UTC(2026, 9, 30, 12, 0, 0);

test('add and totals inside the window', () => {
  let b = {};
  b = S.add(b, NOW - 2 * H, 1, 30);
  b = S.add(b, NOW - 2 * H, 1, 20);
  b = S.add(b, NOW, 1, 10);
  assert.deepStrictEqual(S.totals(b, NOW, 24), { reels: 3, seconds: 60 });
});

test('12h window leaves out older reels, 24h keeps them', () => {
  let b = {};
  b = S.add(b, NOW - 18 * H, 4, 100);
  b = S.add(b, NOW - 1 * H, 2, 40);
  assert.strictEqual(S.totals(b, NOW, 12).reels, 2);
  assert.strictEqual(S.totals(b, NOW, 24).reels, 6);
});

test('data older than 24h is erased on the next write', () => {
  let b = S.add({}, NOW - 25 * H, 9, 900);
  b = S.add(b, NOW, 1, 5);
  assert.strictEqual(Object.keys(b).length, 1);
  assert.deepStrictEqual(S.totals(b, NOW, 24), { reels: 1, seconds: 5 });
});

test('prune drops broken and future buckets', () => {
  const idx = Math.floor(NOW / S.BUCKET_MS);
  const b = S.prune({
    [idx]: [1, 2],
    [idx + 50]: [5, 5],
    abc: [1, 1],
    [idx - 1]: 'x',
    [idx - 2]: [-1, 3]
  }, NOW);
  assert.deepStrictEqual(b, { [idx]: [1, 2] });
});

test('store holds at most one day of 5-minute buckets', () => {
  let b = {};
  for (let t = NOW - 48 * H; t <= NOW; t += S.BUCKET_MS) b = S.add(b, t, 1, 1);
  assert.ok(Object.keys(b).length <= 24 * 12 + 2);
});

test('hourly bars line up oldest to newest', () => {
  let b = {};
  b = S.add(b, NOW - 11.5 * H, 1, 0);
  b = S.add(b, NOW - 30 * 60 * 1000, 3, 0);
  const bars = S.hourly(b, NOW, 12);
  assert.strictEqual(bars.length, 12);
  assert.strictEqual(bars[11], 3);
  assert.strictEqual(bars[0], 1);
});

test('settings are cleaned', () => {
  assert.deepStrictEqual(S.cleanSettings(null), S.DEFAULTS);
  assert.deepStrictEqual(
    S.cleanSettings({ windowHours: 12, showOnPage: false, paused: true, evil: 1 }),
    { windowHours: 12, showOnPage: false, paused: true }
  );
  assert.strictEqual(S.cleanSettings({ windowHours: 7 }).windowHours, 24);
  assert.strictEqual(S.cleanSettings({ paused: 'yes' }).paused, false);
});

test('formatting', () => {
  assert.strictEqual(S.formatDuration(0), '0m');
  assert.strictEqual(S.formatDuration(59 * 60), '59m');
  assert.strictEqual(S.formatDuration(65 * 60), '1h 05m');
  assert.strictEqual(S.formatCount(999), '999');
  assert.strictEqual(S.formatCount(1250), '1.2k');
  assert.strictEqual(S.formatCount(15300), '15k');
});
