---
name: browser-tools
description: Interactive browser automation via Chrome DevTools Protocol. Use when you need to interact with web pages, test frontends, or when user interaction with a visible browser is required.
---

# Browser Tools

Chrome DevTools Protocol tools for agent-assisted web automation. These tools connect to Chrome running on `:9222` with remote debugging enabled (override with `CDP_PORT`, see "Multiple browser instances").

## Setup

Run once before first use:

```bash
cd {baseDir}/browser-tools
npm install
```

If you need something these scripts don't cover, write a small script next to them and
reuse the shared helpers instead of re-doing the connect boilerplate:

```js
import { connect, activePage, sleep } from "./lib.mjs";
const browser = await connect();            // honours CDP_PORT, clear error if not running
const page = await activePage(browser);     // last real tab; pass "localhost:7766" to prefer a tab
// ...
await browser.disconnect();
```

Delete such scratch scripts once done - only generally useful ones belong in this skill.

## Start Chrome

```bash
{baseDir}/browser-start.js                    # Fresh profile
{baseDir}/browser-start.js --profile          # Copy user's profile (cookies, logins, extensions)
{baseDir}/browser-start.js --no-extensions    # Disable extensions
```

Launch Chrome with remote debugging on `:9222`. Use `--profile` to preserve user's authentication state. Idempotent per port: if a debuggable Chrome is already on the port it just reports it.

Extensions are enabled by default, so Chrome Web Store installs work. Pass `--no-extensions` for a clean, extension-free browser (Web Store installs then fail with "Installation is not enabled").

## Check what's running

```bash
{baseDir}/browser-status.js               # list all debuggable Chrome instances + tabs
{baseDir}/browser-status.js --port 9223   # exit 0 if running on that port, 1 if free
```

**Check before you start.** Before launching a new instance on a non-default port, run `browser-status.js` to see which ports are taken. For any other TCP port (dev servers etc.), check with:

```bash
ss -ltnp "sport = :7766"    # empty output = port free
```

## Multiple browser instances

Every script honors the `CDP_PORT` env var (default `9222`). Each port gets its own Chrome instance and profile dir (`~/.cache/browser-tools-<port>`), so several browsers can run and be driven simultaneously - e.g. two independent agent sessions, or two webapps logged in as different users:

```bash
CDP_PORT=9223 {baseDir}/browser-start.js
CDP_PORT=9223 {baseDir}/browser-nav.js https://example.com
CDP_PORT=9223 {baseDir}/browser-eval.js 'document.title'
```

All commands for the same instance must use the same `CDP_PORT`. Stop a specific instance with `pkill -f 'remote-debugging-port=9223'`.

## Stop Chrome

`browser-start.js` detaches Chrome and writes no pidfile. To stop it (and its 30+ helper processes), kill by the debugging-port flag:

```bash
pkill -f 'remote-debugging-port=9222'   # use the instance's CDP_PORT
```

If you started Chrome solely for a one-off agent task, ask the user whether to stop it before declaring the task done - they may want to keep the session alive for follow-up work.

Killing Chrome leaves its profile dir behind (`~/.cache/browser-tools-<port>`, several hundred
MB each) - see "Clean Up" below.

## Clean Up

These tools leave artifacts around: screenshots and recording dirs in `$TMPDIR`, and a Chrome
profile dir per port in `~/.cache/browser-tools[-<port>]` which is easily 200-700 MB. Nothing
is deleted automatically, so throwaway ports accumulate gigabytes.

```bash
{baseDir}/browser-clean.js                  # dry-run report of what is reclaimable
{baseDir}/browser-clean.js --yes            # delete artifacts older than 1 day + idle profiles
{baseDir}/browser-clean.js --days 0 --yes   # ignore age, delete everything idle
{baseDir}/browser-clean.js --tmp --yes      # only /tmp screenshots + recordings
{baseDir}/browser-clean.js --profiles       # only profile dirs
```

Safety behaviour:
- Dry-run by default; nothing is removed without `--yes`.
- A profile dir is never deleted while something is listening on its port (it prints
  `live keep :<port>` instead), so running sessions are safe.
