(() => {
  'use strict';
  const S = globalThis.ReelStats;
  const $ = (id) => document.getElementById(id);

  let settings = S.cleanSettings();
  let buckets = {};
  let health = null;
  let armTimer = null;

  function render() {
    const now = Date.now();
    const hours = settings.windowHours;
    const t = S.totals(buckets, now, hours);

    $('reels').textContent = settings.paused ? '||' : S.formatCount(t.reels);
    $('reels-label').textContent = settings.paused
      ? 'tracking is paused'
      : (t.reels === 1 ? 'reel' : 'reels') + ' in the last ' + hours + 'h';
    $('time').textContent = S.formatDuration(t.seconds);
    $('axis-start').textContent = hours + 'h ago';

    document.querySelectorAll('.seg button').forEach((b) => {
      b.setAttribute('aria-checked', String(Number(b.dataset.hours) === hours));
    });
    $('show-on-page').checked = settings.showOnPage;
    $('paused').checked = settings.paused;
    $('notice').hidden = !(health && Number.isFinite(health.stuckAt) && now - health.stuckAt < S.KEEP_MS);

    const per = S.hourly(buckets, now, hours);
    const max = Math.max(1, ...per);
    const spark = $('spark');
    spark.replaceChildren(...per.map((n, i) => {
      const bar = document.createElement('i');
      bar.style.height = Math.max(6, Math.round((n / max) * 100)) + '%';
      if (n) bar.className = 'on';
      bar.title = n + (n === 1 ? ' reel, ' : ' reels, ') + (hours - i) + 'h ago';
      return bar;
    }));
    spark.setAttribute('aria-label', 'Reels per hour over the last ' + hours + ' hours');
  }

  function saveSettings(patch) {
    settings = S.cleanSettings(Object.assign({}, settings, patch));
    chrome.storage.local.set({ settings });
    render();
  }

  document.querySelectorAll('.seg button').forEach((b) => {
    b.addEventListener('click', () => saveSettings({ windowHours: Number(b.dataset.hours) }));
  });
  $('show-on-page').addEventListener('change', (e) => saveSettings({ showOnPage: e.target.checked }));
  $('paused').addEventListener('change', (e) => saveSettings({ paused: e.target.checked }));

  // Two clicks to reset, so a slip of the mouse does not wipe the day.
  const resetBtn = $('reset');
  resetBtn.addEventListener('click', () => {
    if (!resetBtn.classList.contains('armed')) {
      resetBtn.classList.add('armed');
      resetBtn.textContent = 'Click again to reset';
      armTimer = setTimeout(disarm, 3000);
      return;
    }
    disarm();
    chrome.runtime.sendMessage({ t: 'reset' }).catch(() => {});
  });
  function disarm() {
    clearTimeout(armTimer);
    resetBtn.classList.remove('armed');
    resetBtn.textContent = 'Reset counts';
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.settings) settings = S.cleanSettings(changes.settings.newValue);
    if (changes.buckets) buckets = changes.buckets.newValue || {};
    if (changes.health) health = changes.health.newValue || null;
    render();
  });

  $('ver').textContent = 'v' + chrome.runtime.getManifest().version + ' · by Narayan Jangid';

  chrome.storage.local.get(['buckets', 'settings', 'health']).then((d) => {
    settings = S.cleanSettings(d.settings);
    buckets = d.buckets || {};
    health = d.health || null;
    render();
  });
  setInterval(render, 30000);
})();
