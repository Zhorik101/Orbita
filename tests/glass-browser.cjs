'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');

(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM||'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  const page=await browser.newPage({viewport:{width:320,height:740}});
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>{
   const url=new URL(route.request().url());
   const file=path.join(__dirname,'../assets',url.pathname);
   return url.hostname==='orbita.local'&&fs.existsSync(file)?route.fulfill({path:file}):route.abort();
  });
  await page.goto('https://orbita.local/index.html');
  await page.evaluate(()=>{document.querySelectorAll('dialog[open]').forEach(dialog=>dialog.close());showPage('settings')});
  const verify=()=>page.evaluate(()=>{
   const body=document.body;
   const surface=body.style.getPropertyValue('--glass-surface');
   const [r,g,b,alpha]=surface.match(/[\d.]+/g).map(Number);
   const tint='#'+[r,g,b].map(value=>value.toString(16).padStart(2,'0')).join('');
   const actual=['#000000','#ffffff'].flatMap(underlay=>{
    const surfaceColor=mixColor(underlay,tint,alpha);
    return ['--glass-text','--glass-muted','--glass-accent-text'].map(key=>
     colorContrast(body.style.getPropertyValue(key),surfaceColor));
   });
   return {surface,minimum:Math.min(...actual),accent:body.style.getPropertyValue('--accent'),
    blur:getComputedStyle(document.querySelector('.mobile-nav')).backdropFilter};
  });
  for(const name of ['violet','green','pink','blue','dark']){
   await page.locator('[data-option="'+name+'"]').click();
   assert((await verify()).minimum>=4.5,name);
  }
  async function setColors(background,accent){
   await page.locator('#open-custom-theme').click();
   await page.locator('#custom-background-hex').fill(background);
   await page.locator('#custom-accent-hex').fill(accent);
   await page.locator('#apply-custom-theme').click();
  }
  await setColors('#101218','#faf023');
  const dark=await verify();
  assert(dark.minimum>=4.5);
  await setColors('#f8f5f0','#184d2d');
  const light=await verify();
  assert(light.minimum>=4.5);
  assert.notEqual(light.surface,dark.surface);
  await setColors('#ff00ff','#00ff99');
  const bright=await verify();
  assert(bright.minimum>=4.5);
  assert.notEqual(bright.accent,light.accent);
  await page.locator('#glass-effect').selectOption('low');
  assert.match((await verify()).blur,/blur\(5px\)/);
  await page.reload();
  await page.evaluate(()=>{document.querySelectorAll('dialog[open]').forEach(dialog=>dialog.close());showPage('settings')});
  assert.equal(await page.locator('#glass-effect').inputValue(),'low');
  const backup=await page.evaluate(async()=>{
   const data=await parseProfileBackup(await createProfileBackup(state));
   return [data.glassEffect,data.customAppearance.background,data.customAppearance.accent];
  });
  assert.deepEqual(backup,['low','#ff00ff','#00ff99']);
  await page.addStyleTag({content:'body[data-glass] { --nav-glass-background: var(--glass-solid); }'});
  assert.match(await page.locator('.mobile-nav').evaluate(el=>getComputedStyle(el).backgroundColor),/^rgb\(/);
  await page.locator('#glass-effect').selectOption('off');
  assert.equal(await page.locator('.mobile-nav').evaluate(el=>getComputedStyle(el).backdropFilter),'none');
  assert.deepEqual(errors,[]);
  console.log('PASS glass contrast, presets, live custom accents, persistence, backup and no-blur mode');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
