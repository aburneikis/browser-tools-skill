#!/usr/bin/env node

import { spawn, execSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";

const args = process.argv.slice(2);
const useProfile = args.includes("--profile");
const noExtensions = args.includes("--no-extensions");
const unknown = args.filter((a) => a !== "--profile" && a !== "--no-extensions");

if (unknown.length) {
	console.log("Usage: [CDP_PORT=<port>] browser-start.js [--profile] [--no-extensions]");
	console.log("\nOptions:");
	console.log("  --profile        Copy your default Chrome profile (cookies, logins,");
	console.log("                   extensions)");
	console.log("  --no-extensions  Disable extensions (Web Store installs will fail");
	console.log("                   with 'Installation is not enabled')");
	console.log("\nEnvironment:");
	console.log("  CDP_PORT   Remote debugging port (default 9222). Each port gets");
	console.log("             its own Chrome instance and profile dir, so multiple");
	console.log("             browsers can run simultaneously.");
	process.exit(1);
}

const CDP_PORT = Number(process.env.CDP_PORT || 9222);
// Per-port profile dir: Chrome allows only one instance per user-data-dir
// (SingletonLock), so each CDP port needs its own. Port 9222 keeps the
// historical un-suffixed dir for backwards compatibility.
const PROFILE_DIR =
	CDP_PORT === 9222
		? `${process.env.HOME}/.cache/browser-tools`
		: `${process.env.HOME}/.cache/browser-tools-${CDP_PORT}`;

const isUp = async () => {
	try {
		const res = await fetch(`http://localhost:${CDP_PORT}/json/version`, {
			signal: AbortSignal.timeout(2000),
		});
		return res.ok;
	} catch {
		return false;
	}
};

if (await isUp()) {
	console.log(`✓ Chrome already running on :${CDP_PORT}`);
	process.exit(0);
}

mkdirSync(PROFILE_DIR, { recursive: true });

// Stale singleton files block a new instance after an unclean shutdown.
for (const f of ["SingletonLock", "SingletonSocket", "SingletonCookie"]) {
	rmSync(`${PROFILE_DIR}/${f}`, { force: true });
}

if (useProfile) {
	console.log("Syncing profile...");
	const extensionExcludes = noExtensions
		? [
				"Extensions",
				"Extension State",
				"Extension Rules",
				"Local Extension Settings",
				"Sync Extension Settings",
			]
				.map((d) => `--exclude='*/${d}'`)
				.join(" ")
		: "";
	execSync(
		`rsync -a --delete \
			--exclude='SingletonLock' \
			--exclude='SingletonSocket' \
			--exclude='SingletonCookie' \
			${extensionExcludes} \
			--exclude='*/Sessions/*' \
			--exclude='*/Current Session' \
			--exclude='*/Current Tabs' \
			--exclude='*/Last Session' \
			--exclude='*/Last Tabs' \
			"${process.env.HOME}/.config/google-chrome/" "${PROFILE_DIR}/"`,
		{ stdio: "pipe" },
	);
}

// Start Chrome with flags to force new instance
spawn(
	"google-chrome",
	[
		`--remote-debugging-port=${CDP_PORT}`,
		`--user-data-dir=${PROFILE_DIR}`,
		"--no-first-run",
		"--profile-directory=Default",
		"about:blank",
		"--no-default-browser-check",
		...(noExtensions ? ["--disable-extensions"] : []),
		"--ozone-platform=wayland",
		// WebGL support
		"--ignore-gpu-blocklist",
		"--enable-webgl",
		"--enable-unsafe-swiftshader",
		"--use-angle=swiftshader",
	],
	{ detached: true, stdio: "ignore" },
).unref();

// Wait for Chrome to be ready
let connected = false;
for (let i = 0; i < 30 && !connected; i++) {
	connected = await isUp();
	if (!connected) await new Promise((r) => setTimeout(r, 500));
}

if (!connected) {
	console.error("✗ Failed to connect to Chrome");
	process.exit(1);
}

console.log(
	`✓ Chrome started on :${CDP_PORT}${useProfile ? " with your profile" : ""}${noExtensions ? " (extensions disabled)" : ""}`,
);
