'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');

(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM||'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  const page=await browser.newPage({viewport:{width:360,height:740}});
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>{
   window.deviceFiles=[];
   window.nativeCalls=[];
   window.OrbitaAndroid={
    read:()=>localStorage.getItem('fixture-profile')||'',
    write:json=>{localStorage.setItem('fixture-profile',json);return true},
    sdoFiles:()=>JSON.stringify(window.deviceFiles),
    importSdoFiles:()=>window.nativeCalls.push('pick'),
    cancelSdoImport:()=>window.nativeCalls.push('cancel'),
    openSdoFile:id=>window.nativeCalls.push('open:'+id),
    exportSdoFile:id=>window.nativeCalls.push('export:'+id),
    deleteSdoFiles:json=>{
     const ids=JSON.parse(json);
     window.deviceFiles=window.deviceFiles.filter(item=>!ids.includes(item.id));
     window.orbitaSdoFilesChanged('Удалено',[]);
    }
   };
  });
  await page.route('**/*',route=>{
   const url=new URL(route.request().url()),file=path.join(__dirname,'../assets',url.pathname);
   return url.hostname==='orbita.local'&&fs.existsSync(file)?route.fulfill({path:file}):route.abort();
  });
  await page.goto('https://orbita.local/index.html');
  await page.evaluate(()=>{
   document.querySelectorAll('dialog[open]').forEach(dialog=>dialog.close());
   courseGradeResult={courses:[{id:'chem',term:3,name:'Химия',total:18,maximum:100}]};
   showPage('miniapps');
  });
  await page.locator('[data-tool="sdo"]').click();
  assert.match(await page.locator('#sdo-content').innerText(),/Автоматическое подключение/);
  assert.equal(await page.getByRole('link',{name:'Мои курсы в СДО ↗'}).getAttribute('href'),'https://online-edu.mirea.ru/my/courses.php');
  await page.getByRole('button',{name:'+ Курс',exact:true}).click();
  await page.locator('#sdo-edit-title').fill('Лабораторный практикум по химии');
  await page.locator('#sdo-edit-url').fill('https://online-edu.mirea.ru/course/view.php?id=81&sesskey=secret');
  await page.locator('#sdo-edit-discipline').selectOption('0');
  await page.locator('#sdo-edit-favorite').check();
  await page.getByRole('button',{name:'Сохранить запись'}).click();
  await page.locator('#sdo-mode').selectOption('favorites');
  await page.getByRole('button',{name:/Лабораторный практикум по химии/}).click();
  await page.getByRole('button',{name:'+ Задание',exact:true}).click();
  await page.locator('#sdo-edit-title').fill('Подготовить практику 1');
  await page.locator('#sdo-edit-url').fill('https://online-edu.mirea.ru/mod/assign/view.php?id=14');
  await page.locator('#sdo-edit-section').fill('Тема 1');
  await page.getByRole('button',{name:'Сохранить запись'}).click();
  assert.match(await page.locator('#sdo-content').innerText(),/Тема 1/);
  await page.getByRole('button',{name:/Подготовить практику 1/}).click();
  await page.getByRole('button',{name:'Создать личную задачу'}).click();
  assert.equal(await page.evaluate(()=>state.tasks.filter(row=>row.text==='Подготовить практику 1').length),1);
  await page.evaluate(()=>document.querySelector('#modal').close());
  await page.getByRole('button',{name:/Подготовить практику 1/}).click();
  await page.getByRole('button',{name:'Открыть связанную задачу'}).click();
  assert.equal(await page.evaluate(()=>state.tasks.filter(row=>row.text==='Подготовить практику 1').length),1);
  await page.evaluate(()=>document.querySelector('#modal').close());
  await page.getByRole('button',{name:/Подготовить практику 1/}).click();
  await page.getByRole('button',{name:'Импортировать вложения задания'}).click();
  await page.evaluate(()=>window.orbitaSdoProgress(1,2));
  await page.locator('#sdo-cancel-import').click();
  await page.evaluate(()=>{
   const file={id:'a'.repeat(64),name:'Методичка.pdf',extension:'pdf',size:4096,updated:Date.now()};
   window.deviceFiles=[file];
   window.orbitaSdoFilesChanged('Импорт отменён. Доступно: 1.',[file.id]);
  });
  assert.deepEqual(await page.evaluate(()=>window.nativeCalls.slice(0,2)),['pick','cancel']);
  assert.match(await page.locator('#sdo-content').innerText(),/PDF.*офлайн/);
  await page.getByRole('button',{name:/Подготовить практику 1/}).click();
  assert.match(await page.locator('#modal').innerText(),/Материалы задания/);
  await page.evaluate(()=>document.querySelector('#modal').close());
  await page.getByRole('button',{name:/Методичка.pdf/}).click();
  await page.getByRole('button',{name:'Открыть офлайн'}).click();
  await page.getByRole('button',{name:'Экспорт файла'}).click();
  await page.getByRole('button',{name:'Привязать к задаче'}).click();
  assert.equal(await page.evaluate(()=>window.nativeCalls.at(-1)),'export:'+'a'.repeat(64));
  await page.evaluate(()=>document.querySelector('#modal').close());
  await page.evaluate(()=>{
   window.openDiscipline('Химия',{id:'chem',term:3});
   selectDisciplineTab('materials');
  });
  assert.match(await page.locator('#discipline-pane-materials').innerText(),/Методичка.pdf/);
  const backup=await page.evaluate(async()=>parseProfileBackup(await createProfileBackup(state)));
  assert.equal(backup.sdo.items.length,3);
  assert(!JSON.stringify(backup).includes('secret'));
  assert.equal(Object.values(backup.sdo.attachments)[0].length,2);
  for(const width of [320,360,393,412]){
   await page.setViewportSize({width,height:740});
   await page.evaluate(()=>window.openSdo());
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  }
  await page.evaluate(()=>handleAppBack());
  assert(await page.locator('#miniapps-page').isVisible());
  await page.reload();
  await page.evaluate(()=>{
   document.querySelectorAll('dialog[open]').forEach(dialog=>dialog.close());
   window.openSdo();
  });
  assert.match(await page.locator('#sdo-content').innerText(),/Лабораторный практикум/);
  await page.locator('#sdo-mode').selectOption('materials');
  assert.match(await page.locator('#sdo-content').innerText(),/Копия отсутствует/);
  assert.deepEqual(errors,[]);
  console.log('PASS saved SDO links, manual course structure, task linking, import cancellation, offline bridge, profile and mobile UI');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
