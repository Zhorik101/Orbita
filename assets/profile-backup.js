// Portable profile files contain user content and selected preferences only.
const backupFormat='orbita-profile';
const backupVersion=1;
const backupLimit=2_000_000;
const backupText=new TextEncoder();
const backupSettings={
 group:'string',theme:'string',lightTheme:'string',compact:'boolean',appearanceMode:'string',
 launcherIcon:'string',syncLauncherIcon:'boolean',attendanceScannerDock:'boolean',
 scheduleChangePush:'boolean',indoorCampus:'string',welcomeComplete:'boolean'
};
const backupCollections={
 homeLayout:{id:'string',size:'string',detail:'string',height:'number'},
 savedGroupTargets:{id:'id',title:'string',target:'number'}
};
const backupObjects={
 dashboard:{next:'boolean',stats:'boolean',tasks:'boolean'},
 customAppearance:{background:'string',accent:'string'},
 completionEffects:{sound:'boolean',confetti:'boolean'},
 dailyWorkReminder:{enabled:'boolean',time:'string'},
 lessonReminder:{enabled:'boolean',minutes:'number'},
 pinnedGroup:{id:'id',title:'string',target:'number'},
 officialGroup:{id:'id',title:'string',target:'number'}
};
const backupTaskFields={
 workId:'string',text:'string',kind:'string',subject:'string',due:'string',dueISO:'string',
 comment:'string',major:'boolean',done:'boolean',doneAt:'number',number:'string'
};
const backupNoteFields={id:'string',title:'string',body:'string',updated:'number'};
const backupLists=['miniAppOrder','recentGroups','favoriteGroups','customSubjectPresets','customWorkTypes'];

function backupPick(input, fields){
 const result={};
 if(!isOrbitaRecord(input))return result;
 for(const [key,type] of Object.entries(fields)){
  const value=input[key];
  if(type==='id'?(typeof value==='string'||Number.isSafeInteger(value)):
   typeof value===type&&(type!=='number'||Number.isFinite(value)))result[key]=value;
 }
 return result;
}
function localBackupData(source){
 const list=(value,fields,required)=>Array.isArray(value)?value.map(item=>backupPick(item,fields))
  .filter(item=>required.some(key=>typeof item[key]==='string'&&item[key].trim())):[];
 const data={
  tasks:list(source.tasks,backupTaskFields,['text']),
  ...(typeof cleanDebtMarks==='function'?{debtMarks:cleanDebtMarks(source.debtMarks)}:{}),
  ...(typeof controlEventList==='function'?{controlEvents:controlEventList(source.controlEvents)}:{}),
  notebooks:list(source.notebooks,backupNoteFields,['body','title']),
  notes:isOrbitaRecord(source.notes)?Object.fromEntries(Object.entries(source.notes).filter(([,v])=>typeof v==='string')):{}
 };
 if(typeof source.homeNote==='string')data.homeNote=source.homeNote;
 Object.assign(data,backupPick(source,backupSettings));
 for(const [key,fields] of Object.entries(backupObjects)){
  if(isOrbitaRecord(source[key]))data[key]=backupPick(source[key],fields);
 }
 for(const [key,fields] of Object.entries(backupCollections)){
  if(Array.isArray(source[key]))data[key]=list(source[key],fields,key==='homeLayout'?['id']:['title']);
 }
 for(const key of backupLists){
  if(Array.isArray(source[key]))data[key]=source[key].filter(value=>typeof value==='string');
 }
 if(isOrbitaRecord(source.subgroups)){
  data.subgroups=Object.fromEntries(Object.entries(source.subgroups).filter(([k,v])=>/^1:[a-zA-Z0-9_-]+$/.test(k)&&typeof v==='string'));
 }
 return data;
}

async function backupDigest(payload){
 const bytes=await crypto.subtle.digest('SHA-256',backupText.encode(payload));
 return [...new Uint8Array(bytes)].map(value=>value.toString(16).padStart(2,'0')).join('');
}
async function createProfileBackup(source){
 const payload=JSON.stringify(localBackupData(source));
 const json=JSON.stringify({format:backupFormat,version:backupVersion,createdAt:new Date().toISOString(),
  sha256:await backupDigest(payload),payload});
 if(backupText.encode(json).length>backupLimit)throw new Error('Резервная копия превышает 2 МБ.');
 return json;
}

async function parseProfileBackup(json){
 if(typeof json!=='string'||json.length>backupLimit||backupText.encode(json).length>backupLimit)throw new Error('Размер файла превышает 2 МБ.');
 const file=JSON.parse(json);
 if(!isOrbitaRecord(file))throw new Error('Это не резервная копия Орбиты.');
 let data=file;
 if('format' in file){
  if(file.format!==backupFormat||file.version!==backupVersion)throw new Error('Формат резервной копии не поддерживается.');
  if(typeof file.payload!=='string'||!/^[a-f0-9]{64}$/.test(file.sha256)||await backupDigest(file.payload)!==file.sha256)
   throw new Error('Контрольная сумма не совпадает. Файл повреждён.');
  data=JSON.parse(file.payload);
 }
 if(!isOrbitaRecord(data)||!(Array.isArray(data.tasks)||Array.isArray(data.notebooks)||isOrbitaRecord(data.notes)))
  throw new Error('В файле нет профиля Орбиты.');
 if(typeof data.schemaVersion==='number'&&data.schemaVersion>orbitaSchemaVersion)
  throw new Error('Профиль создан в более новой версии Орбиты.');
 for(const key of ['tasks','notebooks','notes','controlEvents','debtMarks']){
  if(key in data&&!(['notes','debtMarks'].includes(key)?isOrbitaRecord(data[key]):Array.isArray(data[key])))
   throw new Error('Один из разделов файла повреждён.');
 }
 return localBackupData(data);
}

