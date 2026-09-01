// Shared helpers for the browser-tools scripts.
import { tmpdir } from "node:os";
import { join } from "node:path";
import puppeteer from "puppeteer-core";

export const CDP_PORT = process.env.CDP_PORT || 9222;

/** True if a debuggable Chrome answers on the given port. */
export async function isChromeUp(port, timeoutMs = 2000) {
	try {
		const res = await fetch(`http://localhost:${port}/json/version`, {
			signal: AbortSignal.timeout(timeoutMs),
		});
		return res.ok;
	} catch {
		return false;
	}
}

const BROWSER_URL = `http://localhost:${CDP_PORT}`;
// Floored: the wedged-tab heuristic below infers a fault from a failed connect,
// so an impatient timeout must not be mistaken for a broken tab.
const CONNECT_TIMEOUT = Math.max(10000, Number(process.env.CDP_CONNECT_TIMEOUT ?? 20000));
const PROBE_TIMEOUT = 8000;

/**
 * A single tab can wedge puppeteer's attach handshake (an unresponsive OOPIF
 * or worker is enough) even though the browser itself answers CDP normally.
 * When that happens every command fails, so treat it as recoverable rather
 * than reporting a dead browser.
 */
async function tryConnect(timeoutMs, targetFilter) {
	let timedOut = false;
	const pending = puppeteer.connect({
		browserURL: BROWSER_URL,
		defaultViewport: null,
		...(targetFilter && { targetFilter }),
	});
	// Only a connection that lost the race may be dropped; disconnecting the
	// winner would hand back a dead browser.
	pending.then((b) => timedOut && b.disconnect().catch(() => {})).catch(() => {});
	let timer;
	try {
		return await Promise.race([
			pending,
			new Promise((_, reject) => {
				// unref: a pending timer must never keep the process alive after the
				// connection wins the race.
				timer = setTimeout(() => {
					timedOut = true;
					reject(new Error("timeout"));
				}, timeoutMs);
				timer.unref?.();
			}),
		]);
	} catch {
		return undefined;
	} finally {
		clearTimeout(timer);
	}
}

/**
 * Closing every tab quits Chrome, so a replacement must exist before any
 * cleanup. Uses the HTTP endpoint because puppeteer may be unable to attach.
 */
async function openBlankTab() {
	try {
		await fetch(`${BROWSER_URL}/json/new?about:blank`, {
			method: "PUT",
			signal: AbortSignal.timeout(5000),
		});
		return true;
	} catch {
		return false;
	}
}

function exitWithRestartHint(message) {
	console.error(`✗ ${message}`);
	console.error(`  Restart it: pkill -f '[r]emote-debugging-port=${CDP_PORT}' && browser-start.js`);
	process.exit(1);
}

async function closeTab(tab) {
	console.error(`⚠ Closing unattachable tab: ${tab.url.slice(0, 80)}`);
	await fetch(`${BROWSER_URL}/json/close/${tab.id}`, { signal: AbortSignal.timeout(3000) }).catch(() => {});
}

/** Race a promise against a timer that can never hold the process open. */
export function withTimeout(promise, ms, onTimeout = () => null) {
	let timer;
	return Promise.race([
		promise,
		new Promise((resolve) => {
			timer = setTimeout(() => resolve(onTimeout()), ms);
			timer.unref?.();
		}),
	]).finally(() => clearTimeout(timer));
}

async function pageTargets() {
	try {
		const res = await fetch(`${BROWSER_URL}/json/list`, { signal: AbortSignal.timeout(3000) });
		return (await res.json()).filter((t) => t.type === "page");
	} catch {
		return undefined;
	}
}

/**
 * Find the tabs that block the handshake by excluding one candidate at a time.
 * Raw CDP probing cannot detect these - only a real connect attempt can.
 */
async function findWedgedTabs(tabs, timeoutMs) {
	const wedged = [];
	for (const tab of tabs) {
		const skip = new Set([...wedged.map((t) => t.id), tab.id]);
		const browser = await tryConnect(timeoutMs, (t) => !skip.has(t.targetId));
		if (browser) {
			await browser.disconnect().catch(() => {});
			wedged.push(tab);
		}
	}
	return wedged;
}

