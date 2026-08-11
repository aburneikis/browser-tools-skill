#!/usr/bin/env node

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
	const el = await p.waitForSelector(selector, { timeout: 10000 });
	await el.screenshot({ path: filepath });
} else {
	await p.screenshot({ path: filepath, fullPage });
}

console.log(filepath);

await b.disconnect();
