import puppeteer from "puppeteer-core";
const b = await puppeteer.connect({ browserURL: "http://localhost:9222", defaultViewport: null });
const p = (await b.pages()).at(-1);
const c = await p.createCDPSession();
await c.send("Network.clearBrowserCookies");
console.log("cookies cleared");
await b.disconnect();
