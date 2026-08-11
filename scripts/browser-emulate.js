#!/usr/bin/env node

// Emulate viewport sizes / mobile devices / offline mode on the active tab.
import { connect, activePage, sleep } from "./lib.mjs";

const args = process.argv.slice(2);
if (!args.length) {
	console.log("Usage: browser-emulate.js <preset|WIDTHxHEIGHT> [--offline|--online] [--wait ms]");
	console.log("\nPresets: mobile (390x844, touch), tablet (820x1180, touch), desktop (1440x900), reset");
	console.log("\nExamples:");
	console.log("  browser-emulate.js mobile");
	console.log("  browser-emulate.js 760x760          # squeeze layout to test responsive breakpoints");
	console.log("  browser-emulate.js reset            # clear all overrides");
	console.log("  browser-emulate.js --offline        # simulate network loss");
	process.exit(1);
}

// Note: user-agent overrides are per-CDP-session and vanish when this script disconnects,
// so presets only set viewport / mobile / touch, which do persist.
const presets = {
	mobile: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
	tablet: { width: 820, height: 1180, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
	desktop: { width: 1440, height: 900, isMobile: false, hasTouch: false, deviceScaleFactor: 1 },
};

let target = null;
let offline = null;
let wait = 500;
for (let i = 0; i < args.length; i++) {
	if (args[i] === "--offline") offline = true;
	else if (args[i] === "--online") offline = false;
	else if (args[i] === "--wait") wait = parseInt(args[++i], 10);
	else target = args[i];
}

const browser = await connect();
const page = await activePage(browser);

if (target === "reset") {
	const session = await page.createCDPSession();
	await session.send("Emulation.clearDeviceMetricsOverride");
	await session.detach();
	console.log("emulation reset");
} else if (target) {
	const m = /^(\d+)x(\d+)$/.exec(target);
	const cfg = presets[target] || (m ? { width: +m[1], height: +m[2], isMobile: false, deviceScaleFactor: 1 } : null);
	if (!cfg) {
		console.error(`✗ Unknown preset: ${target} (use mobile|tablet|desktop|reset|WIDTHxHEIGHT)`);
		process.exit(1);
	}
	await page.setViewport({
		width: cfg.width,
		height: cfg.height,
		isMobile: !!cfg.isMobile,
		hasTouch: !!cfg.hasTouch,
		deviceScaleFactor: cfg.deviceScaleFactor ?? 1,
	});
	await sleep(wait);
	console.log(`viewport ${cfg.width}x${cfg.height}${cfg.isMobile ? " (mobile)" : ""}: ${page.url()}`);
}

if (offline !== null) {
	await page.setOfflineMode(offline);
	console.log(offline ? "offline" : "online");
}

await browser.disconnect();
