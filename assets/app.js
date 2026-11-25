const $=s=>document.querySelector(s),$$=s=>document.querySelectorAll(s);const safe=(s)=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));const orbitaSchemaVersion=1;
const orbitaRecoveryKey='orbita-recovery-v1';
const isOrbitaRecord=value=>!!value&&typeof value==='object'&&!Array.isArray(value);

function readSavedOrbita(){
 let unreadable=false;
 for(const read of [()=>window.OrbitaAndroid?.read(),()=>localStorage.getItem('orbita')]){
  try{
   const raw=read();
   if(!raw)continue;
   const stored=JSON.parse(raw);
   if(isOrbitaRecord(stored))return {stored,unreadable};
   unreadable=true;
  }catch{unreadable=true}
 }
 return {stored:null,unreadable};
}

function recoverySnapshot(original,profile){
 const project=(items,fields)=>items.map(item=>Object.fromEntries(fields
  .filter(key=>['string','boolean','number'].includes(typeof item[key]))
  .map(key=>[key,item[key]])));
 return {
  schemaVersion:orbitaSchemaVersion,
  previousSchemaVersion:Number.isInteger(original.schemaVersion)?original.schemaVersion:0,
  savedAt:new Date().toISOString(),
  tasks:project(profile.tasks,['text','kind','subject','due','dueISO','comment','major','done','workId']),
  notes:Object.fromEntries(Object.entries(profile.notes).filter(([,value])=>typeof value==='string')),
  notebooks:project(profile.notebooks,['id','title','body','updated']),
  controlEvents:profile.controlEvents||[],
  group:profile.group,theme:profile.theme,homeNote:typeof profile.homeNote==='string'?profile.homeNote:'',
  homeLayout:project(Array.isArray(profile.homeLayout)?profile.homeLayout.filter(isOrbitaRecord):[],['id','size','detail','height'])
 };
}

