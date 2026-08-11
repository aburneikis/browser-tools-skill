---
name: browser-tools
description: Interactive browser automation via Chrome DevTools Protocol. Use when you need to interact with web pages, test frontends, or when user interaction with a visible browser is required.
---

# Browser Tools

Scripts that drive Chrome via CDP on `:9222` (override with `CDP_PORT`).

## Setup

Run once before first use: `cd {baseDir} && npm install`

For anything the scripts do not cover, write a scratch script next to them reusing the shared helpers, and delete it when done:

```js
import { connect, activePage, sleep } from "./lib.mjs";
const browser = await connect();            // honours CDP_PORT
const page = await activePage(browser);     // last real tab; pass "localhost:7766" to prefer a tab
await browser.disconnect();
```

## Commands

All scripts live in `{baseDir}/`.

| Script | Usage / notes |
|---|---|
| `browser-start.js [--profile] [--no-extensions]` | Launch Chrome with remote debugging. `--profile` copies the user's profile (cookies, logins). Idempotent per port. |
| `browser-status.js [--port N]` | List debuggable Chrome instances + tabs. With `--port`: exit 0 if running, 1 if free. |
| `browser-nav.js <url> [--new] [--reload]` | Navigate; `--new` opens a new tab; `--reload` forces a reload after navigating. |
| `browser-eval.js '<js>'` | Run JS in the active tab (async context). |
| `browser-type.js <sel> <text> [--enter] [--pick-suggestion [sel]] [--delay ms]` | Real keyboard events (waits for selector, clears existing value). Prefer over setting `input.value` via eval - frameworks and autocompletes need real events. Default suggestion selector handles Google Places. |
| `browser-screenshot.js [--full] [--selector S] [path]` | Capture viewport/page/element; prints file path. `--selector` captures by absolute page coordinates, so it does not scroll the page and works when the window is hidden. |
| `browser-record.js ...` | Record transitions - see below. |
| `browser-emulate.js mobile\|tablet\|desktop\|WxH\|reset\|--offline\|--online` | Viewport/device/network emulation. Viewport overrides persist after exit; user-agent does not. |
| `browser-pick.js "<prompt>"` | Interactive element picker: the user clicks elements (Cmd/Ctrl+Click for multiple, Enter when done); returns CSS selectors. Use whenever the user wants to point at elements on the page. |
| `browser-upload.js <sel> <file...>` | Attach files to an `<input type=file>` (JS cannot set `input.files`). For dropzones, target the hidden nested file input. Multiple files need the `multiple` attribute. |
| `browser-cookies.js` | Dump cookies for the current tab. |
| `browser-content.js <url>` | Navigate and extract readable page content as markdown. |
| `browser-clean.js [--yes] [--days N] [--tmp] [--profiles] [--all]` | Reclaim tmp screenshots/recordings and idle profile dirs. Dry-run by default; live ports and the default 9222 profile are protected (`--all` + ask the user first). |

## Multiple instances / stopping

Each `CDP_PORT` gets its own Chrome and profile dir (`~/.cache/browser-tools-<port>`), so several browsers can run and be driven simultaneously. All commands for one instance must use the same `CDP_PORT`.

Stop an instance with `pkill -f 'remote-debugging-port=<port>'`. If you started Chrome solely for a one-off task, ask the user before stopping it. Profile dirs (200-700 MB each) are never deleted automatically - run `browser-clean.js` after sessions that spun up extra ports.

## Record transitions (spinners, toasts, redirects)

A screenshot taken after an action almost always misses the transient moment (spinner gone, toast faded, redirects finished). `browser-record.js` starts capturing before performing the action, in the same process:

```bash
{baseDir}/browser-record.js --click 'button[type=submit]' --duration 6 --fps 8
{baseDir}/browser-record.js --nav https://example.com/login --duration 4
{baseDir}/browser-record.js --eval '<js that triggers the transition>'
{baseDir}/browser-record.js --none --duration 10                        # user drives, you record
{baseDir}/browser-record.js --none --wait-enter --video /tmp/demo.mp4   # record until Enter (needs a tty - run it yourself)
```

Output is a dir of `frame-NNNN-<ms>ms.png` plus `timeline.txt` interleaving frames with navigated/load/dialog/console-error events - read specific frames with the read tool. Add `--video [file.mp4]` or `--gif [file.gif]` to encode with ffmpeg (frames deleted after encode unless `--keep-frames`). The recording covers the CDP tab only, but it **needs the window to be visible**: it is driven by `Page.screencastFrame`, and a hidden window delivers no frames at all (measured: zero frames in 60 s). Put the Chrome window on the focused workspace before recording.

Always trigger the action via `--click/--eval/--nav` in the same invocation - clicking in one command and recording in another reintroduces the race. Recording dirs land in `$TMPDIR` (`--out <dir>` to control; see clean-up above).

## Guidelines

- Prefer DOM reads (`browser-eval.js`) over screenshots for reading state; screenshots are for visual verification and layout bugs.
- Batch multi-step JS into one `browser-eval.js` call (IIFE returning JSON) instead of many round trips.
- For transient state, do not sleep-then-look: use `browser-record.js`, or latch inside the page with a MutationObserver (that dies on navigation - then record instead).
- For layout/truncation bugs: `browser-emulate.js 760x760`, read computed styles via eval, then `browser-screenshot.js --selector`.
- Investigate page structure (title, forms, buttons, inputs) with one eval before interacting.
- Before taking a port, check it: `browser-status.js --port N` for CDP ports, `ss -ltnp "sport = :7766"` for anything else.

## Hidden windows stall anything that waits for a frame

On a tiling WM a window on an unfocused workspace has an unmapped surface, so the page renders no frames. Anything that waits on rendering then blocks until you switch back to that workspace - typically seen as a command that hangs for minutes and finishes the instant the window appears.

What this hits, and what to do:

- **`IntersectionObserver` never fires.** This is the usual culprit, because puppeteer's `ElementHandle.screenshot/click/type` call `scrollIntoViewIfNeeded()`, which awaits an observer callback. `browser-screenshot.js --selector` no longer uses that path; `browser-click`/`browser-type` on an off-screen element still can, so make the window visible for those.
- **Scrolling does not repaint.** Scrolling and then capturing returns pixels from the pre-scroll position - a silently wrong screenshot, not an error. Never scroll-then-capture while hidden; capture absolute coordinates instead.
- **Screencast delivers nothing**, so `browser-record.js` needs a visible window.
- **`Page.captureScreenshot` itself is fine** (sub-second when hidden), which is why plain viewport and `--full` screenshots and all `browser-eval.js` DOM reads are unaffected.
