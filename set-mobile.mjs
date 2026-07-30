import puppeteer from "puppeteer-core";
const b = await puppeteer.connect({ browserURL: `http://localhost:${process.env.CDP_PORT||9222}`, defaultViewport: null });
const pages = await b.pages();
const p = pages.filter(p => !p.url().startsWith("chrome://")).at(-1);
await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
console.log('viewport set');
await b.disconnect();
