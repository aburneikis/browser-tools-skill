#!/usr/bin/env node
// usage: node shot.mjs <url> <width> <height> <outfile> [waitMs]
import puppeteer from "puppeteer-core";
const [url, w, h, out, waitMs = "3000"] = process.argv.slice(2);
const b = await puppeteer.connect({ browserURL: "http://localhost:9222", defaultViewport: null });
const pages = await b.pages();
const p = pages.filter(p => !p.url().startsWith("chrome")).at(-1) ?? (await b.newPage());
await p.setViewport({ width: +w, height: +h });
await p.goto(url, { waitUntil: "networkidle2", timeout: 60000 }).catch(e => console.error("nav:", e.message));
await new Promise(r => setTimeout(r, +waitMs));
await p.screenshot({ path: out });
console.log(out);
await b.disconnect();
