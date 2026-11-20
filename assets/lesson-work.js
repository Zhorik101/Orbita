// Work is manually entered; subject-matching makes it visible at subsequent lessons.
let activeLessonWork=null;
function normalizedCourse(value){return String(value||'').trim().toLocaleLowerCase('ru').replaceAll('ё','е').replace(/\s+/g,' ')}
function workMatchesLesson(task,lesson){return normalizedCourse(task.subject)===normalizedCourse(lesson.title)||normalizedCourse(shortSubject(task.subject))===normalizedCourse(shortSubject(lesson.title))}
function worksForLesson(lesson){return pendingWorks().filter(task=>workMatchesLesson(task,lesson))}
function reopenLessonWork(context){const rows=context.home?dayData(context.day):pairsData(new Date(context.key+'T12:00:00')),index=rows.findIndex(row=>row.uid===context.lesson.uid);if(index<0){toast('Занятие изменилось. Открой его заново.');return}if(context.home)showLesson(context.day,index);else openPairDetails(context.key,index);const input=$('#pair-note')||$('#note');if(input&&context.noteDraft!==undefined)input.value=context.noteDraft}
function addWorkAtLesson(context){const input=$('#pair-note')||$('#note');context.noteDraft=input?.value;addTask(context.lesson.title);const returnButton=document.createElement('button');returnButton.className='lesson-work-return';returnButton.textContent='← К занятию';$('#work-intro').before(returnButton);returnButton.onclick=()=>reopenLessonWork(context);const saveButton=$('#save-work-template'),saveWork=saveButton.onclick;saveButton.onclick=()=>{const before=state.tasks.length;saveWork();if(state.tasks.length>before)reopenLessonWork(context)}}
function paintLessonWork(){const panel=$('#lesson-work-panel'),context=activeLessonWork;if(!panel||!context)return;const tasks=worksForLesson(context.lesson),recent=state.tasks.filter(t=>t.done&&workMatchesLesson(t,context.lesson)&&recentWorkActions.get(t.workId)?.expires>Date.now());panel.innerHTML='<div class="lesson-work-title"><h3>Работы по предмету</h3><button id="lesson-add-work">＋ Добавить</button></div>'+tasks.map(task=>'<div class="lesson-work-row"><input type="checkbox" data-lesson-complete="'+task.index+'" aria-label="Выполнить '+safe(task.text)+'"><div><b>'+safe(task.text)+'</b><small>'+safe(task.due)+'</small>'+(task.comment?'<p>'+safe(task.comment)+'</p>':'')+'</div></div>').join('')+recent.map(task=>'<div class="lesson-work-row lesson-work-recent"><div><b>'+safe(task.text)+'</b><small>Только что выполнено</small></div><button data-lesson-undo="'+safe(task.workId)+'">Отменить</button></div>').join('')+(!tasks.length&&!recent.length?'<p class="lesson-work-empty">Несданных работ по этому предмету нет. Можно добавить вручную.</p>':'');$('#lesson-add-work').onclick=()=>addWorkAtLesson(context);$$('[data-lesson-complete]').forEach(b=>b.onchange=()=>{changeWork(Number(b.dataset.lessonComplete),'done');paintLessonWork();setTimeout(()=>{if($('#lesson-work-panel')&&activeLessonWork===context)paintLessonWork()},8200)});$$('[data-lesson-undo]').forEach(b=>b.onclick=()=>{undoWorkAction(b.dataset.lessonUndo);paintLessonWork()})}
function appendHideSubgroup(context,panel){
 const own=state.pinnedGroup||state.officialGroup;
 const key=calendarKey(own),raw=officialCache[key]?.raw;
 if(!own||!raw||(!context.home&&calendarKey(currentOfficialTarget())!==key))return;
 const lesson=context.lesson;
 if(!lesson.subgroup){
  if(!lesson.date)return;
  let rows;
  try{rows=expandOfficialCalendar(raw,lesson.date,lesson.date)[lesson.date]||[]}catch{return}
  if(!parallelLessonSets(rows).some(group=>group.some(row=>row.uid===lesson.uid)))return;
 }
 const button=document.createElement('button');
 button.className='settings-link';button.id='hide-lesson-variant';
 button.textContent='Скрыть чужую подгруппу';
 button.onclick=()=>{
  const previous=state.hiddenLessonVariants;
  const hidden=[...new Set([...(previous?.[key]||[]),hiddenLessonKey(lesson)])];
  state.hiddenLessonVariants={...previous,[key]:hidden};
  if(!save()){state.hiddenLessonVariants=previous;return}
  $('#modal').close();refreshOwnFilters();toast('Вариант скрыт. Вернуть можно в «Моей подгруппе».');
 };
 panel.before(button);
}
function attachLessonWork(context){activeLessonWork=context;let panel=$('#lesson-work-panel');if(panel)panel.remove();panel=document.createElement('section');panel.id='lesson-work-panel';panel.className='lesson-work-panel';const note=$('#pair-note')||$('#note'),label=note?.previousElementSibling;if(label?.tagName==='LABEL')label.before(panel);else if(note)note.before(panel);else $('#modal-content').appendChild(panel);if(context.lesson.room&&context.lesson.room!=='Не указана'){
 const map=document.createElement('button');map.className='settings-link';
 map.textContent='Найти аудиторию '+context.lesson.room+' на карте';
 map.onclick=()=>openLessonRoom(context.lesson);panel.before(map);
 }appendHideSubgroup(context,panel);paintLessonWork()}