function normalizeOrbitaProfile(original){
 const repaired=[];
 const collection=(key,value)=>{
  if(value===undefined)return [];
  if(!Array.isArray(value))repaired.push(key);
  const items=Array.isArray(value)?value:isOrbitaRecord(value)?Object.values(value):[];
  const valid=items.filter(isOrbitaRecord);
  if(valid.length!==items.length)repaired.push(key);
  return valid;
 };
 const profile={group:'',theme:window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'violet',
  compact:false,...original,schemaVersion:orbitaSchemaVersion};
 profile.tasks=collection('tasks',original.tasks).map(task=>{
  if(!('dueISO' in task)||task.dueISO==null||typeof task.dueISO==='string')return task;
  repaired.push('tasks');
  return {...task,dueISO:''};
 });
 profile.notebooks=collection('notebooks',original.notebooks);
 if(typeof controlEventList==='function')profile.controlEvents=controlEventList(collection('controlEvents',original.controlEvents));
 if(original.notes!==undefined&&!isOrbitaRecord(original.notes))repaired.push('notes');
 profile.notes=isOrbitaRecord(original.notes)?original.notes:{};
 if(typeof profile.group!=='string'||profile.group.length>32){profile.group='';repaired.push('group')}
 if(!['violet','green','pink','blue','dark'].includes(profile.theme)){
  profile.theme=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'violet';
  repaired.push('theme');
 }
 return {profile,repaired};
}
const loadedOrbita=readSavedOrbita();
const originalOrbita=loadedOrbita.stored||{};
const normalizedOrbita=normalizeOrbitaProfile(originalOrbita);
let state=normalizedOrbita.profile;
let orbitaReadOnly=loadedOrbita.unreadable||originalOrbita.schemaVersion>orbitaSchemaVersion;
if(loadedOrbita.stored&&!orbitaReadOnly&&(originalOrbita.schemaVersion!==orbitaSchemaVersion||normalizedOrbita.repaired.length)){
 try{
  if(!localStorage.getItem(orbitaRecoveryKey)){
   localStorage.setItem(orbitaRecoveryKey,JSON.stringify(recoverySnapshot(originalOrbita,state)));
  }
 }catch{orbitaReadOnly=true}
}
if(orbitaReadOnly||normalizedOrbita.repaired.length){
 const notice=document.createElement('p');
 notice.className='profile-recovery-notice';
 notice.setAttribute('role','status');
 notice.textContent=orbitaReadOnly
  ?'Сохранённый профиль требует восстановления. Запись временно отключена, чтобы сохранить исходные данные.'
  :'Часть настроек не удалось прочитать. Доступные данные восстановлены, локальная резервная копия сохранена.';
 $('main').prepend(notice);
}
let selected=2,weekOffset=0,weekView=false,page='schedule';const base=new Date(2026,10,9);const days=['Пн','Вт','Ср','Чт','Пт','Сб','Вс'],fullDays=['Понедельник','Вторник','Среда','Четверг','Пятница','Суббота','Воскресенье'];const lessons=[{title:'Программирование',type:'Практическое занятие',teacher:'Кузнецов А. В.',room:'Г-215',start:'09:00',end:'10:30',color:'green'},{title:'Математический анализ',type:'Лекция',teacher:'Соколова Е. И.',room:'А-308',start:'11:00',end:'12:30',color:'violet'},{title:'Иностранный язык',type:'Практическое занятие',teacher:'Морозова Н. А.',room:'Б-412',start:'13:10',end:'14:40',color:'peach'},{title:'Физика',type:'Лабораторная работа',teacher:'Петров Д. С.',room:'В-106',start:'14:40',end:'16:10',color:'blue'}];const themes={violet:['Лаванда','#7060dc','#eeeafa'],green:['Шалфей','#718967','#edf2e9'],pink:['Розовый','#bb7f9d','#f8eaf1'],blue:['Небо','#638cbd','#eaf1fa'],dark:['Космос','#a994e0','#40364e']};function save(){if(orbitaReadOnly)return false;try{localStorage.setItem('orbita',JSON.stringify(state));return true}catch{toast('Не удалось сохранить данные в браузере');return false}}function toast(t){$('#toast').textContent=t;$('#toast').classList.add('visible');setTimeout(()=>$('#toast').classList.remove('visible'),3000)}function dateAt(day){const d=new Date(base);d.setDate(d.getDate()+weekOffset*7+day);return d}function dayData(day){if(day===6)return[];let arr=lessons.map(x=>({...x}));if(day===5)return arr.slice(0,2);if(day!==2){arr=arr.slice(day%2?1:0,day%2?4:3);arr[0]={...arr[0],title:day%2?'Дискретная математика':'Информатика',teacher:'Иванов М. В.'}}if(state.group==='ИВБО-01-24')arr[0]={...arr[0],title:'Архитектура вычислительных систем'};if(state.group==='БСБО-05-24')arr[0]={...arr[0],title:'Информационная безопасность'};return arr}function renderLesson(l,i,day){let key=`${weekOffset}-${day}-${i}`;return `<div class="lesson-row"><div class="time">${l.start}<small>${l.end}</small></div><button class="lesson ${l.color}" data-lesson="${day},${i}"><div class="lesson-top"><span class="lesson-type">${l.type}</span><span class="lesson-num">${i+1} ПАРА ${state.notes[key]?'· ✎':''}</span></div><h3>${l.title}</h3><div class="lesson-details"><span>⌖ ${l.room}</span><span>♙ ${l.teacher}</span><span>Вернадского, 78</span></div></button></div>${l.end==='12:30'?'<div class="break">☕ Большой перерыв · 40 минут</div>':''}`}function renderSchedule(){const first=dateAt(0),last=dateAt(6);$('#week-label').textContent=`${first.getDate()} — ${last.toLocaleDateString('ru',{day:'numeric',month:'long'})}`;$('#week-strip').innerHTML=days.map((d,i)=>`<button class="day-button ${selected===i?'chosen':''} ${i>4?'weekend':''}" data-day="${i}"><small>${d}</small><b>${dateAt(i).getDate()}</b><i></i></button>`).join('');$('#day-label').textContent=`${fullDays[selected]}, ${dateAt(selected).toLocaleDateString('ru',{day:'numeric',month:'long'})}`;$('#day-view').classList.toggle('selected',!weekView);$('#week-view').classList.toggle('selected',weekView);let list=weekView?[0,1,2,3,4,5,6]:[selected];$('#lessons').innerHTML=list.map(d=>(weekView?`<h3 class="week-list-title">${fullDays[d]}, ${dateAt(d).getDate()}</h3>`:'')+(dayData(d).length?dayData(d).map((l,i)=>renderLesson(l,i,d)).join(''):'<div class="empty-day"><span>✧</span>Свободный день<br><small>Время для себя и новых планов</small></div>')).join('');$$('[data-day]').forEach(b=>b.onclick=()=>{selected=+b.dataset.day;weekView=false;renderSchedule()});$$('[data-lesson]').forEach(b=>b.onclick=()=>showLesson(...b.dataset.lesson.split(',').map(Number)))}function renderTasks(){let html=state.tasks.map((t,i)=>`<label class="task ${t.done?'done':''}"><input type="checkbox" data-task="${i}" ${t.done?'checked':''}><div><b>${safe(t.text)}</b><p>${safe(t.subject)} · <span class="due">${safe(t.due)}</span></p></div></label>`).join('');$('#task-list').innerHTML=html;$('#full-tasks').innerHTML=html;$('#task-count').textContent=state.tasks.filter(t=>!t.done).length;$$('[data-task]').forEach(t=>t.onchange=()=>{state.tasks[+t.dataset.task].done=t.checked;save();renderTasks()})}function applyTheme(){let t=themes[state.theme]||themes.violet;document.documentElement.style.setProperty('--accent',t[1]);document.documentElement.style.setProperty('--accent-soft',t[2]);document.body.classList.toggle('dark-theme',state.theme==='dark');document.body.classList.toggle('compact',state.compact);$$('[data-theme]').forEach(b=>{b.classList.toggle('chosen',b.dataset.theme===state.theme);b.textContent=b.dataset.theme===state.theme?'✓':''});$('#theme-options').innerHTML=Object.entries(themes).map(([k,v])=>`<button class="theme-option ${k===state.theme?'selected':''}" data-option="${k}"><i style="background:${v[1]}"></i>${v[0]}</button>`).join('');$$('[data-option]').forEach(b=>b.onclick=()=>setTheme(b.dataset.option));$('#compact').checked=state.compact}function setTheme(t){state.theme=t;save();applyTheme()}function showPage(p){page=p;['schedule','tasks','settings'].forEach(k=>$(`#${k}-page`).hidden=k!==p);$$('[data-page]').forEach(b=>b.classList.toggle('active',b.dataset.page===p));$('#crumb').textContent={schedule:'Расписание',tasks:'Мои задачи',settings:'Оформление'}[p];$('#page-title').innerHTML={schedule:'Твоя неделя<span> в орбите</span><span class="spark">✳</span>',tasks:'Мои задачи<span> без суеты</span>',settings:'Твоя орбита<span> — твои правила</span>'}[p];$('#page-subtitle').textContent={schedule:'Пары, планы и немного времени для себя.',tasks:'Освободи голову — сохрани всё важное здесь.',settings:'Добавь своему расписанию немного настроения.'}[p]}function modal(html){$('#modal-content').innerHTML=html;$('#modal').showModal()}function showLesson(d,i){const l=dayData(d)[i],key=`${weekOffset}-${d}-${i}`;modal(`<span class="eyebrow">${l.type}</span><h2>${l.title}</h2><p>${fullDays[d]} · ${l.start}–${l.end}<br>Аудитория ${l.room} · Вернадского, 78<br>${l.teacher}</p><label for="note">Заметка к занятию</label><textarea id="note" rows="4" placeholder="Что взять с собой или подготовить…">${safe(state.notes[key]||'')}</textarea><button class="primary" id="save-note">Сохранить заметку</button>`);$('#save-note').onclick=()=>{state.notes[key]=$('#note').value;save();$('#modal').close();renderSchedule();toast('Заметка сохранена')}}function addTask(){modal('<h2>Новая задача</h2><label for="task-name">Что нужно сделать?</label><input id="task-name" placeholder="Например, подготовить отчёт" maxlength="160"><label for="task-subject">Предмет</label><input id="task-subject" placeholder="Название предмета" maxlength="80"><label for="task-date">Срок</label><input id="task-date" type="date"><button class="primary" id="save-task">Добавить задачу</button>');$('#save-task').onclick=()=>{let text=$('#task-name').value.trim();if(!text){$('#task-name').focus();return}state.tasks.push({text,subject:$('#task-subject').value.trim()||'Личное',due:$('#task-date').value?new Date($('#task-date').value+'T12:00').toLocaleDateString('ru',{day:'numeric',month:'long'}):'Без срока',done:false});save();renderTasks();$('#modal').close();toast('Задача добавлена')}}$$('[data-page]').forEach(b=>b.onclick=()=>showPage(b.dataset.page));$$('[data-theme]').forEach(b=>b.onclick=()=>setTheme(b.dataset.theme));$('#prev-week').onclick=()=>{weekOffset--;renderSchedule()};$('#next-week').onclick=()=>{weekOffset++;renderSchedule()};$('#today').onclick=()=>{weekOffset=0;selected=2;weekView=false;renderSchedule()};$('#day-view').onclick=()=>{weekView=false;renderSchedule()};$('#week-view').onclick=()=>{weekView=true;renderSchedule()};$('#add-task').onclick=$('#new-task').onclick=addTask;$('#all-tasks').onclick=()=>showPage('tasks');$('#customize').onclick=$('#profile').onclick=()=>showPage('settings');$('#compact').onchange=e=>{state.compact=e.target.checked;save();applyTheme()};$('#notify').onclick=()=>modal('<h2>Уведомления</h2><p>Пока новых уведомлений нет.</p><p>Это демонстрационное расписание. Чтобы сверить занятия, открой официальный сайт РТУ МИРЭА.</p><a class="primary" style="display:inline-block" target="_blank" rel="noopener" href="https://www.mirea.ru/schedule/">Открыть расписание ↗</a>');$('#group-label').textContent=state.group;$('#modal').onclick=e=>{if(e.target===$('#modal'))$('#modal').close()};renderSchedule();renderTasks();applyTheme();showPage('schedule');

