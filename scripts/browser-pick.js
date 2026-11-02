#!/usr/bin/env node

import { connect, activePage, printResult, isHeadless, CDP_PORT } from "./lib.mjs";

const message = process.argv.slice(2).join(" ");
if (!message) {
	console.log("Usage: browser-pick.js 'message'");
	console.log("\nExample:");
	console.log('  browser-pick.js "Click the submit button"');
	process.exit(1);
}

const browser = await connect();
if (isHeadless()) {
	console.error(`✗ Chrome on :${CDP_PORT} is headless, nobody can click in it.`);
	console.error(`  Restart it headed: pkill -f '[r]emote-debugging-port=${CDP_PORT}' && browser-start.js --headed`);
	await browser.disconnect();
	process.exit(1);
}
const page = await activePage(browser);

// Inject pick() helper into current page (overwrite any stale version from a previous run)
await page.evaluate(() => {
	window.pick = async (message) => {
		if (!message) {
			throw new Error("pick() requires a message parameter");
		}
		return new Promise((resolve) => {
			const HIGHLIGHT_STYLE =
				"position:absolute;border:2px solid #3b82f6;background:rgba(59,130,246,0.1);transition:all 0.1s";
			const selections = [];
			const selectedElements = new Set();

			const overlay = document.createElement("div");
			overlay.style.cssText =
				"position:fixed;top:0;left:0;width:100%;height:100%;z-index:2147483647;pointer-events:none";

			const highlight = document.createElement("div");
			highlight.style.cssText = HIGHLIGHT_STYLE;
			overlay.appendChild(highlight);

			const banner = document.createElement("div");
			banner.style.cssText =
				"position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#1f2937;color:white;padding:12px 24px;border-radius:8px;font:14px sans-serif;box-shadow:0 4px 12px rgba(0,0,0,0.3);pointer-events:auto;z-index:2147483647";

			const updateBanner = () => {
				banner.textContent = `${message} (${selections.length} selected, Cmd/Ctrl+click to add, Enter to finish, ESC to cancel)`;
			};
			updateBanner();

			document.body.append(banner, overlay);

			const cleanup = () => {
				document.removeEventListener("mousemove", onMove, true);
				document.removeEventListener("click", onClick, true);
				document.removeEventListener("keydown", onKey, true);
				overlay.remove();
				banner.remove();
				selectedElements.forEach((el) => {
					el.style.outline = "";
				});
			};

			const onMove = (e) => {
				const el = document.elementFromPoint(e.clientX, e.clientY);
				if (!el || overlay.contains(el) || banner.contains(el)) return;
				const r = el.getBoundingClientRect();
				highlight.style.cssText = `${HIGHLIGHT_STYLE};top:${r.top}px;left:${r.left}px;width:${r.width}px;height:${r.height}px`;
			};

			// el.className is an SVGAnimatedString on SVG elements, so read the attribute.
			const classOf = (el) => el.getAttribute("class")?.trim() || null;

			const buildElementInfo = (el) => {
				const parents = [];
				let current = el.parentElement;
				while (current && current !== document.body) {
					const parentInfo = current.tagName.toLowerCase();
					const id = current.id ? `#${current.id}` : "";
					const classes = classOf(current);
					const cls = classes ? `.${classes.split(/\s+/).join(".")}` : "";
					parents.push(parentInfo + id + cls);
					current = current.parentElement;
				}

				return {
					tag: el.tagName.toLowerCase(),
					id: el.id || null,
					class: classOf(el),
					text: el.textContent?.trim().slice(0, 200) || null,
					html: el.outerHTML.slice(0, 500),
					parents: parents.join(" > "),
				};
			};

			const onClick = (e) => {
				if (banner.contains(e.target)) return;
				e.preventDefault();
				e.stopPropagation();
				const el = document.elementFromPoint(e.clientX, e.clientY);
				if (!el || overlay.contains(el) || banner.contains(el)) return;

				if (e.metaKey || e.ctrlKey) {
					if (!selectedElements.has(el)) {
						selectedElements.add(el);
						el.style.outline = "3px solid #10b981";
						selections.push(buildElementInfo(el));
						updateBanner();
					}
				} else {
					cleanup();
					const info = buildElementInfo(el);
					resolve(selections.length > 0 ? selections : info);
				}
			};

			const onKey = (e) => {
				if (e.key === "Escape") {
					e.preventDefault();
					cleanup();
					resolve(null);
				} else if (e.key === "Enter" && selections.length > 0) {
					e.preventDefault();
					cleanup();
					resolve(selections);
				}
			};

			document.addEventListener("mousemove", onMove, true);
			document.addEventListener("click", onClick, true);
			document.addEventListener("keydown", onKey, true);
		});
	};
});

printResult(await page.evaluate((msg) => window.pick(msg), message));

await browser.disconnect();
