# Reel Meter

A small Chrome extension by **Narayan Jangid** at **Laya Labs** that shows how many Instagram reels
you watched, and for how long, in the last 24 hours (or 12, your pick).

It only counts. It never pauses a reel, never blocks anything and never sits on
top of the video or Instagram's buttons.

Free to use. More tools: https://layalabs.netlify.app

## Privacy

- Only two numbers are saved: reels and seconds, in 5-minute slots, on your device.
- Anything older than 24 hours is erased on its own. "Reset counts" erases it now.
- It never reads chats (it does nothing on `/direct/` pages), captions, usernames
  or which reel you watched.
- Nothing about you is ever sent anywhere. No account, no analytics, no ads.
- The only download is `rules.json` from this repo (see below). It is plain data.

Full policy: [PRIVACY.md](PRIVACY.md)

## How it counts

- A reel counts when its address (`/reels/<code>/`, `/reel/<code>/`) stays open
  for 1.5 seconds. Quick skips are not counted, and going back to a reel in the
  same tab does not count it twice.
- If Instagram ever stops putting the code in the address, the Reels tab falls
  back to counting each new video that starts playing.
- The home feed is not counted. Sponsored reels are, since you watched them too.
- Watch time adds up while a reel page is on screen and a video is playing.

## The counter on the page

The little pill finds a free corner: no video, picture, button, text or menu
under it. If that spot gets busy it moves; if there is no free spot (small
window, fullscreen) it hides and the number stays on the toolbar icon.
Clicks go straight through it.

## When Instagram changes something

The parts that depend on Instagram live in [`rules.json`](rules.json): two path
patterns and a delay. The extension checks this file every 6 hours, so a fix
here reaches everyone the same day, without waiting for a Web Store review.

Every value is checked before use (known fields only, size limits, patterns
must compile). A bad file is ignored and the built-in rules keep working. It
cannot run code.

If a tab spends 90 seconds on reels with no count, the popup tells the user
something changed on Instagram's side, so they don't just see low numbers.

## Install from source

1. Open `chrome://extensions` and turn on Developer mode.
2. Click **Load unpacked** and pick this folder.
3. Open Instagram. Reload any Instagram tab that was already open.

## Project layout

```
manifest.json        permissions: storage, alarms; runs on www.instagram.com only
background.js        writes the counts, toolbar badge, 24h cleanup, rules download
content/content.js   reel detection, watch time, on-page counter
lib/stats.js         count math shared by every part
lib/rules.js         default rules and the checks for rules.json
popup/               12h / 24h switch, numbers, per-hour bars, settings
rules.json           live rules (see above)
tests/               node --test tests/ and a fake Instagram page for layout checks
tools/               icon generator and the Web Store zip script
```

## Live rules link

`background.js` reads
`https://raw.githubusercontent.com/narayan451/reel-meter/main/rules.json`.
Edit `rules.json` on `main` and every install picks it up within 6 hours.

## Release

1. Bump `version` in `manifest.json`.
2. `node --test tests/stats.test.js tests/rules.test.js`
3. `powershell -File tools/pack.ps1` and upload `dist/reel-meter-<version>.zip`.

Counts and settings survive updates.

---

Made by Narayan Jangid · [Laya Labs](https://layalabs.netlify.app)

Not affiliated with Instagram or Meta.