// Keep an explicit one-tap theme switch available throughout the application.
const originalApplyTheme = applyTheme;
applyTheme = function() {
 originalApplyTheme();
 const dark = state.theme === 'dark';
 document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
 document.querySelector('meta[name="theme-color"]').content = dark ? '#1e1d26' : '#f7f8fa';
 const toggle = document.querySelector('#theme-toggle');
 toggle.textContent = dark ? '☀' : '☾';
 toggle.setAttribute('aria-label', dark ? 'Включить светлую тему' : 'Включить тёмную тему');
 toggle.setAttribute('aria-pressed', String(dark));
};
document.querySelector('#theme-toggle').onclick = () => {
 if(state.theme === 'dark') setTheme(state.lightTheme || 'violet');
 else {state.lightTheme=state.theme;setTheme('dark');}
};
applyTheme();

// Android 1.1: durable settings, arbitrary groups, and home-screen widgets.
function applyWidgetTaskChanges(patch) {
 if (!isOrbitaRecord(patch) || !Array.isArray(patch.tasks) || !(patch.widgetTaskRevision > (state.widgetTaskRevision || 0))) return false;
 const since=state.widgetTaskRevision||0;
 const validTasks=patch.tasks.filter(task=>isOrbitaRecord(task)&&typeof task.workId==='string'&&task.workId);
 const byId = new Map(validTasks.map(task => [task.workId, task]));
 for (const task of state.tasks) {
  const update = byId.get(task.workId);
  if (update) {
   task.done = update.done;
   task.widgetTaskRevision = update.widgetTaskRevision;
   if(update.widgetEditedRevision>since){
    for(const field of ['text','kind','subject','due','dueISO','comment','major'])
     if(Object.hasOwn(update,field))task[field]=update[field];
    task.widgetEditedRevision=update.widgetEditedRevision;
   }
  }
 }
 const knownIds=new Set(state.tasks.map(task=>task.workId));
 for(const task of validTasks){
  if(task.widgetCreatedRevision>since&&!knownIds.has(task.workId))state.tasks.push({...task});
 }
 state.widgetTaskRevision = patch.widgetTaskRevision;
 queueMicrotask(() => window.orbitaRepaintTasks?.());
 return true;
}

