---
name: browser-tools
description: Interactive browser automation via Chrome DevTools Protocol, headless by default. Use when you need to interact with web pages, test frontends, or when user interaction with a visible browser is required.
---

# Browser Tools

Scripts that drive Chrome via CDP on `:9222` (override with `CDP_PORT`).

Chrome runs headless by default (1920x1080 window and screen, normal Chrome user agent). Start it with `--headed` when a person needs the window: `browser-pick.js`, user-driven `--none` recording or network capture, manual login (2FA, SSO), or the user wants to watch. The mode is fixed at launch; to switch, stop the instance and start it again. `browser-status.js` shows each instance's mode.

## Setup

Run once before first use: `cd {baseDir} && npm install`

For anything the scripts do not cover, write a scratch script in `{baseDir}/scripts/` reusing the shared helpers, and delete it when done:

```js
import { connect, activePage, sleep } from "./lib.mjs";
const browser = await connect();            // honours CDP_PORT
const page = await activePage(browser);     // last real tab; pass "localhost:7766" to prefer a tab
await browser.disconnect();
```

## Commands

All scripts live in `{baseDir}/scripts/`.

| Script | Usage / notes |
|---|---|
| `browser-start.js [--profile] [--no-extensions] [--headed]` | Launch Chrome with remote debugging, headless unless `--headed`. `--profile` copies the user's profile (cookies, logins). Idempotent per port. |
| `browser-status.js [--port N]` | List debuggable Chrome instances + tabs. With `--port`: exit 0 if running, 1 if free. |
| `browser-nav.js <url> [--new] [--reload]` | Navigate; `--new` opens a new tab; `--reload` forces a reload after navigating. |
| `browser-eval.js '<js>'` | Evaluate one JS expression in the active tab (async context; use an IIFE or comma expression for statements). Nested objects/arrays are JSON-serialised in the output. |
| `browser-network.js [action] [opts]` | Log requests while acting - see below. |
| `browser-type.js <sel> <text> [--enter] [--pick-suggestion [sel]] [--delay ms]` | Real keyboard events (waits for selector, clears existing value). Prefer over setting `input.value` via eval - frameworks and autocompletes need real events. Default suggestion selector handles Google Places. |
| `browser-screenshot.js [--full] [--selector S] [path]` | Capture viewport/page/element; prints file path. |
| `browser-record.js ...` | Record transitions - see below. |
| `browser-emulate.js mobile\|tablet\|desktop\|WxH\|reset\|--offline\|--online` | Viewport/device/network emulation for the active tab. Viewport and offline persist for later commands on that tab until `reset`; user-agent does not. |
| `browser-pick.js "<prompt>"` | Interactive element picker: the user clicks elements (Cmd/Ctrl+Click for multiple, Enter when done); returns CSS selectors. Use whenever the user wants to point at elements on the page. Needs `--headed`. |
| `browser-upload.js <sel> <file...>` | Attach files to an `<input type=file>` (JS cannot set `input.files`). For dropzones, target the hidden nested file input. Multiple files need the `multiple` attribute. |
| `browser-cookies.js` | Dump cookies for the current tab. |
| `browser-content.js <url>` | Navigate and extract readable page content as markdown. |
| `browser-clean.js [--yes] [--days N] [--tmp] [--profiles] [--all]` | Reclaim tmp screenshots/recordings and idle profile dirs. Dry-run by default; live ports and the default 9222 profile are protected (`--all` + ask the user first). |

## Multiple instances / stopping

Each `CDP_PORT` gets its own Chrome and profile dir (`~/.cache/browser-tools-<port>`), so several browsers can run and be driven simultaneously. All commands for one instance must use the same `CDP_PORT`.

Stop an instance with `pkill -f 'remote-debugging-port=<port>'`. If you started Chrome solely for a one-off task, ask the user before stopping it. Profile dirs (200-700 MB each) are never deleted automatically - run `browser-clean.js` after sessions that spun up extra ports.

## Network: what did that action request?

`browser-network.js` starts listening, performs one action, then reports `status method url`.
Use it for "did the button hit the endpoint, and what came back?" and for pages that hang.

