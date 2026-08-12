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
	else if (args[i] === "--pick-suggestion") pickSuggestion = args[++i] || ".pac-container .pac-item";
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

await page.waitForSelector(selector, { timeout: 10000 });

// Runs in the page's main world: element handles evaluate in an isolated world
// whose HTMLInputElement.prototype is a different object, so its native setter
// would never reach the one frameworks patch.
const inPage = (fn) => page.evaluate(fn, selector);

// A triple-click + Backspace silently misses on some widgets, splicing the new
// text into the old, so clear through the value setter instead.
await inPage((s) => {
	const node = document.querySelector(s);
	node.focus();
	if (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement) {
		const proto =
			node instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
		Object.getOwnPropertyDescriptor(proto, "value").set.call(node, "");
	} else if (node.isContentEditable) {
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
	await sleep(1500);
	const suggestion = await page.$(pickSuggestion);
	if (suggestion) {
		await suggestion.click();
		console.log(`Typed into ${selector}, clicked suggestion ${pickSuggestion}`);
	} else {
		console.log(`Typed into ${selector}, no suggestion matched ${pickSuggestion}`);
	}
} else {
	if (enter) await page.keyboard.press("Enter");
	console.log(`Typed into ${selector}${enter ? " + Enter" : ""}`);
}

await browser.disconnect();
