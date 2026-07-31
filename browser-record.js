#!/usr/bin/env node

// Record a burst of frames + a URL/navigation timeline while an action happens.
// Fixes the classic race: click -> (spinner, animation, 3 redirects) -> screenshot too late.
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { connect, activePage, sleep } from "./lib.mjs";

const args = process.argv.slice(2);
if (!args.length || args.includes("--help") || args.includes("-h")) {
	console.log("Usage: browser-record.js [trigger] [--duration s] [--fps n] [--out dir] [--quality 0-100]");
	console.log("\nTriggers (performed AFTER recording starts, so nothing is missed):");
	console.log("  --click <selector>     click an element");
	console.log("  --eval  <js>           run JS in the page");
	console.log("  --nav   <url>          navigate");
	console.log("  --none                 record only; you (or another command) trigger it");
	console.log("\nExamples:");
	console.log("  browser-record.js --click 'button[type=submit]' --duration 6");
	console.log("  browser-record.js --nav https://example.com/login --fps 8");
	console.log("  browser-record.js --none --duration 10        # while a human clicks around");
	console.log("\nWrites frame-NNNN-<ms>.png files plus timeline.txt and prints the timeline.");
	process.exit(args.length ? 0 : 1);
}

let duration = 5;
let fps = 5;
let quality = 60;
let outDir = null;
let trigger = null;
let triggerArg = null;

for (let i = 0; i < args.length; i++) {
	const a = args[i];
	if (a === "--duration") duration = parseFloat(args[++i]);
	else if (a === "--fps") fps = parseFloat(args[++i]);
	else if (a === "--quality") quality = parseInt(args[++i], 10);
	else if (a === "--out") outDir = args[++i];
	else if (a === "--click" || a === "--eval" || a === "--nav") {
		trigger = a.slice(2);
		triggerArg = args[++i];
	} else if (a === "--none") trigger = "none";
}

outDir = outDir || join(tmpdir(), `record-${new Date().toISOString().replace(/[:.]/g, "-")}`);
mkdirSync(outDir, { recursive: true });

const browser = await connect();
const page = await activePage(browser);
const session = await page.createCDPSession();

const t0 = Date.now();
const at = () => Date.now() - t0;
const timeline = [];
const log = (kind, detail) => {
	const line = `${String(at()).padStart(6)}ms  ${kind.padEnd(10)} ${detail}`;
	timeline.push(line);
	console.log(line);
};

log("start", page.url());

// Navigation / lifecycle timeline: catches redirect chains you would otherwise never see.
page.on("framenavigated", (f) => {
	if (f === page.mainFrame()) log("navigated", f.url());
});
page.on("load", () => log("load", page.url()));
page.on("dialog", (d) => log("dialog", `${d.type()}: ${d.message()}`));
page.on("console", (m) => {
	if (m.type() === "error") log("console", m.text().slice(0, 200));
});
page.on("pageerror", (e) => log("pageerror", e.message.slice(0, 200)));

let n = 0;
session.on("Page.screencastFrame", async ({ data, sessionId }) => {
	const ms = at();
	const file = join(outDir, `frame-${String(n++).padStart(4, "0")}-${ms}ms.png`);
	writeFileSync(file, Buffer.from(data, "base64"));
	timeline.push(`${String(ms).padStart(6)}ms  frame      ${file}`);
	try {
		await session.send("Page.screencastFrameAck", { sessionId });
	} catch {}
});

await session.send("Page.startScreencast", {
	format: "png",
	quality,
	everyNthFrame: 1,
	maxWidth: 1600,
	maxHeight: 1600,
});

// Screencast only emits frames on repaint, so also sample on a fixed interval
// to guarantee coverage of static-but-transient states (e.g. a "Redirecting..." page).
const tick = setInterval(async () => {
	try {
		const ms = at();
		const file = join(outDir, `frame-${String(n++).padStart(4, "0")}-${ms}ms.png`);
		await page.screenshot({ path: file });
		timeline.push(`${String(ms).padStart(6)}ms  frame      ${file}`);
	} catch {}
}, Math.max(50, Math.round(1000 / fps)));

// Perform the trigger only once recording is live.
try {
	if (trigger === "click") {
		log("click", triggerArg);
		await page.click(triggerArg);
	} else if (trigger === "eval") {
		log("eval", triggerArg);
		const r = await page.evaluate((c) => new (async () => {}).constructor(`return (${c})`)(), triggerArg);
		log("eval-out", JSON.stringify(r)?.slice(0, 200));
	} else if (trigger === "nav") {
		log("nav", triggerArg);
		page.goto(triggerArg, { waitUntil: "domcontentloaded" }).catch((e) => log("nav-err", e.message));
	}
} catch (e) {
	log("trigger-err", e.message);
}

await sleep(duration * 1000);
clearInterval(tick);
try {
	await session.send("Page.stopScreencast");
	await session.detach();
} catch {}
log("end", page.url());

timeline.sort((a, b) => parseInt(a) - parseInt(b));
writeFileSync(join(outDir, "timeline.txt"), timeline.join("\n") + "\n");
console.log(`\n${n} frames -> ${outDir}`);
console.log(`timeline -> ${join(outDir, "timeline.txt")}`);

await browser.disconnect();
