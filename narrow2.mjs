import puppeteer from 'puppeteer-core';
const b = await puppeteer.connect({browserURL:'http://localhost:9222', defaultViewport:null});
const pages = await b.pages();
const p = pages.find(p=>p.url().includes('localhost:7766')) || pages[pages.length-1];
await p.bringToFront();
const s = await p.target().createCDPSession();
await s.send('Emulation.setDeviceMetricsOverride',{width:1300,height:800,deviceScaleFactor:1,mobile:false});
await new Promise(r=>setTimeout(r,1200));
// force the Outcome column cells narrow
const data = await p.evaluate(()=>{
  const tags = Array.from(document.querySelectorAll('fl-tag.Outcome'));
  if(!tags.length) return {err:'no tags'};
  // find the td containing the outcome tag and shrink it
  tags.forEach(t=>{ const td = t.closest('td'); if(td){ td.style.width='70px'; td.style.maxWidth='70px'; }});
  return null;
});
await new Promise(r=>setTimeout(r,600));
const out = await p.evaluate(()=>{
  const tag = document.querySelector('fl-tag.Outcome[data-status="complete"]') || document.querySelector('fl-tag.Outcome');
  const cs = getComputedStyle(tag);
  const inner = tag.querySelector('.Tag');
  const ics = getComputedStyle(inner);
  const csc = tag.querySelector('.ContentTextSizeSetterContainer');
  return {
    text: tag.textContent.trim(),
    hostW: tag.getBoundingClientRect().width.toFixed(1),
    hostBg: cs.backgroundColor, hostBorder: cs.borderColor,
    innerW: inner.getBoundingClientRect().width.toFixed(1),
    innerBg: ics.backgroundColor, innerBorder: ics.borderColor,
    cscMinWidth: csc?getComputedStyle(csc).minWidth:null,
    cscTruncate: csc?csc.getAttribute('data-truncate'):null,
  };
});
await p.screenshot({path:'/tmp/narrow2.png'});
console.log(JSON.stringify(out,null,1));
await s.send('Emulation.clearDeviceMetricsOverride');
b.disconnect();
