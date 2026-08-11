#!/usr/bin/env node

import { writeFile } from "node:fs/promises";
import { connect, activePage, tmpPath } from "./lib.mjs";

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

if (selector) {
	// Element capture deliberately avoids ElementHandle.screenshot: that scrolls
	// the element into view via an IntersectionObserver, and a window parked on a
	// background workspace has an unmapped Wayland surface that produces no
	// frames, so the observer never fires and the capture blocks until the user
	// tabs back. Scrolling first is no fix either - the same missing frames make
	// the capture return pixels from the pre-scroll position. Capturing absolute
	// page coordinates with captureBeyondViewport needs neither scroll nor frame.
	const el = await p.waitForSelector(selector, { timeout: 10000 });
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
} else {
	await p.screenshot({ path: filepath, fullPage });
}

console.log(filepath);

await b.disconnect();
