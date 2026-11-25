const studyDraftKey='orbita.studyDraft';
const studySyncKey='orbita.studySync';

function readStudyLocal(key){
 try{return JSON.parse(localStorage.getItem(key)||'null')}catch{return null}
}
function writeStudyLocal(key,value){
 try{
  if(value===null)localStorage.removeItem(key);
  else localStorage.setItem(key,JSON.stringify(value));
  return true;
 }catch{toast('Не удалось сохранить состояние операции.');return false}
}
window.clearStudyDraft=()=>writeStudyLocal(studyDraftKey,null);
function restoreStudyDraft(draft){
 addTask(null,{workId:draft.workId||undefined,draft});
}
window.showSavedStudyDraft=(root,workId,current)=>{
 const draft=readStudyLocal(studyDraftKey);
 if(current||!draft||draft.workId!==workId)return;
 const resume=document.createElement('button');
 resume.type='button';
 resume.textContent='Восстановить черновик';
 resume.onclick=()=>restoreStudyDraft(draft);
 root.append(resume);
};
function studyLocalCopy(source){
 return source.document&&sdoDeviceFiles.has(source.id)?source:
  state.sdo.items.find(item=>item.sourceId===source.id&&sdoDeviceFiles.has(item.id));
}
function nextStudyDownload(draft){
 if(!draft.queue?.length){
  delete draft.active;
  writeStudyLocal(studyDraftKey,draft);
  restoreStudyDraft(draft);
  return;
 }
 const sourceId=draft.queue.shift();
 const source=state.sdo.items.find(item=>item.id===sourceId);
 if(!source){nextStudyDownload(draft);return}
 const existing=studyLocalCopy(source);
 if(existing){
  draft.fileIds=[...new Set([...draft.fileIds,existing.id])];
  nextStudyDownload(draft);
  return;
 }
 draft.active=source.id;
 if(!writeStudyLocal(studyDraftKey,draft))return;
 window.OrbitaAndroid?.downloadSdoMaterial?.(source.url,source.id);
}
window.finishStudyDownload=(source,id)=>{
 const draft=readStudyLocal(studyDraftKey);
 if(!draft||draft.active!==source)return false;
 draft.fileIds=[...new Set([...draft.fileIds,id])];
 setTimeout(()=>nextStudyDownload(draft),0);
 return true;
};
window.cancelStudyDownload=source=>{
 const draft=readStudyLocal(studyDraftKey);
 if(!draft||draft.active!==source)return;
 delete draft.active;
 delete draft.queue;
 writeStudyLocal(studyDraftKey,draft);
 restoreStudyDraft(draft);
};
window.openStudyMaterialPicker=draft=>{
 if(!writeStudyLocal(studyDraftKey,draft))return;
 syncSdoFiles();
 const courses=sdoCourses().sort((a,b)=>Number(sdoDisciplineOf(b)?.name===draft.subject)-Number(sdoDisciplineOf(a)?.name===draft.subject)||a.title.localeCompare(b.title,'ru'));
 const selected=new Set();
 const trail=[];
 let course='',parent='',section='';
 const source=draft.source&&state.sdo.items.find(item=>item.url===draft.source&&item.kind==='assignment');
 if(source?.courseId){course=source.courseId;parent=source.id}
 modal('<h2>Материалы СДО</h2><div class="work-chips"><button id="study-picker-back">Назад</button><button id="study-picker-editor">К задаче</button></div><label class="control-field">Поиск <input id="study-picker-search" type="search"></label><ul class="sdo-file-list" id="study-picker-list"></ul><button class="primary" id="study-picker-attach">Скачать и прикрепить</button>');
 const search=$('#study-picker-search'), list=$('#study-picker-list'), action=$('#study-picker-attach');
 function navigate(nextCourse,nextParent='',nextSection=''){
  trail.push([course,parent,section]);
  [course,parent,section]=[nextCourse,nextParent,nextSection];
  search.value='';render();
 }
 function row(title,details,onClick,record){
  const li=document.createElement('li'), label=document.createElement('span'),button=document.createElement('button');
  label.className='sdo-file-name';label.textContent=title;
  if(details){const hint=document.createElement('small');hint.textContent=details;label.append(document.createElement('br'),hint)}
  button.type='button';
  button.textContent=record?(selected.has(record.id)?'Убрать':studyLocalCopy(record)?'Прикрепить':'Выбрать'):'Открыть';
  button.onclick=onClick;
  li.append(label,button);
  if(record?.url){
   const original=document.createElement('a');
   original.href=record.url;original.dataset.sdoPortal='';original.textContent='Оригинал в СДО';
   label.append(document.createElement('br'),original);
  }
  list.append(li);
 }
 function render(){
  list.replaceChildren();
  const query=normalizeSdoTitle(search.value);
  const matches=item=>!query||normalizeSdoTitle(item.title).includes(query);
  let items=course?state.sdo.items.filter(item=>item.courseId===course):courses;
  if(!course&&!query){
   for(const item of items)row(item.title,sdoDisciplineOf(item)?.name,()=>navigate(item.id));
   if(!items.length)list.textContent='Сначала обнови список курсов в СДО.';
  }else{
   if(!course)items=state.sdo.items.filter(item=>item.kind!=='course');
   if(parent)items=items.filter(item=>item.assignmentId===parent);
   else if(course&&!query)items=items.filter(item=>!item.assignmentId);
   if(section)items=items.filter(item=>(item.section||'Без раздела')===section);
   if(course&&!parent&&!section&&!query){
    for(const name of new Set(items.map(item=>item.section||'Без раздела')))row(name,'Раздел курса',()=>navigate(course,'',name));
   }else for(const item of items.filter(matches).slice(0,100)){
    const hasChildren=state.sdo.items.some(child=>child.assignmentId===item.id);
    if(hasChildren&&!parent){row(item.title,sdoKinds[item.kind],()=>navigate(item.courseId,item.id));continue}
    if(!item.document&&!sdoDownloadable(item))continue;
    const local=studyLocalCopy(item);
    if(!local&&!window.OrbitaAndroid?.downloadSdoMaterial)continue;
    row(item.title,[sdoKinds[item.kind],local?'Скачан':'СДО',local?.size?sdoSize(local.size):''].filter(Boolean).join(' · '),
     ()=>{if(selected.has(item.id))selected.delete(item.id);else if(selected.size<12)selected.add(item.id);else toast('За один раз можно выбрать до 12 файлов.');render()},item);
   }
  }
  if(!list.children.length&&!list.textContent)list.textContent='Файлы не найдены.';
  action.disabled=!selected.size;
  action.textContent='Скачать и прикрепить'+(selected.size?' · '+selected.size:'');
 }
 search.oninput=render;
 $('#study-picker-back').onclick=()=>{if(!trail.length){restoreStudyDraft(draft);return}[course,parent,section]=trail.pop();search.value='';render()};
 $('#study-picker-editor').onclick=()=>restoreStudyDraft(draft);
 action.onclick=()=>{draft.queue=[...selected];nextStudyDownload(draft)};
 render();
};

