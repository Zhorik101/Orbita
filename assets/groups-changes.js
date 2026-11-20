// Own group is explicit; viewing other schedules never replaces it.
function rememberGroup(target){if(!validSavedGroup(target))return;state.savedGroupTargets=[{id:Number(target.id),target:1,title:target.title},...state.savedGroupTargets.filter(g=>g.id!==Number(target.id))].slice(0,30);state.recentGroups=[target.title,...state.recentGroups.filter(n=>n!==target.title)].slice(0,20)}
function groupLabels(){
 const label=state.pinnedGroup?.title||state.group||'Выбрать группу';
 $('#group-label').textContent=label;
 $('#settings-group-name').textContent=label;
 if($('#mini-current-group'))$('#mini-current-group').textContent=label;
}
selectOfficialTarget=async function(target){const previous=JSON.parse(JSON.stringify(state));if(validSavedGroup(target)){rememberGroup(target);if(!validSavedGroup(state.pinnedGroup)){state.pinnedGroup={...target};state.officialGroup={...target};state.group=target.title;state.favoriteGroups=[...new Set([target.title,...state.favoriteGroups])]}}state.officialSelection={...target};if(!save()){state=previous;groupLabels();return}groupLabels();$('#modal').close();showPage('pairs');await loadOfficial(target)};
async function resolveSavedGroup(name){const savedTarget=state.savedGroupTargets.find(g=>g.title===name);if(savedTarget)return savedTarget;const matches=normalizeOfficialResults(JSON.parse(await officialRequest('search',name))).filter(g=>g.target===1&&g.title.toUpperCase()===name.toUpperCase());if(matches.length!==1)throw new Error('Не удалось однозначно найти группу. Используй поиск.');rememberGroup(matches[0]);save();return matches[0]}
async function pinOwnGroup(target){const previous=JSON.parse(JSON.stringify(state));rememberGroup(target);state.pinnedGroup={...target};state.officialGroup={...target};state.officialSelection={...target};state.group=target.title;state.favoriteGroups=[...new Set([target.title,...state.favoriteGroups])];if(!save()){state=previous;return}groupLabels();$('#modal').close();showPage('schedule');await loadOfficial(target);toast('Моя группа: '+target.title)}
function savedGroupNames(){return [...new Set([state.pinnedGroup?.title,...state.favoriteGroups,...state.savedGroupTargets.map(g=>g.title),...state.recentGroups].filter(Boolean))]}
function openSavedGroupPicker(){const names=savedGroupNames();modal('<h2>Мои группы</h2><p>Закреплённая группа открывается при запуске. Другие расписания можно смотреть отдельно.</p><div class="saved-groups">'+names.map((name,i)=>'<div class="saved-group-row"><button data-open-saved-group="'+i+'"><b>'+safe(name)+'</b><small>'+(name===state.pinnedGroup?.title?'Моя группа · закреплена':state.favoriteGroups.includes(name)?'Избранная группа':'Недавно открывалась')+'</small></button><button data-pin-saved-group="'+i+'" class="'+(name===state.pinnedGroup?.title?'pinned':'')+'" aria-label="Сделать своей группой '+safe(name)+'">'+(name===state.pinnedGroup?.title?'★':'☆')+'</button></div>').join('')+'</div><p id="saved-group-status" role="status"></p><button class="primary" id="find-new-group">＋ Найти другую группу</button>');$('#find-new-group').onclick=()=>openOfficialDirectory(1,'');for(const [selector,action] of [['[data-open-saved-group]',selectOfficialTarget],['[data-pin-saved-group]',pinOwnGroup]])$$(selector).forEach(b=>b.onclick=async()=>{const index=Number(b.dataset.openSavedGroup??b.dataset.pinSavedGroup);b.disabled=true;try{const target=await resolveSavedGroup(names[index]);await action(target)}catch(error){if($('#saved-group-status'))$('#saved-group-status').textContent=error.message;b.disabled=false}})}
$('#group-button').onclick=openSavedGroupPicker;$('#pairs-group').onclick=openSavedGroupPicker;$('#settings-group').onclick=openSavedGroupPicker;
chooseGroup=function(name){const target=state.savedGroupTargets.find(g=>g.title===name);if(target){selectOfficialTarget(target);return true}resolveSavedGroup(name).then(selectOfficialTarget).catch(error=>toast(error.message));return false};
renderMiniGroups=function(){groupLabels();const query=$('#mini-groups-search').value.trim().toUpperCase(),names=savedGroupNames().filter(n=>n.toUpperCase().includes(query));$('#mini-groups-list').innerHTML=names.map((name,i)=>'<div class="mini-group-row"><button data-mini-saved="'+i+'"><span class="mini-group-icon">'+icon('people')+'</span><span><b>'+safe(name)+'</b><small>'+(name===state.pinnedGroup?.title?'Моя группа · закреплена':'Открыть расписание')+'</small></span></button><button data-mini-pin="'+i+'" aria-label="Закрепить группу">'+(name===state.pinnedGroup?.title?'★':'☆')+'</button></div>').join('')||'<p>Найди свою группу и закрепи её.</p>';for(const [selector,action] of [['[data-mini-saved]',selectOfficialTarget],['[data-mini-pin]',pinOwnGroup]])$$(selector).forEach(b=>b.onclick=()=>resolveSavedGroup(names[Number(b.dataset.miniSaved??b.dataset.miniPin)]).then(action).catch(e=>toast(e.message)))};$('#mini-groups-search').oninput=renderMiniGroups;$('#mini-enter-group').onclick=()=>openOfficialDirectory(1,'');
// Compare the same target and date window. Initial download is a baseline, not a change.
state.scheduleChangeLog=Array.isArray(state.scheduleChangeLog)?state.scheduleChangeLog:[];
function paintChangeBadge(){const unread=state.scheduleChangeLog.filter(c=>!c.read).length;const bell=$('#pairs-bell');let dot=bell.querySelector('i');if(!dot){dot=document.createElement('i');bell.appendChild(dot)}dot.hidden=!unread;bell.setAttribute('aria-label',unread?'Изменения расписания: '+unread:'Изменения расписания')}
const cacheBeforeChangeLog=cacheOfficial;cacheOfficial=function(target,raw){const previous=officialCache[calendarKey(target)]?.raw;let changes=[];try{if(previous)changes=scheduleDiff(scheduleSnapshot(previous),scheduleSnapshot(raw))}catch{}cacheBeforeChangeLog(target,raw);const own=state.pinnedGroup||state.officialGroup;if(calendarKey(target)===calendarKey(own))window.OrbitaAndroid?.scheduleBaseline?.(calendarKey(target),raw);if(changes.length){const stamp=Date.now();for(const change of changes)state.scheduleChangeLog.unshift({...change,target:{...target},at:stamp,read:false});state.scheduleChangeLog=state.scheduleChangeLog.slice(0,100);save();if(state.scheduleChangePush&&calendarKey(target)===calendarKey(own)&&window.OrbitaAndroid?.scheduleChanged)window.OrbitaAndroid.scheduleChanged(target.title+': '+changes.length+' изменений в расписании')}paintChangeBadge()};
function importBackgroundChanges(){
 const bridge=window.OrbitaAndroid;
 if(!bridge?.scheduleInbox)return;
 try{
  const inbox=JSON.parse(bridge.scheduleInbox());
  const own=state.pinnedGroup||state.officialGroup;
  if(calendarKey(own)!==inbox.key||!inbox.raw)return;
  const cached=officialCache[inbox.key];
  if(!cached||cached.updated<inbox.updated){
   cacheBeforeChangeLog(own,inbox.raw);
   officialCache[inbox.key].updated=inbox.updated;
   localStorage.setItem('orbitaOfficialCache',JSON.stringify(officialCache));
  }
  const known=new Set(state.scheduleChangeLog.map(entry=>entry.backgroundId).filter(Boolean));
  const fresh=(inbox.changes||[]).filter(entry=>!known.has(entry.backgroundId));
  if(fresh.length){
   state.scheduleChangeLog=[...fresh,...state.scheduleChangeLog].slice(0,100);
   if(!save())return;
  }
  bridge.ackScheduleInbox(inbox.updated);paintChangeBadge();
  if(typeof syncWidgetLessons==='function')syncWidgetLessons();
 }catch{}
}
window.orbitaImportSchedule=importBackgroundChanges;
importBackgroundChanges();
function describeChangedLesson(row){return row?safe(row.date)+' · '+safe(row.start)+'–'+safe(row.end)+'<br>'+safe(row.room)+' · '+safe(row.campus)+(row.teacher?'<br>'+safe(row.teacher):''):''}
async function openChangedSchedule(entry){
 const target=entry?.target;if(!target){toast('Не удалось определить расписание');return}
 const row=entry.after||entry.before,date=row?.date;
 state.officialSelection={...target};save();
 if(/^\d{4}-\d{2}-\d{2}$/.test(date||'')){const day=new Date(date+'T12:00:00');if(Number.isFinite(day.getTime()))pairsDate=day}
 pairsMode='day';pairsType='all';pairsQuery='';if($('#pairs-search'))$('#pairs-search').value='';
 $('#modal').close();showPage('pairs');await loadOfficial(target);
}
function openScheduleChanges(message=''){
 const entries=state.scheduleChangeLog;
 modal('<h2>Изменения расписания</h2><p>Переносы, отмены и новые занятия из расписания МИРЭА.</p><div class="schedule-change-list">'+(entries.length?entries.map((c,i)=>'<article class="schedule-change"><small>'+safe(c.target.title)+' · '+new Date(c.at).toLocaleString('ru')+'</small><h3>'+safe(c.kind)+'</h3><b>'+safe((c.after||c.before).title)+'</b>'+(c.before?'<p><span>Было</span><br>'+describeChangedLesson(c.before)+'</p>':'')+(c.after?'<p><span>Стало</span><br>'+describeChangedLesson(c.after)+'</p>':'')+'<button class="settings-link" data-open-changed-schedule="'+i+'">Открыть расписание на эту дату →</button></article>').join(''):'<p>Пока изменений не обнаружено.</p>')+'</div><button class="primary" id="check-schedule-changes">Проверить расписание</button><p id="change-check-status" role="status">'+safe(typeof message==='string'?message:'')+'</p>');
 for(const entry of entries)entry.read=true;save();paintChangeBadge();
 $$('[data-open-changed-schedule]').forEach(button=>button.onclick=()=>openChangedSchedule(entries[Number(button.dataset.openChangedSchedule)]));
 const button=$('#check-schedule-changes'),status=$('#change-check-status');
 button.onclick=async()=>{
  const target=state.pinnedGroup||currentOfficialTarget();
  if(!target){$('#modal').close();openSavedGroupPicker();return}
  button.disabled=true;button.textContent='Проверяем…';status.textContent='Загружаем расписание '+target.title+'…';
  const before=new Set(state.scheduleChangeLog);
  try{
   const result=await loadOfficial(target,true);
   // A finished request must not reopen a dialog the user has already left.
   if(!button.isConnected||!$('#modal').open)return;
   if(result?.ok===false||officialError)throw new Error(result?.error||officialError||'Проверка прервана. Попробуй ещё раз.');
   const added=state.scheduleChangeLog.filter(entry=>!before.has(entry)).length;
   openScheduleChanges(added?'Проверено: новых изменений — '+added+'.':'Проверено: новых изменений нет.');
  }catch(error){if(status.isConnected)status.textContent=error.message||'Не удалось проверить расписание. Попробуй ещё раз.'}
  finally{if(button.isConnected){button.disabled=false;button.textContent='Проверить расписание'}}
 };
}
$('#pairs-bell').onclick=openScheduleChanges;$('#notify').onclick=openScheduleChanges;
const changesSetting=document.createElement('section');changesSetting.className='settings-section';changesSetting.innerHTML='<div class="settings-section-title"><span class="settings-section-icon">'+icon('bell')+'</span><div><h3>Изменения расписания</h3><p>Добавления, отмены, переносы и смена аудиторий</p></div></div><label class="setting-row"><span>Уведомлять при обнаружении изменений</span><input id="changes-push-enabled" type="checkbox"></label><p class="pairs-disclaimer">Орбита проверяет расписание и в фоне при доступе к интернету. Время проверки зависит от Android.</p><button class="settings-link" id="changes-history">История изменений →</button>';$('.settings-about').before(changesSetting);$('#changes-push-enabled').checked=!!state.scheduleChangePush;$('#changes-push-enabled').onchange=()=>{state.scheduleChangePush=$('#changes-push-enabled').checked;save();const own=state.pinnedGroup||state.officialGroup, key=calendarKey(own);if(officialCache[key]?.raw)window.OrbitaAndroid?.scheduleBaseline?.(key,officialCache[key].raw);if(state.scheduleChangePush)window.OrbitaAndroid?.requestLessonNotificationPermission?.()};$('#changes-history').onclick=openScheduleChanges;
let lastOwnCheck=0;async function checkOwnGroupChanges(){if(document.hidden||officialBusy||!state.pinnedGroup||Date.now()-lastOwnCheck<300000)return;lastOwnCheck=Date.now();importBackgroundChanges();await loadOfficial(state.pinnedGroup,true)}setInterval(checkOwnGroupChanges,300000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)checkOwnGroupChanges()});
const groupChangeStyle=document.createElement('style');groupChangeStyle.textContent='.saved-group-row{display:flex;align-items:center;gap:10px;border-bottom:1px solid var(--line)}.saved-group-row>button:first-child{flex:1;min-width:0;text-align:left;padding:15px 2px}.saved-group-row b{display:block;font-size:15px}.saved-group-row small{display:block;font-size:11px;color:var(--muted);margin-top:6px}.saved-group-row>button:last-child{min-width:44px;min-height:44px;font-size:24px;color:var(--muted)}.saved-group-row>button.pinned{color:var(--accent)}#saved-group-status{font-size:12px;color:var(--muted)}.schedule-change-list{max-height:50vh;overflow:auto}.schedule-change{padding:16px 0;border-bottom:1px solid var(--line)}.schedule-change>small{font-size:10px;color:var(--muted)}.schedule-change h3{font-size:15px;color:var(--accent);margin:10px 0}.schedule-change>b{font-size:14px;line-height:1.5}.schedule-change p{font-size:12px;line-height:1.6}.schedule-change p span{font-size:10px;color:var(--accent)}';document.head.appendChild(groupChangeStyle);groupLabels();paintChangeBadge();save();

