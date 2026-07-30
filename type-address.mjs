import puppeteer from "puppeteer-core";

const b = await puppeteer.connect({ browserURL: `http://localhost:9222`, defaultViewport: null });
const allPages = await b.pages();
const p = allPages.filter(p => !p.url().startsWith("chrome://")).at(-1);

const selector = process.argv[2];
const text = process.argv[3];

await p.click(selector, { clickCount: 3 });
await p.keyboard.type(text, { delay: 80 });
await new Promise(r => setTimeout(r, 1500));

// try to find pac-container suggestion and click first one
const suggestion = await p.$('.pac-container .pac-item');
if (suggestion) {
  await suggestion.click();
  console.log("clicked suggestion");
} else {
  console.log("no suggestion found");
}
await b.disconnect();
