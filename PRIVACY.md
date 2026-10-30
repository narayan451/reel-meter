# Reel Meter - Privacy Policy

_Last updated: 30 October 2026_

Reel Meter is made by Laya Labs. It counts how many reels you open on
instagram.com and how long a video plays while a reel is open. That is all.

## What is stored
- A number of reels and a number of seconds, grouped in 5-minute slots.
- Your settings (12h or 24h, counter on page, paused).
- The current detection rules, and a time stamp if counting looks broken.

All of it stays in your browser (`chrome.storage.local`). Slots older than
24 hours are erased automatically. "Reset counts" erases them right away.

## What is never collected
- Which reels you watched, who posted them, captions or any page text.
- Your messages. The extension does nothing on `/direct/` pages.
- Your username, password, cookies or account details.

## What goes over the internet
Nothing about you. Every 6 hours the extension downloads a small public file
(`rules.json`, from github.com/narayan451/reel-meter) that tells it how to recognise a
reel page. The request carries no data from the extension; like any download,
GitHub sees your IP address. The file is plain data and cannot run code.

No analytics, no ads, no account, no server of ours.

## Permissions
- **instagram.com access** - to notice that a reel is open and show the counter.
- **storage** - to keep the counts on your device.
- **alarms** - to erase old counts and refresh the rules when Instagram is closed.

## Contact
datasender112@gmail.com

Reel Meter is not affiliated with, endorsed by, or sponsored by Instagram or Meta.