const subgroupRow=document.createElement('button');
subgroupRow.className='settings-link';
subgroupRow.textContent='Моя подгруппа';
subgroupRow.id='choose-subgroup';
($('#settings-group')||$('.settings-about')).after(subgroupRow);
function refreshOwnFilters(){
 renderPairs();renderSchedule();updateOfficialHome();syncWidgetLessons();
}
function openSubgroupOptions(){
 const own=state.pinnedGroup||state.officialGroup,key=calendarKey(own);
 const raw=officialCache[key]?.raw;
 let rows=[],invalid=false;
 if(raw)try{
  const now=new Date(),start=new Date(now),end=new Date(now);
  start.setDate(start.getDate()-14);end.setMonth(end.getMonth()+4);
  rows=Object.values(expandOfficialCalendar(raw,moscowParts(start).date,moscowParts(end).date)).flat();
 }catch{invalid=true}
 const options=new Set(rows.map(row=>row.subgroup).filter(Boolean));
 const selected=state.subgroups?.[key]||'';
 if(selected)options.add(selected);
 const variants=state.lessonVariants?.[key]||{};
 const subjects=new Map();
 for(const group of parallelLessonSets(rows)){
  const variantKey=lessonVariantKey(group[0]);
  if(!subjects.has(variantKey))subjects.set(variantKey,new Map());
  for(const lesson of group)subjects.get(variantKey).set(lessonVariantId(lesson),lesson);
 }
 // Keep previously selected rules resettable after a timetable change.
 for(const variantKey of Object.keys(variants))if(!subjects.has(variantKey))subjects.set(variantKey,new Map());
 const intro=!own?'Сначала выбери свою группу.':!raw||invalid?'Сначала загрузи расписание своей группы.':
  options.size?'Общие занятия останутся в расписании.':subjects.size?
  'МИРЭА не указал номера подгрупп. Выбери свой вариант у пар, которые идут одновременно.':
  'В загруженном расписании нет номеров подгрупп и одновременных вариантов одной лабы или практики.';
 modal('<h2>Моя подгруппа</h2><p>'+intro+'</p>'+
  (!own?'<button class="primary" id="subgroup-find">Выбрать группу</button>':'')+
  (own&&(!raw||invalid)?'<button class="primary" id="subgroup-fetch">Загрузить расписание</button><p id="subgroup-status" role="status"></p>':'')+
  (options.size?'<div class="work-chips">'+['',...[...options].sort((a,b)=>Number(a)-Number(b))].map(value=>
   '<button data-subgroup="'+safe(value)+'" class="'+(selected===value?'selected':'')+'">'+(value?'Подгруппа '+safe(value):'Все занятия')+'</button>').join('')+'</div>':'')+
  [...subjects].map(([variantKey,lessons],index)=>{
   const [discipline,type]=JSON.parse(variantKey);
   const current=variants[variantKey]||'';
   const choices=[{id:'',name:'Все варианты',room:''},
    ...[...lessons].map(([id,lesson])=>({id,name:lesson.teacher||'Аудитория '+lesson.room,room:lesson.teacher?lesson.room:''}))];
   if(current&&!lessons.has(current))choices.push({id:current,name:'Ранее выбранный вариант',room:''});
   const active=choices.find(choice=>choice.id===current);
   return '<details class="subgroup-picker" id="subgroup-variant-'+index+'">'+
    '<summary><span><b>'+safe(discipline)+'</b><small>'+safe(type)+' · '+safe(active.name)+'</small></span><i aria-hidden="true">⌄</i></summary>'+
    '<div class="subgroup-choices">'+choices.map(choice=>
     '<button type="button" data-variant-index="'+index+'" data-variant-value="'+safe(choice.id)+
     '" aria-pressed="'+String(choice.id===current)+'"><span>'+safe(choice.name)+
     (choice.room?'<small>'+safe(choice.room)+'</small>':'')+'</span><i aria-hidden="true">'+
     (choice.id===current?'✓':'')+'</i></button>').join('')+'</div></details>';
  }).join('')+
  ((state.hiddenLessonVariants?.[key]||[]).length?'<h3>Скрытые варианты</h3>'+
   state.hiddenLessonVariants[key].map((value,index)=>{
    let label;
    try{label=JSON.parse(value).filter(Boolean).join(' · ')}catch{label='Скрытый вариант'}
    return '<button class="settings-link" data-unhide-variant="'+index+'">'+safe(label)+' · Вернуть</button>';
   }).join(''):''));
 $$('[data-unhide-variant]').forEach(button=>button.onclick=()=>{
  const previous=state.hiddenLessonVariants;
  const remaining=previous[key].filter((_,index)=>index!==Number(button.dataset.unhideVariant));
  state.hiddenLessonVariants={...previous,[key]:remaining};
  if(!save()){state.hiddenLessonVariants=previous;return}
  refreshOwnFilters();openSubgroupOptions();
 });
 if($('#subgroup-find'))$('#subgroup-find').onclick=()=>openOfficialDirectory(1,'');
 const fetchButton=$('#subgroup-fetch');
 if(fetchButton)fetchButton.onclick=async()=>{
  fetchButton.disabled=true;
  try{
   const result=await loadOfficial(own,true);
   if(!fetchButton.isConnected||!$('#modal').open)return;
   if(result?.ok&&officialCache[key]?.raw)openSubgroupOptions();
   else $('#subgroup-status').textContent=result?.error||'Не удалось загрузить расписание.';
  }finally{fetchButton.disabled=false}
 };
 $$('[data-subgroup]').forEach(button=>button.onclick=()=>{
  const previous=state.subgroups;
  state.subgroups={...previous,[key]:button.dataset.subgroup};
  if(!save()){state.subgroups=previous;return}
  refreshOwnFilters();openSubgroupOptions();
 });
 const keys=[...subjects.keys()];
 $$('[data-variant-index]').forEach(button=>{
  button.onclick=()=>{
   const index=Number(button.dataset.variantIndex),variantKey=keys[index],value=button.dataset.variantValue;
   const previous=state.lessonVariants,next={...state.lessonVariants?.[key]};
   if(value)next[variantKey]=value;
   else delete next[variantKey];
   state.lessonVariants={...previous,[key]:next};
   if(!save()){state.lessonVariants=previous;return}
   refreshOwnFilters();openSubgroupOptions();
   $('#subgroup-variant-'+index+' summary')?.focus({preventScroll:true});
  };
 });
}
subgroupRow.onclick=openSubgroupOptions;
