#!/usr/bin/env node

// Type text into an input using real keyboard events (triggers framework/autocomplete handlers).
import { connect, activePage, sleep } from "./lib.mjs";

const args = process.argv.slice(2);
let delay = 40;
let pickSuggestion = null;
let enter = false;
const positional = [];

for (let i = 0; i < args.length; i++) {
	if (args[i] === "--delay") delay = parseInt(args[++i], 10);
	else if (args[i] === "--enter") enter = true;
	else if (args[i] === "--pick-suggestion")
		// The custom selector is optional: consume the next arg only when both
		// positionals (selector, text) are already present and it is not a flag.
		pickSuggestion =
			positional.length >= 2 && args[i + 1] && !args[i + 1].startsWith("--")
				? args[++i]
				: ".pac-container .pac-item";
	else positional.push(args[i]);
}

const [selector, text] = positional;
if (!selector || text === undefined) {
	console.log("Usage: browser-type.js <selector> <text> [--delay ms] [--enter] [--pick-suggestion [selector]]");
	console.log("\nExamples:");
	console.log('  browser-type.js "#email" user@example.com');
	console.log('  browser-type.js "#search" "hello" --enter');
	console.log('  browser-type.js "#address" "1 Smith St" --pick-suggestion   # Google Places autocomplete');
	process.exit(1);
}

const browser = await connect();
const page = await activePage(browser);

const el = await page.waitForSelector(selector, { timeout: 10000 });

// Runs in the page's main world: element handles evaluate in an isolated world
// whose HTMLInputElement.prototype is a different object, so its native setter
// would never reach the one frameworks patch.
const inPage = (fn) => page.evaluate(fn, selector);

// Focus with a real click: some widgets (e.g. autocomplete dropdowns gated on
// a document click listener) only arm themselves on a trusted click, which a
// JS-side node.focus() never produces. But a trusted click stalls forever
// when the window sits on a hidden Wayland workspace (mouse input waits for
// a compositor frame), so fall back to a synthetic click + focus after 1.5s.
const clickOrFallback = async (handle) => {
	const done = await Promise.race([
		handle.click().then(() => true),
		sleep(1500).then(() => false),
	]);
	if (!done)
		await handle.evaluate((node) => {
			node.click();
			node.focus();
		});
	return done;
};
await clickOrFallback(el);

// Clear with trusted keys so widgets that mirror the value internally (e.g.
// Google Places) stay in sync; a JS value-setter clear leaves their internal
// copy stale and later queries splice old and new text.
const selectAllModifier = process.platform === "darwin" ? "Meta" : "Control";
await page.keyboard.down(selectAllModifier);
await page.keyboard.press("a");
await page.keyboard.up(selectAllModifier);
await page.keyboard.press("Backspace");

// Safety net: if the keyboard clear missed (some widgets swallow select-all),
// clear through the native value setter as well.
await inPage((s) => {
	const node = document.querySelector(s);
	const hasValue =
		(node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement)
			? node.value !== ""
			: node.isContentEditable && node.textContent !== "";
	if (!hasValue) return;
	if (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement) {
		const proto =
			node instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
		Object.getOwnPropertyDescriptor(proto, "value").set.call(node, "");
	} else {
		node.textContent = "";
	}
	node.dispatchEvent(new Event("input", { bubbles: true }));
});

await page.keyboard.type(text, { delay });

// Commit the value: controls bound with `updateOn: 'blur'` (Angular) only write
// to the model on blur, so without this the DOM shows the text while the form
// model stays empty and submits blank.
if (!pickSuggestion && !enter) {
	await inPage((s) => {
		const node = document.querySelector(s);
		node.dispatchEvent(new Event("change", { bubbles: true }));
		node.blur();
		node.dispatchEvent(new Event("blur", { bubbles: true }));
	});
}

if (pickSuggestion) {
	const suggestion = await page
		.waitForSelector(pickSuggestion, { visible: true, timeout: 8000 })
		.catch(() => null);
	if (suggestion) {
		await sleep(300); // let the list settle so the click hits the intended item
		await clickOrFallback(suggestion);
		console.log(`Typed into ${selector}, clicked suggestion ${pickSuggestion}`);
	} else {
		console.log(`Typed into ${selector}, no suggestion matched ${pickSuggestion}`);
	}
} else {
	if (enter) await page.keyboard.press("Enter");
	console.log(`Typed into ${selector}${enter ? " + Enter" : ""}`);
}

await browser.disconnect();
