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
   const group={target:1,id:999,title:'ХЕБО-09-25'};
   state.officialGroup=group;
   state.officialSelection=group;
   officialCache[calendarKey(group)]={updated:Date.now()};
   const tomorrow=new Date();
   tomorrow.setDate(tomorrow.getDate()+1);
   officialLessons=(_target,date)=>dateKey(date)===dateKey(tomorrow)
    ?[{title:'Информационные технологии в химии',start:'12:00',end:'13:30',type:'Лекция',room:'А-308'}]:[];
   state.tasks=[
    {workId:'a',subject:'ИТ в химии',text:'Мой отчёт',due:'Завтра',done:false},
    {workId:'b',subject:'Информационные технологии в химии',text:'Старый отчёт',done:true},
    {workId:'c',subject:'Математика',text:'Другой предмет',done:false}
   ];
   window.gradeRequests=[];
   window.attendanceRequestsSeen=[];
   window.OrbitaAndroid={
    loadMireaGrades:(request)=>window.gradeRequests.push(request),
    loadMireaAttendance:(request,id)=>window.attendanceRequestsSeen.push({request,id})
   };
   courseGradeResult={updated:Date.now(),schema:2,courses:[
    {id:'chem',name:'Информационные технологии в химии',term:3,total:24,maximum:100,categories:[]}
   ]};
   showPage('mini-courses');
  });
  await page.getByRole('button',{name:'Информационные технологии в химии'}).click();
  const detail=page.locator('#mini-discipline-page');
  await detail.getByRole('heading',{name:'Информационные технологии в химии'}).waitFor();
  assert.match(await detail.innerText(),/3 семестр/);
  assert.match(await detail.innerText(),/24/);
  assert.match(await detail.innerText(),/Обновлено/);
  assert.match(await detail.innerText(),/Загружаем посещаемость/);
  const reply=await page.evaluate(()=>window.attendanceRequestsSeen);
  assert.equal(reply.length,1);
  await page.evaluate(request=>window.orbitaMireaAttendance(request,{present:2,absent:1,total:3,entries:[]}),reply[0].request);
  assert.match(await detail.innerText(),/Присутствий: 2/);
  assert.match(await detail.innerText(),/А-308/);
  assert.match(await detail.innerText(),/Старый отчёт/);
  assert.doesNotMatch(await detail.innerText(),/Другой предмет/);
  await detail.getByRole('button',{name:'Мой отчёт'}).click();
  assert.equal(await page.locator('#save-work-template').getAttribute('data-work-id'),'a');
  await page.evaluate(()=>document.querySelector('#modal').close());
  await detail.getByRole('button',{name:'Обновить БРС'}).click();
  await page.evaluate(()=>window.orbitaMireaGrades(window.gradeRequests.at(-1),{error:'network'}));
  assert.match(await detail.innerText(),/показаны сохранённые баллы/);
  assert.match(await detail.innerText(),/24/);
  await page.evaluate(()=>handleAppBack());
  assert.equal(await page.locator('#mini-courses-page').isVisible(),true);
  await page.evaluate(()=>{courseGradeResult={error:'login'};paintCourseTools()});
  await page.getByRole('button',{name:'Информационные технологии в химии'}).click();
  assert.match(await detail.innerText(),/Войди в МИРЭА/);
  assert.match(await detail.innerText(),/Мой отчёт/);
  assert.deepEqual(errors,[]);
  console.log('PASS discipline details, existing task editor, attendance, schedule, stale grades and schedule-only fallback');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