```bash
{baseDir}/scripts/browser-network.js --click 'UPGRADE' --filter escalate.php --body
{baseDir}/scripts/browser-network.js --nav https://host/messages --failures
{baseDir}/scripts/browser-network.js --none --duration 15 --failures   # user drives (--headed)
```

Actions: `--nav <url>`, `--reload`, `--click <sel-or-button-text>`, `--eval '<js>'`, `--none`.
Options: `--filter <substr>`, `--failures` (status >= 400 plus failed requests), `--body`,
`--duration <s>` (default 6), `--json`.

As with recording, trigger the action inside the same invocation - clicking in a separate
command loses the requests.

## Record transitions (spinners, toasts, redirects)

A screenshot taken after an action almost always misses the transient moment (spinner gone, toast faded, redirects finished). `browser-record.js` starts capturing before performing the action, in the same process:

```bash
{baseDir}/scripts/browser-record.js --click 'button[type=submit]' --duration 6 --fps 8
{baseDir}/scripts/browser-record.js --nav https://example.com/login --duration 4
{baseDir}/scripts/browser-record.js --eval '<js that triggers the transition>'
{baseDir}/scripts/browser-record.js --none --duration 10                        # user drives (--headed), you record
{baseDir}/scripts/browser-record.js --none --wait-enter --video /tmp/demo.mp4   # record until Enter (--headed, needs a tty - run it yourself)
```

To record a multi-step flow you drive yourself, run the recorder in the background with `--none`, act with the other scripts, then stop it. It still writes the timeline and encodes:

```bash
{baseDir}/scripts/browser-record.js --none --duration 300 --out /tmp/rec > /tmp/rec.log 2>&1 &
{baseDir}/scripts/browser-type.js '#email' 'a@b.co' --enter    # ...any other actions, in later commands too
kill $(cat /tmp/rec/record.pid); until grep -q 'recording done' /tmp/rec.log; do sleep 0.5; done
```

Stop via `record.pid`, not `$!` (that can be a wrapping shell, which ignores SIGINT), and wait on the log, not the pid (a recorder started from an earlier shell lingers as a zombie). `--duration` is a safety cap. Frames are written as they arrive; `timeline.txt` and any video only after the stop. Only the tab that was active at start is recorded (`browser-nav.js --new` escapes it).

Output is a dir of `frame-NNNN-<ms>ms.png` plus `timeline.txt` interleaving frames with navigated/load/dialog/console-error events - read specific frames with the read tool. Add `--video [file.mp4]` or `--gif [file.gif]` to encode with ffmpeg (frames deleted after encode unless `--keep-frames`). The recording covers the CDP tab only.

Always trigger the action via `--click/--eval/--nav` in the same invocation - clicking in one command and recording in another reintroduces the race. Recording dirs land in `$TMPDIR` (`--out <dir>` to control; see clean-up above).

## Guidelines

- Prefer DOM reads (`browser-eval.js`) over screenshots for reading state; screenshots are for visual verification and layout bugs.
- `--selector` screenshots come back blank for elements that are offscreen, inside a scroll container, or mid-animation. Scroll first, tag the node, let it settle, then shoot:
  `browser-eval.js '(() => { const el = ...; el.scrollIntoView({block:"center"}); el.setAttribute("data-shot","1"); return "ok"; })()'`, `sleep 2`, `browser-screenshot.js --selector '[data-shot="1"]'`. Falling back to a viewport screenshot is often faster than fighting this.
- Batch multi-step JS into one `browser-eval.js` call (IIFE returning JSON) instead of many round trips.
- For transient state, do not sleep-then-look: use `browser-record.js`, or latch inside the page with a MutationObserver (that dies on navigation - then record instead).
- For layout/truncation bugs: `browser-emulate.js 760x760`, read computed styles via eval, then `browser-screenshot.js --selector`.
- Investigate page structure (title, forms, buttons, inputs) with one eval before interacting.
- Before taking a port, check it: `browser-status.js --port N` for CDP ports, `ss -ltnp "sport = :7766"` for anything else.
- Headed only: if a browser command hangs for a long time and then finishes suddenly, suspect a hidden Chrome window (rendering is paused); make it visible and retry.