function studyDriveFiles(workId){
 try{
  const data=JSON.parse(window.OrbitaAndroid?.workAttachments?.(workId)||'{}');
  return [...(data.files||[]),...(data.drivePending?[data.drivePending]:[])];
 }catch{return []}
}
function cleanStudyDriveUrl(value){
 try{
  const url=new URL(value);
  if(url.protocol!=='https:'||url.username||url.password)return '';
  if(url.hostname==='drive.google.com'&&/^\/file\/d\/[\w-]+(?:\/view)?\/?$/.test(url.pathname))return url.origin+url.pathname;
  if(url.hostname==='docs.google.com'&&/^\/(?:document|spreadsheets|presentation)\/d\/[\w-]+(?:\/(?:edit|view))?\/?$/.test(url.pathname))return url.origin+url.pathname;
 }catch{}
 return '';
}
function studyPrompt(task,ids,mode){
 const clean=value=>String(value||'').replace(/https?:\/\/[^\s<>]+/g,link=>canonicalSdoLink(link)||cleanStudyDriveUrl(link)||'[ссылка скрыта]')
  .replace(/\b(?:access_token|refresh_token|sesskey|authorization|cookie|password)\s*[:=]\s*[^\r\n]*/gi,'[секрет скрыт]');
 const source=canonicalSdoLink(task.sdoUrl);
 const rows=['Помоги разобраться с учебной задачей и подготовиться к её выполнению.',
  'Дисциплина: '+clean(task.subject),'Задание: '+clean(task.text),'Вид работы: '+clean(task.kind)];
 if(task.comment)rows.push('Условие: '+clean(task.comment));
 if((mode==='deadline'||mode==='full')&&task.dueISO)rows.push('Срок: '+clean(task.dueISO));
 if(mode==='full'&&source)rows.push('Оригинал в СДО: '+source);
 if(mode!=='text'){
  const attached=new Set([...(state.sdo.attachments[task.workId]||[]),...ids]);
  for(const item of state.sdo.items.filter(row=>attached.has(row.id)))rows.push('Материал: '+clean(item.title));
  for(const file of studyDriveFiles(task.workId)){
   const link=cleanStudyDriveUrl(file.url);
   if(link)rows.push('Google Диск: '+clean(file.name)+' — '+link);
  }
  if(attached.size)rows.push('Локальные файлы перечислены по имени. Этот запрос передаёт только текст и ссылки.');
 }
 rows.push('Объясни условие простыми словами, выдели необходимые знания, предложи план и вопросы для защиты. Если документы недоступны, укажи это.');
 return rows.join('\n');
}
window.showStudyAi=(task,ids=[],draft=null)=>{
 modal('<h2>Разобрать с ИИ</h2><label class="control-field">Помощник <select id="study-ai-provider"><option value="other">Другое приложение</option><option value="chatgpt">ChatGPT</option><option value="gemini">Gemini</option><option value="claude">Claude</option></select></label><label class="control-field">Контекст <select id="study-ai-mode"><option value="full">Полный учебный контекст</option><option value="text">Только текст</option><option value="links">Текст и материалы</option><option value="deadline">Текст, материалы и срок</option></select></label><label class="control-field">Предпросмотр <textarea id="study-ai-text" rows="10" readonly></textarea></label><p>Передаётся текст. Доступ помощника к документам зависит от разрешений.</p><div class="work-chips"><button id="study-ai-copy">Скопировать запрос</button><button id="study-ai-share">Поделиться</button></div>');
 if(draft){
  const back=document.createElement('button');back.type='button';back.textContent='К задаче';
  back.onclick=()=>restoreStudyDraft(draft);$('#study-ai-share').after(back);
 }
 const provider=$('#study-ai-provider'), mode=$('#study-ai-mode'), preview=$('#study-ai-text');
 syncSdoFiles();
 const attached=new Set([...(state.sdo.attachments[task.workId]||[]),...ids]);
 const local=state.sdo.items.filter(file=>attached.has(file.id)&&file.document&&sdoDeviceFiles.has(file.id));
 if(local.length&&window.OrbitaAndroid?.shareStudyFile){
  const panel=document.createElement('section');
  panel.innerHTML='<h3>Передать локальный файл</h3><p>Выбери один документ. В системном меню появятся приложения, которые принимают его формат. Если помощник не принимает вложение, скопируй запрос и добавь файл вручную.</p>';
  for(const file of local){
   const button=document.createElement('button');
   button.type='button';button.textContent='Текст и файл: '+file.title;
   button.onclick=()=>window.OrbitaAndroid.shareStudyFile(preview.value,file.id);
   panel.append(button);
  }
  $('#study-ai-share').parentElement.after(panel);
 }
 provider.value=readStudyLocal('orbita.studyAi')||'other';
 provider.onchange=()=>writeStudyLocal('orbita.studyAi',provider.value);
 mode.onchange=()=>{preview.value=studyPrompt(task,ids,mode.value)};
 mode.onchange();
 $('#study-ai-copy').onclick=async()=>{
  try{
   if(window.OrbitaAndroid?.copyStudyText)window.OrbitaAndroid.copyStudyText(preview.value);
   else await navigator.clipboard.writeText(preview.value);
   toast('Запрос скопирован');
  }catch{preview.select();toast('Выделенный запрос можно скопировать вручную.')}
 };
 $('#study-ai-share').onclick=()=>{
  if(window.OrbitaAndroid?.shareStudyText)window.OrbitaAndroid.shareStudyText(preview.value,provider.value);
  else if(navigator.share)navigator.share({text:preview.value}).catch(()=>{});
  else preview.select();
 };
};

