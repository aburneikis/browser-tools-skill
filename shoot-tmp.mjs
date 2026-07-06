import puppeteer from "puppeteer-core";
const [url, label] = process.argv.slice(2);
const widths = [320, 375, 414];
const b = await puppeteer.connect({ browserURL: "http://localhost:9222", defaultViewport: null });
const pages = await b.pages();
const p = pages.filter(p => !p.url().startsWith("chrome")).at(-1);
for (const w of widths) {
  await p.setViewport({ width: w, height: 800, isMobile: true, deviceScaleFactor: 2 });
  await p.goto(url, { waitUntil: "networkidle2", timeout: 90000 }).catch(e => console.error("nav:", e.message));
  await new Promise(r => setTimeout(r, 4000));
  await p.evaluate(() => window.scrollTo(0, 0)).catch(() => {});
  await new Promise(r => setTimeout(r, 500));
  const path = `/tmp/ls-${label}-${w}.png`;
  await p.screenshot({ path });
  const dims = await p.evaluate(() => Array.from(document.querySelectorAll('fl-logo img')).map(i => { const r = i.getBoundingClientRect(); return r.width ? `${Math.round(r.width)}x${Math.round(r.height)}` : null; }).filter(Boolean).join(','));
  console.log(path, dims);
}
await b.disconnect();
