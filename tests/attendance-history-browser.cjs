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
  await page.evaluate(()=>{
   document.querySelectorAll('dialog[open]').forEach(dialog=>dialog.close());
   const group={target:1,id:999,title:'Тестовая группа'};
   state.officialGroup=group;
   const today=new Date(moscowParts(new Date()).date+'T12:00:00');
   window.fixtureDays=Array.from({length:10},(_,index)=>{
    const date=new Date(today);
    date.setDate(today.getDate()-index-1);
    return dateKey(date);
   });
   officialLessons=(_group,date)=>window.fixtureDays.includes(dateKey(date))?[{title:'Философия',start:'10:00'}]:[];
   window.dayQueries=[];
   window.OrbitaAndroid={
    loadMireaAttendance:request=>{window.courseRequest=request},
    loadMireaDailyMarks:(id,day)=>window.dayQueries.push({id,day})
   };
   showCourseAttendance('philosophy','Философия');
  });
  assert.equal(await page.evaluate(()=>window.dayQueries.length),0);
  await page.evaluate(()=>window.orbitaMireaAttendance(window.courseRequest,{error:'format'}));
  const history=page.locator('#course-attendance-content');
  assert.match(await history.innerText(),/Не удалось разобрать/);
  assert.match(await history.innerText(),/Проверено 0 из 6 дат/);
  await page.evaluate(()=>{
   const {id,day}=window.dayQueries.at(-1);
   const start=Date.parse(day+'T09:00:00+03:00')/1000;
   const present={subject:'Философия',disciplineId:'philosophy',lessonId:'a',start,type:3};
   window.orbitaMireaDailyMarks(id,{entries:[
    present,present,{...present,lessonId:'b',start:start+3600,type:1},
    {...present,lessonId:'c',start:start+7200,type:99},{...present,disciplineId:'other',lessonId:'d',type:1}
   ]});
   window.orbitaMireaDailyMarks(window.dayQueries.at(-1).id,{error:'network'});
  });
  assert.match(await history.innerText(),/Проверено 1 из 6 дат · получено записей: 3 · ошибок: 1/);
  assert.match(await history.innerText(),/Неизвестный статус: 1/);
  assert.equal(await page.evaluate(()=>window.dayQueries.length),2);
  await page.locator('#attendance-refresh-days').click();
  assert.equal(await page.evaluate(()=>window.dayQueries.length),3);
  await page.evaluate(()=>{
   for(let index=0;index<5;index++){
    window.orbitaMireaDailyMarks(window.dayQueries.at(-1).id,{entries:[]});
   }
  });
  assert.match(await history.innerText(),/Проверено 6 из 6 дат · получено записей: 3/);
  await page.locator('#attendance-mark-filter').selectOption('1');
  assert.equal(await history.locator('.attendance-row').count(),1);
  await page.locator('#attendance-period-options summary').click();
  await page.locator('#attendance-period').selectOption('semester');
  assert.match(await page.locator('#attendance-range-hint').innerText(),/не передаёт границы/);
  const days=await page.evaluate(()=>window.fixtureDays);
  await page.locator('#attendance-from').fill(days.at(-1));
  await page.locator('#attendance-to').fill(days[0]);
  await page.locator('#attendance-period-form button').click();
  assert.match(await history.innerText(),/Проверено 6 из 10 дат/);
  const alreadyRequested=await page.evaluate(()=>window.dayQueries.length);
  await page.evaluate(()=>document.querySelector('#modal').close());
  await page.evaluate(()=>window.orbitaMireaDailyMarks(window.dayQueries.at(-1).id,{entries:[]}));
  assert.equal(await page.evaluate(()=>window.dayQueries.length),alreadyRequested);
  await page.evaluate(()=>{
   showCourseAttendance('other','Другой предмет');
   const entries=Array.from({length:36},(_,i)=>({start:1764057600+i*3600,type:i%3+1}));
   window.orbitaMireaAttendance(window.courseRequest,{entries,total:entries.length,present:12,absent:12,excused:12});
  });
  assert.equal(await history.locator('.attendance-row').count(),36);
  await page.locator('#attendance-mark-filter').selectOption('3');
  assert.equal(await history.locator('.attendance-row').count(),12);
  for(const width of [320,360,393,412]){
   await page.setViewportSize({width,height:550});
   const fit=await page.evaluate(()=>{
    window.orbitaSetInsets({top:24,bottom:25,keyboard:260});
    const body=document.querySelector('.unified-dialog-body');
    body.scrollTop=body.scrollHeight;
    const close=document.querySelector('#modal > form .close').getBoundingClientRect();
    return body.scrollHeight>body.clientHeight&&close.top>=0&&close.bottom<innerHeight&&document.documentElement.scrollWidth<=innerWidth;
   });
   assert(fit,'dialog scroll and close at '+width);
  }
  assert.deepEqual(errors,[]);
  console.log('PASS full journal, dated history, bounded load, retry, cache, deduplication, filters and dialog');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
