const academicDebtsPage=createMiniPage('mini-academic-debts',`
 <button type="button" class="mini-back" id="academic-debts-back">← Мини-приложения</button>
 <div class="mini-heading"><h1>Долги</h1><p>Академические задолженности РТУ МИРЭА</p></div>
 <section class="course-discipline discipline-panel">
  <h2>Официальные данные о задолженностях недоступны</h2>
  <p>Сверь экзамены и зачёты в кабинете МИРЭА. Пересдачи из ведомости можно добавить сюда вручную.</p>
  <a class="academic-debts-portal" href="https://lk.mirea.ru/auth.php">Личный кабинет МИРЭА ↗</a>
 </section><div id="academic-retakes"></div>`);
$('#academic-debts-back').onclick=()=>showPage('miniapps');
const debtsPage=createMiniPage('mini-debts',`
 <button type="button" class="mini-back" id="debts-back">← Назад</button>
 <div class="mini-heading"><h1>Незавершённые работы</h1></div><div id="debts-content"></div>`);
const debtFilters={all:'Все',overdue:'Просроченные',open:'Незавершённые',review:'Требуют проверки'};
let debtScope=null,debtFilter='all',debtSort='date',debtSubject='';
const debtDateOrder=(a,b)=>(a.date||'9999').localeCompare(b.date||'9999');
const debtSubjectOrder=(a,b)=>a.subject.localeCompare(b.subject,'ru');
const debtSorters={date:debtDateOrder,subject:debtSubjectOrder,kind:(a,b)=>a.kind.localeCompare(b.kind,'ru')};

function debtRows(){
 const now=new Date();
 return collectDebts(state.tasks,[],state.debtMarks,moscowParts(now).date,+now);
}
function debtMatchesCourse(row,course){
 const event=row.event;
 if(event?.term&&course.term&&event.term!==course.term)return false;
 if(event?.courseId&&course.id)return event.courseId===course.id;
 const names=[...new Set((courseGradeResult?.courses||[]).map(score=>score.name))];
 if(!names.includes(course.name))names.push(course.name);
 return disciplineTaskMatches(row.subject,course.name,names);
}
function debtDateLabel(date){
 return date?controlDateLabel({date}):'Без срока';
}
function openDebts(course=null){
 debtScope=course;
 debtFilter='all';
 debtSubject='';
 showPage('mini-debts');
 window.scrollTo(0,0);
}
function closeDebts(){
 if(!debtScope){showPage('miniapps');return}
 const {name,id,term}=debtScope;
 window.openDiscipline(name,{id,term});
}
$('#debts-back').onclick=closeDebts;

