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

const el = await page.waitForSelector(selector, { timeout: 10000 });
await el.click({ clickCount: 3 }); // select existing value
await page.keyboard.press("Backspace");
await el.type(text, { delay });

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
