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
   state.tasks=[
    {workId:'linked',subject:'Химия',text:'Подготовка',dueISO:'2020-01-01',due:'1 января',kind:'Тест',done:false},
    {workId:'undated',subject:'Математика',text:'Задача без даты',due:'Без срока',kind:'Контрольная',done:false}
   ];
   state.controlEvents=[cleanControlEvent({id:'mtk_'+'1'.repeat(32),courseId:'chem',courseName:'Химия',term:3,
    type:'test',title:'Тест по химии',date:'2090-11-25',status:'planned',taskId:'linked'})];
   state.debtMarks={};
   save();
   courseGradeResult={updated:Date.now(),schema:2,courses:[{id:'chem',term:3,name:'Химия',total:12,maximum:100}]};
   showPage('miniapps');
  });
  await page.getByRole('button',{name:/Долги.*Просроченные/}).click();
  const rows=page.locator('[data-debt-row]');
  assert.equal(await rows.count(),2);
  await page.locator('#debt-filter').selectOption('overdue');
  assert.equal(await rows.count(),1);
  const linked=rows.first();
  assert.match(await linked.innerText(),/Личная задача · Просрочена/);
  assert.match(await linked.innerText(),/Ручное МТК/);
  await linked.getByRole('button',{name:'Срок задачи'}).click();
  assert.equal(await page.locator('#save-work-template').getAttribute('data-work-id'),'linked');
  await page.evaluate(()=>document.querySelector('#modal').close());
  await linked.getByRole('button',{name:'Добавить пометку'}).click();
  await page.locator('#debt-mark-task').click();
  await page.locator('#debt-mark-value').selectOption('retake');
  await page.locator('#debt-save-mark').click();
  assert.match(await linked.innerText(),/Нужна пересдача/);
  await page.reload();
  await page.evaluate(()=>{document.querySelectorAll('dialog[open]').forEach(dialog=>dialog.close());openDebts()});
  await page.locator('#debt-filter').selectOption('review');
  assert.equal(await rows.count(),1);
  await rows.first().getByRole('button',{name:'Изменить пометку'}).click();
  await page.locator('#debt-mark-task').click();
  await page.locator('#debt-mark-value').selectOption('none');
  await page.locator('#debt-save-mark').click();
  assert.equal(await rows.count(),0);
  await page.locator('#debt-filter').selectOption('official');
  assert.equal(await rows.count(),0);
  assert.match(await page.locator('#debts-content').innerText(),/источник академических задолженностей/);
  await page.locator('#debt-filter').selectOption('all');
  await rows.filter({hasText:'Тест по химии'}).getByRole('button',{name:'Выполнено'}).click();
  assert.equal(await rows.count(),2);
  assert.match(await rows.filter({hasText:'Тест по химии'}).innerText(),/Личная задача · Выполнена/);
  assert.match(await rows.filter({hasText:'Тест по химии'}).innerText(),/Ручное МТК · Запланировано/);
  await rows.filter({hasText:'Тест по химии'}).getByRole('button',{name:'К дисциплине'}).click();
  await page.locator('#discipline-open-debts').click();
  assert.equal(await rows.count(),1);
  await page.locator('#debts-back').click();
  await page.evaluate(()=>{
   window.courseRequests=[];
   window.OrbitaAndroid={loadMireaAttendance:(request,id)=>window.courseRequests.push({request,id})};
   courseGradeResult={updated:Date.now(),schema:2,courses:[{id:'chem',term:3,name:'Химия',total:12,maximum:100}]};
   window.openDiscipline('Химия',{id:'chem',term:3});
   window.orbitaMireaAttendance(window.courseRequests.at(-1).request,{error:'format'});
  });
  await page.getByRole('button',{name:'Повторить',exact:true}).click();
  await page.evaluate(()=>window.orbitaMireaAttendance(window.courseRequests.at(-1).request,{total:0,entries:[]}));
  assert.match(await page.locator('#course-attendance-content').innerText(),/не вернула отметок/);
  assert.doesNotMatch(await page.locator('#course-attendance-content').innerText(),/Присутствовал/);
  await page.evaluate(()=>document.querySelector('#modal').close());
  for(const width of [320,360,393,412]){
   await page.setViewportSize({width,height:740});
   for(const theme of ['violet','dark']){
    const fit=await page.evaluate(async theme=>{
     state.theme=theme;
     applyTheme();
     window.scrollTo(0,document.scrollingElement.scrollHeight);
     await new Promise(resolve=>requestAnimationFrame(resolve));
     const last=document.querySelector('#discipline-overview').lastElementChild.getBoundingClientRect();
     const nav=document.querySelector('.mobile-nav').getBoundingClientRect();
     return last.bottom <= nav.top+1 && document.documentElement.scrollWidth <= innerWidth;
    },theme);
    assert(fit,`Last discipline card fits above navigation at ${width}px, ${theme}`);
   }
  }
  assert.deepEqual(errors,[]);
  console.log('PASS debts actions, reload, attendance retry and discipline viewport in both themes');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
