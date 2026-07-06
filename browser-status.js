#!/usr/bin/env node
/*
 * browser-status.js
 *
 * List running browser-tools Chrome instances (found by their
 * --remote-debugging-port flag) and their open tabs. Use this to check
 * whether a CDP port is already taken before starting a new instance.
 *
 * Usage:
 *   browser-status.js              # list all instances
 *   browser-status.js --port 9223  # check one port; exit 0 = running, 1 = free
 */

import { execSync } from "node:child_process";

function argPort() {
	const i = process.argv.indexOf("--port");
	if (i === -1) return null;
	const p = Number(process.argv[i + 1]);
	if (!p) {
		console.error("Usage: browser-status.js [--port <port>]");
		process.exit(2);
	}
	return p;
}

async function probe(port) {
	try {
		const ctl = new AbortController();
		const t = setTimeout(() => ctl.abort(), 2000);
		const version = await (
			await fetch(`http://localhost:${port}/json/version`, { signal: ctl.signal })
		).json();
		const tabs = await (
			await fetch(`http://localhost:${port}/json/list`, { signal: ctl.signal })
		).json();
		clearTimeout(t);
		return { version, tabs: tabs.filter((t) => t.type === "page") };
	} catch {
		return null;
	}
}

function discoverPorts() {
	// Find Chrome processes launched with an explicit remote debugging port.
	let out = "";
	try {
		out = execSync("pgrep -af 'remote-debugging-port='", {
			encoding: "utf8",
		});
	} catch {
		return [];
	}
	const ports = new Set();
	for (const m of out.matchAll(/--remote-debugging-port=(\d+)/g)) {
		ports.add(Number(m[1]));
	}
	return [...ports].sort((a, b) => a - b);
}

const single = argPort();
const ports = single ? [single] : discoverPorts();

if (!single && ports.length === 0) {
	console.log("No Chrome instances with remote debugging found.");
	process.exit(0);
}

let anyRunning = false;
for (const port of ports) {
	const info = await probe(port);
	if (!info) {
		console.log(`:${port}  not responding (no debuggable Chrome on this port)`);
		continue;
	}
	anyRunning = true;
	console.log(`:${port}  ${info.version.Browser}  (${info.tabs.length} tab${info.tabs.length === 1 ? "" : "s"})`);
	for (const tab of info.tabs) {
		console.log(`      ${tab.url}`);
	}
}

if (single) process.exit(anyRunning ? 0 : 1);
