#!/usr/bin/env node

import { connect, activePage, evalAsync, printResult } from "./lib.mjs";

const code = process.argv.slice(2).join(" ");
if (!code) {
	console.log("Usage: browser-eval.js 'code'");
	console.log("\nExamples:");
	console.log('  browser-eval.js "document.title"');
	console.log('  browser-eval.js "document.querySelectorAll(\'a\').length"');
	process.exit(1);
}

const b = await connect();

const p = await activePage(b);

printResult(await evalAsync(p, code));

await b.disconnect();
