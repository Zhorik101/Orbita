// Manual control events share the existing profile, task editor and Calendar Provider.
let controlFilter='all';
let controlCalendarRequest=0;
const pendingControlCalendar=new Map();

function disciplineControlEvents(course){
 return state.controlEvents.filter(event=>{
  if(event.term&&course.term&&event.term!==course.term)return false;
  return event.courseId&&course.id?event.courseId===course.id:subjectKey(event.courseName)===subjectKey(course.name);
 }).sort((a,b)=>(a.date||'9999').localeCompare(b.date||'9999')||a.time.localeCompare(b.time)||a.title.localeCompare(b.title,'ru'));
}
function controlStatusNow(event){
 return controlStatus(event,moscowParts(new Date()).date,Date.now());
}
function controlDateLabel(event){
 if(!event.date)return 'Дата не назначена';
 const date=new Date(event.date+'T12:00:00').toLocaleDateString('ru');
 return date+(event.time?' · '+event.time+' МСК':'');
}
function controlScoreLabel(event){
 if(event.earned===null&&event.maximum===null)return 'Баллы не указаны';
 return event.earned===null?'Максимум '+gradeNumber(event.maximum)
  :gradeNumber(event.earned)+(event.maximum===null?' балла':' из '+gradeNumber(event.maximum));
}
function controlOptions(values,selected){
 return Object.entries(values).map(([value,label])=>
  `<option value="${value}"${selected===value?' selected':''}>${label}</option>`).join('');
}
window.controlEventsPanel=course=>{
 const events=disciplineControlEvents(course);
 const rows=events.filter(event=>controlFilter==='all'||controlStatusNow(event)===controlFilter);
 const completed=events.filter(event=>controlStatusNow(event)==='completed').length;
 const overdue=events.filter(event=>controlStatusNow(event)==='overdue').length;
 return disciplinePanel('Мероприятия текущего контроля',`
  <p>Ручные записи · выполнено ${completed} из ${events.length} · просрочено ${overdue}</p>
  <p>МИРЭА передаёт сводные баллы БРС. Отдельные МТК и их вклад в БРС пока недоступны в Орбите.</p>
  <button type="button" id="add-control-event">+ Мероприятие</button>
  <label class="control-field">Статус <select id="control-status-filter">${controlOptions({all:'Все статусы',...controlStatuses},controlFilter)}</select></label>
  ${rows.length?`<ul>${rows.map(event=>`<li><button type="button" data-control-event="${event.id}">${safe(event.title)}</button>
   <small>${controlTypes[event.type]} · ${safe(controlDateLabel(event))}</small>
   <small>${controlStatuses[controlStatusNow(event)]} · ${safe(controlScoreLabel(event))}</small>
   <small>Добавлено вручную</small></li>`).join('')}</ul>`
  :`<p>${events.length?'Под выбранный статус ничего не подходит.':'Мероприятий пока нет.'}</p>`}`);
};
window.bindControlEvents=(overview,course)=>{
 overview.querySelector('#add-control-event').onclick=()=>editControlEvent(course);
 overview.querySelector('#control-status-filter').onchange=event=>{
  controlFilter=event.target.value;
  paintDiscipline();
  $('#control-status-filter').focus();
 };
 overview.querySelectorAll('[data-control-event]').forEach(button=>button.onclick=()=>showControlEvent(button.dataset.controlEvent));
};

