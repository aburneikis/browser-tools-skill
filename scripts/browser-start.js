#!/usr/bin/env node

import { spawn, execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { isChromeUp, markActive, portFile } from "./lib.mjs";

const args = process.argv.slice(2);
const useProfile = args.includes("--profile");
const noExtensions = args.includes("--no-extensions");
const headed = args.includes("--headed");
const unknown = args.filter((a) => !["--profile", "--no-extensions", "--headed"].includes(a));

if (unknown.length) {
	console.log("Usage: [CDP_PORT=<port>] browser-start.js [--profile] [--no-extensions] [--headed]");
	console.log("\nOptions:");
	console.log("  --profile        Copy your default Chrome profile (cookies, logins,");
	console.log("                   extensions)");
	console.log("  --no-extensions  Disable extensions (Web Store installs will fail");
	console.log("                   with 'Installation is not enabled')");
	console.log("  --headed         Show a Chrome window (default is headless). Needed");
	console.log("                   when the user clicks or types in the browser.");
	console.log("\nEnvironment:");
	console.log("  CDP_PORT   Remote debugging port (default 9222). Each port gets");
	console.log("             its own Chrome instance and profile dir, so multiple");
	console.log("             browsers can run simultaneously.");
	console.log("  BROWSER_IDLE_MINUTES  Stop a headless instance after this long");
	console.log("             without any script using it (default 30, 0 = never).");
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

if (await isChromeUp(CDP_PORT)) {
	console.log(`✓ Chrome already running on :${CDP_PORT} (restart it to change --headed)`);
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

disablePasswordManager(`${PROFILE_DIR}/Default/Preferences`);

function disablePasswordManager(prefsPath) {
	mkdirSync(`${PROFILE_DIR}/Default`, { recursive: true });
	let prefs = {};
	if (existsSync(prefsPath)) {
		try {
			prefs = JSON.parse(readFileSync(prefsPath, "utf8"));
		} catch {
			prefs = {};
		}
	}
	prefs.credentials_enable_service = false;
	prefs.credentials_enable_autosignin = false;
	prefs.profile = { ...prefs.profile, password_manager_leak_detection: false };
	prefs.autofill = { ...prefs.autofill, credit_card_enabled: false, profile_enabled: false };
	writeFileSync(prefsPath, JSON.stringify(prefs));
}

const HEADLESS_WIDTH = 1920;
const HEADLESS_HEIGHT = 1080;

// Headless advertises "HeadlessChrome" in its user agent, which some sites
// (Google sign-in, Cloudflare) reject, so present the headed one instead.
function headedUserAgent() {
	const major = execSync("google-chrome --version", { encoding: "utf8" }).match(/(\d+)\./)[1];
	return `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36`;
}

const displayFlags = headed
	? ["--ozone-platform=wayland"]
	: [
			"--headless=new",
			`--window-size=${HEADLESS_WIDTH},${HEADLESS_HEIGHT}`,
			// Headless otherwise reports an 800x600 screen behind the larger window.
			`--screen-info={${HEADLESS_WIDTH}x${HEADLESS_HEIGHT}}`,
			`--user-agent=${headedUserAgent()}`,
		];

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
		// Keep Google Password Manager / keyring out of the way
		"--password-store=basic",
		"--disable-features=PasswordManagerOnboarding,PasswordLeakDetection,AutofillServerCommunication",
		...(noExtensions ? ["--disable-extensions"] : []),
		...displayFlags,
		// WebGL support
		"--ignore-gpu-blocklist",
		"--enable-webgl",
		"--enable-unsafe-swiftshader",
		"--use-angle=swiftshader",
	],
	{ detached: true, stdio: "ignore" },
).unref();

rmSync(portFile(CDP_PORT, "idle-stopped"), { force: true });
markActive(CDP_PORT);

// Wait for Chrome to be ready
let connected = false;
for (let i = 0; i < 30 && !connected; i++) {
	connected = await isChromeUp(CDP_PORT);
	if (!connected) await new Promise((r) => setTimeout(r, 500));
}

if (!connected) {
	console.error("✗ Failed to connect to Chrome");
	process.exit(1);
}

// Started only now: it exits as soon as it finds no Chrome on the port.
const idleMinutes = Number(process.env.BROWSER_IDLE_MINUTES ?? 30);
if (!headed && idleMinutes > 0) {
	spawn(process.execPath, [fileURLToPath(new URL("./idle-stop.mjs", import.meta.url)), String(CDP_PORT), String(idleMinutes)], {
		detached: true,
		stdio: "ignore",
	}).unref();
}

console.log(
	`✓ Chrome started ${headed ? "headed" : "headless"} on :${CDP_PORT}${useProfile ? " with your profile" : ""}${noExtensions ? " (extensions disabled)" : ""}`,
);
if (!headed) {
	const autoStop = idleMinutes > 0 ? `, auto-stops after ${idleMinutes} idle minutes` : "";
	console.log(`  Stop it with browser-stop.js when done${autoStop}`);
}
