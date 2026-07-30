#!/usr/bin/env node
import puppeteer from "puppeteer-core";

const b = await puppeteer.connect({ browserURL: `http://localhost:${process.env.CDP_PORT || 9222}`, defaultViewport: null });
const allPages = await b.pages();
const p = allPages.filter(p => !p.url().startsWith("chrome://")).at(-1);

// iPhone 13-ish viewport
await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
await p.setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1");

console.log("mobile viewport set:", p.url());
await b.disconnect();
