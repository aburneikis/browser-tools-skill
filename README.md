# browser-tools

Small CDP scripts that drive a real Chrome instance over the Chrome DevTools
Protocol. Used as a Pi agent skill (see `SKILL.md`), but every script is a
standalone CLI you can run yourself.

## Layout

```
SKILL.md      agent-facing instructions
package.json  dependencies (puppeteer-core, jsdom, readability, turndown)
scripts/      all executables + lib.mjs shared helpers
```

## Install

```bash
npm install
```

## Quick start

```bash
scripts/browser-start.js --profile     # launch headless Chrome (--headed for a window)
scripts/browser-nav.js https://example.com
scripts/browser-eval.js 'document.title'
scripts/browser-screenshot.js
scripts/browser-stop.js                # stop it
```

Every script talks to `localhost:9222` unless `CDP_PORT` is set. Each port gets
its own Chrome instance and profile dir, so several browsers can run at once.

## Scripts

| Script | Purpose |
|---|---|
| `browser-start.js` | Launch Chrome with remote debugging, headless unless `--headed` (`--profile` clones your real profile) |
| `browser-stop.js` | Close an instance (headless ones also stop after `BROWSER_IDLE_MINUTES` idle, default 30) |
| `browser-status.js` | List debuggable instances and tabs; `--port N` exits 0 if in use |
| `browser-nav.js` | Navigate the active tab, or `--new` for a new one |
| `browser-eval.js` | Run JS in the active tab |
| `browser-type.js` | Type into a selector with real keyboard events |
| `browser-screenshot.js` | Viewport, full page, or element capture |
| `browser-record.js` | Capture a transition as frames, mp4, or gif |
| `browser-emulate.js` | Viewport, device, and network emulation |
| `browser-pick.js` | Let the user click elements, get CSS selectors back |
| `browser-upload.js` | Attach files to `<input type=file>` |
| `browser-cookies.js` | Dump cookies for the current tab |
| `browser-content.js` | Extract readable page content as markdown |
| `browser-clean.js` | Reclaim tmp screenshots/recordings and idle profile dirs |

`scripts/lib.mjs` exports `connect`, `activePage`, `allPages`, `evalAsync`,
`printResult`, `sleep`, `tmpPath`, `isHeadless`, `stopChrome`, `CDP_PORT` for one-off scripts.

## Requirements

- Node 18+ (the scripts use native `fetch` and ESM).
- `google-chrome` on `PATH`.
- `ffmpeg` on `PATH`, only for `browser-record.js --video` / `--gif`.
- `rsync`, only for `browser-start.js --profile`.

## Portability notes

The scripts are OS agnostic except for `scripts/browser-start.js` and the
process lookup in `scripts/lib.mjs`, which assume a Linux + Wayland desktop:

| Assumption | Where | Change for other systems |
|---|---|---|
| Chrome binary is `google-chrome` | `browser-start.js` spawn call | macOS needs `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`; some distros ship `google-chrome-stable` or `chromium` |
| Profile source `~/.config/google-chrome/` | `--profile` rsync | macOS: `~/Library/Application Support/Google/Chrome`; Windows: `%LOCALAPPDATA%\Google\Chrome\User Data` |
| `--ozone-platform=wayland` | Chrome flags | Drop it on X11 or macOS |
| SwiftShader / `--use-angle=swiftshader` WebGL flags | Chrome flags | Tuned for software GL; harmless but unnecessary with a real GPU |
| `mkdir -p`, `rm -f`, `rsync`, `ps` | shell calls | POSIX only |
| Chrome processes found via `ps` as an executable ending in `/chrome` | `chromeProcesses` in `lib.mjs` (stop, idle stop, headless check) | macOS executable is `Google Chrome`; Windows has no `ps` |

Other environment assumptions:

- Profile dirs live in `~/.cache/browser-tools[-<port>]` (XDG style).
- Screenshots and recordings are written to `$TMPDIR`.
- `SKILL.md` suggests `ss -ltnp` for port checks, which is Linux `iproute2`.
  On macOS use `lsof -i :<port>`.
- On a tiling compositor, an unfocused or unmapped Chrome window has rendering
  paused, so screenshots and recordings can hang until the window is visible.

Nothing here is tied to a specific site, employer, or internal service. Profile
dirs are 200-700 MB each and are never deleted automatically; run
`scripts/browser-clean.js` after sessions that spun up extra ports.

## License

MIT. Original author: Mario Zechner.
