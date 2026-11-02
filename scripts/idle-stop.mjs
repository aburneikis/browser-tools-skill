// Spawned detached by browser-start.js for headless instances: nobody sees a
// forgotten headless Chrome, so it stops itself after a stretch without use.
// Usage: node idle-stop.mjs <port> <idle minutes>
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { chromeProcesses, portFile, sleep, stopChrome } from "./lib.mjs";

const port = Number(process.argv[2]);
const idleMinutes = Number(process.argv[3]);
const idleMs = idleMinutes * 60000;
const checkEveryMs = Math.max(1000, Math.min(60000, idleMs / 4));

const lastUsed = () => {
	try {
		return Number(readFileSync(portFile(port, "last-used"), "utf8")) || statSync(portFile(port, "last-used")).mtimeMs;
	} catch {
		return Date.now();
	}
};

while (chromeProcesses(port).length) {
	if (Date.now() - lastUsed() > idleMs) {
		writeFileSync(portFile(port, "idle-stopped"), String(idleMinutes));
		await stopChrome(port);
		break;
	}
	await sleep(checkEveryMs);
}
