'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');

(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM||'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  const page=await browser.newPage({viewport:{width:360,height:740}});
  let attempts=0;
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>{
   const url=new URL(route.request().url());
   const asset=url.pathname;
   if(url.hostname!=='orbita.local')return route.abort();
   if(asset==='/route-data.js'&&++attempts===1)return route.abort();
   const file=path.join(__dirname,'../assets',asset);
   return fs.existsSync(file)?route.fulfill({path:file}):route.abort();
  });
  await page.goto('https://orbita.local/index.html');
  assert.equal(attempts,0);
  await page.evaluate(()=>{document.querySelectorAll('dialog[open]').forEach(d=>d.close());showPage('campus');campusSelect.value='v-78';chooseIndoorCampus()});
  await page.waitForFunction(()=>document.querySelector('#route-status').textContent.includes('не загрузились'));
  assert.equal(attempts,1);
  await page.evaluate(()=>document.querySelector('#route-build').click());
  await page.waitForFunction(()=>routeChoices.size>0,null,{timeout:6000}).catch(async error=>{console.error({attempts,errors,status:await page.locator("#route-status").textContent()});throw error});
  assert.equal(attempts,2);
  await page.evaluate(()=>{showPage('schedule');showPage('campus')});
  assert.equal(attempts,2);
  assert.deepEqual(errors,[]);
  console.log('PASS route graph absent at startup, error retry, route choices and one-time caching');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
