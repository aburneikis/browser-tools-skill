#!/usr/bin/env node

// Record a burst of frames + a URL/navigation timeline while an action happens.
// Fixes the classic race: click -> (spinner, animation, 3 redirects) -> screenshot too late.
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { connect, activePage, evalAsync, sleep, tmpPath } from "./lib.mjs";

const args = process.argv.slice(2);
if (!args.length || args.includes("--help") || args.includes("-h")) {
	console.log("Usage: browser-record.js [trigger] [--duration s] [--fps n] [--video [file]] [--gif [file]]");
	console.log("                         [--out dir] [--quality 0-100] [--keep-frames] [--wait-enter]");
	console.log("\nTriggers (performed AFTER recording starts, so nothing is missed):");
	console.log("  --click <selector>     click an element");
	console.log("  --eval  <js>           run JS in the page");
	console.log("  --nav   <url>          navigate");
	console.log("  --none                 record only; you (or another command) trigger it");
	console.log("\nExamples:");
	console.log("  browser-record.js --click 'button[type=submit]' --duration 6");
	console.log("  browser-record.js --nav https://example.com/login --fps 8");
	console.log("  browser-record.js --none --duration 10                 # while a human clicks around");
	console.log("  browser-record.js --none --wait-enter --video demo.mp4 # screen recording, Enter to stop");
	console.log("  browser-record.js --click '#play' --duration 4 --fps 15 --gif /tmp/anim.gif");
	console.log("\nWrites frame-NNNN-<ms>.png files plus timeline.txt, and an mp4/gif with --video/--gif.");
	process.exit(args.length ? 0 : 1);
}

let duration = 5;
let fps = 5;
let quality = 60;
let outDir = null;
let trigger = null;
let triggerArg = null;
let video = null;
let gif = null;
let keepFrames = false;
let waitEnter = false;
let durationGiven = false;

const optArg = (next) => (next && !next.startsWith("--") ? next : null);

for (let i = 0; i < args.length; i++) {
	const a = args[i];
	if (a === "--duration") {
		duration = parseFloat(args[++i]);
		durationGiven = true;
	} else if (a === "--fps") fps = parseFloat(args[++i]);
	else if (a === "--quality") quality = parseInt(args[++i], 10);
	else if (a === "--out") outDir = args[++i];
	else if (a === "--keep-frames") keepFrames = true;
	else if (a === "--wait-enter") waitEnter = true;
	else if (a === "--video") {
		video = optArg(args[i + 1]) || "";
		if (video) i++;
	} else if (a === "--gif") {
		gif = optArg(args[i + 1]) || "";
		if (gif) i++;
	} else if (a === "--click" || a === "--eval" || a === "--nav") {
		trigger = a.slice(2);
		triggerArg = args[++i];
	} else if (a === "--none") trigger = "none";
}

if ((video !== null || gif !== null) && spawnSync("ffmpeg", ["-version"]).status !== 0) {
	console.error("✗ ffmpeg not found - install it, or drop --video/--gif and use the PNG frames");
	process.exit(1);
}

// A screen recording of a person doing things has no known length: default to Enter-to-stop.
if (waitEnter && !durationGiven) duration = Infinity;

outDir = outDir || tmpPath("record");
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
const frames = []; // { ms, file } in capture order, used for encoding
const nextFramePath = (ms) => join(outDir, `frame-${String(n++).padStart(4, "0")}-${ms}ms.png`);
const recordFrame = (ms, file) => {
	frames.push({ ms, file });
	timeline.push(`${String(ms).padStart(6)}ms  frame      ${file}`);
};
let screencastFrames = 0;
session.on("Page.screencastFrame", async ({ data, sessionId }) => {
	screencastFrames++;
	const ms = at();
	const file = nextFramePath(ms);
	writeFileSync(file, Buffer.from(data, "base64"));
	recordFrame(ms, file);
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
		const file = nextFramePath(ms);
		await page.screenshot({ path: file });
		recordFrame(ms, file);
	} catch {}
}, Math.max(50, Math.round(1000 / fps)));

