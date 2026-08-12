#!/usr/bin/env node

// Report and remove leftover browser-tools artifacts: /tmp screenshots and recordings,
// and Chrome profile dirs in ~/.cache for ports that are no longer running.
// Dry-run by default; pass --yes to actually delete.
import { execFileSync } from "node:child_process";
import { readdirSync, rmSync, statSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { isChromeUp } from "./lib.mjs";

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
	console.log("Usage: browser-clean.js [--yes] [--days N] [--profiles] [--tmp] [--all]");
	console.log("\nBy default reports (dry-run) both /tmp artifacts and idle Chrome profiles.");
	console.log("  --yes        actually delete");
	console.log("  --days N     only artifacts older than N days (default 1; 0 = everything)");
	console.log("  --tmp        only /tmp screenshots + recordings");
	console.log("  --profiles   only ~/.cache/browser-tools* profile dirs (never live ones)");
	console.log("  --all        include the default profile dir (~/.cache/browser-tools) if idle;");
	console.log("               this discards saved logins/cookies for that profile");
	console.log("\nExamples:");
	console.log("  browser-clean.js                  # see what is reclaimable");
	console.log("  browser-clean.js --yes            # delete stale stuff");
	console.log("  browser-clean.js --days 0 --yes   # delete everything idle, regardless of age");
	process.exit(0);
}

const yes = args.includes("--yes");
const all = args.includes("--all");
const onlyTmp = args.includes("--tmp");
const onlyProfiles = args.includes("--profiles");
const days = args.includes("--days") ? parseFloat(args[args.indexOf("--days") + 1]) : 1;
const cutoff = Date.now() - days * 86400_000;

const du = (p) => {
	try {
		return parseInt(execFileSync("du", ["-sb", p]).toString().split("\t")[0], 10);
	} catch {
		return 0;
	}
};
const human = (b) => {
	const u = ["B", "K", "M", "G"];
	let i = 0;
	while (b >= 1024 && i < u.length - 1) {
		b /= 1024;
		i++;
	}
	return `${b.toFixed(b < 10 && i ? 1 : 0)}${u[i]}`;
};

const targets = [];
let skipped = 0;

// /tmp artifacts written by browser-screenshot.js and browser-record.js
if (!onlyProfiles) {
	const tmp = tmpdir();
	for (const name of readdirSync(tmp)) {
		const isShot = /^screenshot-.*\.png$/.test(name);
		const isRec = /^record-/.test(name);
		if (!isShot && !isRec) continue;
		const p = join(tmp, name);
		let st;
		try {
			st = statSync(p);
		} catch {
			continue;
		}
		if (st.mtimeMs > cutoff) {
			skipped++;
			continue;
		}
		targets.push({ path: p, size: du(p), what: isRec ? "recording" : "screenshot" });
	}
}

// Chrome profile dirs - only if nothing is listening on their port
if (!onlyTmp) {
	const cache = join(homedir(), ".cache");
	for (const name of readdirSync(cache)) {
		if (!/^browser-tools(-\d+)?$/.test(name)) continue;
		const isDefault = name === "browser-tools";
		if (isDefault && !all) {
			skipped++;
			continue;
		}
		const port = isDefault ? 9222 : name.split("-").at(-1);
		const p = join(cache, name);
		if (await isChromeUp(port, 500)) {
			console.log(`live      keep   :${port}  ${p}`);
			continue;
		}
		targets.push({ path: p, size: du(p), what: `profile :${port}` });
	}
}

if (!targets.length) {
	console.log(`Nothing to clean${skipped ? ` (${skipped} item(s) too recent or in use)` : ""}.`);
	process.exit(0);
}

targets.sort((a, b) => b.size - a.size);
let total = 0;
for (const t of targets) {
	total += t.size;
	console.log(`${(yes ? "delete" : "would").padEnd(9)} ${human(t.size).padStart(6)}  ${t.what.padEnd(14)} ${t.path}`);
	if (yes) rmSync(t.path, { recursive: true, force: true });
}

console.log(`\n${yes ? "Reclaimed" : "Reclaimable"}: ${human(total)} across ${targets.length} item(s)`);
if (!yes) console.log("Re-run with --yes to delete.");
if (skipped) console.log(`Skipped ${skipped} item(s) (newer than ${days}d, or default profile without --all).`);
