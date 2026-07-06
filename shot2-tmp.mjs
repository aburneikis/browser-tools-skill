import puppeteer from 'puppeteer-core';
const [url, w, h, out, wait] = process.argv.slice(2);
const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222', defaultViewport: null });
const pages = await browser.pages();
const page = pages[pages.length - 1];
await page.setViewport({ width: +w, height: +h });
try { await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 }); } catch (e) { console.error('nav:', e.message); }
await page.evaluate(() => document.fonts.ready);
await new Promise(r => setTimeout(r, +(wait || 8000)));
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: out });
console.log(out);
browser.disconnect();
