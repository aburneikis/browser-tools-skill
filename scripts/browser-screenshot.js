#!/usr/bin/env node

import { writeFile } from "node:fs/promises";
import { connect, activePage, tmpPath, withTimeout } from "./lib.mjs";

const args = process.argv.slice(2);
let fullPage = false;
let out = null;
let selector = null;
for (let i = 0; i < args.length; i++) {
	if (args[i] === "--full") fullPage = true;
	else if (args[i] === "--selector") selector = args[++i];
	else if (args[i] === "--help" || args[i] === "-h") {
		console.log("Usage: browser-screenshot.js [outfile.png] [--full] [--selector CSS]");
		console.log("  no outfile -> writes a timestamped png in $TMPDIR and prints the path");
		process.exit(0);
	} else out = args[i];
}

const b = await connect();
const p = await activePage(b);

const filepath = out || tmpPath("screenshot", ".png");

// ElementHandle.screenshot scrolls the element into view via an
// IntersectionObserver, which never fires when the window has an unmapped
// surface (background workspace on a tiling WM) - the call then hangs until
// the window becomes visible. Fallback: capture absolute page coordinates
// with captureBeyondViewport, which needs neither scroll nor rendered frame.
async function captureByClip(el) {
	const clip = await el.evaluate((node) => {
		const r = node.getBoundingClientRect();
		return {
			x: r.left + window.scrollX,
			y: r.top + window.scrollY,
			width: r.width,
			height: r.height,
			scale: window.devicePixelRatio || 1,
		};
	});
	if (clip.width === 0 || clip.height === 0) {
		console.error(`\u2717 '${selector}' has a zero-sized box (hidden?), nothing to capture`);
		process.exit(1);
	}
	const session = await p.createCDPSession();
	const { data } = await session.send("Page.captureScreenshot", {
		format: "png",
		captureBeyondViewport: true,
		clip,
	});
	await session.detach().catch(() => {});
	await writeFile(filepath, Buffer.from(data, "base64"));
}

if (selector) {
	const el = await p.waitForSelector(selector, { timeout: 10000 });
	const result = await withTimeout(
		el.screenshot({ path: filepath }).then(() => "ok", () => "error"),
		5000,
		() => "timeout",
	);
	if (result !== "ok") await captureByClip(el);
} else {
	await p.screenshot({ path: filepath, fullPage });
}

console.log(filepath);

await b.disconnect();