const pairDetailsBeforeWork=openPairDetails;openPairDetails=function(key,index){pairDetailsBeforeWork(key,index);const lesson=pairsData(new Date(key+'T12:00:00'))[Number(index)];if(lesson&&$('#pair-note'))attachLessonWork({key,index:Number(index),lesson,home:false})};
const homeDetailsBeforeWork=showLesson;showLesson=function(day,index){homeDetailsBeforeWork(day,index);const lesson=dayData(Number(day))[Number(index)];if(lesson&&$('#note'))attachLessonWork({day:Number(day),index:Number(index),lesson,key:dateKey(dateAt(Number(day))),home:true})};
const pairCardBeforeWorkBadges=pairCard;pairCard=function(lesson,date,next){const count=worksForLesson(lesson).length;let html=pairCardBeforeWorkBadges(lesson,date,next).replace(' data-pair-open=',' data-work-course="'+safe(lesson.title)+'" data-pair-open=');if(count)html=html.replace('</h3>',' <span class="pair-work-count">Работ: '+count+'</span></h3>');return html};
function refreshLessonWorkBadges(){for(const card of $$('[data-work-course]')){const count=worksForLesson({title:card.dataset.workCourse}).length;let badge=card.querySelector('.pair-work-count');if(!count){badge?.remove();continue}if(!badge){badge=document.createElement('span');badge.className='pair-work-count';card.querySelector('h3')?.appendChild(badge)}badge.textContent='Работ: '+count}}
const tasksBeforeLessonLinks=renderTasks;renderTasks=function(){tasksBeforeLessonLinks();refreshLessonWorkBadges();if($('#lesson-work-panel'))paintLessonWork()};
const lessonWorkStyle=document.createElement('style');lessonWorkStyle.textContent='.lesson-work-panel{padding:14px;border:1px solid var(--line);border-radius:18px;margin:17px 0}.lesson-work-title{display:flex;align-items:center;justify-content:space-between;gap:10px}.lesson-work-title h3{font-size:14px;margin:0}.lesson-work-title button,.lesson-work-return{font-size:12px;color:var(--accent);min-height:40px}.lesson-work-row{display:flex;gap:10px;align-items:flex-start;padding:11px 0;border-top:1px solid var(--line)}.lesson-work-row>div{flex:1;min-width:0}.lesson-work-row b{display:block;font-size:13px;line-height:1.5;overflow-wrap:anywhere}.lesson-work-row small{font-size:10px;color:var(--muted);display:block;margin-top:4px}.lesson-work-row p{font-size:11px;margin:5px 0;line-height:1.5}.reference-ui .lesson-work-row input{appearance:none;width:20px!important;min-width:20px!important;height:20px;min-height:20px!important;padding:0!important;margin:3px 0 0!important;border:1px solid var(--muted);border-radius:6px;background:var(--bg);flex:none}.lesson-work-row button{font-size:11px;color:var(--accent);min-height:36px}.lesson-work-recent b{text-decoration:line-through;color:var(--muted)}.lesson-work-empty{font-size:11px!important;color:var(--muted);margin:7px 0!important;line-height:1.6}.pair-work-count{display:inline-block;font-size:9px;font-weight:500;line-height:1.2;padding:3px 5px;margin-left:4px;border-radius:7px;vertical-align:middle;background:var(--accent-soft);color:var(--accent)}';document.head.appendChild(lessonWorkStyle);renderPairs();renderSchedule();