function commitControlEvents(events,tasks=state.tasks){
 const previousEvents=state.controlEvents,previousTasks=state.tasks;
 state.controlEvents=events;
 state.tasks=tasks;
 if(!save()){
  state.controlEvents=previousEvents;
  state.tasks=previousTasks;
  return false;
 }
 renderTasks();
 refreshWorkCards();
 paintDiscipline();
 return true;
}
function editControlEvent(course,original){
 const item=original||{};
 const field=(id,label,type,limit,value)=>`<label class="control-field">${label}
  <input id="control-${id}" type="${type}" ${limit} value="${safe(value??'')}"></label>`;
 modal(`<h2>${original?'Изменить мероприятие':'Новое мероприятие'}</h2><p>${safe(course.name)}</p>
  <form id="control-form">
  ${field('title','Название','text','required maxlength="160"',item.title)}
  <label class="control-field">Тип <select id="control-type">${controlOptions(controlTypes,item.type||'other')}</select></label>
  ${field('date','Дата или срок сдачи','date','',item.date)}
  ${field('time','Время (МСК)','time','',item.time)}
  ${field('earned','Получено баллов','number','min="0" max="100000" step="any"',item.earned)}
  ${field('maximum','Максимум баллов','number','min="0" max="100000" step="any"',item.maximum)}
  <label class="control-field">Статус <select id="control-status">${controlOptions({
   planned:controlStatuses.planned,completed:controlStatuses.completed,review:controlStatuses.review
  },item.status||'planned')}</select></label>
  <label class="control-field">Заметка <textarea id="control-notes" rows="3" maxlength="2000">${safe(item.notes||'')}</textarea></label>
  <p id="control-form-error" role="status"></p>
  <div class="control-actions"><button class="primary" type="submit">Сохранить мероприятие</button><button type="button" id="control-cancel">Отмена</button></div></form>`);
 $('#control-cancel').onclick=()=>original?showControlEvent(original.id):$('#modal').close();
 $('#control-form').onsubmit=event=>{
  event.preventDefault();
  const read=id=>$('#control-'+id).value;
  const number=id=>read(id)===''?null:Number(read(id));
  const date=read('date'),time=read('time'),earned=number('earned'),maximum=number('maximum');
  const error=$('#control-form-error');
  if((date&&!controlDateValid(date))||(time&&!date)){error.textContent='Укажи корректную дату для выбранного времени.';return}
  if(earned!==null&&maximum!==null&&earned>maximum){error.textContent='Полученные баллы превышают максимум.';return}
  const entry=cleanControlEvent({...item,id:item.id||newControlId(),courseId:course.id,courseName:course.name,term:course.term,
   title:read('title'),type:read('type'),date,time,earned,maximum,status:read('status'),notes:read('notes')});
  if(!entry){error.textContent='Введи название мероприятия.';return}
  const next=original?state.controlEvents.map(current=>current.id===entry.id?entry:current):[...state.controlEvents,entry];
  if(commitControlEvents(next))showControlEvent(entry.id);
 };
}
function newControlId(){
 return 'mtk_'+Array.from(crypto.getRandomValues(new Uint8Array(16)),byte=>byte.toString(16).padStart(2,'0')).join('');
}
function controlCourse(event){
 return {name:event.courseName,id:event.courseId,term:event.term};
}
function showControlEvent(id){
 const event=state.controlEvents.find(item=>item.id===id);
 if(!event)return;
 const task=controlTaskFor(event,state.tasks);
 modal(`<h2>${safe(event.title)}</h2><p>${safe(event.courseName)} · Добавлено вручную</p>
  <p>${controlTypes[event.type]} · ${safe(controlDateLabel(event))}</p>
  <p>${controlStatuses[controlStatusNow(event)]} · ${safe(controlScoreLabel(event))}</p>
  ${event.notes?`<p class="control-notes">${safe(event.notes)}</p>`:''}
  <p>${task?'Связанная задача · '+safe(task.text)+(task.done?' · выполнена':''):event.taskId?'Связанная задача удалена.':''}</p>
  <div class="work-chips">
   <button type="button" id="control-edit">Изменить</button>
   <button type="button" id="control-task">${task?'Открыть задачу':'Создать задачу'}</button>
   <button type="button" id="control-link">Привязать задачу</button>
   ${event.taskId?'<button type="button" id="control-unlink">Убрать связь</button>':''}
   <button type="button" id="control-calendar">Добавить или изменить в Google Календаре</button>
   <button type="button" id="control-delete">Удалить мероприятие</button>
  </div><div id="control-extra"></div>`);
 $('#control-edit').onclick=()=>editControlEvent(controlCourse(event),event);
 $('#control-task').onclick=()=>openOrCreateControlTask(id);
 $('#control-link').onclick=()=>pickControlTask(event);
 if(event.taskId)$('#control-unlink').onclick=()=>linkControlTask(id,'');
 $('#control-calendar').onclick=()=>editControlCalendar(event);
 $('#control-delete').onclick=()=>{
  $('#control-extra').innerHTML='<p>Связанная задача и событие Google Календаря сохранятся.</p><button type="button" id="control-confirm-delete">Подтвердить удаление МТК</button>';
  $('#control-confirm-delete').onclick=()=>{
   if(commitControlEvents(state.controlEvents.filter(item=>item.id!==id)))$('#modal').close();
  };
 };
}
function linkControlTask(id,taskId,newTask){
 if(taskId&&state.controlEvents.some(item=>item.id!==id&&item.taskId===taskId)){
  toast('Эта задача уже связана с другим мероприятием');
  return false;
 }
 const events=state.controlEvents.map(item=>item.id===id?{...item,taskId}:item);
 const tasks=newTask?[...state.tasks,newTask]:state.tasks;
 if(!commitControlEvents(events,tasks))return false;
 showControlEvent(id);
 return true;
}
function openOrCreateControlTask(id){
 const event=state.controlEvents.find(item=>item.id===id);
 if(!event)return;
 const linked=controlTaskFor(event,state.tasks);
 if(linked){
  if(linked.done){
   modal(`<h2>${safe(linked.text)}</h2><p>Задача выполнена</p><p>${safe(linked.comment||'')}</p><button type="button" id="done-control-discipline">Перейти к дисциплине</button>`);
   $('#done-control-discipline').onclick=()=>openControlDiscipline(event);
  }else addTask(null,{workId:linked.workId});
  return;
 }
 const task=makeControlTask(event,'work_'+newControlId().slice(4),event.date?controlDateLabel({...event,time:''}):'Без срока');
 linkControlTask(id,task.workId,task);
}
function pickControlTask(event){
 const used=new Set(state.controlEvents.filter(item=>item.id!==event.id).map(item=>item.taskId));
 const candidates=state.tasks.filter(task=>task.workId&&!used.has(task.workId));
 const root=$('#control-extra');
 root.innerHTML=candidates.length?`<label class="control-field">Задача <select id="control-task-choice">${candidates.map((task,index)=>
  `<option value="${index}"${task.workId===event.taskId?' selected':''}>${safe(task.text)} · ${safe(task.subject||'Личное')}</option>`).join('')}</select></label>
  <button type="button" id="control-task-confirm">Сохранить связь</button>`:'<p>Нет свободных задач для привязки.</p>';
 if(candidates.length)$('#control-task-confirm').onclick=()=>linkControlTask(event.id,candidates[Number($('#control-task-choice').value)].workId);
}
function openControlDiscipline(event){
 $('#modal').close();
 const score=courseGradeResult?.courses?.find(item=>item.id===event.courseId&&item.term===event.term);
 window.openDiscipline(event.courseName,score||{id:event.courseId,term:event.term});
}
window.addControlTaskLink=(task,anchor)=>{
 const event=state.controlEvents.find(item=>item.taskId===task.workId);
 if(!event)return;
 const button=document.createElement('button');
 button.type='button';
 button.className='settings-link';
 button.textContent='Перейти к дисциплине · '+event.courseName;
 button.onclick=()=>openControlDiscipline(event);
 anchor.after(button);
 button.classList.add('control-task-discipline');
};

