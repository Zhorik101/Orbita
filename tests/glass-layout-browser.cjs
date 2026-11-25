'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');

(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM||'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  const page=await browser.newPage({viewport:{width:393,height:850},reducedMotion:'reduce'});
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>{
   const url=new URL(route.request().url());
   const file=path.join(__dirname,'../assets',url.pathname);
   return url.hostname==='orbita.local'&&fs.existsSync(file)?route.fulfill({path:file}):route.abort();
  });
  await page.goto('https://orbita.local/index.html');
  await page.evaluate(()=>{
   document.querySelectorAll('dialog[open]').forEach(dialog=>dialog.close());
   window.orbitaSetInsets({top:20,bottom:26});
   courseGradeResult={schema:2,updated:Date.now(),courses:[{id:'fixture',term:3,name:'Органическая химия и основы анализа',total:42,maximum:100,categories:[]}]};
  });
  const screens={
   schedule:'#schedule-page .home-grid > :last-child',
   miniapps:'#mini-grid > :last-child',
   settings:'#settings-page .settings-about',
   'mini-discipline':'#discipline-pane-overview > :last-child',
   pairs:'#pairs-page',
   tasks:'#tasks-page .standalone',
   'mini-notes':'#mini-notes-page',
   'mini-team':'#mini-team-page'
  };
  for(const width of [320,360,393,412]){
   await page.setViewportSize({width,height:820});
   for(const [name,selector] of Object.entries(screens)){
    const size=await page.evaluate(async({name,selector})=>{
     if(name==='mini-discipline')window.openDiscipline('Органическая химия и основы анализа',{id:'fixture',term:3});
     else showPage(name);
     window.scrollTo(0,document.scrollingElement.scrollHeight);
     await new Promise(resolve=>requestAnimationFrame(resolve));
     const end=document.querySelector(selector)?.getBoundingClientRect();
     const nav=document.querySelector('.mobile-nav').getBoundingClientRect();
     const tiles=[...document.querySelectorAll('#mini-grid .mini-tile')].map(tile=>tile.getBoundingClientRect());
     return {horizontal:document.documentElement.scrollWidth-innerWidth, end:end?.bottom, nav:nav.top,
      tiles:tiles.map(tile=>tile.height),secondColumn:tiles[1]?.left>tiles[0]?.left};
    },{name,selector});
    if(size.horizontal>1) console.error(await page.evaluate(()=>[...document.querySelectorAll("main *")].filter(el=>el.getBoundingClientRect().right>innerWidth+1).slice(0,20).map(el=>[el.id,el.className,el.getBoundingClientRect().right])));
    assert(size.horizontal<=1,`Horizontal overflow on ${name} at ${width}px: ${size.horizontal}`);
    if(['schedule','miniapps','settings','mini-discipline'].includes(name))
     assert(size.end<=size.nav+1,`Dock overlaps ${name} at ${width}px: ${size.end} / ${size.nav}`);
    if(name==='miniapps'){
     assert(size.secondColumn);
     assert(size.tiles.every(height=>height>=140&&height<=180),size.tiles.join(', '));
    }
   }
  }
  await page.evaluate(()=>window.openDiscipline('Органическая химия и основы анализа',{id:'fixture',term:3}));
  await page.getByRole('tab',{name:'Работы'}).click();
  await page.getByRole('tab',{name:'Работы'}).press('ArrowRight');
  assert.equal(await page.getByRole('tab',{name:'Материалы'}).getAttribute('aria-selected'),'true');
  await page.getByRole('tab',{name:'Работы'}).click();
  await page.locator('#discipline-pane-work').getByRole('button',{name:'+ Работа'}).click();
  await page.evaluate(()=>window.orbitaSetInsets({top:20,bottom:26,keyboard:280}));
  assert.equal(await page.locator('#modal').isVisible(),true);
  assert.equal(await page.locator('.mobile-nav').evaluate(el=>getComputedStyle(el).pointerEvents),'none');
  await page.evaluate(()=>{document.querySelector('#modal').close();window.orbitaSetInsets({top:20,bottom:26});handleAppBack()});
  assert.equal(await page.locator('#mini-courses-page').isVisible(),true);

  await page.evaluate(()=>{showPage('miniapps');window.scrollTo(0,0)});
  await page.locator('#mini-order-edit').click();
  await page.locator('#mini-grid .mini-app-down:not([aria-disabled="true"])').first().click();
  await page.locator('#mini-order-done').click();
  assert((await page.evaluate(()=>state.miniAppOrder)).length>5);
  await page.evaluate(()=>{showPage('schedule');window.scrollTo(0,0)});
  await page.locator('#home-edit').click();
  assert.equal(await page.locator('#home-cancel').isVisible(),true);
  await page.locator('#home-cancel').click();
  assert.equal(await page.locator('#home-edit').isVisible(),true);
  assert.deepEqual(errors,[]);
  console.log('PASS compact glass layout, offline screens, dock clearance, keyboard, tabs, editors and back');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