function mergeProfileBackup(current, data, settings){
 const addUnique=(items,incoming,idKey,signature)=>{
  const result=items.map(item=>({...item}));
  const ids=new Set(result.map(item=>item[idKey]).filter(Boolean));
  const allTexts=new Set(result.map(signature));
  const legacyTexts=new Set(result.filter(item=>!item[idKey]).map(signature));
  for(const item of incoming){
   const id=item[idKey],text=signature(item);
   if(id?(ids.has(id)||legacyTexts.has(text)):allTexts.has(text))continue;
   result.push({...item});
   if(id)ids.add(id);else legacyTexts.add(text);
   allTexts.add(text);
  }
  return result;
 };
 const taskText=task=>JSON.stringify(['text','subject','dueISO','due','comment'].map(key=>task[key]||''));
 const noteText=note=>JSON.stringify([note.title||'',note.body||'']);
 const {tasks,notebooks,notes,homeNote,controlEvents,debtMarks,...preferences}=data;
 const mergedTasks=addUnique(current.tasks,tasks,'workId',taskText);
 const mergedEvents=typeof controlEventList==='function'?controlEventList([
  ...controlEventList(current.controlEvents),
  ...(controlEvents||[]).map(event=>{
   const incoming=tasks.find(task=>task.workId===event.taskId);
   const restored=mergedTasks.find(task=>task.workId===event.taskId);
   return {...event,taskId:incoming&&restored&&taskText(incoming)===taskText(restored)?event.taskId:''};
  })
 ]):undefined;
 const restoredMarks=typeof cleanDebtMarks==='function'?Object.fromEntries(
  Object.entries(cleanDebtMarks(debtMarks)).filter(([key])=>{
   const id=key.slice(key.indexOf(':')+1);
   if(key.startsWith('event:'))return (controlEvents||[]).some(event=>event.id===id)
    &&mergedEvents?.some(event=>event.id===id);
   const original=tasks.find(task=>task.workId===id);
   const restored=mergedTasks.find(task=>task.workId===id);
   return original&&restored&&taskText(original)===taskText(restored);
  })
 ):null;
 return {...current,...(settings?preferences:{}),
  tasks:mergedTasks,
  ...(mergedEvents?{controlEvents:mergedEvents}:{}),
  ...(restoredMarks?{debtMarks:{...restoredMarks,...cleanDebtMarks(current.debtMarks)}}:{}),
  notebooks:addUnique(current.notebooks,notebooks,'id',noteText),
  notes:{...notes,...current.notes},
  homeNote:current.homeNote||homeNote||''
 };
}

window.orbitaImportBackup=async json=>{
 try{
  const data=await parseProfileBackup(json);
  const lessonNotes=Object.keys(data.notes).length;
  modal(`<h2>Импорт данных</h2><p>В файле: задач — ${data.tasks.length}, заметок — ${data.notebooks.length+lessonNotes+(data.homeNote?1:0)}, МТК — ${data.controlEvents?.length||0}.</p>
  <p>Существующие записи с тем же ID или содержанием сохранятся. Добавятся записи из копии.</p>
  <label class="setting-row"><span>Восстановить оформление и настройки</span><input id="profile-restore-settings" type="checkbox"></label>
  <button type="button" class="primary" id="profile-confirm-import">Объединить данные</button>`);
  $('#profile-confirm-import').onclick=async event=>{
   const button=event.currentTarget;
   button.disabled=true;
   try{
    const restoreSettings=$('#profile-restore-settings').checked;
    const previous=state;
    const checkpoint=await createProfileBackup(previous);
    if(!button.isConnected||!$('#modal').open)return;
    localStorage.setItem('orbita-before-import',checkpoint);
    if(previous!==state||JSON.stringify(localBackupData(state))!==JSON.parse(checkpoint).payload)
     throw new Error('Профиль изменился во время импорта. Повтори операцию.');
    state=mergeProfileBackup(previous,data,restoreSettings);
    if(!save()){
     state=previous;
     button.disabled=false;
     return;
    }
    location.reload();
   }catch(error){button.disabled=false;toast(error.message||'Не удалось импортировать данные.')}
  };
 }catch(error){toast(error instanceof SyntaxError?'Файл не является корректным JSON.':error.message||'Не удалось прочитать копию.')}
};

if(window.OrbitaAndroid?.exportProfileBackup&&window.OrbitaAndroid?.importProfileBackup){
 const section=document.createElement('section');
 section.className='settings-section';
 section.innerHTML=`<div class="settings-section-title"><span class="settings-section-icon">${icon('grid')}</span><div><h3>Резервные копии</h3><p>Задачи, заметки и настройки</p></div></div>
 <button type="button" class="settings-link" id="profile-export"><span>Экспорт данных</span>${courseChevron()}</button>
 <button type="button" class="settings-link" id="profile-import"><span>Импорт данных</span>${courseChevron()}</button>`;
 $('.settings-about').before(section);
 $('#profile-export').onclick=async event=>{
  const button=event.currentTarget;
  button.disabled=true;
  try{window.OrbitaAndroid.exportProfileBackup(await createProfileBackup(state))}
  catch(error){toast(error.message||'Не удалось создать резервную копию.')}
  finally{button.disabled=false}
 };
 $('#profile-import').onclick=()=>window.OrbitaAndroid.importProfileBackup();
}