window.orbitaSyncWidgetTasks = function() {
 const bridge = window.OrbitaAndroid;
 if (!bridge?.widgetTaskChanges||orbitaReadOnly) return;
 let patch;
 try{patch=JSON.parse(bridge.widgetTaskChanges(state.widgetTaskRevision || 0))}catch{return}
 if (applyWidgetTaskChanges(patch)) {
  try { localStorage.setItem('orbita', JSON.stringify(state)); } catch {}
 }
};

function persistOrbita() {
 if(orbitaReadOnly){toast('Сначала нужно восстановить сохранённый профиль.');return false}
 let json;
 try{json=JSON.stringify(state)}catch{toast('Не удалось подготовить данные к сохранению.');return false}
 const bridge = window.OrbitaAndroid;
 if (bridge) {
  let stored = false;
  try {
   if (bridge.writeState) {
    const result = bridge.writeState(json);
    if (result) {
     if (applyWidgetTaskChanges(JSON.parse(result))) json = JSON.stringify(state);
     stored = true;
    }
   } else stored = bridge.write(json);
  } catch {}
  if (!stored) { toast('Не удалось сохранить. Попробуй ещё раз.'); return false; }
 }
 try { localStorage.setItem('orbita', json); }
 catch { if (!bridge) { toast('Не удалось сохранить данные на устройстве'); return false; } }
 return true;
}
save = persistOrbita;
state.recentGroups = Array.isArray(state.recentGroups)?state.recentGroups:[];
state.dashboard = {next:true,stats:true,tasks:true,...state.dashboard};
function chooseGroup(value){
 const group=value.trim().toUpperCase().replace(/\s+/g,'');
 if(!/^[А-ЯЁA-Z0-9]+(?:-[А-ЯЁA-Z0-9]+)*$/.test(group)||group.length>32||group.length<3) {
  toast('Введи название группы, например ИКБО-16-24');return false;
 }
 const previous=state.group, recent=state.recentGroups;
 state.group=group;
 state.recentGroups=[group,...recent.filter(g=>g!==group)].slice(0,8);
 if(!save()){state.group=previous;state.recentGroups=recent;return false;}
 $('#group-label').textContent=group;
 renderSchedule();
 $('#modal').close();
 toast('Группа '+group+' сохранена для следующих запусков');
 return true;
}
$('#group-button').onclick=()=>{
 const groups=[...new Set([state.group,...state.recentGroups,'ИКБО-16-24','ИВБО-01-24','БСБО-05-24'])];
 modal(`<h2>Твоя группа</h2><p>Последняя выбранная группа запоминается автоматически, даже после полного закрытия приложения.</p><label for="custom-group">Название группы</label><input id="custom-group" value="${safe(state.group)}" placeholder="Например, ИКБО-20-25" maxlength="32" autocomplete="off" autocapitalize="characters"><div class="group-chips">${groups.map(g=>`<button class="group-chip ${g===state.group?'selected':''}" data-group-value="${safe(g)}">${safe(g)}</button>`).join('')}</div><p class="hint">Расписание пока демонстрационное. Ввод своей группы сохраняет её название, но не загружает реальные занятия МИРЭА.</p><button class="primary" id="save-group">Сохранить группу</button>`);
 $('#save-group').onclick=()=>chooseGroup($('#custom-group').value);
 $('#custom-group').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();chooseGroup(e.target.value)}};
 $$('[data-group-value]').forEach(b=>b.onclick=()=>{$('#custom-group').value=b.dataset.groupValue;$$('[data-group-value]').forEach(x=>x.classList.toggle('selected',x===b))});
};
save();
