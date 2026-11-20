// Coursework-oriented tasks, content-driven cards and Android lesson reminders.
const workTypes=['Лабораторная','Чертёж','Конспект','Контрольная','Отчёт','Практическая','Домашнее задание','Курсовая','Подготовка к зачёту','Презентация'];
state.customWorkTypes=Array.isArray(state.customWorkTypes)?state.customWorkTypes.filter(v=>typeof v==='string'&&v.trim()&&v.length<=60).slice(0,30):[];
for(const kind of state.customWorkTypes)if(!workTypes.includes(kind))workTypes.push(kind);
function savedTaskPresets(subject){
 const local=subject?state.customSubjectPresets:state.customWorkTypes;
 try{return [...new Set([...(local||[]),...JSON.parse(window.OrbitaAndroid?.taskPresets?.(subject)||'[]')])]}
 catch{return Array.isArray(local)?local:[]}
}
function saveTaskPreset(subject,name){
 const key=subject?'customSubjectPresets':'customWorkTypes';
 const previous=state[key];
 const entries=savedTaskPresets(subject);
 if(entries.some(value=>value.toLowerCase()===name.toLowerCase()))return true;
 if(window.OrbitaAndroid?.addTaskPreset)return window.OrbitaAndroid.addTaskPreset(subject,name);
 if(entries.length>=30)return false;
 state[key]=[...entries,name];
 if(save())return true;
 state[key]=previous;
 return false;
}
function shortSubject(title){const rules=[[/информационные технологии в химии/i,'ИТ в химии'],[/системы искусственного интеллекта и большие данные/i,'ИИ и большие данные'],[/физическ.*культур/i,'Физкультура'],[/математический анализ/i,'Матанализ'],[/линейная алгебра.*геометри/i,'Линал и геометрия'],[/иностранный язык/i,'Иностранный язык'],[/безопасность жизнедеятельности/i,'БЖД'],[/основы российской государственности/i,'Государственность'],[/теория вероятност/i,'Теория вероятностей']];const known=rules.find(([r])=>r.test(title));return known?known[1]:title.length>45?title.split(/\s+/).map((w,i)=>i<3?w:w[0]+'.').join(' '):title}
function courseSubjects(){const found=new Set();for(let i=-14;i<35;i++){const date=new Date();date.setDate(date.getDate()+i);for(const l of officialLessons(state.officialGroup,date))found.add(l.title)}for(const t of state.tasks)if(t.subject&&t.subject!=='Личное')found.add(t.subject);return [...found].sort((a,b)=>a.localeCompare(b,'ru'))}
function pendingWorks(){return state.tasks.map((t,index)=>({...t,index})).filter(t=>!t.done).sort((a,b)=>(a.dueISO||'9999').localeCompare(b.dueISO||'9999'))}
function workLessonType(kind){
 if(kind==='Лабораторная')return 'Лабораторная работа';
 if(kind==='Практическая'||kind==='Чертёж')return 'Практическое занятие';
 return '';
}
function nextCourseDate(subject,kind=''){
 const type=workLessonType(kind);
 const clock=moscowParts(new Date());
 const date=new Date(clock.date+'T12:00:00');
 for(let offset=0;offset<35;offset++){
  const matches=officialLessons(state.pinnedGroup||state.officialGroup,date).some(lesson=>
   lesson.title===subject&&lesson.type!=='Лекция'&&(!type||lesson.type===type)&&
   (offset>0||lessonMinutes(lesson.start)>lessonMinutes(clock.time)));
  if(matches)return dateKey(date);
  date.setDate(date.getDate()+1);
 }
 return '';
}
addTask=function(subjectPreset, options={}){
 const original = options.workId ? state.tasks.find(task => task.workId === options.workId) : null;
 if (options.workId && (!original || original.done)) { toast('Этой работы уже нет в списке'); return; }
 const initialKind = original?.kind || original?.text || workTypes[0];
 const initialNumber = original?.text?.startsWith(initialKind+' ') ? original.text.slice(initialKind.length+1) : '';
 let kind = initialKind;
 const subjects = [...new Set([...courseSubjects(),...savedTaskPresets(true)])];
 for(const name of savedTaskPresets(false))if(!workTypes.includes(name))workTypes.push(name);
 if (!subjects.includes('Личное')) subjects.push('Личное');
 let subject = original?.subject || (typeof subjectPreset==='string' && subjectPreset) || subjects[0] || '';
 let due = original?.dueISO || (options.dueToday ? dateKey(new Date()) : '');
 let dueChanged = false, custom = '';
 let majorTouched=original?.major!==undefined;
 modal('<h2>'+(original?'Изменить работу':'Добавить работу')+'</h2><p id="work-intro">Выбери тип, предмет и срок. Писать название необязательно.</p><label>Что нужно сделать?</label><div class="work-split"><input id="work-kind-input" aria-label="Вид работы" maxlength="60"><button type="button" id="work-kind-presets" aria-label="Шаблоны работ" aria-expanded="false">▼</button></div><div id="work-types" class="work-chips" hidden></div><div id="custom-work-editor" hidden><label for="custom-work-type">Свой вид работы</label><input id="custom-work-type" maxlength="60" placeholder="Например, эссе или макет"><button id="save-custom-work-type" class="primary">Добавить шаблон</button><p id="custom-work-status" role="status"></p></div><div id="work-fixed-subject" hidden></div><label id="work-subject-label">По какому предмету?</label><div class="work-split" id="work-subject-split"><input id="work-subject-search" aria-label="Дисциплина" placeholder="Ввести дисциплину" maxlength="160"><button type="button" id="work-subject-presets" aria-label="Шаблоны дисциплин" aria-expanded="false">▼</button></div><div id="work-subjects" class="work-chips work-subjects" hidden></div><div id="custom-subject-editor" hidden><label for="custom-subject-name">Название шаблона</label><input id="custom-subject-name" maxlength="160"><button class="primary" id="save-custom-subject">Сохранить шаблон</button><p id="custom-subject-status" role="status"></p></div><label>Когда сдать?</label><div class="work-chips" id="work-dates"><button data-work-date="today">Сегодня</button><button data-work-date="tomorrow">Завтра</button><button data-work-date="next">К следующей паре</button><button data-work-date="choose">Дата…</button><button data-work-date="none" class="selected">Без срока</button></div><p id="work-date-label">Без срока</p><div id="work-reminder-row" hidden><label for="work-deadline-reminder">Напомнить о сроке · МСК</label><select id="work-deadline-reminder"><option value="">Без напоминания</option><option value="evening">Накануне в 19:00</option><option value="morning">В день сдачи в 08:00</option></select></div><label class="work-major-row"><span><b>Крупная работа</b><small>Конфетти при выполнении</small></span><input type="checkbox" id="work-major"></label><details><summary>Номер и подробности · необязательно</summary><input id="work-number" maxlength="30" placeholder="Например, № 4"><textarea id="work-comment" rows="2" maxlength="1000" placeholder="Что именно сделать"></textarea></details><button class="primary" id="save-work-template">Добавить работу</button>');
 $('#modal-content').querySelector('.unified-dialog-body')?.classList.add('work-form');
 const kindInput=$('#work-kind-input'),presets=$('#work-kind-presets'),types=$('#work-types');
 const subjectInput=$('#work-subject-search'),subjectChoices=$('#work-subjects');
 function showPresets(open){types.hidden=!open;presets.setAttribute('aria-expanded',String(open))}
 presets.onclick=()=>showPresets(types.hidden);
 kindInput.oninput=()=>{kind=kindInput.value.trim();if(!majorTouched)$('#work-major').checked=kind==='Курсовая';refreshNextWorkDate()};
 subjectInput.value=subject;
 const subjectPresets=$('#work-subject-presets');
 function showSubjects(open){
  subjectChoices.hidden=!open;subjectPresets.setAttribute('aria-expanded',String(open));
  if(open)paintSubjects(true);
 }
 subjectPresets.onclick=()=>showSubjects(subjectChoices.hidden);
 $('#save-custom-subject').onclick=()=>{
  const name=$('#custom-subject-name').value.trim().replace(/\s+/g,' ');
  if(!name||!saveTaskPreset(true,name)){
   $('#custom-subject-status').textContent=name?'Не удалось сохранить шаблон':'Введи название дисциплины';
   return;
  }
  if(!subjects.includes(name))subjects.push(name);
  subject=name;custom='';subjectInput.value=name;
  $('#custom-subject-editor').hidden=true;showSubjects(false);refreshNextWorkDate();
 };
 function paintTypes(){kindInput.value=kind;if(!majorTouched)$('#work-major').checked=kind==='Курсовая';const choices=workTypes.includes(initialKind)?workTypes:[initialKind,...workTypes];$('#work-types').innerHTML=choices.map((v,i)=>'<button data-work-kind="'+i+'" class="'+(v===kind?'selected':'')+'">'+safe(v)+'</button>').join('')+'<button id="add-custom-work-type" aria-label="Добавить свой вид работы">＋ Свой вариант</button>';$('#add-custom-work-type').onclick=()=>{$('#custom-work-editor').hidden=false;$('#custom-work-type').focus()};$$('[data-work-kind]').forEach(b=>b.onclick=()=>{kind=choices[Number(b.dataset.workKind)];refreshNextWorkDate();paintTypes();showPresets(false)})}
 function paintSubjects(all=false){const q=all?'':$('#work-subject-search').value.trim().toLowerCase(),rows=subjects.filter(v=>v.toLowerCase().includes(q));$('#work-subjects').innerHTML=rows.map((v,i)=>'<button data-work-subject="'+i+'" title="'+safe(v)+'" class="'+(v===subject?'selected':'')+'">'+safe(shortSubject(v))+'</button>').join('');$$('[data-work-subject]').forEach(b=>b.onclick=()=>{subject=rows[Number(b.dataset.workSubject)];custom='';subjectInput.value=subject;showSubjects(false);refreshNextWorkDate();paintSubjects()});const add=document.createElement('button');add.textContent='＋ Свой вариант';add.onclick=()=>{
  showSubjects(false);$('#custom-subject-editor').hidden=false;$('#custom-subject-name').value=subjectInput.value;$('#custom-subject-name').focus();
 };subjectChoices.append(add)}
 $('#work-major').checked=original?.major??(kind==='Курсовая');
 $('#work-major').onchange=()=>{majorTouched=true};
 $('#work-subject-search').oninput=()=>{custom=$('#work-subject-search').value.trim();refreshNextWorkDate();paintSubjects()};paintTypes();paintSubjects();
 if(typeof subjectPreset==='string'&&subjectPreset){$('#work-intro').textContent='Предмет уже выбран. Осталось выбрать вид работы и срок.';$('#work-fixed-subject').hidden=false;$('#work-fixed-subject').innerHTML='<span>Предмет уже выбран</span><b>'+safe(subjectPreset)+'</b>';$('#work-subject-split').hidden=true;$('#work-subjects').hidden=true;$('#work-subject-label').hidden=true;}
 $('#save-custom-work-type').onclick=()=>{const value=$('#custom-work-type').value.trim().replace(/\s+/g,' ');if(!value){$('#custom-work-status').textContent='Введи название вида работы';return}const existing=workTypes.find(k=>k.toLocaleLowerCase('ru')===value.toLocaleLowerCase('ru'));if(existing){kind=existing;refreshNextWorkDate();$('#custom-work-editor').hidden=true;paintTypes();return}if(!saveTaskPreset(false,value)){$('#custom-work-status').textContent='Не удалось сохранить шаблон';return}workTypes.push(value);kind=value;refreshNextWorkDate();$('#custom-work-type').value='';$('#custom-work-editor').hidden=true;paintTypes();showPresets(false)};
 function refreshNextWorkDate(){
  if(!$('#work-dates [data-work-date="next"].selected'))return;
  const value=nextCourseDate(custom||subject,kind);
  setDue(value,value?'next':'none');
  if(!value)toast('Подходящее занятие не найдено. Выбери срок.');
 }
 function setDue(value,key){dueChanged=true;due=value;$('#work-reminder-row').hidden=!due;$('#work-date-label').textContent=value?new Date(value+'T12:00:00').toLocaleDateString('ru',{day:'numeric',month:'long',year:'numeric'}):'Без срока';$$('[data-work-date]').forEach(b=>b.classList.toggle('selected',b.dataset.workDate===key))}
 $$('[data-work-date]').forEach(b=>b.onclick=()=>{const key=b.dataset.workDate;if(key==='choose'){openThemedDatePicker(due,value=>setDue(value,'choose'));return}if(key==='next'){const value=nextCourseDate(custom||subject,kind);if(!value){toast(workLessonType(kind)?'В расписании на 35 дней нет подходящего занятия: '+workLessonType(kind)+'. Выбери дату вручную.':'Ближайшая пара по предмету не найдена');return}setDue(value,key);return}const date=new Date();if(key==='tomorrow')date.setDate(date.getDate()+1);setDue(key==='none'?'':dateKey(date),key)});
 if (options.dueToday || original?.dueISO) {
  const tomorrow=new Date(); tomorrow.setDate(tomorrow.getDate()+1);
  setDue(due,due===dateKey(new Date())?'today':due===dateKey(tomorrow)?'tomorrow':'choose');
 }
 $('#save-work-template').dataset.workId=original?.workId||'';

 if (original) {
  const remove=document.createElement('button');
  remove.className='settings-link';
  remove.textContent='Удалить работу';
  remove.id='delete-edited-work';
  $('#save-work-template').after(remove);
  remove.onclick=()=>{
   const index=state.tasks.findIndex(task=>task.workId===original.workId);
   if(changeWork(index,'delete'))$('#modal').close();
  };
  $('#work-intro').textContent='';
  $('#work-intro').hidden=true;
  $('#work-number').value=initialNumber;
  $('#work-comment').value=original.comment || '';
  $('#save-work-template').textContent='Сохранить изменения';
  if (initialNumber || original.comment) $('#modal details').open=true;
  if (!due && original.due && original.due!=='Без срока') $('#work-date-label').textContent=original.due;
 }
 $('#work-deadline-reminder').value=original?.deadlineReminder||'';
 dueChanged=false;
 function saveWork(attach=false){
  if(attach&&!due){$('#new-work-file-status').textContent='Выбери срок, чтобы прикрепить файл к событию.';return}
  if(attach&&!state.calendarAutoSync?.tasks){$('#new-work-file-status').textContent='Сначала включи синхронизацию задач с Google Календарём в настройках.';return}
  const discipline=custom||subject;
  if(!discipline||!kind){toast('Введи вид работы и предмет');return}
  const number=$('#work-number').value.trim();
  const title=original && kind===initialKind && number===initialNumber ? original.text : kind+(number?' '+number:'');
  const deadline=due?new Date(due+'T12:00:00').toLocaleDateString('ru',{day:'numeric',month:'long'}):'Без срока';
  const fields={text:title,kind,deadlineReminder:due?$('#work-deadline-reminder').value:'',major:$('#work-major').checked,subject:discipline,dueISO:due,due:original&&!dueChanged&&original.due?original.due:deadline,comment:$('#work-comment').value.trim()};
  let previous, index, newTask;
  if (original) {
   index=state.tasks.findIndex(task=>task.workId===original.workId);
   if(index<0 || state.tasks[index].done){toast('Работа уже выполнена или удалена');return}
   previous=state.tasks[index];
   state.tasks[index]={...previous,...fields};
  } else {newTask={...fields,done:false};state.tasks.push(newTask)}
  if(!save()){
   if(original)state.tasks[index]=previous;
   else state.tasks.pop();
   return;
  }
  $('#modal').close();
  renderTasks();
  refreshWorkCards();
  if(fields.deadlineReminder&&window.OrbitaAndroid?.notificationsAllowed?.()===false)window.OrbitaAndroid.requestLessonNotificationPermission?.();
  if(attach){
   const created=state.tasks.find(task=>task===newTask);
   if(created){addTask(null,{workId:created.workId});$('#work-attachment-action')?.click();return}
  }
  toast(original?'Изменения сохранены':'Работа добавлена');
 }
 $('#save-work-template').onclick=()=>saveWork();
 if(window.OrbitaAndroid?.attachWorkFile){
  if(original)showWorkAttachmentControls(original);
  else{
   const section=document.createElement('section');
   section.className='work-attachments';
   section.innerHTML='<button type="button" class="settings-link" id="new-work-attachment">📎 Прикрепить файл</button><p id="new-work-file-status" role="status"></p>';
   $('#save-work-template').before(section);
   $('#new-work-attachment').onclick=()=>saveWork(true);
  }
 }
};$('#add-task').onclick=$('#new-task').onclick=()=>addTask();
let completedOpen=false;
function changeWork(index,action){const previous=state.tasks.map(t=>({...t}));if(action==='delete')state.tasks.splice(index,1);else state.tasks[index].done=action==='done';if(!save()){state.tasks=previous;return}renderTasks();refreshWorkCards()}
renderTasks=function(){const active=pendingWorks(),done=state.tasks.map((t,index)=>({...t,index})).filter(t=>t.done);const row=t=>'<div class="task"><input type="checkbox" data-work-done="'+t.index+'" aria-label="Выполнить '+safe(t.text)+'"><div><b>'+safe(t.text)+'</b><p>'+safe(shortSubject(t.subject))+' · '+safe(t.due)+'</p>'+(t.comment?'<p>'+safe(t.comment)+'</p>':'')+'</div><button data-work-delete="'+t.index+'" aria-label="Удалить">×</button></div>';$('#task-list').innerHTML=active.slice(0,4).map(row).join('')||'<p class="work-empty">Нет несданных работ</p>';$('#full-tasks').innerHTML=active.map(row).join('')+'<button id="completed-toggle">Выполненные · '+done.length+'</button><div '+(completedOpen?'':'hidden')+'>'+done.map(t=>'<div class="task"><div><b>'+safe(t.text)+'</b><p>'+safe(shortSubject(t.subject))+'</p></div><button data-work-restore="'+t.index+'">Вернуть</button><button data-work-delete="'+t.index+'">×</button></div>').join('')+'</div>';$('#task-count').textContent=active.length;$('#completed-toggle').onclick=()=>{completedOpen=!completedOpen;renderTasks()};$$('[data-work-done]').forEach(b=>b.onchange=()=>changeWork(Number(b.dataset.workDone),'done'));$$('[data-work-delete]').forEach(b=>b.onclick=()=>changeWork(Number(b.dataset.workDelete),'delete'));$$('[data-work-restore]').forEach(b=>b.onclick=()=>changeWork(Number(b.dataset.workRestore),'restore'))};
const courseworkTools=[['mini-courses','Мои дисциплины','Предметы и быстрое добавление работ']];for(const [id,name,caption] of courseworkTools){const section=createMiniPage(id,miniBack()+'<div class="mini-heading"><h1>'+name+'</h1><p>'+caption+'</p></div><div id="'+id+'-body"></div>');section.querySelector('[data-mini-back]').onclick=()=>showPage('miniapps')}
const hubBeforeCoursework=renderMiniHub;renderMiniHub=function(){hubBeforeCoursework();for(const [id,name,caption] of courseworkTools){const b=document.createElement('button');b.className='mini-tile';b.innerHTML='<span class="mini-tile-top"><i>'+icon(id==='mini-courses'?'edit':'calendar')+'</i><span>↗</span></span><b>'+name+'</b><p>'+caption+'</p>';b.onclick=()=>showPage(id);$('#mini-grid').appendChild(b)}};
function paintCourseTools(){const subjects=courseSubjects();$('#mini-courses-body').innerHTML=subjects.map((s,i)=>'<button class="official-result" data-course-task="'+i+'"><span>'+safe(shortSubject(s))+'</span><small>+ Работа</small></button>').join('')||'<p>Загрузи расписание своей группы — здесь появятся предметы.</p>';$$('[data-course-task]').forEach(b=>b.onclick=()=>addTask(subjects[Number(b.dataset.courseTask)]));const rows=officialLessons(state.officialGroup,new Date()),gaps=lessonBreaks(rows);if($('#mini-windows-body'))$('#mini-windows-body').innerHTML=gaps.map(g=>'<article class="work-window"><b>'+breakTime(g.start)+'–'+breakTime(g.end)+'</b><p>'+g.duration+' минут между занятиями</p></article>').join('')||'<p>На сегодня загруженных перерывов нет.</p>'}
function workCardHtml(id,expanded){const pending=pendingWorks(),subjects=courseSubjects(),rows=officialLessons(state.officialGroup,new Date());let body='';if(id==='progress')body='<strong class="work-value">'+(state.tasks.length-pending.length)+' / '+state.tasks.length+'</strong><p>работ выполнено</p>'+ (expanded?'<p>Осталось: '+pending.length+'</p>':'')+'<button data-work-open="tasks">Все работы →</button>';if(id==='deadlines')body=pending.filter(t=>t.dueISO).slice(0,expanded?5:2).map(t=>'<p><b>'+safe(t.text)+'</b><br>'+safe(shortSubject(t.subject))+' · '+safe(t.due)+'</p>').join('')+'<button data-quick-work>+ Работа</button>';if(id==='rooms')body=rows.slice(0,expanded?8:2).map(l=>'<p><b>'+safe(l.start)+' · '+safe(l.room)+'</b><br>'+safe(l.campus)+'</p>').join('')+'<button data-work-open="campus">Карта корпуса →</button>';if(id==='subjects')body=subjects.slice(0,expanded?8:3).map((s,i)=>'<button data-card-subject="'+i+'">'+safe(shortSubject(s))+' ＋</button>').join('');if(id==='week'){let count=0;const list=[];for(let i=0;i<7;i++){const d=new Date();d.setDate(d.getDate()+i);const n=officialLessons(state.officialGroup,d).length;count+=n;list.push('<p>'+safe(d.toLocaleDateString('ru',{weekday:'short',day:'numeric'}))+' · '+n+' пар</p>')}body='<strong class="work-value">'+(officialCache[calendarKey(state.officialGroup)]?count:'—')+'</strong><p>пар за 7 дней</p>'+(expanded?list.join(''):'')+'<button data-work-open="pairs">Расписание →</button>'}if(id==='today')body='<strong class="work-value">'+new Date().getDate()+'</strong><p>'+safe(new Date().toLocaleDateString('ru',{weekday:'long',month:'long'}))+'</p><b>'+safe(state.group)+'</b>';if(id==='shortcuts')body='<div class="work-chips"><button data-work-open="campus">Карты</button><button data-work-open="tasks">Работы</button><button data-work-open="mini-courses">Предметы</button><button data-work-open="mini-notes">Заметки</button></div>';return '<div class="section-title"><h2>'+homeCatalog[id].name+'</h2></div>'+body}
function refreshWorkCards(){for(const item of currentHomeLayout()){const card=homeCards.get(item.id);if(!card)continue;const mode=item.detail||(item.id==='schedule'&&state.compact?'compact':item.height&&item.height>=320?'expanded':item.height&&item.height<=190||item.size==='small'&&!item.height?'compact':'normal');card.dataset.detail=mode;const content=card.querySelector(homeCatalog[item.id].selector||'.home-note');if(content)content.style.minHeight='';const extra=card.querySelector('.extra-card');if(extra)extra.innerHTML=workCardHtml(item.id,mode==='expanded');card.querySelectorAll('[data-work-open]').forEach(b=>b.onclick=()=>showPage(b.dataset.workOpen));card.querySelectorAll('[data-quick-work]').forEach(b=>b.onclick=()=>addTask());card.querySelectorAll('[data-card-subject]').forEach(b=>b.onclick=()=>addTask(courseSubjects()[Number(b.dataset.cardSubject)]))}
 let detail=homeCards.get('next').querySelector('.work-next-details');if(!detail){detail=document.createElement('div');detail.className='work-next-details';homeCards.get('next').querySelector('.next-copy').appendChild(detail)}const rows=officialLessons(state.officialGroup,new Date()),now=new Date(),minutes=now.getHours()*60+now.getMinutes();detail.innerHTML=rows.filter(l=>lessonMinutes(l.end)>minutes).slice(0,3).map(l=>'<p>'+safe(l.start)+' · '+safe(shortSubject(l.title))+'<br>'+safe(l.teacher)+'</p>').join('');let breaks=homeCards.get('break').querySelector('.work-break-details');if(!breaks){breaks=document.createElement('div');breaks.className='work-break-details';homeCards.get('break').querySelector('.stat-card').appendChild(breaks)}breaks.innerHTML=lessonBreaks(rows).map(g=>'<p>'+breakTime(g.start)+'–'+breakTime(g.end)+' · '+g.duration+' мин</p>').join('')}
