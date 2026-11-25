// Read-only study overview. Tasks, grades and schedules keep their existing stores.
const disciplinePage=createMiniPage('mini-discipline',`
 <button type="button" class="mini-back" id="discipline-back">← Мои дисциплины</button>
 <div class="mini-heading"><h1 id="discipline-title"></h1><p id="discipline-term"></p></div>
 <div id="discipline-overview"></div>`);
let openedDiscipline=null;
let disciplineScheduleRequest=null;
const disciplineTimestamp=new Intl.DateTimeFormat('ru',{dateStyle:'short',timeStyle:'short'});
window.disciplineUpdated=updated=>Number.isFinite(updated)&&updated>0
 ?'Обновлено '+disciplineTimestamp.format(updated):'';
const disciplineBack=()=>showPage('mini-courses');
$('#discipline-back').onclick=disciplineBack;

function disciplineSchedule(days=14){
 const today=new Date();
 today.setHours(12,0,0,0);
 return Array.from({length:days},(_,offset)=>{
  const date=new Date(today);
  date.setDate(today.getDate()+offset);
  return officialLessons(state.officialGroup,date).map(lesson=>({date,lesson}));
 }).flat();
}
window.scheduledDisciplines=()=>[...new Set(disciplineSchedule().map(({lesson})=>lesson.title))];
window.openDiscipline=(name,score)=>{
 openedDiscipline={name,id:score?.id,term:score?.term??null};
 showPage('mini-discipline');

};
function disciplineTaskMatches(taskName,discipline,courses){
 if(typeof taskName!=='string')return false;
 const key=subjectKey(taskName);
 if(key===subjectKey(discipline))return true;
 const alias=subjectKey(shortSubject(discipline));
 return key===alias&&courses.filter(name=>subjectKey(shortSubject(name))===alias).length===1;
}
function disciplinePanel(title,body){
 return `<section class="course-discipline discipline-panel"><h2>${title}</h2>${body}</section>`;
}
function disciplineTaskList(tasks,completed=false){
 return tasks.map((task,index)=>`<li>${!completed&&task.workId
  ?`<button type="button" data-discipline-task="${index}">${safe(task.text)}</button>`
  :`<b>${safe(task.text)}</b>`}
  ${task.due?`<small>${safe(task.due)}</small>`:''}${task.comment?`<p>${safe(task.comment)}</p>`:''}</li>`).join('');
}
function paintDiscipline(){
 if(page!=='mini-discipline'||!openedDiscipline)return;
 const {id,name,term}=openedDiscipline;
 const result=courseGradeResult;
 const courses=result?.courses||[];
 const latestTerm=Math.max(0,...courses.map(course=>course.term||0));
 const score=courses.find(course=>course.term===(term??latestTerm)
  &&(id?course.id===id:subjectKey(course.name)===subjectKey(name)));
 requestCourseAttendance(score?.id);
 const attendance=score?.id?attendanceByCourse.get(score.id):null;
 const activeTerm=!term||!latestTerm||term===latestTerm;
 const group=state.officialGroup;
 const scheduleCache=officialCache[calendarKey(group)];
 const slots=activeTerm?disciplineSchedule():[];
 const matchingNames=[...new Map([...courses.filter(course=>course.term===term).map(course=>course.name),name]
  .map(title=>[subjectKey(title),title])).values()];
 const tasks=state.tasks.filter(task=>disciplineTaskMatches(task.subject,name,matchingNames));
 const pending=tasks.filter(task=>!task.done).sort((a,b)=>(a.dueISO||'9999').localeCompare(b.dueISO||'9999'));
 const completed=tasks.filter(task=>task.done);
 const now=Date.now();
 const upcoming=slots.filter(({date,lesson})=>subjectKey(lesson.title)===subjectKey(name)
  &&Date.parse(dateKey(date)+'T'+lesson.start+':00+03:00')>=now).slice(0,8);
 $('#discipline-title').textContent=name;
 $('#discipline-term').textContent=(score?.term||term)?`${score?.term||term} семестр`:'Семестр в расписании не указан';
 const gradesStatus=[courseGradesLoading?'Обновляем баллы…':courseGradeRefreshError?'Не удалось обновить · показаны сохранённые баллы':'',
  score?window.disciplineUpdated(result.updated):''].filter(Boolean).join(' · ');
 const attendanceStatus=attendance?.error==='login'?'Войди в МИРЭА для просмотра отметок'
  :attendance?.error==='format'?'Не удалось разобрать журнал МИРЭА'
  :attendance?.error?'Не удалось загрузить посещаемость'
  :attendance?.summaries?.length?'Доступна сводка Пульса · по журналам'
  :attendance?attendance.total?`Присутствий: ${attendance.present} · Пропусков: ${attendance.absent} · Всего: ${attendance.total}${attendance.partial?' · часть журналов':''} · Без разбивки по семестрам`:'Отметок пока нет'
  :score?.id&&window.OrbitaAndroid?.loadMireaAttendance?'Загружаем посещаемость…':'Посещаемость недоступна';
 const scheduleStatus=!activeTerm?'Для прошедшего семестра предстоящие пары не показываются.'
  :!group?'Сначала выбери свою группу.':disciplineScheduleRequest||(!scheduleCache?'Расписание ещё не загружено.':'Пар по этому предмету на ближайшие 14 дней нет.');
 const slotRows=upcoming.map(({date,lesson},index)=>`<li><button type="button" data-discipline-lesson="${index}">${safe(date.toLocaleDateString('ru',{day:'numeric',month:'long'}))} · ${safe(lesson.start)}</button>
  <small>${[lesson.type,lesson.subgroup?'Подгруппа '+lesson.subgroup:'',lesson.room,lesson.campus,lesson.teacher].filter(Boolean).map(safe).join(' · ')}</small></li>`).join('');
 $('#discipline-overview').innerHTML=
  disciplinePanel('Баллы БРС',`<p role="status">${safe(gradesStatus)}</p>
   ${score?courseScoreHtml(score):`<p>${courseGradesLoading?'Загружаем баллы…':result?.error==='login'?'Войди в МИРЭА для просмотра баллов.':result?.error?'Не удалось загрузить баллы.':'Баллы по этому предмету недоступны.'}</p>`}
   ${window.OrbitaAndroid?.loadMireaGrades&&!courseGradesLoading?`<button type="button" data-discipline-action="grades">${result?.error==='login'?'Войти':'Обновить БРС'}</button>`:''}`)
  +disciplinePanel('Посещаемость по дисциплине',`<p role="status">${safe(attendanceStatus)}</p><p>${safe(window.disciplineUpdated(attendance?.updated))}</p>
   ${score?.id&&window.OrbitaAndroid?.loadMireaAttendance?`<button type="button" data-discipline-action="attendance">${attendance?.error?'Повторить':'История посещений'}</button>`:''}`)
  +disciplinePanel('Предстоящие пары',`${slotRows?`<ul>${slotRows}</ul>`:''}
   <p role="status">${safe(upcoming.length?disciplineScheduleRequest||'':scheduleStatus)}</p>
   <p>${safe(window.disciplineUpdated(scheduleCache?.updated))}</p>
   ${activeTerm&&group?`<button type="button" data-discipline-action="schedule"${disciplineScheduleRequest==='Обновляем расписание…'?' disabled':''}>Обновить расписание</button>`:''}`)
  +(window.disciplineDebtsPanel?.({name,id:score?.id||id,term:score?.term||term})||'')
  +disciplinePanel('Личные задания',`<button type="button" data-discipline-action="add">+ Работа</button>
   ${pending.length?`<ul>${disciplineTaskList(pending)}</ul>`:'<p>Открытых заданий нет.</p>'}`)
  +disciplinePanel('Командные задания','<p>В общих работах предмет хранится в описании. Открой команду, чтобы посмотреть список.</p><button type="button" data-discipline-action="teams">Открыть команды</button>')
  +disciplinePanel('Учебные материалы','<button type="button" data-discipline-action="sdo">Открыть СДО МИРЭА ↗</button><p>Файлы, прикреплённые к личным заданиям, доступны в этих заданиях.</p>')
  +disciplinePanel('История результатов',`<p>Выполненные личные задания</p>${completed.length?`<ul>${disciplineTaskList(completed,true)}</ul>`:'<p>Выполненных заданий пока нет.</p>'}<p>В БРС доступна текущая сводка баллов.</p>`);
 const overview=$('#discipline-overview');
 window.bindDisciplineDebts?.(overview,{name,id:score?.id||id,term:score?.term||term});
 const scoreHistory=overview.querySelector('.course-attendance-link');
 if(scoreHistory)scoreHistory.remove();
 const actions={
  grades:()=>result?.error==='login'?openPulseGrades(true):loadCourseGrades(),
  attendance:()=>showCourseAttendance(score.id,name),
  schedule:async()=>{
   const selection=openedDiscipline;
   disciplineScheduleRequest='Обновляем расписание…';
   paintDiscipline();
   const update=await loadOfficial(group,true);
   if(openedDiscipline!==selection||page!=='mini-discipline')return;
   disciplineScheduleRequest=update?.ok?null:'Не удалось обновить расписание.';
   paintDiscipline();
  },
  add:()=>addTask(name),
  teams:()=>showPage('mini-team'),
  sdo:()=>{window.location.href='https://online-edu.mirea.ru/'}
 };
 overview.querySelectorAll('[data-discipline-action]').forEach(button=>button.onclick=actions[button.dataset.disciplineAction]);
 overview.querySelectorAll('[data-discipline-task]').forEach(button=>button.onclick=()=>addTask(null,{workId:pending[Number(button.dataset.disciplineTask)].workId}));
 overview.querySelectorAll('[data-discipline-lesson]').forEach(button=>button.onclick=()=>{
  if(!ownPairsSelected())openWidgetSchedule();
  pairsDate=upcoming[Number(button.dataset.disciplineLesson)].date;
  pairsMode='day';
  showPage('pairs');
  renderPairs();
 });
}
window.paintDiscipline=paintDiscipline;
$('#modal').addEventListener('close',paintDiscipline);
const showPageBeforeDiscipline=showPage;
showPage=function(destination){
 showPageBeforeDiscipline(destination);
 if(destination==='mini-discipline')paintDiscipline();
 else {disciplineScheduleRequest=null;openedDiscipline=null;}
};
const backBeforeDiscipline=handleAppBack;
handleAppBack=function(){
 if(page==='mini-discipline'){disciplineBack();return true}
 if(page==='mini-courses'){showPage('miniapps');return true}
 return backBeforeDiscipline();
};
