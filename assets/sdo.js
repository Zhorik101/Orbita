const sdoResumeKey='orbita.sdoResume';
const sdoPortal='https://online-edu.mirea.ru/';
const sdoCatalog=createMiniPage('mini-sdo',`
 <button class="mini-back" id="sdo-back">← Мини-приложения</button>
 <div class="mini-heading"><h1 id="sdo-title">СДО</h1></div>
 <div id="sdo-progress" role="status" hidden></div>
 <div id="sdo-content"></div>`);
let activeSdoCourse='',sdoReturnDiscipline=null,sdoMode='courses',sdoCourseTab='overview';
let sdoQuery='',sdoSort='title',sdoSubject='',sdoImportContext=null,sdoPendingImport=false;
let sdoDeviceFiles=new Map();

function sdoNewId(prefix){
 return prefix+Array.from(crypto.getRandomValues(new Uint8Array(16)),value=>value.toString(16).padStart(2,'0')).join('');
}
function sdoSize(bytes){
 return bytes>=1048576?(bytes/1048576).toLocaleString('ru',{maximumFractionDigits:1})+' МБ'
  :Math.max(1,Math.ceil(bytes/1024))+' КБ';
}
function syncSdoFiles(ids=[],context=null){
 let files=[];
 try{files=JSON.parse(window.OrbitaAndroid?.sdoFiles?.()||'[]')}catch{}
 sdoDeviceFiles=new Map((Array.isArray(files)?files:[]).filter(row=>row&&sdoDocumentId.test(row.id)).map(row=>[row.id,row]));
 const existing=state.sdo.items;
 const known=new Set(existing.map(item=>item.id));
 const received=new Set(ids);
 const added=[...sdoDeviceFiles.values()].filter(row=>!known.has(row.id)).map(row=>({
  id:row.id,title:row.name,kind:received.has(row.id)?context?.kind||'material':'material',
  discipline:received.has(row.id)?context?.discipline:null,courseId:received.has(row.id)?context?.courseId:'',
  assignmentId:received.has(row.id)?context?.assignmentId:'',
  extension:row.extension,size:row.size,updated:row.updated
 }));
 if(added.length)saveSdo({...state.sdo,items:[...existing,...added]});
}
function saveSdo(next){
 const previous=state.sdo;
 state.sdo=cleanSdoProfile(next);
 if(save())return true;
 state.sdo=previous;
 return false;
}
function updateSdoItem(item){
 const old=state.sdo.items.find(row=>row.id===item.id);
 if(!old&&state.sdo.items.length>=sdoCatalogLimit){toast('Каталог СДО заполнен.');return false}
 return saveSdo({...state.sdo,items:old?state.sdo.items.map(row=>row.id===item.id?item:row):[...state.sdo.items,item]});
}
function sdoCourses(){return state.sdo.items.filter(item=>item.kind==='course')}
function sdoDisciplineOf(item){
 const course=item.kind==='course'?item:sdoCourses().find(entry=>entry.id===item.courseId);
 if(item.disciplineEdited)return item.discipline;
 if(course?.disciplineEdited)return course.discipline;
 return item.discipline||course?.discipline||
  inferSdoDiscipline(course?.title||item.title,courseGradeResult?.courses||[]);
}
function sdoItemsForDiscipline(course){
 return state.sdo.items.filter(item=>sameSdoDiscipline(sdoDisciplineOf(item),course));
}
function sdoExternal(url,text){
 return `<a class="sdo-action" data-sdo-portal href="${safe(url)}">${safe(text)} ↗</a>`;
}
document.addEventListener('click',event=>{
 const download=event.target.closest?.('[data-sdo-download]');
 if(download&&window.OrbitaAndroid?.downloadSdoMaterial){
  event.preventDefault();
  window.OrbitaAndroid.downloadSdoMaterial(download.href,download.dataset.sdoDownload);
  return;
 }
 const link=event.target.closest?.('[data-sdo-portal]');
 if(!link||!window.OrbitaAndroid?.openSdoPortal)return;
 event.preventDefault();
 window.OrbitaAndroid.openSdoPortal(link.href);
});
window.orbitaSdoPortalBookmark=(url,title)=>{
 const canonical=canonicalSdoLink(url);
 if(!canonical)return;
 const existing=state.sdo.items.find(row=>row.url===canonical);
 if(existing){toast('Ссылка уже сохранена в каталоге.');return}
 const kind=canonical.includes('/course/view.php?')?'course':
  canonical.includes('/mod/assign/view.php?')?'assignment':'material';
 editSdoItem(null,{kind,url:canonical,title:String(title||'').slice(0,180),discipline:kind==='course'?null:sdoReturnDiscipline,
  courseId:kind==='course'?'':activeSdoCourse});
};
window.orbitaSdoPortalImport=json=>{
 let payload;
 try{payload=JSON.parse(json)}catch{return}
 const batch=Array.isArray(payload?.pages);
 const pages=batch?payload.pages.slice(0,501):[payload];
 if(batch&&Array.isArray(payload.resume)){
  try{localStorage.setItem(sdoResumeKey,JSON.stringify(payload.resume.slice(0,500)))}catch{}
 }
 if(!batch&&!Array.isArray(payload?.links))return;
 const items=[...state.sdo.items];
 const seen=new Map(items.filter(item=>item.url).map(item=>[item.url,item]));
 const now=Date.now();
 function add(url,title,kind,courseId='',section='',assignmentId='',moodleCourse=''){
  if(!url||seen.has(url)||items.length>=sdoCatalogLimit||typeof title!=='string'||!title.trim())return null;
  const item={id:sdoNewId('sdo_'),url,title:sdoDisplayTitle(title,kind,true),kind,courseId,section,assignmentId,moodleCourse,source:'portal',updated:now,
   discipline:null};
  seen.set(url,item);items.push(item);
  return item;
 }
 let currentCourse=null, refreshedItem=null;
 for(const result of pages){
  if(!Array.isArray(result?.links))continue;
  let parent=seen.get(canonicalSdoLink(result.parent));
  if(parent?.kind==='assignment'&&typeof result.description==='string'&&result.description.trim()){
   const updated={...parent,description:result.description.trim().slice(0,1000)};
   items[items.indexOf(parent)]=updated;seen.set(updated.url,updated);parent=updated;
  }
  const portalCourse=canonicalSdoLink(result.course)||items.find(entry=>parent?.courseId===entry.id)?.url||'';
  let course=portalCourse&&portalCourse.includes('/course/view.php?')?seen.get(portalCourse):null;
  if(portalCourse&&!course&&portalCourse.includes('/course/view.php?')){
   course=add(portalCourse,result.title||'Курс '+new URL(portalCourse).searchParams.get('id'),'course');
  }
  const types={assign:'assignment',quiz:'quiz',forum:'forum',page:'page',folder:'folder',url:'link',lesson:'lesson',resource:'material'};
  if(!batch){currentCourse=course||currentCourse;refreshedItem=parent||refreshedItem}
  for(const row of result.links.slice(0,100)){
   const url=canonicalSdoLink(row?.url);
   if(!url)continue;
   if(course||parent){
    const courseId=course?.id||parent.courseId;
    const path=new URL(url).pathname;
    const module=path.split('/')[2];
    const file=path.startsWith('/pluginfile.php/');
    if(!file&&(!course||!path.startsWith('/mod/')))continue;
    const existing=seen.get(url);
    if(existing&&existing.source==='portal'){
     const next={...existing,courseId:courseId||existing.courseId,moodleCourse:portalCourse||existing.moodleCourse,
      assignmentId:parent?.id||existing.assignmentId,section:row.section||parent?.section||existing.section};
     if(next.courseId!==existing.courseId||next.moodleCourse!==existing.moodleCourse||
        next.assignmentId!==existing.assignmentId||next.section!==existing.section){
      items[items.indexOf(existing)]=next;seen.set(url,next);
     }
    }else if(!existing)add(url,row.title,file?'material':types[module]||'other',courseId,row.section||parent?.section||'',parent?.id||'',portalCourse);
   }else if(!portalCourse&&url.includes('/course/view.php?'))add(url,row.title,'course');
  }
 }
 const added=items.length-state.sdo.items.length;
 const updated=items.some((item,i)=>i<state.sdo.items.length&&item!==state.sdo.items[i]);
 if((added||updated)&&!saveSdo({...state.sdo,items}))return;
 if(page==='mini-sdo'){
  activeSdoCourse=currentCourse?.id||'';
  sdoMode='courses';sdoCourseTab='overview';
  paintSdo();
 }
 if(refreshedItem)showSdoItem(refreshedItem);
 if(batch){toast('Найдено файлов: '+(Number(payload.files)||0)+' · новых ссылок: '+added+' · пропущено страниц: '+(Number(payload.skipped)||0));return}
 toast(added?'Добавлено ссылок: '+added:updated?'Файлы привязаны к папке или заданию.':'Эти ссылки уже есть в каталоге или каталог заполнен.');
};
function sdoPortalActions(){
 return sdoExternal(sdoPortal+'my/courses.php','Мои курсы в СДО')+' '+
  sdoExternal(sdoPortal,'Войти или открыть портал');
}
window.openSdo=(discipline=null,courseId='')=>{
 activeSdoCourse=courseId;
 sdoReturnDiscipline=discipline;
 sdoMode='courses';
 sdoCourseTab='overview';
 sdoQuery='';
 sdoSubject='';
 syncSdoFiles();
 showPage('mini-sdo');
 window.scrollTo(0,0);
};
function sdoBack(){
 if(activeSdoCourse){
  activeSdoCourse='';
  paintSdo();
  return;
 }
 if(sdoReturnDiscipline){
  const {name,id,term}=sdoReturnDiscipline;
  window.openDiscipline(name,{id,term});
 }else showPage('miniapps');
}
$('#sdo-back').onclick=sdoBack;

