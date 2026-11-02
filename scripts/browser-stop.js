#!/usr/bin/env node

import { CDP_PORT, isHeadless, stopChrome } from "./lib.mjs";

const i = process.argv.indexOf("--port");
const port = i === -1 ? CDP_PORT : Number(process.argv[i + 1]);
if (!port || process.argv.slice(2).some((a, j) => a !== "--port" && j !== i - 1)) {
	console.log("Usage: [CDP_PORT=<port>] browser-stop.js [--port <port>]");
	console.log("\nCloses the Chrome on the port (default 9222). Its profile dir is kept.");
	process.exit(1);
}

const mode = isHeadless(port) ? "headless" : "headed";
if (await stopChrome(port)) console.log(`✓ Stopped ${mode} Chrome on :${port}`);
else console.log(`No Chrome running on :${port}`);
