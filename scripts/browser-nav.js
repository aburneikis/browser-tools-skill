#!/usr/bin/env node

import { connect, activePage } from "./lib.mjs";

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

const browser = await connect();

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

if (newTab) {
	const page = await browser.newPage();
	await navigate(page);
	await page.bringToFront();
	console.log("✓ Opened:", url);
} else {
	const page = await activePage(browser);
	await navigate(page);
	if (reload) {
		await page.reload({ waitUntil: "domcontentloaded" });
	}
	await page.bringToFront();
	console.log("✓ Navigated to:", url);
}

await browser.disconnect();
