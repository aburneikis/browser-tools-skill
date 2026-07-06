#!/usr/bin/env node

import { spawn, execSync } from "node:child_process";
import puppeteer from "puppeteer-core";

const useProfile = process.argv[2] === "--profile";

if (process.argv[2] && process.argv[2] !== "--profile") {
	console.log("Usage: [CDP_PORT=<port>] browser-start.js [--profile]");
	console.log("\nOptions:");
	console.log("  --profile  Copy your default Chrome profile (cookies, logins)");
	console.log("\nEnvironment:");
	console.log("  CDP_PORT   Remote debugging port (default 9222). Each port gets");
	console.log("             its own Chrome instance and profile dir, so multiple");
	console.log("             browsers can run simultaneously.");
	process.exit(1);
}

const CDP_PORT = Number(process.env.CDP_PORT || 9222);
// Per-port profile dir: Chrome allows only one instance per user-data-dir
// (SingletonLock), so each CDP port needs its own. Port 9222 keeps the
// historical un-suffixed dir for backwards compatibility.
const SCRAPING_DIR =
	CDP_PORT === 9222
		? `${process.env.HOME}/.cache/browser-tools`
		: `${process.env.HOME}/.cache/browser-tools-${CDP_PORT}`;

// Check if already running on this port
try {
	const browser = await puppeteer.connect({
		browserURL: `http://localhost:${CDP_PORT}`,
		defaultViewport: null,
	});
	await browser.disconnect();
	console.log(`✓ Chrome already running on :${CDP_PORT}`);
	process.exit(0);
} catch {}

// Setup profile directory
execSync(`mkdir -p "${SCRAPING_DIR}"`, { stdio: "ignore" });

// Remove SingletonLock to allow new instance
try {
	execSync(`rm -f "${SCRAPING_DIR}/SingletonLock" "${SCRAPING_DIR}/SingletonSocket" "${SCRAPING_DIR}/SingletonCookie"`, { stdio: "ignore" });
} catch {}

if (useProfile) {
	console.log("Syncing profile...");
	execSync(
		`rsync -a --delete \
			--exclude='SingletonLock' \
			--exclude='SingletonSocket' \
			--exclude='SingletonCookie' \
			--exclude='*/Extensions' \
			--exclude='*/Extension State' \
			--exclude='*/Extension Rules' \
			--exclude='*/Local Extension Settings' \
			--exclude='*/Sync Extension Settings' \
			--exclude='*/Sessions/*' \
			--exclude='*/Current Session' \
			--exclude='*/Current Tabs' \
			--exclude='*/Last Session' \
			--exclude='*/Last Tabs' \
			"${process.env.HOME}/.config/google-chrome/" "${SCRAPING_DIR}/"`,
		{ stdio: "pipe" },
	);
}

// Start Chrome with flags to force new instance
spawn(
	"google-chrome",
	[
		`--remote-debugging-port=${CDP_PORT}`,
		`--user-data-dir=${SCRAPING_DIR}`,
		"--no-first-run",
		"--profile-directory=Default",
		"about:blank",
		"--no-default-browser-check",
		"--disable-extensions",
		"--ozone-platform=wayland",
		// WebGL support
		"--ignore-gpu-blocklist",
		"--enable-webgl",
		"--enable-unsafe-swiftshader",
		"--use-angle=swiftshader",
	],
	{ detached: true, stdio: "ignore" },
).unref();

// Wait for Chrome to be ready
let connected = false;
for (let i = 0; i < 30; i++) {
	try {
		const browser = await puppeteer.connect({
			browserURL: `http://localhost:${CDP_PORT}`,
			defaultViewport: null,
		});
		await browser.disconnect();
		connected = true;
		break;
	} catch {
		await new Promise((r) => setTimeout(r, 500));
	}
}

if (!connected) {
	console.error("✗ Failed to connect to Chrome");
	process.exit(1);
}

console.log(`✓ Chrome started on :${CDP_PORT}${useProfile ? " with your profile" : ""}`);
