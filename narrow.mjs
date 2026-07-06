import puppeteer from 'puppeteer-core';
const b = await puppeteer.connect({browserURL:'http://localhost:9222', defaultViewport:null});
const pages = await b.pages();
const p = pages.find(p=>p.url().includes('localhost:7766')) || pages[pages.length-1];
await p.bringToFront();
// Narrow the window so the Outcome column is squeezed and the tag truncates
const session = await p.target().createCDPSession();
await session.send('Emulation.setDeviceMetricsOverride',{width:760,height:760,deviceScaleFactor:1,mobile:false});
await new Promise(r=>setTimeout(r,1500));
const data = await p.evaluate(()=>{
  const tag = document.querySelector('fl-tag.Outcome[data-status="complete"]') || document.querySelector('fl-tag.Outcome');
  if(!tag) return {err:'no tag'};
  const cs = getComputedStyle(tag);
  const inner = tag.querySelector('.Tag');
  const ics = inner?getComputedStyle(inner):null;
  return {
    status: tag.getAttribute('data-status'),
    hostW: tag.getBoundingClientRect().width,
    hostBg: cs.backgroundColor, hostColor: cs.color, hostBorder: cs.borderColor, hostDisplay: cs.display,
    innerW: inner?inner.getBoundingClientRect().width:null,
    innerBg: ics?ics.backgroundColor:null, innerBorder: ics?ics.borderColor:null,
    matchedRule: (()=>{ try{ return null;}catch(e){return null;} })()
  };
});
const path = '/tmp/narrow.png';
await p.screenshot({path});
console.log(JSON.stringify(data,null,1));
console.log('shot:'+path);
await session.send('Emulation.clearDeviceMetricsOverride');
b.disconnect();
