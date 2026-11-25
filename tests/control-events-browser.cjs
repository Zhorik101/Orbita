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
  const restored=await page.evaluate(async()=>{
   document.querySelectorAll('dialog[open]').forEach(dialog=>dialog.close());
   const course={id:'chem',name:'Химия',term:3,total:24,maximum:100,categories:[]};
   state.tasks=[{workId:'existing',subject:'Химия',text:'Готовая задача',due:'Без срока',done:false}];
   state.controlEvents=[cleanControlEvent({id:'mtk_'+'1'.repeat(32),title:'Старое МТК',courseId:'chem',
    courseName:'Химия',term:3,taskId:'existing'})];
   courseGradeResult={updated:Date.now(),schema:2,courses:[course]};
   window.openDiscipline(course.name,course);
   const data=await parseProfileBackup(await createProfileBackup(state));
   return {taskId:data.controlEvents[0].taskId,taskCount:data.tasks.length};
  });
  await page.locator('#mini-discipline-page').getByRole('heading',{name:'Химия'}).waitFor();
  assert.equal(await page.getByRole('button',{name:'+ Мероприятие'}).count(),0);
  assert.doesNotMatch(await page.locator('#discipline-overview').innerText(),/Старое МТК/);
  assert.match(await page.locator('#discipline-overview').innerText(),/Готовая задача/);
  assert.deepEqual(restored,{taskId:'existing',taskCount:1});
  assert.deepEqual(errors,[]);
  console.log('PASS legacy control events stay in backup and the discipline only shows the task');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
