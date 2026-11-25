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
  const snapshot=await page.evaluate(async()=>{
   document.querySelectorAll('dialog[open]').forEach(dialog=>dialog.close());
   const group={target:1,id:999,title:'Тестовая группа'};
   state.officialGroup=group;
   const today=new Date(moscowParts(new Date()).date+'T12:00:00');
   officialLessons=(_group,date)=>dateKey(date)===dateKey(today)?[{title:'Философия',start:'10:00'}]:[];
   state.tasks=[{workId:'existing',subject:'Философия',text:'Обычная задача',due:'Без срока',done:false}];
   state.academicRetakes=[{id:'retake_'+'1'.repeat(32),subject:'Философия',term:1,kind:'exam'}];
   window.OrbitaAndroid={
    loadMireaAttendance:request=>{window.courseRequest=request},
    loadMireaDailyMarks:request=>{window.dailyRequest=request}
   };
   courseGradeResult={updated:Date.now(),schema:2,courses:[{id:'philosophy',term:1,name:'Философия',total:12,maximum:100}]};
   showPage('miniapps');
   return {retakes:(await parseProfileBackup(await createProfileBackup(state))).academicRetakes.length};
  });
  assert.equal(snapshot.retakes,1);
  assert.equal(await page.locator('[data-mini-open="mini-debts"],[data-mini-open="mini-academic-debts"]').count(),0);
  await page.evaluate(()=>window.openDiscipline('Философия',{id:'philosophy',term:1}));
  assert.match(await page.locator('#discipline-overview').innerText(),/Обычная задача/);
  assert.equal(await page.locator('#discipline-open-debts,#add-course-retake').count(),0);
  await page.getByRole('button',{name:'История посещений'}).click();
  await page.evaluate(()=>{
   window.orbitaMireaAttendance(window.courseRequest,{error:'format'});
   window.orbitaMireaDailyMarks(window.dailyRequest,{entries:[
    {subject:'Философия',disciplineId:'philosophy',start:1764057600,type:3},
    {subject:'Философия',disciplineId:'wrong',start:1764057600,type:1}
   ]});
  });
  const history=page.locator('#course-attendance-content');
  assert.match(await history.innerText(),/Последние занятия/);
  assert.match(await history.innerText(),/Присутствовал/);
  assert.doesNotMatch(await history.innerText(),/Отсутствовал/);
  assert.deepEqual(errors,[]);
  console.log('PASS hidden debts, preserved records, daily attendance fallback and discipline ID filtering');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