function editControlCalendar(event){
 const root=$('#control-extra');
 if(!window.OrbitaAndroid?.saveControlCalendar){
  root.textContent='Запись в Google Календарь доступна в Android-приложении.';
  return;
 }
 const destinations=readCalendarTargets();
 if(!destinations.permission){
  root.innerHTML='<p>Разреши доступ к календарю, затем снова открой форму.</p><button type="button" id="control-calendar-access">Разрешить доступ</button>';
  $('#control-calendar-access').onclick=()=>window.OrbitaAndroid.requestCalendarAccess();
  return;
 }
 const calendars=(destinations.calendars||[]).filter(calendar=>calendar.accountType==='com.google');
 if(!calendars.length){root.textContent='На телефоне нет доступного для записи Google Календаря.';return}
 root.innerHTML=`<form id="control-calendar-form">
  <label class="control-field">Google Календарь <select id="control-calendar-id">${calendars.map(calendar=>
   `<option value="${Number(calendar.id)}">${safe(calendar.name)} · ${safe(calendar.account)}</option>`).join('')}</select></label>
  <label class="control-field">Название <input id="control-calendar-title" required maxlength="450" value="${safe(event.courseName+' · '+event.title)}"></label>
  <label class="control-field">Дата <input id="control-calendar-date" type="date" required value="${safe(event.date)}"></label>
  <label class="control-field">Время (МСК) <input id="control-calendar-time" type="time" value="${safe(event.time)}"></label>
  <p>Событие со временем длится час, без времени занимает весь день. Повторное сохранение обновит событие, созданное из этого МТК.</p>
  <button class="primary" type="submit">Сохранить в календаре</button><p id="control-calendar-result" role="status"></p>
  </form>`;
 const form=$('#control-calendar-form');
 const configured=state.calendarAutoSync?.id;
 if(calendars.some(calendar=>Number(calendar.id)===Number(configured)))$('#control-calendar-id').value=String(configured);
 form.onsubmit=async submit=>{
  submit.preventDefault();
  const button=form.querySelector('button'),status=$('#control-calendar-result');
  const timing=controlCalendarTiming($('#control-calendar-date').value,$('#control-calendar-time').value);
  if(!timing){status.textContent='Выбери дату события.';return}
  button.disabled=true;
  status.textContent='Сохраняем…';
  try{
   const response=await saveControlCalendar({id:event.id,calendar:Number($('#control-calendar-id').value),
    title:$('#control-calendar-title').value.trim(),description:event.notes,...timing});
   status.textContent=response.ok?'Сохранено в календаре телефона. Google синхронизирует запись при подключении к сети.':response.error;
  }catch(error){status.textContent=error.message}
  finally{button.disabled=false}
 };
}
function saveControlCalendar(payload){
 return new Promise((resolve,reject)=>{
  const id=++controlCalendarRequest;
  const timeout=setTimeout(()=>{
   pendingControlCalendar.delete(id);
   reject(new Error('Календарь не ответил. Повторное сохранение не создаст копию.'));
  },25000);
  pendingControlCalendar.set(id,result=>{clearTimeout(timeout);resolve(result)});
  try{window.OrbitaAndroid.saveControlCalendar(id,JSON.stringify(payload))}
  catch(error){clearTimeout(timeout);pendingControlCalendar.delete(id);reject(error)}
 });
}
window.orbitaControlCalendarResult=(id,result)=>{
 const complete=pendingControlCalendar.get(id);
 if(!complete)return;
 pendingControlCalendar.delete(id);
 complete(result);
};