- The default profile (`~/.cache/browser-tools`, port 9222) is skipped unless you pass
  `--all`, because deleting it discards saved logins and cookies. Ask the user first.

Run this after a session that spun up extra `CDP_PORT` instances, and mention the reclaimable
size rather than deleting profiles the user may still want logged in.

## Navigate

```bash
{baseDir}/browser-nav.js https://example.com
{baseDir}/browser-nav.js https://example.com --new
```

Navigate to URLs. Use `--new` flag to open in a new tab instead of reusing current tab.

## Evaluate JavaScript

```bash
{baseDir}/browser-eval.js 'document.title'
{baseDir}/browser-eval.js 'document.querySelectorAll("a").length'
```

Execute JavaScript in the active tab. Code runs in async context. Use this to extract data, inspect page state, or perform DOM operations programmatically.

## Type Into Inputs

```bash
{baseDir}/browser-type.js '#email' user@example.com
{baseDir}/browser-type.js '#search' 'hello world' --enter
{baseDir}/browser-type.js '#address' '1 Smith St' --pick-suggestion
{baseDir}/browser-type.js '#q' 'text' --delay 100 --pick-suggestion '.my-autocomplete li'
```

Types with real keyboard events (waits for the selector, selects and clears the existing
value first). Prefer this over setting `input.value` via `browser-eval.js`: frameworks
(Angular/React) and autocompletes only react to genuine `keydown`/`input` events.

- `--enter` presses Enter afterwards (submit / search).
- `--pick-suggestion [selector]` waits ~1.5s then clicks the first suggestion. Default
  selector `.pac-container .pac-item` handles Google Places address autocomplete.

## Screenshot

```bash
{baseDir}/browser-screenshot.js                        # viewport -> temp file path
{baseDir}/browser-screenshot.js --full                 # full scrollable page
{baseDir}/browser-screenshot.js --selector '.my-card'  # just one element
{baseDir}/browser-screenshot.js /tmp/out.png           # explicit output path
```

Capture the page and print the file path. Use this to visually inspect page state or verify UI changes.

## Record Transitions (animations, spinners, redirects)

**A single screenshot after an action almost always shows the wrong moment.** By the time a
separate `browser-screenshot.js` process has started (~0.3-1s, plus any `sleep` you added),
the spinner is gone, the toast has faded, the animation has finished, and the app may have
redirected two or three times. You never see what you were asked to check.

`browser-record.js` fixes this by starting the capture *before* performing the action, in
the same process:

```bash
{baseDir}/browser-record.js --click 'button[type=submit]' --duration 6 --fps 8
{baseDir}/browser-record.js --nav https://example.com/login --duration 4
{baseDir}/browser-record.js --eval 'document.querySelector(".toast-trigger").click()'
{baseDir}/browser-record.js --none --duration 10     # user clicks around; you just record
```

Output is a directory of `frame-NNNN-<ms>ms.png` files plus `timeline.txt` interleaving
frames with `navigated` / `load` / `dialog` / console-error / `pageerror` events, so you can
see the full redirect chain and pick the exact frame you care about:

```
     0ms  nav        http://github.com/login
   291ms  navigated  https://github.com/login
   703ms  load       https://github.com/login
```

### Screen recordings (mp4 / gif)

Add `--video` or `--gif` to encode the captured frames with ffmpeg (required; already present
here). Frame timestamps drive the per-frame durations, so playback speed matches real time.

```bash
# Record a scripted action as an mp4
{baseDir}/browser-record.js --click '#submit' --duration 6 --fps 10 --video /tmp/submit.mp4

# Record while a human drives the browser: starts recording, stops when you press Enter
{baseDir}/browser-record.js --none --wait-enter --video /tmp/demo.mp4

# Short animation as a gif for a Phabricator revision / bug report
{baseDir}/browser-record.js --click '#play' --duration 3 --fps 15 --gif /tmp/anim.gif
```

- Omit the filename (`--video` alone) to get `recording.mp4` inside the output dir.
- PNG frames are deleted after a successful encode; pass `--keep-frames` to keep them (useful
  when you also want to `read` individual frames).