function sdoItemText(item){
 const discipline=sdoDisciplineOf(item);
 const file=sdoDeviceFiles.get(item.id);
 return [item.document?(item.extension||'файл').toUpperCase():sdoKinds[item.kind],
  discipline?.name,discipline?.term?discipline.term+' семестр':'',item.document?(file?sdoSize(file.size)+' · офлайн':'Копия отсутствует'):item.source==='portal'?'Со страницы СДО':'Сохранено вручную']
  .filter(Boolean).join(' · ');
}
function sdoDownloadable(item){
 return item.url.includes('/pluginfile.php/') || item.url.includes('/mod/resource/view.php?');
}
function sdoDownloadLink(item,text='Скачать',label=text){
 return `<a class="sdo-action" data-sdo-portal data-sdo-download="${safe(item.id)}" aria-label="${safe(label)}" href="${safe(item.url)}">${safe(text)} ↗</a>`;
}
function sdoItemHtml(item){
 return `<article class="course-discipline sdo-item">
  <button type="button" class="sdo-item-title" data-sdo-item="${item.id}">${safe(sdoDisplayTitle(item.title,item.kind,item.source==='portal'))} ${courseChevron()}</button>
  ${sdoDownloadable(item)?sdoDownloadLink(item):''}
  <p>${safe(sdoItemText(item))}</p></article>`;
}
function groupedSdoItems(items){
 const sections=new Map();
 for(const item of items){
  const section=item.section||'Без раздела';
  if(!sections.has(section))sections.set(section,[]);
  sections.get(section).push(item);
 }
 return [...sections].map(([name,rows])=>`<section><h2 class="sdo-section-name">${safe(name)}</h2>${rows.map(sdoItemHtml).join('')}</section>`).join('');
}
function sdoOptions(values,selected){
 return Object.entries(values).map(([id,label])=>`<option value="${id}"${selected===id?' selected':''}>${safe(label)}</option>`).join('');
}
function paintSdo(){
 if(page!=='mini-sdo')return;
 const course=sdoCourses().find(item=>item.id===activeSdoCourse);
 $('#sdo-title').textContent=course?.title||'СДО';
 $('#sdo-back').textContent=course?'← Каталог СДО':sdoReturnDiscipline?'← Материалы дисциплины':'← Мини-приложения';
 const root=$('#sdo-content');
 if(course){
  const positions=state.sdo.items.filter(item=>item.courseId===course.id);
  const folders=new Set(positions.filter(item=>item.kind==='folder').map(item=>item.id));
  const views={overview:'Обзор',assignments:'Задания',materials:'Материалы',progress:'Прогресс'};
  const items=positions.filter(item=>item.document||!folders.has(item.assignmentId)).filter(item=>sdoCourseTab==='assignments'?item.kind==='assignment':
   sdoCourseTab==='materials'?item.kind!=='assignment':true);
  root.innerHTML=`<section class="course-discipline sdo-toolbar"><p>${safe(sdoItemText(course))}</p>
   <p>Условия, оценки и статусы проверки открываются на официальной странице.</p>
   <div class="work-chips">${sdoExternal(course.url,'Открыть оригинал')}
   ${window.OrbitaAndroid?.syncSdoPortal?'<button type="button" id="sdo-sync-course">Обновить из СДО</button>':''}
   <button type="button" id="sdo-edit-course">Изменить курс</button>
   <button type="button" data-sdo-add="assignment">+ Задание</button>
   <button type="button" data-sdo-add="material">+ Ссылка</button>
   ${window.OrbitaAndroid?.importSdoFiles?'<button type="button" id="sdo-import">Импорт файлов</button>':''}</div>
   <label class="control-field">Раздел <select id="sdo-course-tab">${sdoOptions(views,sdoCourseTab)}</select></label></section>
   ${sdoCourseTab==='progress'?'<p>Оценки и статусы проверки открываются в СДО.</p>':
    groupedSdoItems(items)||'<p>В этом разделе пока нет сохранённых записей.</p>'}`;
  $('#sdo-course-tab').onchange=event=>{sdoCourseTab=event.target.value;paintSdo();$('#sdo-course-tab').focus()};
  $('#sdo-edit-course').onclick=()=>editSdoItem(course);
  $('#sdo-sync-course')?.addEventListener('click',()=>window.OrbitaAndroid.syncSdoPortal(course.url));
  const fileButton=$('#sdo-import');
  if(fileButton)fileButton.onclick=()=>startSdoImport({courseId:course.id,discipline:course.discipline});
  root.querySelectorAll('[data-sdo-add]').forEach(button=>button.onclick=()=>editSdoItem(null,{courseId:course.id,kind:button.dataset.sdoAdd}));
 }else{
  const context=sdoReturnDiscipline;
  let resume='[]';
  try{resume=localStorage.getItem(sdoResumeKey)||'[]'}catch{}
  const all=context?sdoItemsForDiscipline(context):state.sdo.items;
  const subjects=[...new Set(all.map(item=>sdoDisciplineOf(item)?.name).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ru'));
  if(sdoSubject&&!subjects.includes(sdoSubject))sdoSubject='';
  const size=[...sdoDeviceFiles.values()].reduce((sum,item)=>sum+Number(item.size||0),0);
  root.innerHTML=`<section class="course-discipline sdo-toolbar">
   <p>${context?safe(context.name):'Курсы и задания открываются на официальном портале МИРЭА.'}</p>
   <p>«Обновить из СДО» собирает ссылки из видимых курсов. Файлы скачиваются по нажатию.</p>
   <div class="work-chips">${sdoPortalActions()}${window.OrbitaAndroid?.syncSdoPortal?'<button type="button" id="sdo-sync-portal">Обновить из СДО</button>':''}
   ${resume!=='[]'&&window.OrbitaAndroid?.resumeSdoScan?'<button type="button" id="sdo-resume-scan">Продолжить сканирование</button>':''}
   <button type="button" id="sdo-refresh">Обновить локальные файлы</button>
   <button type="button" data-sdo-add="course">+ Курс</button><button type="button" data-sdo-add="assignment">+ Задание</button>
   <button type="button" data-sdo-add="material">+ Ссылка</button>
   ${window.OrbitaAndroid?.importSdoFiles?'<button type="button" id="sdo-import">Импорт файлов</button>':''}</div>
   ${sdoCourses().some(item=>item.source==='portal'&&item.discipline)?'<button type="button" id="sdo-clean-links">Снять связи импортированных курсов</button>':''}
   <p>Офлайн-файлы: ${sdoDeviceFiles.size} · ${size?sdoSize(size):'0 КБ'}</p>
   ${sdoDeviceFiles.size?'<button type="button" id="sdo-clear">Удалить все локальные копии</button>':''}
   <div class="sdo-filters">
   <label class="control-field">Раздел <select id="sdo-mode">${sdoOptions({courses:'Мои курсы',favorites:'Избранное',assignments:'Задания СДО',materials:'Мои материалы',recent:'Недавние импорты'},sdoMode)}</select></label>
   <label class="control-field">Сортировка <select id="sdo-sort">${sdoOptions({title:'По названию',recent:'По дате добавления'},sdoSort)}</select></label>
   ${context?'':`<label class="control-field">Дисциплина <select id="sdo-subject"><option value="">Все дисциплины</option>${subjects.map((name,index)=>`<option value="${index}"${name===sdoSubject?' selected':''}>${safe(name)}</option>`).join('')}</select></label>`}
   <label class="control-field">Поиск <input type="search" id="sdo-query" maxlength="160" value="${safe(sdoQuery)}"></label>
   </div></section><div id="sdo-items"></div>`;
  const list=()=>{
   const query=sdoQuery.toLocaleLowerCase('ru').trim();
   const rows=all.filter(item=>(sdoMode==='courses'?item.kind==='course':sdoMode==='favorites'?item.favorite:
    sdoMode==='assignments'?item.kind==='assignment':sdoMode==='recent'?item.document&&sdoDeviceFiles.has(item.id):
     item.kind!=='course'&&item.kind!=='assignment')&&(!sdoSubject||sdoDisciplineOf(item)?.name===sdoSubject)
    &&(!query||[item.title,sdoDisciplineOf(item)?.name].some(value=>value?.toLocaleLowerCase('ru').includes(query))));
   rows.sort((a,b)=>(sdoSort==='recent'||sdoMode==='recent'?b.updated-a.updated:0)||a.title.localeCompare(b.title,'ru'));
   $('#sdo-items').innerHTML=rows.map(sdoItemHtml).join('')||'<p>Нет сохранённых записей под выбранным фильтром.</p>';
   bindSdoRows($('#sdo-items'));
  };
  $('#sdo-query').oninput=event=>{sdoQuery=event.target.value;list()};
  $('#sdo-mode').onchange=event=>{sdoMode=event.target.value;list()};
  $('#sdo-sort').onchange=event=>{sdoSort=event.target.value;list()};
  const subject=$('#sdo-subject');
  if(subject)subject.onchange=()=>{sdoSubject=subject.value===''?'':subjects[Number(subject.value)];list()};
  $('#sdo-resume-scan')?.addEventListener('click',()=>window.OrbitaAndroid.resumeSdoScan(resume));
  $('#sdo-sync-portal')?.addEventListener('click',()=>window.OrbitaAndroid.syncSdoPortal(sdoPortal+'my/courses.php'));
  $('#sdo-clean-links')?.addEventListener('click',()=>{
   modal('<h2>Снять привязки к дисциплинам?</h2><p>Будут сброшены связи всех курсов, импортированных со страницы СДО. Курсы, файлы и задачи сохранятся.</p><button class="primary" id="sdo-confirm-clean">Снять привязки</button>');
   $('#sdo-confirm-clean').onclick=()=>{
    const items=state.sdo.items.map(item=>item.kind==='course'&&item.source==='portal'?{...item,discipline:null,disciplineEdited:false}:item);
    if(saveSdo({...state.sdo,items})){$('#modal').close();paintSdo()}
   };
  });
  $('#sdo-refresh').onclick=()=>{syncSdoFiles();paintSdo();toast('Обновлена локальная библиотека')};
  const fileButton=$('#sdo-import');
  if(fileButton)fileButton.onclick=()=>startSdoImport({discipline:context});
  const clear=$('#sdo-clear');
  if(clear)clear.onclick=()=>confirmSdoRemoval([...sdoDeviceFiles.keys()]);
  root.querySelectorAll('[data-sdo-add]').forEach(button=>button.onclick=()=>
   editSdoItem(null,{kind:button.dataset.sdoAdd,discipline:context}));
  list();
 }
 bindSdoRows(root);
}
function bindSdoRows(root){
 root.querySelectorAll('[data-sdo-item]').forEach(button=>button.onclick=()=>{
  const item=state.sdo.items.find(row=>row.id===button.dataset.sdoItem);
  if(!item)return;
  if(item.kind==='course'){activeSdoCourse=item.id;sdoCourseTab='overview';paintSdo();window.scrollTo(0,0)}
  else showSdoItem(item);
 });
}
function startSdoImport(context){
 if(sdoPendingImport)return;
 sdoPendingImport=true;
 sdoImportContext=context;
 window.OrbitaAndroid?.importSdoFiles?.();
}
window.orbitaSdoProgress=(index,total)=>{
 const progress=$('#sdo-progress');
 progress.hidden=false;
 progress.innerHTML=`<p>Импорт документа ${index} из ${total}</p><button type="button" id="sdo-cancel-import">Отменить</button>`;
 $('#sdo-cancel-import').onclick=()=>window.OrbitaAndroid?.cancelSdoImport?.();
};
window.orbitaSdoFilesChanged=(message,ids)=>{
 syncSdoFiles(Array.isArray(ids)?ids:[],sdoImportContext||{courseId:activeSdoCourse,discipline:sdoReturnDiscipline});
 sdoPendingImport=false;
 sdoImportContext=null;
 $('#sdo-progress').hidden=true;
 if(message)toast(message);
 if(page==='mini-sdo'){if(Array.isArray(ids)&&ids.length)sdoMode='materials';paintSdo()}
 if(page==='mini-discipline')window.paintDiscipline?.();
};

window.orbitaSdoDownloaded=(sourceId,id)=>{
 const source=state.sdo.items.find(item=>item.id===sourceId);
 syncSdoFiles([id],source?{courseId:source.courseId,assignmentId:source.assignmentId,discipline:sdoDisciplineOf(source)}:null);
 const file=state.sdo.items.find(item=>item.id===id);
 if(!file){toast('Файл скачан. Открой локальную библиотеку.');return}
 if(source){
  const next={...file,courseId:file.courseId||source.courseId,assignmentId:file.assignmentId||source.assignmentId,
   discipline:file.discipline||sdoDisciplineOf(source),sourceId:file.sourceId||sourceId};
  if(next.courseId!==file.courseId||next.assignmentId!==file.assignmentId||next.discipline!==file.discipline||next.sourceId!==file.sourceId)updateSdoItem(next);
 }
 if(page==='mini-sdo')paintSdo();
 window.paintDiscipline?.();
 const item=state.sdo.items.find(entry=>entry.id===id);
 if(window.finishStudyDownload?.(sourceId,id))return;
 const discipline=sdoDisciplineOf(item);

 modal(`<h2>Файл скачан</h2><p>${safe(item.title)}</p>
   <p>${discipline?safe(discipline.name):'Дисциплину можно выбрать в библиотеке.'}</p>
   <div class="work-chips"><button id="sdo-save-downloads" type="button">Сохранить в «Загрузки»</button>
   <button id="sdo-create-file-task" type="button">Создать задачу с файлом</button></div>
   <div id="sdo-pick-task"></div>`);
 $('#sdo-save-downloads').onclick=()=>window.OrbitaAndroid?.saveSdoToDownloads?.(id);
 $('#sdo-create-file-task').onclick=()=>openSdoTaskDraft(item);
 paintSdoTaskChoice($('#sdo-pick-task'),item,true);
};

const pageBeforeSdo=showPage;
showPage=function(destination){
 pageBeforeSdo(destination);
 if(destination==='mini-sdo')paintSdo();
};
const backBeforeSdo=handleAppBack;
handleAppBack=function(){
 if(page==='mini-sdo'){sdoBack();return true}
 return backBeforeSdo();
};

function editSdoItem(item,defaults={}){
 const entry=item||defaults,kind=entry.kind||'material';
 const assignments=state.sdo.items.filter(row=>row.kind==='assignment'&&row.id!==item?.id);
 const choices=[];
 const offered=[entry.discipline,...(courseGradeResult?.courses||[]).map(course=>({id:course.id,name:course.name,term:course.term}))];
 for(const candidate of offered){
  const choice=sdoDiscipline(candidate);
  if(choice&&!choices.some(other=>sameSdoDiscipline(other,choice)))choices.push(choice);
 }
 modal(`<h2>${item?'Изменить запись':kind==='course'?'Сохранить курс':'Сохранить ссылку'}</h2>
  <form id="sdo-edit-form">
  <label class="control-field">Название <input id="sdo-edit-title" maxlength="180" required value="${safe(entry.title||'')}"></label>
  ${item?.document?'':`<label class="control-field">Официальная ссылка СДО
   <input id="sdo-edit-url" type="url" maxlength="2000" required value="${safe(entry.url||'')}"></label>`}
  ${kind==='course'?'':`<label class="control-field">Тип <select id="sdo-edit-kind">${sdoOptions(Object.fromEntries(Object.entries(sdoKinds).filter(([key])=>key!=='course')),kind)}</select></label>
   <label class="control-field">Курс <select id="sdo-edit-course-id"><option value="">Без курса</option>${sdoCourses().map(row=>
    `<option value="${row.id}"${row.id===entry.courseId?' selected':''}>${safe(row.title)}</option>`).join('')}</select></label>
   ${kind!=='assignment'&&assignments.length?`<label class="control-field">Задание <select id="sdo-edit-assignment-id"><option value="">Без задания</option>
    ${assignments.map(row=>`<option value="${row.id}"${row.id===entry.assignmentId?' selected':''}>${safe(row.title)}</option>`).join('')}</select></label>`:''}
   <label class="control-field">Раздел курса <input id="sdo-edit-section" maxlength="100" value="${safe(item?.section||'')}"></label>`}
  <label class="control-field">Дисциплина <select id="sdo-edit-discipline"><option value="">Без привязки</option>
   ${choices.map((course,index)=>`<option value="${index}"${sameSdoDiscipline(course,entry.discipline)?' selected':''}>${safe(course.name)}${course.term?' · '+course.term+' семестр':''}</option>`).join('')}</select></label>
  <label class="setting-row"><span>Избранное</span><input id="sdo-edit-favorite" type="checkbox"${item?.favorite?' checked':''}></label>
  <p id="sdo-edit-error" role="status"></p><button class="primary" type="submit">Сохранить запись</button></form>
  ${item&&!item.document?'<button type="button" id="sdo-remove-link">Убрать ссылку из Орбиты</button>':''}`);
 $('#sdo-edit-form').onsubmit=event=>{
  event.preventDefault();
  const title=$('#sdo-edit-title').value.trim(),url=item?.document?'':canonicalSdoLink($('#sdo-edit-url').value);
  const error=$('#sdo-edit-error');
  if(!title){error.textContent='Введи название.';return}
  if(!item?.document&&(!url||(kind==='course')!==url.includes('/course/view.php?'))){
   error.textContent=kind==='course'?'Нужна ссылка на страницу курса с его ID.':'Нужна ссылка на страницу элемента СДО с его ID.';return;
  }
  if(url&&state.sdo.items.some(row=>row.id!==item?.id&&row.url===url)){
   error.textContent='Эта ссылка уже сохранена. Измени существующую запись.';return;
  }
  const selected=$('#sdo-edit-discipline').value;
  const next={...item,id:item?.id||sdoNewId('sdo_'),title,url,kind:$('#sdo-edit-kind')?.value||kind,
   courseId:$('#sdo-edit-course-id')?.value||'',assignmentId:$('#sdo-edit-assignment-id')?.value||'',section:$('#sdo-edit-section')?.value||'',
   discipline:selected===''?null:choices[Number(selected)],disciplineEdited:true,favorite:$('#sdo-edit-favorite').checked,
   updated:item?.updated||Date.now()};
  if(!updateSdoItem(next))return;
  $('#modal').close();
  if(page==='mini-sdo'){sdoMode=kind==='course'?'courses':next.kind==='assignment'?'assignments':'materials';paintSdo()}
  window.paintDiscipline?.();
 };
 const remove=$('#sdo-remove-link');
 if(remove)remove.onclick=()=>{
  modal('<h2>Убрать сохранённую ссылку?</h2><p>Локальные документы курса останутся в библиотеке.</p><button id="sdo-confirm-link" class="primary">Убрать ссылку</button>');
  $('#sdo-confirm-link').onclick=()=>{
   const items=state.sdo.items.filter(row=>row.id!==item.id).map(row=>{
    if(row.courseId===item.id)return {...row,courseId:'',discipline:row.discipline||item.discipline};
    return row.assignmentId===item.id?{...row,assignmentId:''}:row;
   });
   if(!saveSdo({...state.sdo,items}))return;
   if(activeSdoCourse===item.id)activeSdoCourse='';
   $('#modal').close();paintSdo();window.paintDiscipline?.();
  };
 };
}
function confirmSdoRemoval(ids){
 modal(`<h2>${ids.length===1?'Удалить локальную копию?':'Удалить все локальные копии?'}</h2>
  <p>Файлов: ${ids.length}. Связи и ссылки сохранятся.</p><button class="primary" id="sdo-confirm-remove">Удалить с устройства</button>`);
 $('#sdo-confirm-remove').onclick=()=>{
  $('#modal').close();
  window.OrbitaAndroid?.deleteSdoFiles?.(JSON.stringify(ids));
 };
}
function setSdoAttachment(taskId,id,attach=true){
 const next={...state.sdo.attachments},entries=new Set(next[taskId]||[]);
 if(attach&&entries.size>=50&&!entries.has(id)){toast('К задаче уже привязано 50 материалов.');return false}
 if(attach)entries.add(id);else entries.delete(id);
 next[taskId]=[...entries];
 return saveSdo({...state.sdo,attachments:next});
}
function newSdoTask(item){
 const linked=state.tasks.find(task=>task.sdoUrl&&task.sdoUrl===item.url||(state.sdo.attachments[task.workId]||[]).includes(item.id));
 if(linked){
  if(linked.done)toast('Связанная задача уже выполнена.');else addTask(null,{workId:linked.workId});
  return;
 }
 if(item.kind==='assignment'){
  addTask(null,{draft:{title:item.title,subject:sdoDisciplineOf(item)?.name||'Личное',kind:'Задание СДО',source:item.url,comment:item.description||'',fileIds:[item.id]}});
  return;
 }
 const previous=state.tasks;
 const task={workId:sdoNewId('work_'),text:item.title,kind:'Задание СДО',
  subject:sdoDisciplineOf(item)?.name||'Личное',due:'Без срока',dueISO:'',done:false};
 state.tasks=[...previous,task];
 if(!setSdoAttachment(task.workId,item.id)){state.tasks=previous;return}
 renderTasks();refreshWorkCards();addTask(null,{workId:task.workId});
}
function openSdoMaterial(item){
 if(item.document){
  if(sdoDeviceFiles.has(item.id))window.OrbitaAndroid?.openSdoFile?.(item.id);
  else toast('Локальной копии нет. Импортируй исходный файл снова.');
 }else if(window.OrbitaAndroid?.openSdoPortal)window.OrbitaAndroid.openSdoPortal(item.url);
 else window.location.href=item.url;
}
function openSdoTaskDraft(item){
 const linked=state.tasks.find(task=>(state.sdo.attachments[task.workId]||[]).includes(item.id)&&!task.done);
 if(linked){addTask(null,{workId:linked.workId});return}
 const title=readableSdoFile(item.title);
 const kind=/^лб[_\s-]/i.test(item.title)?'Лабораторная':'Подготовка';
 addTask(null,{draft:{title,kind,subject:sdoDisciplineOf(item)?.name||'Личное',fileIds:[item.id]}});
}
function paintSdoTaskChoice(root,item,send){
 const subject=normalizeSdoTitle(sdoDisciplineOf(item)?.name);
 const all=state.tasks.filter(task=>task.workId&&!task.done);
 const matching=subject?all.filter(task=>normalizeSdoTitle(task.subject)===subject):[];
 let showAll=false, selected='';
 function paint(){
  const tasks=showAll?[...matching,...all.filter(task=>!matching.includes(task))]:matching;
  root.innerHTML=`${tasks.length?`<label class="control-field">Личная задача <select><option value="">Выбери задачу</option>
   ${tasks.map(task=>`<option value="${safe(task.workId)}">${safe(task.text)} · ${safe(task.subject)}</option>`).join('')}</select></label>
   <button type="button" data-attach-task>Прикрепить к задаче</button>`:'<p>По этой дисциплине нет открытых задач.</p>'}
   ${!showAll&&all.length>matching.length?'<button type="button" data-all-tasks>Показать все задачи</button>':''}
   ${!send&&!matching.length&&item.kind!=='assignment'?'<button type="button" data-create-task>Создать задачу</button>':''}`;
  const select=root.querySelector('select');
  if(select){
   select.value=selected;
   const attach=root.querySelector('[data-attach-task]');
   attach.disabled=!select.value;
   select.onchange=()=>{selected=select.value;attach.disabled=!selected};
   attach.onclick=()=>{
    const task=tasks.find(row=>row.workId===selected);
    if(!task||!setSdoAttachment(task.workId,item.id))return;
    toast('Материал прикреплён к задаче');
    if(send){
     $('#modal').close();
     if(state.calendarAutoSync?.tasks)sendSdoFileToCalendar(task,item.id);
    }
   };
  }
  root.querySelector('[data-all-tasks]')?.addEventListener('click',()=>{showAll=true;paint()});
  root.querySelector('[data-create-task]')?.addEventListener('click',()=>openSdoTaskDraft(item));
 }
 paint();
}
function showSdoItem(item){
 const file=sdoDeviceFiles.get(item.id);
 const files=state.sdo.items.filter(row=>row.assignmentId===item.id);
 const linked=state.tasks.some(task=>(state.sdo.attachments[task.workId]||[]).includes(item.id));
 modal(`<h2>${safe(sdoDisplayTitle(item.title,item.kind,item.source==='portal'))}</h2><p>${safe(sdoItemText(item))}</p>${item.section?`<p>${safe(item.section)}</p>`:''}
  ${item.description?`<details><summary>Условие из СДО</summary><p class="sdo-assignment-description">${safe(item.description)}</p></details>`:''}
  <div class="work-chips">
  ${item.document?file?'<button type="button" id="sdo-open-file">Открыть офлайн</button><button type="button" id="sdo-export-file">Экспорт файла</button><button type="button" id="sdo-remove-file">Удалить локальную копию</button>':
   '<p>Файл не входит в JSON-копию. Импортируй его с устройства, чтобы восстановить открытие.</p>':sdoDownloadable(item)?sdoDownloadLink(item):sdoExternal(item.url,'Открыть оригинал в СДО')}
  <button type="button" id="sdo-edit-item">Изменить</button>
  ${['folder','page','assignment'].includes(item.kind)&&window.OrbitaAndroid?.syncSdoPortal?
   '<button type="button" id="sdo-sync-materials">Обновить файлы</button>':''}
  ${item.kind==='assignment'?`<button type="button" id="sdo-new-task">${linked?'Открыть связанную задачу':'Создать личную задачу'}</button>
   ${window.OrbitaAndroid?.importSdoFiles?'<button type="button" id="sdo-import-assignment">Импортировать вложения задания</button>':''}`:''}</div>
  ${files.length?`<h3>${item.kind==='assignment'?'Материалы задания':'Файлы'} <small class="sdo-file-count">${files.length}</small></h3>
   <ul class="sdo-file-list">${[...files].sort((a,b)=>a.title.localeCompare(b.title,'ru',{numeric:true})).map(row=>
    `<li><span class="sdo-file-name">${safe(row.title)}</span>${sdoDownloadable(row)?
      sdoDownloadLink(row,'Скачать','Скачать «'+row.title+'»'):
      `<button type="button" data-assignment-material="${row.id}">Открыть</button>`}</li>`).join('')}</ul>`:''}
  ${item.kind==='folder'&&!files.length?'<p>Список файлов ещё не загружен. Нажми «Обновить файлы».</p>':''}
  <div id="sdo-pick-task"></div>`);
 paintSdoTaskChoice($('#sdo-pick-task'),item,false);
 $('#sdo-edit-item').onclick=()=>editSdoItem(item);
 $('#sdo-sync-materials')?.addEventListener('click',()=>window.OrbitaAndroid.syncSdoPortal(item.url));
 const taskButton=$('#sdo-new-task');
 if(taskButton)taskButton.onclick=()=>newSdoTask(item);
 const importAssignment=$('#sdo-import-assignment');
 if(importAssignment)importAssignment.onclick=()=>{
  $('#modal').close();
  if(page!=='mini-sdo')window.openSdo(sdoDisciplineOf(item),item.courseId);
  startSdoImport({assignmentId:item.id,courseId:item.courseId,discipline:sdoDisciplineOf(item)});
 };
 $$('[data-assignment-material]').forEach(button=>button.onclick=()=>{
  const material=files.find(row=>row.id===button.dataset.assignmentMaterial);
  if(material)showSdoItem(material);
 });
 if(file){
  $('#sdo-open-file').onclick=()=>openSdoMaterial(item);
  $('#sdo-export-file').onclick=()=>window.OrbitaAndroid?.exportSdoFile?.(item.id);
  $('#sdo-remove-file').onclick=()=>confirmSdoRemoval([item.id]);
 }

}

window.addSdoTaskLinks=(task,anchor)=>{
 const linked=state.sdo.attachments[task.workId]||[];
 const items=state.sdo.items.filter(item=>item.kind!=='course'&&linked.includes(item.id));
 if(!items.length)return;
 syncSdoFiles();
 const area=document.createElement('section');
 area.className='sdo-task-attachments';
 anchor.before(area);
 area.innerHTML=`${anchor.hasAttribute('data-sdo-files')?'':'<h3>Учебные материалы</h3>'}
  ${items.map(item=>`<div class="sdo-task-item">
   <button type="button" data-open="${item.id}">${safe(item.title)}${item.document&&!sdoDeviceFiles.has(item.id)?' · нет копии':''}</button>
   <button type="button" data-remove="${item.id}" aria-label="Убрать связь">×</button></div>`).join('')}`;
 area.querySelectorAll('[data-open]').forEach(button=>button.onclick=()=>openSdoMaterial(items.find(item=>item.id===button.dataset.open)));
 area.querySelectorAll('[data-remove]').forEach(button=>button.onclick=()=>{
  if(!setSdoAttachment(task.workId,button.dataset.remove,false))return;
  button.closest('.sdo-task-item').remove();
  if(!area.querySelector('.sdo-task-item'))area.remove();
 });
};
function sendSdoFileToCalendar(task,fileId){
 if(!task?.dueISO){toast('Файл прикреплён. Для отправки в Календарь укажи срок задачи.');return}
 window.OrbitaAndroid?.attachSdoWorkFile?.(task.workId,fileId);
}
window.addSdoCalendarPicker=(panel,id)=>{
 syncSdoFiles();
 const files=state.sdo.items.filter(item=>item.document&&sdoDeviceFiles.has(item.id));
 if(!files.length)return;
 const details=document.createElement('details');
 details.innerHTML='<summary>Из учебных файлов</summary><label class="control-field">Поиск <input type="search"></label><div></div>';
 const input=details.querySelector('input'), list=details.querySelector('div');
 const render=()=>{
  const query=input.value.trim().toLocaleLowerCase('ru');
  const matching=files.filter(file=>file.title.toLocaleLowerCase('ru').includes(query));
  list.replaceChildren();
  for(const file of matching.slice(0,12)){
   const button=document.createElement('button');
   button.type='button';button.textContent=file.title;
   button.onclick=()=>{
    if(!setSdoAttachment(id,file.id))return;
    const root=panel.closest('.work-attachments');
    const anchor=root?.querySelector('[data-sdo-files]');
    if(anchor){root.querySelector('.sdo-task-attachments')?.remove();window.addSdoTaskLinks({workId:id},anchor)}
    panel.remove();
    if(state.calendarAutoSync?.tasks)sendSdoFileToCalendar(state.tasks.find(task=>task.workId===id),file.id);
    else toast('Файл прикреплён. Для отправки в Календарь включи синхронизацию задач.');
   };
   list.append(button);
  }
  if(matching.length>12)list.append('Уточни название, чтобы найти нужный файл.');
 };
 input.oninput=render;render();panel.append(details);
};
window.sdoDisciplinePanel=course=>{
 syncSdoFiles();
 const items=sdoItemsForDiscipline(course);
 return disciplinePanel('Учебные материалы',`
  <p>Ссылки на СДО и локальные файлы, привязанные к предмету вручную.</p>
  <div class="work-chips"><button type="button" id="sdo-from-discipline">Открыть каталог СДО</button>
  <button type="button" id="sdo-link-course">Связать с курсом СДО</button>
  ${window.OrbitaAndroid?.importSdoFiles?'<button type="button" id="sdo-import-discipline">Импорт файлов</button>':''}</div>
  ${items.map(item=>`<div class="sdo-linked-item"><button type="button" data-sdo-discipline-item="${item.id}">${safe(item.title)}</button>
   <small>${safe(sdoItemText(item))}</small></div>`).join('')||'<p>Пока нет привязанных курсов и материалов.</p>'}`);
};
window.bindSdoDiscipline=(overview,course)=>{
 const open=overview.querySelector('#sdo-from-discipline');
 if(!open)return;
 open.onclick=()=>window.openSdo(course);
 overview.querySelector('#sdo-link-course').onclick=()=>linkSdoCourse(course);
 const importButton=overview.querySelector('#sdo-import-discipline');
 if(importButton)importButton.onclick=()=>{window.openSdo(course);startSdoImport({discipline:course})};
 overview.querySelectorAll('[data-sdo-discipline-item]').forEach(button=>button.onclick=()=>{
  const item=state.sdo.items.find(row=>row.id===button.dataset.sdoDisciplineItem);
  if(item?.kind==='course')window.openSdo(course,item.id);else if(item)showSdoItem(item);
 });
};
function linkSdoCourse(discipline){
 const courses=sdoCourses();
 modal(`<h2>Связать с курсом СДО</h2><p>${safe(discipline.name)}</p>
  ${courses.length?`<label class="control-field">Сохранённый курс <select id="sdo-existing-course">${courses.map((course,index)=>
   `<option value="${index}">${safe(course.title)}${course.discipline?' · '+safe(course.discipline.name):''}</option>`).join('')}</select></label>
  <button type="button" id="sdo-confirm-course">Привязать выбранный курс</button>`:''}
  <button type="button" class="primary" id="sdo-new-course">Добавить ссылку на курс</button>`);
 $('#sdo-new-course').onclick=()=>editSdoItem(null,{kind:'course',discipline});
 const bind=$('#sdo-confirm-course');
 if(bind)bind.onclick=()=>{
  const item=courses[Number($('#sdo-existing-course').value)];
  if(item&&updateSdoItem({...item,discipline})){
   $('#modal').close();
   window.paintDiscipline?.();
  }
 };
}
