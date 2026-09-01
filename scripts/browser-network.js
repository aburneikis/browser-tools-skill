#!/usr/bin/env node

// Log network activity while performing an action: method, status, url, and
// optionally the response body. Answers "what did that button actually request,
// and what came back?" without hand-rolling a puppeteer script.

import { connect, activePage, evalAsync } from "./lib.mjs";

const args = process.argv.slice(2);
const flag = (name) => {
	const i = args.indexOf(name);
	return i === -1 ? undefined : args[i + 1];
};
const has = (name) => args.includes(name);

if (has("--help") || args.length === 0) {
	console.log(`Usage: browser-network.js [action] [options]

Action (at most one, performed after listening starts):
  --nav <url>        navigate the active tab
  --reload           reload the active tab
  --click <sel>      click a selector (falls back to text match on buttons)
  --eval '<js>'      run JS in the page
  --none             just listen (default)

Options:
  --filter <substr>  only report urls containing this substring
  --failures         only report status >= 400 and failed requests
  --body             include response bodies (truncated to 400 chars)
  --duration <s>     how long to keep listening after the action (default 6)
  --json             machine-readable output

Examples:
  browser-network.js --click 'UPGRADE' --filter escalate.php --body
  browser-network.js --nav https://example.com/messages --failures
  browser-network.js --none --duration 15 --failures`);
	process.exit(has("--help") ? 0 : 1);
}

const filter = flag("--filter");
const onlyFailures = has("--failures");
const withBody = has("--body");
const asJson = has("--json");
const duration = Number(flag("--duration") ?? 6) * 1000;

const browser = await connect();
const page = await activePage(browser);

const events = [];
const wanted = (url) => (filter ? url.includes(filter) : true);

page.on("requestfailed", (req) => {
	if (!wanted(req.url())) return;
	events.push({
		method: req.method(),
		status: "FAILED",
		url: req.url(),
		error: req.failure()?.errorText,
	});
});

page.on("response", async (res) => {
	const url = res.url();
	if (!wanted(url)) return;
	const status = res.status();
	if (onlyFailures && status < 400) return;
	const event = { method: res.request().method(), status, url };
	if (withBody) {
		try {
			event.body = (await res.text()).slice(0, 400);
		} catch {
			event.body = "<unavailable>";
		}
	}
	events.push(event);
});

const clickSelector = flag("--click");
try {
	if (flag("--nav")) {
		await page.goto(flag("--nav"), { waitUntil: "domcontentloaded", timeout: 45000 });
	} else if (has("--reload")) {
		await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 });
	} else if (clickSelector) {
		await page.evaluate((sel) => {
			const bySelector = (() => {
				try {
					return document.querySelector(sel);
				} catch {
					return null;
				}
			})();
			const target =
				bySelector ??
				[...document.querySelectorAll("button, a, [role=button]")].find((el) =>
					el.textContent.trim().toLowerCase().includes(sel.toLowerCase()),
				);
			if (!target) throw new Error(`no element matched ${sel}`);
			target.scrollIntoView({ block: "center" });
			target.click();
		}, clickSelector);
	} else if (flag("--eval")) {
		await evalAsync(page, flag("--eval"));
	}
} catch (err) {
	console.error(`action failed: ${err.message}`);
}

await new Promise((resolve) => setTimeout(resolve, duration));

if (asJson) {
	console.log(JSON.stringify(events, null, 1));
} else if (events.length === 0) {
	console.log("no matching network activity");
} else {
	for (const event of events) {
		console.log(`${event.status}\t${event.method}\t${event.url}`);
		if (event.error) console.log(`\terror: ${event.error}`);
		if (event.body !== undefined) console.log(`\tbody: ${event.body}`);
	}
}

await browser.disconnect();
