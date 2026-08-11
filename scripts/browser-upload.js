#!/usr/bin/env node

import { connect, activePage } from "./lib.mjs";
import path from "node:path";
import fs from "node:fs";

const args = process.argv.slice(2);
if (args.length < 2) {
	console.log("Usage: browser-upload.js <css-selector> <file-path> [<file-path>...]");
	console.log("\nSets files on an <input type=\"file\"> element via CDP.");
	console.log("JS assignment to input.files is blocked by browsers for security,");
	console.log("so this is the only way to programmatically attach files.");
	console.log("\nExamples:");
	console.log("  browser-upload.js 'input[type=file]' /tmp/photo.jpg");
	console.log("  browser-upload.js '#avatar-input' ~/pic.png");
	console.log("  browser-upload.js 'input[name=docs]' a.pdf b.pdf   # input must have 'multiple'");
	console.log("\nFor drag-and-drop dropzones, find the hidden <input type=file> nested inside");
	console.log("the component and target that selector.");
	process.exit(1);
}

const [selector, ...files] = args;
const absFiles = files.map((f) => path.resolve(f.replace(/^~/, process.env.HOME || "")));
for (const f of absFiles) {
	if (!fs.existsSync(f)) {
		console.error(`File not found: ${f}`);
		process.exit(1);
	}
}

const b = await connect();
const p = await activePage(b);

const handle = await p.$(selector);
if (!handle) {
	console.error(`No element matched selector: ${selector}`);
	await b.disconnect();
	process.exit(1);
}

const tagInfo = await handle.evaluate((el) => ({
	tag: el.tagName,
	type: el.type,
	multiple: el.multiple,
}));

if (tagInfo.tag !== "INPUT" || tagInfo.type !== "file") {
	console.error(
		`Element is <${tagInfo.tag.toLowerCase()} type="${tagInfo.type}">, not <input type="file">. ` +
			`File uploads only work on real file inputs (often hidden inside dropzone components).`,
	);
	await b.disconnect();
	process.exit(1);
}

if (absFiles.length > 1 && !tagInfo.multiple) {
	console.error("Input does not have the 'multiple' attribute; cannot attach more than one file.");
	await b.disconnect();
	process.exit(1);
}

await handle.uploadFile(...absFiles);

// Fire change/input events in case the page's framework only listens to those
// (puppeteer dispatches them, but some Angular bindings re-check on input).
await handle.evaluate((el) => {
	el.dispatchEvent(new Event("input", { bubbles: true }));
	el.dispatchEvent(new Event("change", { bubbles: true }));
});

console.log(`Uploaded ${absFiles.length} file(s) to ${selector}:`);
for (const f of absFiles) console.log("  " + f);

await b.disconnect();