window.disciplineDebtsPanel=course=>{
 const rows=debtRows().filter(row=>debtMatchesCourse(row,course));
 const next=rows.map(row=>row.date).filter(Boolean).sort()[0];
 return disciplinePanel('Незавершённые работы',`
  <p>${rows.length?`Записей: ${rows.length}${next?' · Ближайший срок: '+safe(debtDateLabel(next)):''}`:'Открытых записей нет.'}</p>
  <button type="button" id="discipline-open-debts">Открыть работы</button>`);
};
window.bindDisciplineDebts=(overview,course)=>{
 overview.querySelector('#discipline-open-debts').onclick=()=>openDebts(course);
};
function debtCard(row,index){
 const {task,event}=row;
 const details=[
  task?`Личная задача · ${row.workOverdue?'Просрочена':task.done?'Выполнена':'Не завершена'} · ${debtDateLabel(row.taskDue)}`:'',
  event?`Ручное МТК · ${controlStatuses[controlStatusNow(event)]} · ${controlDateLabel(event)}`:''
 ].filter(Boolean);
 return `<article class="course-discipline discipline-panel debt-card" data-debt-row="${index}">
  <h2>${safe(row.title)}</h2><p>${safe(row.subject)} · ${safe(row.kind)}</p>
  ${details.map(detail=>`<p>${safe(detail)}</p>`).join('')}
  ${row.marks.map(mark=>`<p>Личная пометка · ${mark.label}</p>`).join('')}
  <div class="debt-actions">
   ${task?'<button type="button" data-debt-action="task">Открыть задачу</button>':''}
   ${row.taskOpen?'<button type="button" data-debt-action="complete">Выполнено</button>':''}
   ${event?'<button type="button" data-debt-action="event">Открыть МТК</button>':''}
   ${row.taskOpen?`<button type="button" data-debt-action="task-deadline">${event?'Срок задачи':'Изменить срок'}</button>`:''}
   ${event?`<button type="button" data-debt-action="event-deadline">${row.taskOpen?'Срок МТК':'Изменить срок'}</button>`:''}
   <button type="button" data-debt-action="course">К дисциплине</button>
   <button type="button" data-debt-action="mark">${row.marks.length?'Изменить пометку':'Добавить пометку'}</button>
  </div></article>`;
}
function paintDebts(){
 if(page!=='mini-debts')return;
 const root=$('#debts-content');
 const rows=debtRows().filter(row=>!debtScope||debtMatchesCourse(row,debtScope));
 const subjects=[...new Set(rows.map(row=>row.subject))].sort((a,b)=>a.localeCompare(b,'ru'));
 if(debtSubject&&!subjects.includes(debtSubject))debtSubject='';
 const available=rows.filter(row=>!debtSubject||row.subject===debtSubject);
 const counts=['open','overdue','review'].map(key=>available.filter(row=>row[key]).length);
 const visible=available.filter(row=>debtFilter==='all'||row[debtFilter])
  .sort((a,b)=>debtSorters[debtSort](a,b)||debtDateOrder(a,b)||a.title.localeCompare(b.title,'ru'));
 const title=debtScope?`<p class="debt-scope">${safe(debtScope.name)}</p><button type="button" id="debts-clear-scope">Все дисциплины</button>`:'';
 root.innerHTML=`${title}<div class="course-summary debt-summary">
  ${['Незавершённые','Просроченные','Требуют проверки'].map((label,i)=>`<div><strong>${counts[i]}</strong><span>${label}</span></div>`).join('')}</div>
  <div class="debt-controls">
   <label class="control-field">Статус <select id="debt-filter">${controlOptions(debtFilters,debtFilter)}</select></label>
   <label class="control-field">Сортировка <select id="debt-sort">${controlOptions({date:'По сроку',subject:'По дисциплине',kind:'По типу'},debtSort)}</select></label>
   ${debtScope?'':`<label class="control-field">Дисциплина <select id="debt-subject"><option value="">Все дисциплины</option>
   ${subjects.map(name=>`<option value="${safe(name)}"${name===debtSubject?' selected':''}>${safe(name)}</option>`).join('')}</select></label>`}
  </div>
  ${visible.map(debtCard).join('')||'<p>Под выбранные фильтры ничего не подходит.</p>'}`;
 const bindSelect=(id,set)=>{
  const select=$(id);
  if(select)select.onchange=()=>{set(select.value);paintDebts();$(id)?.focus()};
 };
 bindSelect('#debt-filter',value=>debtFilter=value);
 bindSelect('#debt-sort',value=>debtSort=value);
 bindSelect('#debt-subject',value=>debtSubject=value);
 if(debtScope)$('#debts-clear-scope').onclick=()=>{debtScope=null;paintDebts()};
 root.querySelectorAll('[data-debt-action]').forEach(button=>button.onclick=()=>{
  const row=visible[Number(button.closest('[data-debt-row]').dataset.debtRow)];
  runDebtAction(row,button.dataset.debtAction);
 });
}
function openDebtTask(task){
 if(!task.done){addTask(null,{workId:task.workId});return}
 modal(`<h2>${safe(task.text)}</h2><p>${safe(task.subject||'Личное')} · Выполнена</p><p>${safe(task.comment||'')}</p>`);
}
function runDebtAction(row,action){
 const {task,event}=row;
 switch(action){
  case 'task': openDebtTask(task);break;
  case 'complete':{
   const index=state.tasks.findIndex(candidate=>candidate.workId===task.workId);
   if(changeWork(index,'done'))paintDebts();
   break;
  }
  case 'task-deadline':addTask(null,{workId:task.workId});break;
  case 'event-deadline':editControlEvent(controlCourse(event),event);break;
  case 'event':showControlEvent(event.id);break;
  case 'course':
   if(event)openControlDiscipline(event);
   else{
    const scores=[...(courseGradeResult?.courses||[])].sort((a,b)=>b.term-a.term);
    const names=[...new Set(scores.map(score=>score.name))];
    const score=scores.find(candidate=>disciplineTaskMatches(task.subject,candidate.name,names));
    window.openDiscipline(score?.name||row.subject,score);
   }
   break;
  case 'mark':{
   const keys=[event&&'event:'+event.id,task&&'task:'+task.workId].filter(Boolean);
   if(keys.length===1)editDebtMark(keys[0]);
   else{
    modal('<h2>Пометка</h2><div class="work-chips"><button type="button" id="debt-mark-event">Для МТК</button><button type="button" id="debt-mark-task">Для задачи</button></div>');
    $('#debt-mark-event').onclick=()=>editDebtMark(keys[0]);
    $('#debt-mark-task').onclick=()=>editDebtMark(keys[1]);
   }
   break;
  }
 }
}
function editDebtMark(key,returnTo){
 modal(`<h2>Личная пометка</h2><p>Пометка хранится на телефоне и не меняет БРС.</p>
 <label class="control-field">Пометка <select id="debt-mark-value">${controlOptions({none:'Без пометки',...debtMarkLabels},state.debtMarks[key]||'none')}</select></label>
 <button type="button" class="primary" id="debt-save-mark">Сохранить пометку</button>`);
 $('#debt-save-mark').onclick=()=>{
  const old=state.debtMarks;
  const value=$('#debt-mark-value').value;
  state.debtMarks={...old};
  if(value==='none')delete state.debtMarks[key];
  else state.debtMarks[key]=value;
  if(!save()){state.debtMarks=old;return}
  if(returnTo)returnTo();else $('#modal').close();
  paintDebts();
  window.paintDiscipline?.();
 };
}
window.addDebtMarkAction=(key,anchor,returnTo)=>{
 const button=document.createElement('button');
 button.type='button';
 button.className='settings-link';
 button.textContent='Пометка о проверке или пересдаче';
 button.onclick=()=>editDebtMark(key,returnTo);
 anchor.after(button);
};