const renderBeforeWorkCards=renderHome;renderHome=function(){renderBeforeWorkCards();refreshWorkCards();if(homeEditing)for(const item of homeDraft){const b=document.createElement('button');b.textContent='↔';b.setAttribute('aria-label','Содержимое и размер карточки');b.onclick=()=>{modal('<h2>Вид карточки</h2><p>Размер меняет количество деталей.</p><div class="work-chips">'+[['Компактная','small',180],['Кратко на всю ширину','large',180],['Обычная','large',240],['Подробная','large',360]].map(([name,size,height],i)=>'<button data-work-size="'+i+'">'+name+'</button>').join('')+'</div>');const options=[['small',180],['large',180],['large',240],['large',360]];$$('[data-work-size]').forEach(button=>button.onclick=()=>{const selected=Number(button.dataset.workSize);[item.size,item.height]=options[selected];item.detail=selected<2?'compact':selected===2?'normal':'expanded';$('#modal').close();renderHome()})};homeCards.get(item.id).querySelector('.card-edit-actions').prepend(b)}};
const finishBeforeContentResize=finishCardResize;finishCardResize=function(cancel=false){finishBeforeContentResize(cancel);refreshWorkCards()};
const pageBeforeCoursework=showPage;showPage=function(p){pageBeforeCoursework(p);if(p==='tasks')renderTasks();if(p==='miniapps')renderMiniHub();if(p==='mini-courses'||p==='mini-windows')paintCourseTools();if(p==='schedule')refreshWorkCards()};
state.lessonReminder=state.lessonReminder||{enabled:false,lead:30};
function reminderRows(){const result=[],lead=Number(state.lessonReminder.lead)||30;for(let i=0;i<35;i++){const date=new Date();date.setDate(date.getDate()+i);for(const lesson of officialLessons(state.officialGroup,date)){const starts=Date.parse(dateKey(date)+'T'+lesson.start+':00+03:00'),notifyAt=starts-lead*60000;if(notifyAt>Date.now())result.push({at:notifyAt,start:starts,title:lesson.title,room:lesson.room,campus:lesson.campus})}}return result}
function syncCourseReminders(){if(window.OrbitaAndroid?.lessonReminders)window.OrbitaAndroid.lessonReminders(JSON.stringify({enabled:state.lessonReminder.enabled,rows:state.lessonReminder.enabled?reminderRows():[]}))}
const reminderSettings=document.createElement('section');reminderSettings.className='settings-section';reminderSettings.innerHTML='<div class="settings-section-title"><span class="settings-section-icon">'+icon('bell')+'</span><div><h3>Перед парой</h3><p>Уведомления о занятиях твоей группы</p></div></div><label class="setting-row"><span>Напоминать перед парой</span><input id="lesson-reminder-enabled" type="checkbox"></label><p>За сколько напомнить?</p><div class="work-chips" id="lesson-reminder-leads"></div><p id="lesson-reminder-status"></p><p class="pairs-disclaimer">Напоминания создаются по загруженному расписанию на 35 дней. Открывай приложение при изменении расписания. Android может задерживать уведомления в режиме экономии энергии.</p>';$('.settings-about').before(reminderSettings);
function paintReminderSettings(){$('#lesson-reminder-enabled').checked=state.lessonReminder.enabled;$('#lesson-reminder-leads').innerHTML=[[5,'5 мин'],[15,'15 мин'],[30,'30 мин'],[60,'1 час'],[180,'3 часа'],[360,'6 часов'],[720,'12 часов'],[1440,'24 часа']].map(([value,name])=>'<button data-reminder-lead="'+value+'" class="'+(state.lessonReminder.lead===value?'selected':'')+'">'+name+'</button>').join('');$$('[data-reminder-lead]').forEach(b=>b.onclick=()=>{state.lessonReminder.lead=Number(b.dataset.reminderLead);save();syncCourseReminders();paintReminderSettings()});let allowed=false;try{allowed=!!window.OrbitaAndroid?.notificationsAllowed?.()}catch{}$('#lesson-reminder-status').textContent=!window.OrbitaAndroid?.lessonReminders?'Уведомления доступны в Android-приложении':state.lessonReminder.enabled?!allowed?'Разреши уведомления в настройках Android':'Запланировано напоминаний: '+reminderRows().length:'Уведомления выключены'}
$('#lesson-reminder-enabled').onchange=()=>{state.lessonReminder.enabled=$('#lesson-reminder-enabled').checked;save();if(state.lessonReminder.enabled)window.OrbitaAndroid?.requestLessonNotificationPermission?.();syncCourseReminders();paintReminderSettings()};
const syncBeforeReminders=syncWidgetLessons;syncWidgetLessons=function(){syncBeforeReminders();syncCourseReminders();refreshWorkCards()};window.addEventListener('focus',paintReminderSettings);
const workStyle=document.createElement('style');workStyle.textContent='.work-chips{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0}.work-chips button{padding:11px 13px;min-height:42px;border:1px solid var(--line);border-radius:14px;font-size:12px;color:var(--text);text-align:left}.work-chips button.selected{background:var(--accent);color:var(--on-accent);border-color:var(--accent)}.work-subjects{max-height:190px;overflow:auto}.work-value{display:block;font-size:30px;margin:14px 0}.extra-card p,.work-empty{font-size:12px;line-height:1.6;color:var(--muted)}.extra-card>button{display:block;color:var(--accent);font-size:12px;min-height:40px;text-align:left}.extra-card .section-title h2{font-size:16px}.task>div{flex:1;min-width:0}.task>button{padding:8px;min-width:34px;min-height:40px;color:var(--muted)}#completed-toggle{padding:18px 0;color:var(--accent)}.work-window{padding:20px;border:1px solid var(--line);border-radius:22px;background:var(--panel);margin:10px 0}.work-next-details,.work-break-details{display:none}.home-card[data-detail=expanded] .work-next-details,.home-card[data-detail=expanded] .work-break-details{display:block}.work-next-details p,.work-break-details p{font-size:12px;line-height:1.7;border-top:1px solid var(--line);padding-top:10px}.reference-ui .home-card[data-detail]>.next-card,.reference-ui .home-card[data-detail]>.stat-card,.reference-ui .home-card[data-detail]>.home-note,.reference-ui .home-card[data-detail]>.tasks-card{min-height:0!important;height:auto!important}.reference-ui .home-card[data-detail=compact]>.next-card,.reference-ui .home-card[data-detail=compact]>.stat-card,.reference-ui .home-card[data-detail=compact]>.home-note{padding:17px!important}.home-card[data-detail=compact] .subject-art,.home-card[data-detail=compact] .free-caption,.home-card[data-detail=compact] .stat-icon{display:none}.home-card[data-detail=compact] .next-card h2{font-size:16px!important;padding-right:0!important}.home-card[data-detail=compact] .next-place{margin-top:10px!important}.home-card[data-detail=compact] .lesson-live{margin-top:10px}.home-card[data-detail=compact] .pair-teacher,.home-card[data-detail=compact] .pair-meta,.home-card[data-detail=compact] .schedule-footer,.home-card[data-detail=compact] .day-title{display:none!important}.home-card[data-detail=compact] .pair-card{padding:11px 10px!important;gap:9px;min-height:0}.home-card[data-detail=compact] .pair-content h3{font-size:13px!important;margin:0;line-height:1.35}.home-card[data-detail=compact] .pair-time b{font-size:13px}.home-card[data-detail=compact] .pair-time span{font-size:11px}.home-card[data-detail=compact] .schedule-panel #lessons{max-height:210px;overflow:auto}.home-card[data-detail=compact] .schedule-panel .week-controls{font-size:11px}.home-card[data-detail=compact] .schedule-panel .section-title h2{font-size:15px}.home-card[data-detail=expanded] .schedule-panel #lessons{max-height:600px;overflow:auto}.home-card[data-detail=compact] .section-caption{display:none}.home-card[data-detail=compact] .task p{font-size:10px}.home-card[data-detail=compact] .task b{font-size:12px}.home-card[data-detail=compact] .section-title{margin-bottom:10px!important}.reference-ui #lesson-reminder-status{font-size:12px;line-height:1.6;color:var(--muted)}';document.head.appendChild(workStyle);
// Discontinued tools remain in old storage only; no saved notes or tasks are removed.
renderTasks();renderHome();paintReminderSettings();syncCourseReminders();save();

function openWidgetWork(action, workId){
 if(document.querySelector('#orbita-welcome')?.open)finishWelcome(false);
 const form=$('#save-work-template');
 if($('#modal').open && form && form.dataset.workId===(workId||''))return;
 if(action==='edit')addTask(null,{workId});
 else addTask(null,{dueToday:action==='addDue'});
}
