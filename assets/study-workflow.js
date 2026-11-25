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
  window.addControlTaskLink?.(original,$('#save-work-template'));
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
const coursePage=createMiniPage('mini-courses',`${miniBack()}
 <div class="mini-heading"><h1>Мои дисциплины</h1><p>Баллы БРС и работы по предметам</p></div>
 <div class="course-grade-toolbar">
  <div><p id="course-grade-status" role="status"></p><small id="course-grade-freshness"></small></div>
  <label class="course-semester-picker" hidden><select id="course-grade-semester" aria-label="Семестр БРС"></select>${courseChevron('down')}</label>
  <button type="button" id="course-grade-action" hidden></button>
 </div>
 <div id="course-grade-summary"></div>
 <div id="mini-courses-body"></div>`);
coursePage.querySelector('[data-mini-back]').onclick=()=>showPage('miniapps');
if(window.OrbitaAndroid?.openAttendanceScanner){
 const scanAttendance=document.createElement('button');
 scanAttendance.type='button';
 scanAttendance.className='settings-link';
 scanAttendance.innerHTML='<span>Сканировать QR посещения</span>'+courseChevron();
 scanAttendance.onclick=openAttendanceScanner;
 scanAttendance.className='course-scan';
 $('.course-grade-toolbar').after(scanAttendance);
}
const hubBeforeCoursework=renderMiniHub;
renderMiniHub=function(){
 hubBeforeCoursework();
 const tile=document.createElement('button');
 tile.className='mini-tile';
 tile.innerHTML='<span class="mini-tile-top"><i>'+icon('edit')+'</i><span>›</span></span><b>Мои дисциплины</b><p>Баллы БРС и быстрое добавление работ</p>';
 tile.onclick=()=>showPage('mini-courses');
 $('#mini-grid').appendChild(tile);
};
let courseGradeResult=readCachedCourseGrades(),courseGradeRequest=0,courseGradesLoading=false,selectedGradeTerm=null;
let courseGradeRefreshError=false;
const courseGradeMaxAge=5*60*1000;
const gradeNumbers=new Intl.NumberFormat('ru',{maximumFractionDigits:2});
const gradeNumber=value=>gradeNumbers.format(value);
const subjectKey=name=>name.toLocaleLowerCase('ru').replace(/ё/g,'е').replace(/[^а-яa-z0-9]+/g,' ').trim();
function readCachedCourseGrades(){
 try{
  const saved=JSON.parse(window.OrbitaAndroid?.cachedMireaGrades?.()||'null');
  return Array.isArray(saved?.courses)?saved:null;
 }catch{return null}
}
function refreshCourseGradesIfNeeded(){
 if(!courseGradeResult||(!courseGradeResult.error&&(courseGradeResult.schema!==2||Date.now()-(courseGradeResult.updated||0)>courseGradeMaxAge))){
  loadCourseGrades();
 }
}
const mireaReplyTimeouts=new Map();
function requestMireaReply(key, invoke, finish, wait=25000){
 const timeout=setTimeout(()=>finish({error:'timeout'}),wait);
 mireaReplyTimeouts.set(key,timeout);
 try{invoke()}catch{finish({error:'network'})}
}
function takeMireaReply(key){
 if(!mireaReplyTimeouts.has(key))return false;
 clearTimeout(mireaReplyTimeouts.get(key));
 mireaReplyTimeouts.delete(key);
 return true;
}
function resetAttendanceRequests(){
 attendanceByCourse.clear();
 attendanceRequests.clear();
 dailyAttendance.clear();
 dailyAttendanceRequests.clear();
 for(const key of mireaReplyTimeouts.keys())if(!key.startsWith('grades:'))takeMireaReply(key);
}
function loadCourseGrades(){
 if(!window.OrbitaAndroid?.loadMireaGrades||courseGradesLoading)return;
 courseGradesLoading=true;
 courseGradeRefreshError=false;
 if(page==='mini-courses')paintCourseTools();
 if(page==='mini-discipline')window.paintDiscipline?.();
 const request=++courseGradeRequest;
 requestMireaReply('grades:'+request,()=>window.OrbitaAndroid.loadMireaGrades(request),
  result=>window.orbitaMireaGrades(request,result));
}
window.orbitaMireaGrades=(request,result)=>{
 if(request!==courseGradeRequest||!takeMireaReply('grades:'+request))return;
 courseGradesLoading=false;
 if((result.error==='network'||result.error==='timeout')&&Array.isArray(courseGradeResult?.courses)){
  courseGradeRefreshError=true;
 }else{
  courseGradeResult=result;
 }
 if(page==='mini-courses')paintCourseTools();
 if(page==='mini-discipline')window.paintDiscipline?.();
 if(page==='pairs')renderPairs();
};
window.orbitaRefreshMireaGrades=()=>{
 takeMireaReply('grades:'+courseGradeRequest);
 ++courseGradeRequest;
 courseGradesLoading=false;
 courseGradeResult=readCachedCourseGrades();
 courseGradeRefreshError=false;
 resetAttendanceRequests();
 if(window.OrbitaAndroid?.cachedMireaGrades||page==='mini-courses'||page==='pairs')loadCourseGrades();
};
const attendanceByCourse=new Map(),attendanceRequests=new Map();
let attendanceRequestId=0,attendanceDialog=null;
const attendanceTypes={1:['Отсутствовал','absent'],2:['Уважительная причина','excused'],3:['Присутствовал','present']};
const lessonDateFormat=new Intl.DateTimeFormat('ru',{timeZone:'Europe/Moscow',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
// The Pulse history RPC is scoped to a discipline and journal, without a semester argument.
function requestCourseAttendance(id){
 if(!id||!window.OrbitaAndroid?.loadMireaAttendance||attendanceByCourse.has(id))return;
 attendanceByCourse.set(id,null);
 const request=++attendanceRequestId;
 attendanceRequests.set(request,id);
 requestMireaReply('course:'+request,()=>window.OrbitaAndroid.loadMireaAttendance(request,id),
  result=>window.orbitaMireaAttendance(request,result),55000);
}
window.orbitaMireaAttendance=(request,result)=>{
 const id=attendanceRequests.get(request);
 if(!id||!takeMireaReply('course:'+request))return;
 attendanceRequests.delete(request);
 const valid=result&&!result.error&&Array.isArray(result.entries)&&Number.isInteger(result.total)
  &&result.total===result.entries.length;
 const summaries=Array.isArray(result?.summaries)?result.summaries:[];
 attendanceByCourse.set(id,summaries.length?{summaries,updated:Date.now()}
  :valid?{...result,updated:Date.now()}:{error:result?.error||'format'});
 if(page==='mini-discipline')window.paintDiscipline?.();
 if(page==='mini-courses'&&[...$$('[data-sport-attendance]')].some(node=>node.dataset.sportAttendance===id))paintCourseTools();
 if(attendanceDialog?.id===id&&$('#course-attendance-content')&&$('#modal').open)paintAttendanceDialog();
 if(page==='pairs')renderPairs();
};
function selectedAttendanceSubgroup(){
 const group=state.pinnedGroup||state.officialGroup;
 const value=state.subgroups?.[calendarKey(group)];
 return /^\d{1,2}$/.test(value||'')?String(Number(value)):'';
}
function attendanceForSubgroup(rows,subgroup){
 return rows.filter(row=>row.variantVisible!==false&&(!subgroup||!row.subgroup||row.subgroup===subgroup));
}
function attendanceSubgroupNotice(rows,subgroup){
 const variant=rows.some(row=>row.variantVisible===true);
 if(!subgroup)return variant?'<p>Учтён выбранный вариант пары из настроек подгруппы.</p>':'';
 const unknown=rows.filter(row=>!row.subgroup&&!row.variantVisible).length;
 return `<p>Подгруппа ${subgroup}${unknown?' · записей без подгруппы: '+unknown:''}</p>`;
}
function attendanceLessonDetails(rows,name){
 const target=state.pinnedGroup||state.officialGroup;
 if(!target)return rows;
 const byMinute=new Map();
 for(const row of rows){
  const minute=Math.floor(row.start/60);
  byMinute.set(minute,(byMinute.get(minute)||0)+1);
 }
 const days=new Map(),subject=subjectKey(name);
 const variants=state.lessonVariants?.[calendarKey(target)];
 return rows.map(row=>{
  if(!row.teacher&&byMinute.get(Math.floor(row.start/60))!==1)return row;
  const {date,time}=moscowParts(new Date(row.start*1000));
  if(!days.has(date))days.set(date,officialUnfilteredLessons(target,new Date(date+'T12:00:00')));
  const candidates=days.get(date).filter(lesson=>subjectKey(lesson.title)===subject&&lesson.start===time
   &&(!row.subgroup||!lesson.subgroup||row.subgroup===lesson.subgroup));
  const matches=row.teacher?candidates.filter(lesson=>subjectKey(lesson.teacher||'')===subjectKey(row.teacher)):candidates;
  if(matches.length!==1)return row;
  const [lesson]=matches;
  const selected=variants?.[lessonVariantKey(lesson)];
  const parallel=selected&&parallelLessonSets(candidates).find(group=>group.includes(lesson)&&
   group.some(other=>lessonVariantId(other)===selected));
  return {...row,teacher:row.teacher||lesson.teacher,subgroup:row.subgroup||lesson.subgroup,
   variantVisible:parallel?lessonVariantId(lesson)===selected:undefined};
 });
}
function attendanceRowsHtml(rows,filter){
 const own=selectedAttendanceSubgroup();
 const visible=rows.filter(row=>filter==='all'||Number(filter)===row.type)
  .slice().sort((a,b)=>b.start-a.start);
 if(!visible.length)return rows.length?'<p>По этому фильтру отметок нет.</p>':'';
 return `<div class="attendance-rows">${visible.map(row=>{
  const [label,kind]=attendanceTypes[row.type]||['Статус неизвестен','unknown'];
  const subgroup=row.subgroup?(row.subgroup===own?'Моя подгруппа ':'Подгруппа ')+row.subgroup:row.variantVisible?'Мой вариант пары':'Подгруппа не указана';
  return `<div class="attendance-row ${kind}"><div class="attendance-lesson">
   <time>${lessonDateFormat.format(row.start*1000)}</time>
   <small>${safe(row.teacher||'Преподаватель не указан')}</small><small>${safe(subgroup)}</small>
  </div><b>${label}</b></div>`;
 }).join('')}</div>`;
}
function attendanceCountsHtml(rows,checked){
 const counts={1:0,2:0,3:0};
 for(const row of rows)if(row.type in counts)counts[row.type]++;
 const cells=[[counts[3],'Присутствия'],[counts[1],'Пропуски'],[counts[2],'Уважительные']];
 if(checked!==null)cells.push([checked,'Проверено дат']);
 const unknown=rows.length-counts[1]-counts[2]-counts[3];
 return `<div class="attendance-totals">${cells.map(([count,label])=>`<div><strong>${count}</strong><small>${label}</small></div>`).join('')}</div>
  ${unknown?`<p>Неизвестный статус: ${unknown}</p>`:''}`;
}
function paintAttendanceDialog(){
 const box=$('#course-attendance-content'),{id,filter}=attendanceDialog,info=attendanceByCourse.get(id);
 if(!info){
  box.innerHTML='<p>Загружаем посещения…</p>';
  if(attendanceDialog.daily)paintRecentCourseAttendance(box);
  return;
 }
 const scope='<p>Все доступные отметки по дисциплине. Они могут относиться к нескольким семестрам.</p>';
 const refresh='<button type="button" id="retry-course-attendance">'+(info.error==='login'?'Войти':info.error||info.partial?'Повторить':'Обновить')+'</button>';
 if(info.error){
  const message={login:'Войди в МИРЭА, чтобы посмотреть посещения.',timeout:'МИРЭА не ответила вовремя.',
   format:'Не удалось разобрать журнал МИРЭА.',journals:'МИРЭА не вернула доступные журналы.'};
  box.innerHTML='<p>'+(message[info.error]||'Не удалось загрузить посещения.')+'</p>'+refresh;
 }else if(info.summaries?.length){
  box.innerHTML=scope+(selectedAttendanceSubgroup()?'<p>Сводка Пульса без разбивки по подгруппам.</p>':'')+'<p>Пульс вернул сводку. Подробные отметки по датам недоступны.</p><p>'+safe(window.disciplineUpdated?.(info.updated)||'')+'</p>'+refresh+
   info.summaries.map((row,index)=>`<p>Журнал ${index+1} · Присутствий: ${row.present} · Пропусков: ${row.absent} · По уважительной причине: ${row.excused} · Всего занятий: ${row.total}</p>`).join('');
 }else if(!info.total){
  box.innerHTML=scope+'<p>МИРЭА не вернула отметок по предмету в доступных журналах.</p>'+refresh;
 }else{
  const subgroup=selectedAttendanceSubgroup(),rows=attendanceForSubgroup(attendanceLessonDetails(info.entries,attendanceDialog.name),subgroup);
  box.innerHTML=`${scope}${attendanceSubgroupNotice(rows,subgroup)}<p>Источник: журнал дисциплины Пульса</p>
   <p>${safe(window.disciplineUpdated?.(info.updated)||'')}</p>
   ${info.partial?'<p>Загружена часть журналов.</p>':''}${refresh}
   ${attendanceCountsHtml(rows,null)}${attendanceRowsHtml(rows,filter)}${rows.length?'':'<p>Отметок для выбранной подгруппы нет среди полученных записей.</p>'}`;
 }
 if((attendanceDialog.daily||!info.entries?.length)&&info.error!=='login')paintRecentCourseAttendance(box);
 $('#retry-course-attendance').onclick=()=>{
  if(info.error==='login'){openPulseGrades(true);$('#modal').close();return}
  refreshCourseDays(attendanceDialog,false);
  attendanceByCourse.delete(id);requestCourseAttendance(id);paintAttendanceDialog();
 };
}
function showCourseAttendance(id,name){
 attendanceDialog={id,name,dates:null,daily:false,period:'recent',paused:false,filter:'all'};
 if(attendanceByCourse.get(id)?.error && attendanceByCourse.get(id).error!=='login')attendanceByCourse.delete(id);
 modal(`<h2>Посещения по дисциплине</h2><p>${safe(name)}</p>
  ${window.OrbitaAndroid?.loadMireaDailyMarks?`<details id="attendance-period-options">
   <summary>Период дневного журнала</summary>
   <form id="attendance-period-form">
    <label>Период <select id="attendance-period"><option value="recent">Последние занятия</option>
     <option value="semester">Текущий семестр</option><option value="range">Диапазон дат</option></select></label>
    <div id="attendance-range" hidden><p id="attendance-range-hint"></p>
     <label>С <input type="date" id="attendance-from"></label>
     <label>По <input type="date" id="attendance-to"></label></div>
    <p id="attendance-period-error" role="status"></p><button type="submit">Показать отметки</button>
   </form></details>`:''}
  <label class="attendance-filter-label">Отметки <select id="attendance-mark-filter">
   <option value="all">Все</option><option value="3">Присутствовал</option><option value="1">Отсутствовал</option>
   <option value="2">Уважительная причина</option>
  </select></label><div id="course-attendance-content"></div>`);
 $('#attendance-mark-filter').onchange=event=>{attendanceDialog.filter=event.target.value;paintAttendanceDialog()};
 const selector=$('#attendance-period');
 if(selector){
  const range=$('#attendance-range');
  selector.onchange=()=>{
   range.hidden=selector.value==='recent';
   $('#attendance-range-hint').textContent=selector.value==='semester'
    ?'МИРЭА не передаёт границы семестра в этом разделе. Укажи даты по учебному календарю.':'';
  };
  $('#attendance-period-form').onsubmit=event=>{
   event.preventDefault();
   const dialog=attendanceDialog,period=selector.value;
   const from=$('#attendance-from').value,to=$('#attendance-to').value;
   if(period!=='recent'&&!validAttendanceRange(from,to)){
    $('#attendance-period-error').textContent='Выбери прошедший диапазон до 366 дней включительно.';
    return;
   }
   $('#attendance-period-error').textContent='';
   dialog.period=period;
   dialog.dates=recentCourseDates(dialog.name,period==='recent'?null:{from,to});
   dialog.range=period==='recent'?null:{from,to};
   dialog.daily=true;
   dialog.paused=false;
   paintAttendanceDialog();
  };
 }
 requestCourseAttendance(id);
 paintAttendanceDialog();
}
function ownPairsSelected(){
 const target=currentOfficialTarget(),own=state.pinnedGroup||state.officialGroup;
 return target?.target===1&&own?.target===1&&String(target.id)===String(own.id);
}
const dailyAttendance=new Map(),dailyAttendanceRequests=new Map();
let dailyAttendanceRequest=0;
function requestDailyAttendance(date){
 const key=dateKey(date);
 if(!window.OrbitaAndroid?.loadMireaDailyMarks||dailyAttendance.has(key)||dailyAttendanceRequests.size>=2||key>moscowParts(new Date()).date)return;
 dailyAttendance.set(key,null);
 if(dailyAttendance.size>400){
  const oldest=[...dailyAttendance].find(([,value])=>value!==null);
  if(oldest)dailyAttendance.delete(oldest[0]);
 }
 const request=++dailyAttendanceRequest;
 dailyAttendanceRequests.set(request,key);
 requestMireaReply('day:'+request,()=>window.OrbitaAndroid.loadMireaDailyMarks(request,key),
  result=>window.orbitaMireaDailyMarks(request,result));
}
window.orbitaMireaDailyMarks=(request,result)=>{
 const key=dailyAttendanceRequests.get(request);
 if(!key||!takeMireaReply('day:'+request))return;
 dailyAttendanceRequests.delete(request);
 result=Array.isArray(result?.entries)?{...result,updated:Date.now()}:{error:result?.error||'format'};
 dailyAttendance.set(key,result);
 if(page==='pairs'&&(dateKey(pairsDate)===key||!dailyAttendance.has(dateKey(pairsDate))))renderPairs();
 if(attendanceDialog?.dates&&$('#modal').open&&$('#course-attendance-content')){
  if(result?.error&&attendanceDialog.dates.some(date=>dateKey(date)===key))attendanceDialog.paused=true;
  paintAttendanceDialog();
 }
};
// Only dates found in the official schedule are queried. A date with no rows never implies absence.
function validAttendanceRange(from,to){
 const first=Date.parse(from+'T00:00:00Z'),last=Date.parse(to+'T00:00:00Z');
 return Number.isFinite(first)&&Number.isFinite(last)&&last>=first&&last-first<=365*86400000
  &&to<=moscowParts(new Date()).date;
}
function recentCourseDates(name,range){
 const group=state.pinnedGroup||state.officialGroup;
 if(!group)return [];
 const dates=[];
 const today=new Date((range?.to||moscowParts(new Date()).date)+'T12:00:00');
 const subject=subjectKey(name),limit=range?366:90;
 for(let offset=0;offset<limit;offset++){
  const date=new Date(today);
  date.setDate(today.getDate()-offset);
  if(range&&dateKey(date)<range.from)break;
  if(officialLessons(group,date).some(lesson=>subjectKey(lesson.title)===subject))dates.push(date);
  if(!range&&dates.length>=6)break;
 }
 return dates;
}
function refreshCourseDays(dialog,force){
 for(const date of dialog.dates||[]){
  const key=dateKey(date),cached=dailyAttendance.get(key);
  if(cached&&(force||cached.error))dailyAttendance.delete(key);
 }
 dialog.paused=false;
}
function summarizeCourseDays(dialog){
 const subject=subjectKey(dialog.name),identified=new Map(),distinct=[];
 let checked=0,failed=0,updated=0;
 for(const date of dialog.dates){
  const result=dailyAttendance.get(dateKey(date));
  if(result?.error){failed++;continue}
  if(!Array.isArray(result?.entries))continue;
  checked++;
  updated=Math.max(updated,result.updated||0);
  for(const mark of result.entries){
   if(mark.disciplineId?mark.disciplineId!==dialog.id:subjectKey(mark.subject||'')!==subject)continue;
   if(!Number.isFinite(mark.start)||moscowParts(new Date(mark.start*1000)).date!==dateKey(date))continue;
   const entry={...mark,type:attendanceTypes[mark.type]?mark.type:0};
   if(!mark.lessonId){distinct.push(entry);continue}
   const previous=identified.get(mark.lessonId);
   if(!previous)identified.set(mark.lessonId,entry);
   else if(previous.type!==entry.type)identified.set(mark.lessonId,{...previous,type:0});
  }
 }
 return {checked,failed,updated,rows:[...distinct,...identified.values()].sort((a,b)=>b.start-a.start)};
}
function paintRecentCourseAttendance(box){
 if(!window.OrbitaAndroid?.loadMireaDailyMarks)return;
 const dialog=attendanceDialog;
 if(!dialog.dates)dialog.dates=recentCourseDates(dialog.name,null);
 const missing=dialog.dates.find(date=>!dailyAttendance.has(dateKey(date)));
 if(!dialog.paused&&missing&&!dailyAttendanceRequests.size&&navigator.onLine!==false)requestDailyAttendance(missing);
 const {checked,failed,updated,rows:allRows}=summarizeCourseDays(dialog);
 const subgroup=selectedAttendanceSubgroup(),rows=attendanceForSubgroup(attendanceLessonDetails(allRows,dialog.name),subgroup);
 const range=dialog.range||(dialog.dates.length?{from:dateKey(dialog.dates.at(-1)),to:dateKey(dialog.dates[0])}:null);
 const status=!dialog.dates.length?'В загруженном расписании нет дат по этой дисциплине.'
  :navigator.onLine===false?'Нет сети. Показаны доступные сохранённые отметки.'
  :dialog.paused?'Часть запросов завершилась ошибкой. Можно продолжить.'
  :checked===dialog.dates.length?'Проверены все найденные в расписании даты.':'Проверка дат продолжается…';
 const full=attendanceByCourse.get(dialog.id);
 const heading=dialog.period==='recent'?'Последние занятия':dialog.period==='semester'?'Текущий семестр':'Выбранный диапазон';
 box.insertAdjacentHTML('beforeend',`<section id="attendance-daily"><h3>${heading}</h3>
  <p>Источник: дневной журнал Пульса</p>${attendanceSubgroupNotice(rows,subgroup)}
  ${range?`<p>${safe(range.from)} — ${safe(range.to)}</p>`:''}
  ${updated?`<p>${safe(window.disciplineUpdated?.(updated)||'')}</p>`:''}
  ${dialog.dates.length?`<p role="status">Проверено ${checked} из ${dialog.dates.length} дат · получено записей: ${rows.length}${failed?' · ошибок: '+failed:''}</p>`:''}
  <p>${full?.entries?.length&&!full.partial?'Дневная выборка за проверенные даты.':'Показаны отметки за проверенные занятия. Полный журнал пока недоступен.'}</p>
  <p>${status}</p>
  ${dialog.dates.length?`<button type="button" id="attendance-refresh-days">${failed?'Повторить и продолжить':'Обновить даты'}</button>`:''}
  ${checked?attendanceCountsHtml(rows,checked):''}${attendanceRowsHtml(rows,dialog.filter)}</section>`);
 const retry=$('#attendance-refresh-days');
 if(retry)retry.onclick=()=>{refreshCourseDays(dialog,!failed);paintAttendanceDialog()};
}
window.addEventListener('online',()=>{
 if(attendanceDialog&&$('#modal').open&&$('#course-attendance-content')){
  refreshCourseDays(attendanceDialog,false);
  paintAttendanceDialog();
 }
});
function retryVisibleAttendance(){
 if(document.hidden||page!=='pairs'||pairsMode!=='day'||!ownPairsSelected())return;
 const day=dateKey(pairsDate);
 const cached=dailyAttendance.get(day);
 if(cached?.error&&cached.error!=='login')dailyAttendance.delete(day);
 for(const [id,result] of attendanceByCourse)if(result?.error&&result.error!=='login')attendanceByCourse.delete(id);
 requestDailyAttendance(pairsDate);
}
window.addEventListener('online',retryVisibleAttendance);
document.addEventListener('visibilitychange',retryVisibleAttendance);
function lessonAttendance(lesson,date,request=false){
 if(!ownPairsSelected())return null;
 const epoch=Date.parse(`${dateKey(date)}T${lesson.start}:00+03:00`)/1000;
 if(!Number.isFinite(epoch)||epoch>Date.now()/1000)return null;
 const key=subjectKey(shortSubject(lesson.title));
 const sameSubject=name=>subjectKey(shortSubject(name))===key;
 const scheduleMatches=pairsData(date).filter(other=>other.start===lesson.start&&sameSubject(other.title));
 const variants=new Set(scheduleMatches.map(other=>JSON.stringify([other.type,other.teacher,other.room,other.end])));
 if(variants.size!==1)return null;
 const dayKey=dateKey(date);
 if(request)requestDailyAttendance(date);
 const direct=dailyAttendance.get(dayKey);
 const sameTime=entry=>Math.floor(entry.start/60)===Math.floor(epoch/60);
 let matches=direct?.entries?.filter(entry=>sameTime(entry)&&sameSubject(entry.subject))||[];
 if(!matches.length){
  if(dailyAttendance.has(dayKey)&&!direct)return null;
  const courses=(courseGradeResult?.courses||[]).filter(course=>course.id&&sameSubject(course.name));
  const keys=[...new Set(courses.map(course=>course.id))];
  if(keys.length!==1)return null;
  if(request)requestCourseAttendance(keys[0]);
  matches=attendanceByCourse.get(keys[0])?.entries?.filter(sameTime)||[];
 }
 const statuses=[...new Set(matches.map(mark=>mark.type).filter(type=>attendanceTypes[type]))];
 if(statuses.length!==1)return null;
 const [type]=statuses,[text,kind]=attendanceTypes[type];
 return {type,text,kind};
}
const pairCardBeforeAttendance=pairCard;
pairCard=function(lesson,date,next){
 const html=pairCardBeforeAttendance(lesson,date,next);
 if(page!=='pairs')return html;
 const mark=lessonAttendance(lesson,date,pairsMode==='day');
 return mark?html.replace('<div class="pair-meta">',`<div class="pair-meta"><span class="pair-attendance ${mark.kind}">${mark.text}</span>`):html;
};
const attendanceDay=document.createElement('section');
attendanceDay.className='pairs-attendance-day';
attendanceDay.hidden=true;
$('#pairs-count').after(attendanceDay);
const renderPairsBeforeAttendance=renderPairs;
renderPairs=function(){
 renderPairsBeforeAttendance();
 attendanceDay.hidden=page!=='pairs'||pairsMode!=='day'||!ownPairsSelected()||!window.OrbitaAndroid?.loadMireaAttendance;
 if(!attendanceDay.hidden)requestDailyAttendance(pairsDate);
 if(attendanceDay.hidden)return;
 const rows=pairsData(pairsDate);
 if(!rows.length){attendanceDay.hidden=true;return}
 const counts={1:0,2:0,3:0};
 for(const row of rows){
  const mark=lessonAttendance(row,pairsDate,true);
  if(mark)counts[mark.type]++;
 }
 const marked=counts[1]+counts[2]+counts[3];
 attendanceDay.hidden=marked===0;
 if(!marked)return;
 attendanceDay.innerHTML=`<span>Был <b>${counts[3]}</b></span><span>Не был <b>${counts[1]}</b></span>${counts[2]?`<span>Уважительная <b>${counts[2]}</b></span>`:''}`;

};
window.orbitaRefreshAttendance=()=>{
 resetAttendanceRequests();
 if(page==='pairs')renderPairs();
 if(page==='mini-courses')paintCourseTools();
 if(page==='mini-discipline')window.paintDiscipline?.();
};
function isPhysicalEducation(name){
 return /физическ(?:ая|ой) культур|физкультур/i.test(name);
}
function sportAttendanceHtml(score){
 if(!score.id||!window.OrbitaAndroid?.loadMireaAttendance)return '';
 const attendance=attendanceByCourse.get(score.id);
 const summary=score.lessons>0?`Присутствовал: ${score.present} из ${score.lessons}`:'';
 const text=summary||(!attendance?'Загружаем посещения…':attendance.error?'Посещения недоступны':attendance.summaries?.length?'Доступна сводка Пульса':attendance.total
  ?`Присутствовал: ${attendance.present} из ${attendance.total} · Пропусков: ${attendance.absent} · Все доступные журналы`:'Отметок пока нет');
 return `<p class="course-sport-attendance" data-sport-attendance="${safe(score.id)}">${text}</p>`;
}
function courseScoreHtml(score){
 if(!score)return '';
 const {total,maximum,categories=[]}=score;
 const ordered=['Текущий контроль','Посещения','Семестровый контроль','Достижения','Дополнительные'];
 const details=categories.slice().sort((a,b)=>ordered.indexOf(a.name)-ordered.indexOf(b.name));
 const sport=isPhysicalEducation(score.name);
 const goal=score.threshold;
 const goalName=score.thresholdName==='тройки'?'тройки':'зачёта';
 const hasGoal=Number.isFinite(goal)&&goal>0;
 const remainingGoal=Number.isFinite(total)&&hasGoal?Math.max(0,goal-total):null;
 const progress=Number.isFinite(total)&&maximum>0?Math.max(0,Math.min(100,total/maximum*100)):null;
 let remaining=progress??0;
 const segments=details.map(detail=>{
  const kind=Math.max(0,ordered.indexOf(detail.name));
  const size=Math.max(0,Math.min(remaining,detail.points/maximum*100));
  if(!Number.isFinite(size)||size<=0)return '';
  remaining-=size;
  return `<span data-score-category="${kind}" style="width:${size}%"></span>`;
 }).join('');
 return `<div class="course-score">${!sport||Number.isFinite(total)?`<div class="course-score-total"><small>БРС</small>

 <strong>${Number.isFinite(total)?gradeNumber(total):'—'}</strong>${maximum>0?`<span>из ${gradeNumber(maximum)}</span>`:''}</div>`:''}
 ${sport?sportAttendanceHtml(score):''}
 ${progress===null?'':`<div class="course-score-track" role="progressbar" aria-label="Баллы БРС" aria-valuemin="0" aria-valuemax="${maximum}" aria-valuenow="${Math.min(maximum,Math.max(0,total))}">${segments}<span style="width:${remaining}%"></span>${hasGoal?`<i class="brs-goal-marker" style="left:${Math.min(100,goal/maximum*100)}%" aria-hidden="true"></i>`:''}</div>`}
 ${details.length?`<div class="course-score-categories">${details.map(detail=>`<span data-score-category="${Math.max(0,ordered.indexOf(detail.name))}">${safe(detail.name)} <b>${gradeNumber(detail.points)}${detail.maximum>0?' / '+gradeNumber(detail.maximum):''}</b></span>`).join('')}</div>`:''}
 ${remainingGoal!==null?`<p class="brs-goal-caption">${remainingGoal===0?`Порог до ${goalName} достигнут`:`До ${goalName}: ${gradeNumber(remainingGoal)} балла`}</p>`:''}
 ${score.id&&window.OrbitaAndroid?.loadMireaAttendance?('<button type="button" class="course-attendance-link"><span>История посещений</span>'+courseChevron()+'</button>'):''}
 </div>`;
}
function paintCourseTools(){
 const status=$('#course-grade-status'),action=$('#course-grade-action'),result=courseGradeResult;
 const available=!!window.OrbitaAndroid?.loadMireaGrades,login=result?.error==='login';
 const hasSavedScores=Array.isArray(result?.courses);
 const freshness=$('#course-grade-freshness');
 freshness.textContent=hasSavedScores
  ?(courseGradesLoading?'Обновляем…':courseGradeRefreshError?'Сохранённые баллы · не удалось обновить':window.disciplineUpdated?.(result.updated)||'')
  :'';
 freshness.hidden=!freshness.textContent;
 const semester=$('#course-grade-semester');
 const terms=[...new Set((result?.courses||[]).map(course=>course.term).filter(term=>Number.isInteger(term)&&term>0))].sort((a,b)=>b-a);
 if(!terms.includes(selectedGradeTerm))selectedGradeTerm=terms[0]??null;
 semester.parentElement.hidden=terms.length<2;
 semester.innerHTML=terms.map(term=>`<option value="${term}">${term} семестр</option>`).join('');
 if(selectedGradeTerm!==null)semester.value=String(selectedGradeTerm);
 semester.onchange=()=>{selectedGradeTerm=Number(semester.value);paintCourseTools()};
 status.textContent=!available?'БРС доступна в приложении Android':courseGradesLoading&&!hasSavedScores?'Загружаем БРС…':login?'Войди в МИРЭА для просмотра баллов':result?.error==='timeout'?'МИРЭА не ответила вовремя':result?.error?'Не удалось загрузить баллы':terms.length>1?'Баллы БРС':result?.term?`${result.term} семестр`:result?.courses?.length?'Баллы БРС':result?'МИРЭА пока не вернула баллы':'Баллы БРС';
 action.hidden=!available||courseGradesLoading;
 action.textContent=login?'Войти':result?.error||courseGradeRefreshError?'Повторить':'Обновить';
 action.onclick=login?()=>openPulseGrades(true):loadCourseGrades;
 const visibleScores=(result?.courses||[]).filter(score=>selectedGradeTerm===null||score.term===selectedGradeTerm);
 const subjects=new Map(visibleScores.map(score=>[subjectKey(score.name),{name:score.name,score}]));
 if(page==='mini-courses'){
  for(const {score} of subjects.values())if(isPhysicalEducation(score.name)&&!(score.lessons>0))requestCourseAttendance(score.id);
 }
 const totals=visibleScores.map(score=>score.total).filter(Number.isFinite);
 $('#course-grade-summary').innerHTML=totals.length?`<div class="course-summary"><div><strong>${gradeNumber(totals.reduce((a,b)=>a+b,0)/totals.length)}</strong><span>Средний балл</span></div><div><strong>${visibleScores.length}</strong><span>Дисциплин в БРС</span></div></div>`:'';
 if(!hasSavedScores){
  for(const name of window.scheduledDisciplines?.()||[])subjects.set(subjectKey(name),{name,score:null});
 }
 const rowsBySubject=[...subjects.values()].sort((a,b)=>a.name.localeCompare(b.name,'ru'));
 $('#mini-courses-body').innerHTML=rowsBySubject.map(({name,score},index)=>`<article class="course-discipline">
 <div class="course-discipline-heading"><h2><button type="button" class="discipline-open" data-open-discipline="${index}">${safe(name)} ${courseChevron()}</button></h2><button type="button" data-course-task="${index}">+ Работа</button></div>
 ${courseScoreHtml(score)}</article>`).join('')||(!courseGradesLoading&&!result?.error&&result?'<p>В этом семестре нет дисциплин в БРС.</p>':'');
 $$('[data-open-discipline]').forEach(button=>{
  const row=rowsBySubject[Number(button.dataset.openDiscipline)];
  button.onclick=()=>window.openDiscipline?.(row.name,row.score);
 });
 $$('[data-course-task]').forEach(button=>{
  const {name,score}=rowsBySubject[Number(button.dataset.courseTask)];
  button.onclick=()=>addTask(name);
  const card=button.closest('.course-discipline');
  const history=card.querySelector('.course-attendance-link');
  if(history)history.onclick=()=>showCourseAttendance(score.id,name);
 });
 const rows=officialLessons(state.officialGroup,new Date()),gaps=lessonBreaks(rows);if($('#mini-windows-body'))$('#mini-windows-body').innerHTML=gaps.map(g=>'<article class="work-window"><b>'+breakTime(g.start)+'–'+breakTime(g.end)+'</b><p>'+g.duration+' минут между занятиями</p></article>').join('')||'<p>На сегодня загруженных перерывов нет.</p>'}
function workCardHtml(id,expanded){const pending=pendingWorks(),subjects=courseSubjects(),rows=officialLessons(state.officialGroup,new Date());let body='';if(id==='attendanceQr')return `<button type="button" class="home-qr-action" data-open-attendance-qr><span class="home-qr-symbol">${attendanceScannerIcon}</span><span class="home-qr-copy"><b>QR посещения</b><small>Отметиться на паре</small></span><span class="home-qr-arrow">${courseChevron()}</span></button>`;if(id==='progress')body='<strong class="work-value">'+(state.tasks.length-pending.length)+' / '+state.tasks.length+'</strong><p>работ выполнено</p>'+ (expanded?'<p>Осталось: '+pending.length+'</p>':'')+'<button data-work-open="tasks">Все работы →</button>';if(id==='deadlines')body=pending.filter(t=>t.dueISO).slice(0,expanded?5:2).map(t=>'<p><b>'+safe(t.text)+'</b><br>'+safe(shortSubject(t.subject))+' · '+safe(t.due)+'</p>').join('')+'<button data-quick-work>+ Работа</button>';if(id==='rooms')body=rows.slice(0,expanded?8:2).map(l=>'<p><b>'+safe(l.start)+' · '+safe(l.room)+'</b><br>'+safe(l.campus)+'</p>').join('')+'<button data-work-open="campus">Карта корпуса →</button>';if(id==='subjects')body=subjects.slice(0,expanded?8:3).map((s,i)=>'<button data-card-subject="'+i+'">'+safe(shortSubject(s))+' ＋</button>').join('');if(id==='week'){let count=0;const list=[];for(let i=0;i<7;i++){const d=new Date();d.setDate(d.getDate()+i);const n=officialLessons(state.officialGroup,d).length;count+=n;list.push('<p>'+safe(d.toLocaleDateString('ru',{weekday:'short',day:'numeric'}))+' · '+n+' пар</p>')}body='<strong class="work-value">'+(officialCache[calendarKey(state.officialGroup)]?count:'—')+'</strong><p>пар за 7 дней</p>'+(expanded?list.join(''):'')+'<button data-work-open="pairs">Расписание →</button>'}if(id==='today')body='<strong class="work-value">'+new Date().getDate()+'</strong><p>'+safe(new Date().toLocaleDateString('ru',{weekday:'long',month:'long'}))+'</p><b>'+safe(state.group)+'</b>';if(id==='shortcuts')body='<div class="work-chips"><button data-work-open="campus">Карты</button><button data-work-open="tasks">Работы</button><button data-work-open="mini-courses">Предметы</button><button data-work-open="mini-notes">Заметки</button></div>';return '<div class="section-title"><h2>'+homeCatalog[id].name+'</h2></div>'+body}
function refreshWorkCards(){for(const item of currentHomeLayout()){const card=homeCards.get(item.id);if(!card)continue;const mode=item.detail||(item.id==='schedule'&&state.compact?'compact':item.height&&item.height>=320?'expanded':item.height&&item.height<=190||item.size==='small'&&!item.height?'compact':'normal');card.dataset.detail=mode;const content=card.querySelector(homeCatalog[item.id].selector||'.home-note');if(content)content.style.minHeight='';const extra=card.querySelector('.extra-card');if(extra)extra.innerHTML=workCardHtml(item.id,mode==='expanded');card.querySelectorAll('[data-work-open]').forEach(b=>b.onclick=()=>showPage(b.dataset.workOpen));card.querySelectorAll('[data-open-attendance-qr]').forEach(b=>b.onclick=openAttendanceScanner);card.querySelectorAll('[data-quick-work]').forEach(b=>b.onclick=()=>addTask());card.querySelectorAll('[data-card-subject]').forEach(b=>b.onclick=()=>addTask(courseSubjects()[Number(b.dataset.cardSubject)]))}
 let detail=homeCards.get('next').querySelector('.work-next-details');if(!detail){detail=document.createElement('div');detail.className='work-next-details';homeCards.get('next').querySelector('.next-copy').appendChild(detail)}const rows=officialLessons(state.officialGroup,new Date()),now=new Date(),minutes=now.getHours()*60+now.getMinutes();detail.innerHTML=rows.filter(l=>lessonMinutes(l.end)>minutes).slice(0,3).map(l=>'<p>'+safe(l.start)+' · '+safe(shortSubject(l.title))+'<br>'+safe(l.teacher)+'</p>').join('');let breaks=homeCards.get('break').querySelector('.work-break-details');if(!breaks){breaks=document.createElement('div');breaks.className='work-break-details';homeCards.get('break').querySelector('.stat-card').appendChild(breaks)}breaks.innerHTML=lessonBreaks(rows).map(g=>'<p>'+breakTime(g.start)+'–'+breakTime(g.end)+' · '+g.duration+' мин</p>').join('')}
const renderBeforeWorkCards=renderHome;renderHome=function(){renderBeforeWorkCards();refreshWorkCards();if(homeEditing)for(const item of homeDraft){const b=document.createElement('button');b.textContent='↔';b.setAttribute('aria-label','Содержимое и размер карточки');b.onclick=()=>{modal('<h2>Вид карточки</h2><p>Размер меняет количество деталей.</p><div class="work-chips">'+[['Компактная','small',180],['Кратко на всю ширину','large',180],['Обычная','large',240],['Подробная','large',360]].map(([name,size,height],i)=>'<button data-work-size="'+i+'">'+name+'</button>').join('')+'</div>');const options=[['small',180],['large',180],['large',240],['large',360]];$$('[data-work-size]').forEach(button=>button.onclick=()=>{const selected=Number(button.dataset.workSize);[item.size,item.height]=options[selected];item.detail=selected<2?'compact':selected===2?'normal':'expanded';$('#modal').close();renderHome()})};homeCards.get(item.id).querySelector('.card-edit-actions').prepend(b)}};
const finishBeforeContentResize=finishCardResize;finishCardResize=function(cancel=false){finishBeforeContentResize(cancel);refreshWorkCards()};
const pageBeforeCoursework=showPage;showPage=function(p){pageBeforeCoursework(p);if(p==='tasks')renderTasks();if(p==='miniapps')renderMiniHub();if(p==='mini-courses'||p==='mini-windows')paintCourseTools();if(p==='mini-courses'||(p==='pairs'&&ownPairsSelected()))refreshCourseGradesIfNeeded();if(p==='schedule')refreshWorkCards()};
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