// Perform the trigger only once recording is live.
try {
	if (trigger === "click") {
		log("click", triggerArg);
		await page.click(triggerArg);
	} else if (trigger === "eval") {
		log("eval", triggerArg);
		const r = await evalAsync(page, triggerArg);
		log("eval-out", JSON.stringify(r)?.slice(0, 200));
	} else if (trigger === "nav") {
		log("nav", triggerArg);
		page.goto(triggerArg, { waitUntil: "domcontentloaded" }).catch((e) => log("nav-err", e.message));
	}
} catch (e) {
	log("trigger-err", e.message);
}

if (waitEnter) {
	console.error("\nRecording... perform your actions in the browser, then press Enter here to stop.");
	await Promise.race([
		new Promise((r) => process.stdin.once("data", r)),
		duration === Infinity ? new Promise(() => {}) : sleep(duration * 1000),
	]);
	process.stdin.pause();
} else {
	await sleep(duration * 1000);
}
clearInterval(tick);
try {
	await session.send("Page.stopScreencast");
	await session.detach();
} catch {}
log("end", page.url());

timeline.sort((a, b) => parseInt(a) - parseInt(b));
writeFileSync(join(outDir, "timeline.txt"), timeline.join("\n") + "\n");
console.log(`\n${n} frames -> ${outDir}`);
if (screencastFrames === 0) {
	console.error(
		"! no repaint-driven frames arrived: the Chrome window is likely hidden " +
			"(unfocused workspace / minimized), which stops rendering entirely. Only " +
			"fixed-interval snapshots were captured, and they may show stale pixels. " +
			"Make the Chrome window visible and record again.",
	);
}
console.log(`timeline -> ${join(outDir, "timeline.txt")}`);

// Encode with real per-frame durations so playback speed matches reality,
// letterboxing to the first frame's size (viewport/DPR changes mid-record are possible).
frames.sort((a, b) => a.ms - b.ms);

function encode(target, isGif) {
	if (frames.length < 2) {
		console.error("✗ not enough frames to encode");
		return null;
	}
	const out = target || join(outDir, isGif ? "recording.gif" : "recording.mp4");
	const probe = execFileSync("ffprobe", [
		"-v", "error", "-select_streams", "v:0",
		"-show_entries", "stream=width,height", "-of", "csv=p=0:s=x",
		frames[0].file,
	]).toString().trim();
	const [w0, h0] = probe.split("x").map(Number);
	const W = w0 - (w0 % 2);
	const H = h0 - (h0 % 2);

	const lines = [];
	for (let i = 0; i < frames.length; i++) {
		const next = frames[i + 1];
		const dur = ((next ? next.ms - frames[i].ms : 1000 / fps) / 1000).toFixed(3);
		lines.push(`file '${frames[i].file}'`, `duration ${Math.max(0.02, +dur)}`);
	}
	lines.push(`file '${frames.at(-1).file}'`); // concat demuxer needs the last file repeated
	const listFile = join(outDir, "frames.txt");
	writeFileSync(listFile, lines.join("\n") + "\n");

	const scale = `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black`;
	const common = ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", listFile];
	const outFps = Math.min(30, Math.max(5, Math.round(fps)));
	const argv = isGif
		? [...common, "-vf", `${scale},fps=${outFps},split[a][b];[a]palettegen[p];[b][p]paletteuse`, "-loop", "0", out]
		: [...common, "-vf", `${scale},fps=${outFps},format=yuv420p`, "-c:v", "libx264", "-preset", "veryfast", "-movflags", "+faststart", out];
	const r = spawnSync("ffmpeg", argv, { stdio: ["ignore", "ignore", "inherit"] });
	if (r.status !== 0) {
		console.error("✗ ffmpeg failed");
		return null;
	}
	console.log(`${isGif ? "gif" : "video"} -> ${out}`);
	return out;
}

let encoded = false;
if (video !== null) encoded = !!encode(video, false) || encoded;
if (gif !== null) encoded = !!encode(gif, true) || encoded;

if (encoded && !keepFrames) {
	for (const f of frames) rmSync(f.file, { force: true });
	rmSync(join(outDir, "frames.txt"), { force: true });
	console.log("(frames deleted; pass --keep-frames to keep them)");
}

await browser.disconnect();