/** Connect to the Chrome instance on CDP_PORT, exiting with a useful message on failure. */
export async function connect(timeoutMs = CONNECT_TIMEOUT) {
	const browser = await tryConnect(timeoutMs);
	if (browser) return browser;

	const tabs = await pageTargets();
	if (!tabs) {
		console.error(`✗ Could not reach Chrome on :${CDP_PORT}`);
		console.error("  Run: browser-start.js");
		process.exit(1);
	}

	const wedged = await findWedgedTabs(tabs, PROBE_TIMEOUT);
	if (wedged.length === 0) {
		console.error(`✗ Could not connect to browser: timeout after ${timeoutMs}ms`);
		exitWithRestartHint("The browser answers CDP but no tab could be attached.");
	}

	if (wedged.length === tabs.length) await openBlankTab();
	for (const tab of wedged) await closeTab(tab);

	const recovered = await tryConnect(timeoutMs);
	if (recovered) return recovered;

	exitWithRestartHint("Could not connect to browser after closing wedged tabs");
}

/**
 * Resilient replacement for `browser.pages()`, which rejects wholesale if any
 * single target fails to attach ("Tab target session is not defined"). Resolves
 * targets individually so one broken tab cannot hide every usable one.
 */
export async function allPages(browser) {
	const targets = browser.targets().filter((t) => t.type() === "page");
	const resolved = await Promise.all(
		targets.map(async (t) => ({
			id: t._targetId,
			page: await withTimeout(t.page(), 5000).catch(() => null),
		})),
	);

	// browser.targets() order is arbitrary; /json/list is newest-first, so
	// reversing it restores the "most recently opened tab last" contract callers
	// rely on. Fall back to discovery order if the ids cannot be matched.
	const tabs = (await pageTargets()) ?? [];
	const rank = new Map(tabs.map((t, i) => [t.id, tabs.length - i]));
	return resolved
		.filter((r) => r.page)
		.sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0))
		.map((r) => r.page);
}

/** Tabs a user actually sees, as opposed to browser-internal pages. */
export function isUserTab(url) {
	return !url.startsWith("chrome://") && !url.startsWith("chrome-extension://");
}

/**
 * Pick the page to act on: the most recently used real tab.
 * Pass a substring (e.g. "localhost:7766") to prefer a matching tab.
 */
export async function activePage(browser, match) {
	const pages = (await allPages(browser)).filter((p) => isUserTab(p.url()));
	const page = (match && pages.find((p) => p.url().includes(match))) || pages.at(-1);
	if (page) return page;

	// Every tab failed to attach. Open a replacement first - closing the last
	// tab would quit Chrome - then drop the broken ones.
	const broken = (await pageTargets()) ?? [];
	if (!(await openBlankTab())) {
		exitWithRestartHint("No usable tab found and could not open a new one");
	}
	for (const tab of broken) await closeTab(tab);
	console.error("⚠ Opened a fresh blank tab to recover.");

	const fresh = browser.targets().filter((t) => t.type() === "page");
	for (const target of fresh) {
		const p = await target.page().catch(() => null);
		if (p) return p;
	}
	exitWithRestartHint("No usable tab found");
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Evaluate an expression string in the page within an async context. */
export function evalAsync(page, code) {
	return page.evaluate((c) => {
		const AsyncFunction = (async () => {}).constructor;
		return new AsyncFunction(`return (${c})`)();
	}, code);
}

/**
 * Print an eval result: arrays as blocks of key: value, objects as key: value, scalars as-is.
 *
 * Nested objects and arrays are JSON-serialised rather than stringified, so a returned
 * value never degrades into "[object Object]".
 */
export function printResult(result) {
	const show = (value) => {
		if (typeof value !== "object" || value === null) return String(value);
		try {
			return JSON.stringify(value);
		} catch {
			return String(value);
		}
	};
	const printEntries = (obj) => {
		for (const [key, value] of Object.entries(obj)) console.log(`${key}: ${show(value)}`);
	};
	if (Array.isArray(result)) {
		result.forEach((item, i) => {
			if (i > 0) console.log("");
			printEntries(item);
		});
	} else if (typeof result === "object" && result !== null) {
		printEntries(result);
	} else {
		console.log(result);
	}
}

/** Timestamped path in $TMPDIR, e.g. tmpPath("screenshot", ".png"). */
export function tmpPath(prefix, suffix = "") {
	const stamp = new Date().toISOString().replace(/[:.]/g, "-");
	return join(tmpdir(), `${prefix}-${stamp}${suffix}`);
}