const hubBeforeDebts=renderMiniHub;
renderMiniHub=function(){
 hubBeforeDebts();
 const entries=[
  ['mini-academic-debts','Долги','Академические задолженности МИРЭА',()=>showPage('mini-academic-debts')],
  ['mini-debts','Незавершённые работы','Личные задачи и пометки',()=>openDebts()]
 ];
 for(const [destination,title,caption,open] of entries){
  const tile=document.createElement('button');
  tile.type='button';
  tile.className='mini-tile';
  tile.dataset.miniOpen=destination;
  tile.innerHTML='<span class="mini-tile-top"><i>'+icon('check')+'</i><span>›</span></span><b>'+title+'</b><p>'+caption+'</p>';
  tile.onclick=open;
  $('#mini-grid').appendChild(tile);
 }
};
const pageBeforeDebts=showPage;
showPage=function(destination){
 pageBeforeDebts(destination);
 if(destination==='mini-debts')paintDebts();
 if(destination==='mini-academic-debts')paintAcademicRetakes();
};
const backBeforeDebts=handleAppBack;
handleAppBack=function(){
 if(page==='mini-debts'){closeDebts();return true}
 if(page==='mini-academic-debts'){showPage('miniapps');return true}
 return backBeforeDebts();
};
$('#modal').addEventListener('close',paintDebts);

