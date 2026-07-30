// Shared helpers for the browser-tools scripts.
import puppeteer from "puppeteer-core";

export const CDP_PORT = process.env.CDP_PORT || 9222;

/** Connect to the Chrome instance on CDP_PORT, exiting with a useful message on failure. */
export async function connect(timeoutMs = 5000) {
	return Promise.race([
		puppeteer.connect({
			browserURL: `http://localhost:${CDP_PORT}`,
			defaultViewport: null,
		}),
		new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), timeoutMs)),
	]).catch((e) => {
		console.error("✗ Could not connect to browser:", e.message);
		console.error("  Run: browser-start.js");
		process.exit(1);
	});
}

/**
 * Pick the page to act on: the most recently used real tab.
 * Pass a substring (e.g. "localhost:7766") to prefer a matching tab.
 */
export async function activePage(browser, match) {
	const pages = (await browser.pages()).filter(
		(p) => !p.url().startsWith("chrome://") && !p.url().startsWith("chrome-extension://"),
	);
	const page = (match && pages.find((p) => p.url().includes(match))) || pages.at(-1);
	if (!page) {
		console.error("✗ No active tab found");
		process.exit(1);
	}
	return page;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
