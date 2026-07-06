#!/usr/bin/env node
import puppeteer from "puppeteer-core";

const [, , outPath, widthStr, heightStr, urlArg, waitSelector] = process.argv;
const width = parseInt(widthStr, 10);
const height = parseInt(heightStr, 10);

const b = await puppeteer.connect({ browserURL: "http://localhost:9222", defaultViewport: null });
const allPages = await b.pages();
const p = allPages.filter(p => !p.url().startsWith("chrome://") && !p.url().startsWith("chrome-extension://")).at(-1);
if (!p) { console.error("no page"); process.exit(1); }

await p.setViewport({ width, height });
if (urlArg && urlArg !== "-") {
  await p.goto(urlArg, { waitUntil: "networkidle2", timeout: 60000 });
}
if (waitSelector && waitSelector !== "-") {
  await p.waitForSelector(waitSelector, { timeout: 15000 }).catch(() => {});
}
await new Promise(r => setTimeout(r, 800));
await p.screenshot({ path: outPath });
console.log(outPath);
await b.disconnect();