let activeStudySync=null;
const studySyncInitialMessage=window.orbitaAttachmentResult;
window.orbitaAttachmentResult=(id,message,trashed=false)=>{
 const job=activeStudySync;
 if(trashed||!job||job.workId!==id){studySyncInitialMessage?.(id,message,trashed);return}
 job.message=message;
 if(/^(Проверяем|Прикрепляем|Загружаем|Файл на Диске\. Ожидаем)/.test(message)){paintStudySync(job);return}
 job.running=false;
 if(message==='Файл прикреплён в Google Календаре.'||message==='Файл сохранён на Google Диске.'){
  job.completed.push(job.files[job.index]);
  job.index++;
  job.failed=false;
  writeStudyLocal(studySyncKey+':'+job.workId,job);
  paintStudySync(job);
  if(job.index<job.files.length)setTimeout(()=>{if(!job.paused)runStudySync(job)},0);
 }else{
  job.failed=true;
  writeStudyLocal(studySyncKey+':'+job.workId,job);
  paintStudySync(job);
 }
};
function runStudySync(job){
 if(job.running||job.index>=job.files.length)return;
 const task=state.tasks.find(row=>row.workId===job.workId);
 if(!task||(task.dueISO&&!state.calendarAutoSync?.tasks)){
  job.message='Для вложений события включи синхронизацию задач.';
  paintStudySync(job);
  return;
 }
 const bridge=window.OrbitaAndroid;
 if(!bridge?.attachSdoWorkFile)return;
 let pending={};
 try{pending=JSON.parse(bridge.workAttachments?.(job.workId)||'{}')}catch{}
 job.running=true;
 job.paused=false;
 job.message='Отправляем файл '+(job.index+1)+' из '+job.files.length+'…';
 writeStudyLocal(studySyncKey+':'+job.workId,job);
 paintStudySync(job);
 if(job.failed&&(pending.pending||pending.selected))bridge.attachWorkFile(job.workId,true);
 else bridge.attachSdoWorkFile(job.workId,job.files[job.index]);
}
function paintStudySync(job){
 const box=$('#study-sync-state');
 if(!box||box.dataset.work!==job.workId)return;
 let drivePending=false;
 try{drivePending=!!JSON.parse(window.OrbitaAndroid?.workAttachments?.(job.workId)||'{}').drivePending}catch{}
 $('#study-sync-files').textContent=Math.min(job.files.length,job.completed.length+Number(drivePending))+' из '+job.files.length;
 $('#study-sync-event-files').textContent=job.driveOnly?'Без события':job.completed.length+' из '+job.files.length;
 $('#study-sync-message').textContent=job.message||'';
 $('#study-sync-start').disabled=job.running||job.index>=job.files.length;
 $('#study-sync-start').textContent=job.failed?'Повторить':job.index?'Продолжить':'Отправить файлы в Google';
 $('#study-sync-pause').hidden=!job.running;
 box.querySelector('[data-study-event]').textContent=job.driveOnly?'Без срока — событие не создаётся':job.completed.length?'Событие подтверждено Google':
  box.dataset.calendarEligible==='true'?'Событие обновляется через автосинхронизацию':'Нужны срок задачи и автосинхронизация';
}
window.showStudySync=task=>{
 if(!task)return;
 if(activeStudySync?.running&&activeStudySync.workId!==task.workId){toast('Дождись завершения отправки текущей задачи.');return}
 syncSdoFiles();
 const ids=(state.sdo.attachments[task.workId]||[]).filter(id=>sdoDeviceFiles.has(id));
 const saved=readStudyLocal(studySyncKey+':'+task.workId);
 const driveOnly=!task.dueISO;
 const completed=saved?.workId===task.workId&&!!saved.driveOnly===driveOnly?(saved.completed||[]):[];
 const pending=ids.filter(id=>!completed.includes(id));
 const job=activeStudySync?.running&&activeStudySync.workId===task.workId?activeStudySync:
  {workId:task.workId,driveOnly,files:[...ids.filter(id=>completed.includes(id)),...pending],
   completed:ids.filter(id=>completed.includes(id)),index:ids.length-pending.length,
   failed:!!(saved?.workId===task.workId&&(saved.failed||saved.running)),running:false,message:''};
 activeStudySync=job;
 modal('<h2>Задача сохранена</h2><div id="study-sync-state"><p>Google Календарь: <span data-study-event></span></p><p>Файлы в библиотеке: '+ids.length+'</p><p>Google Диск: <span id="study-sync-files"></span></p><p>Вложения события: <span id="study-sync-event-files"></span></p><p id="study-sync-message" role="status"></p><div class="work-chips"><button id="study-sync-start">Отправить файлы в Google</button><button id="study-sync-pause">Остановить после текущего</button><button id="study-sync-ai">Разобрать с ИИ</button></div></div>');
 $('#study-sync-state').dataset.work=task.workId;
 $('#study-sync-state').dataset.calendarEligible=String(!!(task.dueISO&&state.calendarAutoSync?.tasks));
 $('#study-sync-start').onclick=()=>runStudySync(job);
 $('#study-sync-pause').onclick=()=>{job.paused=true;job.message='Очередь остановится после текущего файла.';paintStudySync(job)};
 $('#study-sync-ai').onclick=()=>window.showStudyAi(task);
 paintStudySync(job);
};
