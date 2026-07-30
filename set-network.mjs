import puppeteer from "puppeteer-core";
const b = await puppeteer.connect({ browserURL: `http://localhost:${process.env.CDP_PORT||9222}`, defaultViewport: null });
const pages = await b.pages();
const p = pages.filter(p => !p.url().startsWith("chrome://")).at(-1);
const mode = process.argv[2] || 'offline';
if (mode === 'offline') {
  await p.setOfflineMode(true);
  console.log('offline set');
} else {
  await p.setOfflineMode(false);
  console.log('online restored');
}
await b.disconnect();