- `--wait-enter` records until Enter is pressed on stdin (combine with `--duration` for a cap).
  This is the mode to use for "record me doing X in the browser" - it needs an interactive
  terminal, so run it yourself rather than expecting the agent to press Enter.
- The recording covers the tab CDP is attached to, not the whole desktop: no OS chrome,
  no other windows, and it keeps working if the window is behind another one.
- Video is one artifact for a human; frames + `timeline.txt` are what you should read when
  diagnosing. `--video --keep-frames` gives both.
- Recording dirs live in `$TMPDIR` and are not cleaned up automatically - see "Clean Up".
  Pass `--out <dir>` to put a recording somewhere you control.

Guidelines:
- Use `--click/--eval/--nav` rather than clicking in one command and recording in another -
  that reintroduces the race.
- Bump `--fps` (up to ~10) for short animations; raise `--duration` for slow redirect chains.
- Frames come from both CDP screencast (repaint-driven) and a fixed-interval sampler, so
  static-but-transient pages such as "Redirecting..." interstitials are still captured.
- Read specific frames with the `read` tool; the timestamps in the filenames tell you which.

## Emulate Viewport / Device / Network

```bash
{baseDir}/browser-emulate.js mobile        # 390x844, isMobile + touch, dpr 2
{baseDir}/browser-emulate.js tablet        # 820x1180
{baseDir}/browser-emulate.js desktop       # 1440x900
{baseDir}/browser-emulate.js 760x760       # arbitrary size, e.g. to hit a breakpoint
{baseDir}/browser-emulate.js reset         # clear device metrics override
{baseDir}/browser-emulate.js --offline     # simulate network loss (--online to restore)
```

Use this to test responsive layouts and truncation/overflow bugs: shrink the viewport,
then screenshot or read computed styles with `browser-eval.js`. Viewport, `isMobile` and
touch overrides persist after the script exits; user-agent overrides do not (they are
bound to the CDP session), so this does not spoof `navigator.userAgent`.

## Pick Elements

```bash
{baseDir}/browser-pick.js "Click the submit button"
```

**IMPORTANT**: Use this tool when the user wants to select specific DOM elements on the page. This launches an interactive picker that lets the user click elements to select them. The user can select multiple elements (Cmd/Ctrl+Click) and press Enter when done. The tool returns CSS selectors for the selected elements.

Common use cases:
- User says "I want to click that button" → Use this tool to let them select it
- User says "extract data from these items" → Use this tool to let them select the elements
- When you need specific selectors but the page structure is complex or ambiguous

## Upload Files

```bash
{baseDir}/browser-upload.js 'input[type=file]' /tmp/photo.jpg
{baseDir}/browser-upload.js '#docs' a.pdf b.pdf   # input must have 'multiple'
```

