#!/usr/bin/env node
import puppeteer from 'puppeteer-core';

const [selector, text] = process.argv.slice(2);
if (!selector || text === undefined) {
  throw new Error('Usage: browser-type.mjs <selector> <text>');
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
const element = await page.waitForSelector(selector);
await element.click({ clickCount: 3 });
await page.keyboard.press('Backspace');
await element.type(text, { delay: 40 });
console.log(`Typed into ${selector}`);
await browser.disconnect();
