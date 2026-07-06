import puppeteer from 'puppeteer-core';
const b = await puppeteer.connect({browserURL:'http://localhost:9222', defaultViewport:null});
const pages = await b.pages();
const p = pages.find(p=>p.url().includes('localhost:7766')) || pages[pages.length-1];
await p.bringToFront();
const out = await p.evaluate(()=>{
  const tag = document.querySelector('fl-tag.Outcome[data-status="complete"]') || document.querySelector('fl-tag.Outcome');
  if(!tag) return {err:'no tag'};
  // Force the cell text wrapper narrow to trigger truncation like the bug (many wide columns)
  const cellText = tag.closest('.CellText') || tag.closest('p');
  if(cellText){ cellText.style.width='55px'; cellText.style.maxWidth='55px'; cellText.style.display='block'; }
  const td = tag.closest('td'); if(td){ td.style.width='60px'; td.style.maxWidth='60px'; }
  return {wrapped: !!cellText};
});
await new Promise(r=>setTimeout(r,500));
const res = await p.evaluate(()=>{
  const tag = document.querySelector('fl-tag.Outcome[data-status="complete"]') || document.querySelector('fl-tag.Outcome');
  const cs = getComputedStyle(tag);
  const inner = tag.querySelector('.Tag'); const ics = getComputedStyle(inner);
  return {
    text: tag.textContent.trim().replace(/\s+/g,' '),
    hostW: tag.getBoundingClientRect().width.toFixed(1),
    hostBg: cs.backgroundColor, hostBorder: cs.borderColor,
    innerBg: ics.backgroundColor, innerBorder: ics.borderColor,
  };
});
await p.screenshot({path:'/tmp/trunc.png'});
console.log(JSON.stringify(res,null,1));
b.disconnect();
