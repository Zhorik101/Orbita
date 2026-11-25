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
   const course={id:'chem',name:'Химия',term:3,total:24,maximum:100,categories:[]};
   state.tasks=[{workId:'existing',subject:'Химия',text:'Готовая задача',due:'Без срока',done:false}];
   state.controlEvents=[];
   window.savedCalendar=[];
   window.OrbitaAndroid={
    write:()=>true,
    calendarTargets:()=>JSON.stringify({permission:true,calendars:[{id:7,name:'Личный',account:'test@example.org',accountType:'com.google'}]}),
    saveControlCalendar:(request,payload)=>{
     window.savedCalendar.push(JSON.parse(payload));
     window.orbitaControlCalendarResult(request,{ok:true});
    }
   };
   courseGradeResult={updated:Date.now(),schema:2,courses:[course]};
   showPage('mini-courses');
  });
  await page.getByRole('button',{name:'Химия',exact:true}).click();
  await page.getByRole('button',{name:'+ Мероприятие'}).click();
  await page.locator('#control-title').fill('Контрольная 1');
  await page.locator('#control-type').selectOption('exam');
  await page.locator('#control-earned').fill('9');
  await page.locator('#control-maximum').fill('8');
  await page.getByRole('button',{name:'Сохранить мероприятие'}).click();
  assert.match(await page.locator('#control-form-error').innerText(),/превышают максимум/);
  await page.locator('#control-maximum').fill('10');
  await page.getByRole('button',{name:'Сохранить мероприятие'}).click();
  assert.match(await page.locator('#modal').innerText(),/Добавлено вручную/);
  await page.locator('#control-task').click();
  await page.locator('#control-task').click();
  assert.equal(await page.evaluate(()=>state.tasks.length),2);
  assert.match(await page.locator('#save-work-template').getAttribute('data-work-id'),/^work_/);
  await page.getByRole('button',{name:/Перейти к дисциплине/}).click();
  await page.locator('[data-control-event]').click();
  await page.locator('#control-link').click();
  await page.locator('#control-task-choice').selectOption('0');
  await page.locator('#control-task-confirm').click();
  assert.equal(await page.evaluate(()=>state.controlEvents[0].taskId),'existing');
  await page.locator('#control-edit').click();
  await page.locator('#control-title').fill('Итоговая контрольная');
  await page.locator('#control-status').selectOption('review');
  await page.getByRole('button',{name:'Сохранить мероприятие'}).click();
  await page.locator('#control-calendar').click();
  assert.equal(await page.locator('#control-calendar-date').inputValue(),'');
  await page.locator('#control-calendar-date').fill('2026-12-12');
  await page.locator('#control-calendar-time').fill('14:00');
  await page.getByRole('button',{name:'Сохранить в календаре'}).click();
  await page.locator('#control-calendar-title').fill('Изменённое событие');
  await page.getByRole('button',{name:'Сохранить в календаре'}).click();
  const calendar=await page.evaluate(()=>window.savedCalendar);
  assert.equal(calendar.length,2);
  assert.equal(calendar[0].id,calendar[1].id);
  assert.equal(calendar[1].title,'Изменённое событие');
  assert.equal(calendar[1].start,Date.parse('2026-12-12T11:00:00Z'));
  await page.evaluate(()=>document.querySelector('#modal').close());
  await page.locator('#control-status-filter').selectOption('overdue');
  assert.equal(await page.locator('[data-control-event]').count(),0);
  await page.locator('#control-status-filter').selectOption('review');
  await page.locator('[data-control-event]').click();
  await page.locator('#control-delete').click();
  await page.locator('#control-confirm-delete').click();
  assert.equal(await page.evaluate(()=>state.controlEvents.length),0);
  assert.equal(await page.evaluate(()=>state.tasks.length),2);
  assert.deepEqual(errors,[]);
  console.log('PASS manual control events, task creation and linking, calendar identity, filters and deletion');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