function paintAcademicRetakes(){
 const root=$('#academic-retakes');
 const rows=[...state.academicRetakes].sort((a,b)=>Number(a.done)-Number(b.done)
  ||(a.date||'9999').localeCompare(b.date||'9999'));
 const items=rows.map(item=>`<li><button type="button" data-retake="${item.id}">${safe(item.subject)}</button>
  <small>${item.kind==='exam'?'Экзамен':'Зачёт'} · ${item.term?item.term+' семестр · ':''}${item.date?safe(debtDateLabel(item.date)):'Дата уточняется'} · ${item.done?'Закрыто':'К пересдаче'}</small></li>`).join('');
 root.innerHTML=disciplinePanel('Мои пересдачи',`<p>Записи из ведомости, внесённые вручную.</p>
  <button type="button" id="add-retake">+ Пересдача</button>${items?`<ul>${items}</ul>`:''}`);
 $('#add-retake').onclick=()=>editAcademicRetake();
 root.querySelectorAll('[data-retake]').forEach(button=>button.onclick=()=>
  editAcademicRetake(rows.find(item=>item.id===button.dataset.retake)));
}
function commitAcademicRetakes(records){
 const previous=state.academicRetakes;
 state.academicRetakes=records;
 if(!save()){state.academicRetakes=previous;return}
 $('#modal').close();
 if(page==='mini-academic-debts')paintAcademicRetakes();
 if(page==='mini-discipline')window.paintDiscipline?.();
}
function editAcademicRetake(item,course){
 modal(`<h2>${item?'Пересдача':'Добавить пересдачу'}</h2>
 <form id="retake-form">
 <label class="control-field">Дисциплина <input id="retake-subject" maxlength="160" required value="${safe(item?.subject||course?.name||'')}"${course?' readonly':''}></label>
 <label class="control-field">Семестр <input id="retake-term" type="number" min="1" max="99" value="${item?.term||course?.term||''}"${course?.term?' readonly':''}></label>
 <label class="control-field">Вид контроля <select id="retake-kind">${controlOptions({exam:'Экзамен',credit:'Зачёт'},item?.kind||'exam')}</select></label>
 <label class="control-field">Дата <input id="retake-date" type="date" value="${safe(item?.date||'')}"></label>
 <label class="setting-row"><span>Задолженность закрыта</span><input type="checkbox" id="retake-done"${item?.done?' checked':''}></label>
 <button type="submit" class="primary">Сохранить</button>
 ${item?'<button type="button" id="delete-retake">Удалить запись</button>':''}
 </form>`);
 $('#retake-form').onsubmit=event=>{
  event.preventDefault();
  const subject=$('#retake-subject').value.trim();
  if(!subject){$('#retake-subject').focus();return}
  const [entry]=cleanAcademicRetakes([{id:item?.id||'retake_'+newControlId().slice(4),subject,
   term:Number($('#retake-term').value)||null,courseId:course?.id||(
    item?.subject===subject&&item.term===(Number($('#retake-term').value)||null)?item.courseId:''),
   date:$('#retake-date').value,kind:$('#retake-kind').value,done:$('#retake-done').checked}]);
  commitAcademicRetakes(item?state.academicRetakes.map(row=>row.id===item.id?entry:row):[...state.academicRetakes,entry]);
 };
 if(item)$('#delete-retake').onclick=()=>commitAcademicRetakes(state.academicRetakes.filter(row=>row.id!==item.id));
}

function courseRetakes(course){
 return state.academicRetakes.filter(item=>item.term===(course.term||null)&&
  (item.courseId&&course.id?item.courseId===course.id:subjectKey(item.subject)===subjectKey(course.name)));
}
window.courseRetakeBadge=course=>{
 const open=courseRetakes(course).filter(item=>!item.done).length;
 return open?`<p class="course-sport-attendance">Мои пересдачи · ${open}</p>`:'';
};
window.courseRetakesPanel=course=>{
 const rows=courseRetakes(course);
 return disciplinePanel('Пересдачи',`<p>Записи, добавленные вручную.</p>
  <button type="button" id="add-course-retake">+ Пересдача</button>
  ${rows.length?`<ul>${rows.map(item=>`<li><button type="button" data-course-retake="${item.id}">${item.kind==='exam'?'Экзамен':'Зачёт'} · ${item.done?'Закрыто':'К пересдаче'}</button>
   <small>${item.date?safe(debtDateLabel(item.date)):'Дата уточняется'}</small></li>`).join('')}</ul>`:''}`);
};
window.bindCourseRetakes=(overview,course)=>{
 overview.querySelector('#add-course-retake').onclick=()=>editAcademicRetake(null,course);
 overview.querySelectorAll('[data-course-retake]').forEach(button=>button.onclick=()=>
  editAcademicRetake(courseRetakes(course).find(item=>item.id===button.dataset.courseRetake),course));
};
