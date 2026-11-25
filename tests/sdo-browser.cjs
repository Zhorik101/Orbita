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
    saveSdoToDownloads:id=>{window.savedDownloadId=id},
    downloadSdoMaterial:(url,id)=>{window.downloadCall={url,id}},
    syncSdoPortal:url=>{window.sdoSyncUrl=url},
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
  assert.match(await page.locator('#sdo-content').innerText(),/Обновить из СДО/);
  assert.equal(await page.getByRole('link',{name:'Мои курсы в СДО ↗'}).getAttribute('href'),'https://online-edu.mirea.ru/my/courses.php');
  await page.locator('#sdo-sync-portal').click();
  assert.equal(await page.evaluate(()=>window.sdoSyncUrl),'https://online-edu.mirea.ru/my/courses.php');
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
  await page.evaluate(()=>{
   sdoReturnDiscipline={id:'chem',term:3,name:'Химия'};
   const course='https://online-edu.mirea.ru/course/view.php?id=99';
   window.orbitaSdoPortalImport(JSON.stringify({links:[
    {url:course+'&sesskey=secret',title:'Курс со страницы'},
    {url:course,title:'Дубликат'},
    {url:'https://example.org/course/view.php?id=12',title:'Сторонний курс'}
   ]}));
   window.orbitaSdoPortalImport(JSON.stringify({course,title:'Курс со страницы',links:[
    {url:'https://online-edu.mirea.ru/mod/assign/view.php?id=17&token=secret',title:'Условие лабораторной',section:'Тема 2'}
   ]}));
  });
  assert.match(await page.locator('#sdo-content').innerText(),/Тема 2/);
  assert.match(await page.locator('#sdo-content').innerText(),/Со страницы СДО/);
  const imported=await page.evaluate(()=>state.sdo.items.filter(item=>item.source==='portal'));
  assert.equal(imported.length,2);
  assert.equal(imported.find(item=>item.kind==='course').discipline,null);
  assert(!JSON.stringify(imported).includes('secret'));
  await page.evaluate(()=>{
   const course='https://online-edu.mirea.ru/course/view.php?id=99';
   const parent='https://online-edu.mirea.ru/mod/assign/view.php?id=17';
   const url='https://online-edu.mirea.ru/pluginfile.php/13/mod_assign/introattachment/0/Practice.pdf';
   courseGradeResult={courses:[{id:'chem',term:3,name:'Химия'}]};
   const folder='https://online-edu.mirea.ru/mod/folder/view.php?id=21';
   const other='https://online-edu.mirea.ru/course/view.php?id=100';
   const reply=JSON.stringify({pages:[
    {links:[{url:other,title:'Химия (часть 1/2)'}]},
    {course,parent,links:[{url:url+'?token=secret',title:'Методичка СДО'}]},
    {course:other,links:[{url:'https://online-edu.mirea.ru/mod/resource/view.php?id=22',title:'Файл второго курса'},{url:folder,title:'Папка работ'}]},
    {course:other,parent:folder,links:[{url:'https://online-edu.mirea.ru/pluginfile.php/32/mod_folder/content/0/Lab.pdf',title:'Работа из папки'}]}
   ]});
   window.orbitaSdoPortalImport(reply);
   window.orbitaSdoPortalImport(reply);
  });
  const files=await page.evaluate(()=>state.sdo.items.filter(item=>item.title==='Методичка СДО'));
  assert.equal(files.length,1);
  assert.equal(files[0].assignmentId,imported.find(item=>item.kind==='assignment').id);
  assert(!files[0].url.includes('secret'));
  await page.evaluate(()=>window.openSdo());
  await page.getByRole('button',{name:/Химия \(часть/}).click();
  assert.match(await page.locator('#sdo-content').innerText(),/Файл второго курса/);
  assert.equal(await page.locator('a[href$="id=22"]').getAttribute('href'),
   'https://online-edu.mirea.ru/mod/resource/view.php?id=22');
  await page.getByRole('button',{name:/Папка работ/}).click();
  await page.getByRole('link',{name:/Скачать «Работа из папки»/}).click();
  const download=await page.evaluate(()=>window.downloadCall);
  assert.match(download.url,/Lab.pdf$/);
  const downloaded='b'.repeat(64);
  await page.evaluate(({source,id})=>{
   window.deviceFiles=[{id,name:'Lab.pdf',extension:'pdf',size:123,updated:Date.now()}];
   window.orbitaSdoDownloaded(source,id);
  },{source:download.id,id:downloaded});
  assert.match(await page.locator('#modal').innerText(),/Файл скачан[\s\S]*Химия/);
  await page.locator('#sdo-save-downloads').click();
  assert.equal(await page.evaluate(()=>window.savedDownloadId),downloaded);
  await page.locator('#sdo-create-file-task').click();
  assert(await page.evaluate(id=>state.tasks.some(task=>task.subject==='Химия'&&state.sdo.attachments[task.workId]?.includes(id)),downloaded));
  await page.evaluate(()=>{
   document.querySelector('#modal').close();
   const folder='https://online-edu.mirea.ru/mod/folder/view.php?id=33';
   state.sdo.items.push({id:'sdo_'+'e'.repeat(32),url:folder,title:'Папка без курса',kind:'folder',courseId:''});
   window.orbitaSdoPortalImport(JSON.stringify({parent:folder,links:[
    {url:'https://online-edu.mirea.ru/pluginfile.php/33/mod_folder/content/0/Lecture.pdf',title:'Лекция без курса'}
   ]}));
  });
  assert.match(await page.locator('#modal').innerText(),/Скачать «Лекция без курса»/);
  assert.deepEqual(errors,[]);
  console.log('PASS saved SDO links, manual course structure, task linking, import cancellation, offline bridge, profile and mobile UI');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
