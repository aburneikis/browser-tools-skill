import puppeteer from 'puppeteer-core';
const W = parseInt(process.argv[2]||'1024');
const b = await puppeteer.connect({browserURL:'http://localhost:9222', defaultViewport:null});
const pages = await b.pages();
const p = pages.find(p=>p.url().includes('localhost:7766')) || pages[pages.length-1];
await p.bringToFront();
const s = await p.target().createCDPSession();
await s.send('Emulation.setDeviceMetricsOverride',{width:W,height:760,deviceScaleFactor:1,mobile:false});
await new Promise(r=>setTimeout(r,1500));
const out = await p.evaluate(()=>{
  const tag = document.querySelector('fl-tag.Outcome[data-status="complete"]') || document.querySelector('fl-tag.Outcome');
  if(!tag) return {err:'no tag'};
  const cs = getComputedStyle(tag);
  const inner = tag.querySelector('.Tag');
  const ics = getComputedStyle(inner);
  return {
    text: tag.textContent.trim(),
    hostW: tag.getBoundingClientRect().width.toFixed(1),
    hostBg: cs.backgroundColor, hostBorder: cs.borderColor,
    innerBg: ics.backgroundColor, innerBorder: ics.borderColor,
    layout: document.querySelector('td.Cell')?'table':'cards',
  };
});
await p.screenshot({path:'/tmp/narrow3.png'});
console.log('W='+W+' '+JSON.stringify(out));
await s.send('Emulation.clearDeviceMetricsOverride');
b.disconnect();