Attach files to an `<input type="file">` element. Use this whenever a page needs a
file upload - JS assignment to `input.files` is blocked by the browser, so
`browser-eval.js` cannot do this. This script uses CDP (`DOM.setFileInputFiles`
via puppeteer's `uploadFile`) and dispatches `input`/`change` events afterwards.

Notes:
- Paths are resolved to absolute and must be readable by the Chrome process.
- The selector must resolve to a real `<input type="file">`. For drag-and-drop
  dropzone components, find the hidden file input nested inside the component
  (often `<the-dropzone> input[type=file]`) and target that.
- Multiple files require the input to have the `multiple` attribute.

## Cookies

```bash
{baseDir}/browser-cookies.js
```

Display all cookies for the current tab including domain, path, httpOnly, and secure flags. Use this to debug authentication issues or inspect session state.

## Extract Page Content

```bash
{baseDir}/browser-content.js https://example.com
```

Navigate to a URL and extract readable content as markdown. Uses Mozilla Readability for article extraction and Turndown for HTML-to-markdown conversion. Works on pages with JavaScript content (waits for page to load).

## When to Use

- Testing frontend code in a real browser
- Interacting with pages that require JavaScript
- When user needs to visually see or interact with a page
- Debugging authentication or session issues
- Scraping dynamic content that requires JS execution

---

## Efficiency Guide

### DOM Inspection Over Screenshots

For reading state, parse the DOM rather than screenshotting (screenshots are for visual
verification and layout bugs):

```javascript
// Get page structure
document.body.innerHTML.slice(0, 5000)

// Find interactive elements
Array.from(document.querySelectorAll('button, input, [role="button"]')).map(e => ({
  id: e.id,
  text: e.textContent.trim(),
  class: e.className
}))
```

### Complex Scripts in Single Calls

Wrap everything in an IIFE to run multi-statement code:

```javascript
(function() {
  // Multiple operations
  const data = document.querySelector('#target').textContent;
  const buttons = document.querySelectorAll('button');
  
  // Interactions
  buttons[0].click();
  
  // Return results
  return JSON.stringify({ data, buttonCount: buttons.length });
})()
```

### Batch Interactions

**Don't** make separate calls for each click. **Do** batch them:

```javascript
(function() {
  const actions = ["btn1", "btn2", "btn3"];
  actions.forEach(id => document.getElementById(id).click());
  return "Done";
})()
```

### Typing/Input Sequences

```javascript
(function() {
  const text = "HELLO";
  for (const char of text) {
    document.getElementById("key-" + char).click();
  }
  document.getElementById("submit").click();
  return "Submitted: " + text;
})()
```

### Reading App/Game State

Extract structured state in one call:

```javascript
(function() {
  const state = {
    score: document.querySelector('.score')?.textContent,
    status: document.querySelector('.status')?.className,
    items: Array.from(document.querySelectorAll('.item')).map(el => ({
      text: el.textContent,
      active: el.classList.contains('active')
    }))
  };
  return JSON.stringify(state, null, 2);
})()
```

### Debugging Layout / CSS Bugs

Combine `browser-emulate.js` with computed-style reads instead of writing one-off scripts:

```bash
{baseDir}/browser-emulate.js 760x760
{baseDir}/browser-eval.js '(() => {
  const el = document.querySelector(".my-tag");
  const cs = getComputedStyle(el);
  return { text: el.textContent.trim(), width: el.getBoundingClientRect().width,
           overflow: cs.overflow, bg: cs.backgroundColor };
})()'
{baseDir}/browser-screenshot.js --selector '.my-tag'
```

You can also force a container narrow to reproduce truncation without resizing the window:

```bash
{baseDir}/browser-eval.js '(() => {
  const cell = document.querySelector("td.Cell");
  cell.style.maxWidth = "60px";
  return cell.getBoundingClientRect().width;
})()'
```

### Waiting for Updates

If DOM updates after actions, add a small delay with bash:

```bash
sleep 0.5 && {baseDir}/browser-eval.js '...'
```

But be aware what a `sleep` costs you: anything transient that happened during it is gone.
For state that only exists briefly, do not sleep-then-look - either record the whole window
with `browser-record.js`, or poll/latch inside the page so the evidence survives:

```bash
# Latch transient DOM state from inside the page instead of trying to catch it from outside
{baseDir}/browser-eval.js '(async () => {
  const seen = [];
  const stop = Date.now() + 5000;
  const obs = new MutationObserver(() => {
    const s = document.querySelector(".spinner, .toast, [role=alert]");
    if (s) seen.push({ t: Date.now(), cls: s.className, text: s.textContent.trim() });
  });
  obs.observe(document.body, { subtree: true, childList: true, attributes: true });
  document.querySelector("#submit").click();
  while (Date.now() < stop) await new Promise(r => setTimeout(r, 100));
  obs.disconnect();
  return JSON.stringify(seen);
})()'
```

Note this latching approach dies on navigation - if the action redirects, use
`browser-record.js` instead.

### Investigate Before Interacting

Always start by understanding the page structure:

```javascript
(function() {
  return {
    title: document.title,
    forms: document.forms.length,
    buttons: document.querySelectorAll('button').length,
    inputs: document.querySelectorAll('input').length,
    mainContent: document.body.innerHTML.slice(0, 3000)
  };
})()
```

Then target specific elements based on what you find.
