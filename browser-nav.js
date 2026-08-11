#!/usr/bin/env node

import { connect, allPages } from "./lib.mjs";

const args = process.argv.slice(2);
const newTab = args.includes("--new");
const reload = args.includes("--reload");
const url = args.find(a => !a.startsWith("--"));

if (!url) {
	console.log("Usage: browser-nav.js <url> [--new] [--reload]");
	console.log("\nExamples:");
	console.log("  browser-nav.js https://example.com          # Navigate current tab");
	console.log("  browser-nav.js https://example.com --new    # Open in new tab");
	console.log("  browser-nav.js https://example.com --reload # Navigate and force reload");
	process.exit(1);
}

const b = await connect();

const navigate = async (page) => {
	try {
		await page.goto(url, { waitUntil: "domcontentloaded" });
	} catch (e) {
		if (!e.message.includes("detached") && !e.message.includes("Navigation timeout")) throw e;
		// Frame detach errors are common with redirect-heavy sites (e.g. Facebook).
		// Navigation still completes in the browser - wait briefly for it to settle.
		await new Promise((r) => setTimeout(r, 2000));
	}
};

// Get only real page tabs (exclude service workers, extensions, chrome:// internal pages)
const allPagesList = await allPages(b);
const pages = allPagesList.filter(p => {
	const u = p.url();
	return !u.startsWith("chrome-extension://") && !u.startsWith("chrome://") && !u.includes("fbsbx.com");
});
const foregroundPage = pages.at(0) ?? allPagesList.at(-1);
if (!newTab && !foregroundPage) {
	console.error("✗ No usable tab found");
	process.exit(1);
}

if (newTab) {
	const p = await b.newPage();
	await navigate(p);
	await p.bringToFront();
	console.log("✓ Opened:", url);
} else {
	await navigate(foregroundPage);
	if (reload) {
		await foregroundPage.reload({ waitUntil: "domcontentloaded" });
	}
	await foregroundPage.bringToFront();
	console.log("✓ Navigated to:", url);
}

await b.disconnect();
