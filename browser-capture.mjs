#!/usr/bin/env node
import puppeteer from 'puppeteer-core';

const output = process.argv[2];
if (!output) {
  throw new Error('Usage: browser-capture.mjs <output> [fullPage]');
}
const browser = await puppeteer.connect({
  browserURL: `http://localhost:${process.env.CDP_PORT || 9222}`,
  defaultViewport: null,
});
const pages = await browser.pages();
const page = pages
  .filter(candidate =>
    !candidate.url().startsWith('chrome://') &&
    !candidate.url().startsWith('chrome-extension://'),
  )
  .at(-1);
if (!page) {
  throw new Error('No active tab found');
}
await page.screenshot({ path: output, fullPage: process.argv[3] === 'fullPage' });
console.log(output);
await browser.disconnect();
