// Official MIREA source. No example lessons are used by this module.
const OFFICIAL_ORIGIN='https://schedule-of.mirea.ru';
let officialCache={};try{officialCache=JSON.parse(localStorage.getItem('orbitaOfficialCache')||'{}')}catch{}
let officialBusy=false,officialError='',officialStale=false,directoryType=1,directorySequence=0,officialLoadSequence=0;
const officialPending=new Map(),expandedCalendars=new Map();let officialRequestId=0;
window.orbitaApiResult=(id,result)=>{const pending=officialPending.get(id);if(!pending)return;clearTimeout(pending.timer);officialPending.delete(id);result.ok?pending.resolve(result.body):pending.reject(new Error(result.error||'Сервер недоступен'))};
function officialRequest(operation,argument,target=1){
 if(window.OrbitaAndroid?.scheduleRequest)return new Promise((resolve,reject)=>{const id='request_'+(++officialRequestId);const timer=setTimeout(()=>{officialPending.delete(id);reject(new Error('Сервер МИРЭА не ответил вовремя'))},45000);officialPending.set(id,{resolve,reject,timer});window.OrbitaAndroid.scheduleRequest(id,operation,String(argument),target)});
 const path=operation==='search'?`/schedule/api/search?match=${encodeURIComponent(argument)}&limit=100`:`/schedule/api/ical/${({1:"Group",2:"Teacher",3:"Auditorium"})[target]}/${encodeURIComponent(argument)}?includeMeta=true`;
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),25000);
 return fetch(OFFICIAL_ORIGIN+path,{signal:controller.signal,credentials:'omit'}).then(response=>{if(!response.ok)throw new Error('Сервер МИРЭА: HTTP '+response.status);return response.text()}).finally(()=>clearTimeout(timer));
}
function calendarKey(target){return target?target.target+':'+target.id:''}
function normalizeOfficialResults(raw){
 const list=Array.isArray(raw)?raw:raw?.data;if(!Array.isArray(list))throw new Error('Неизвестный формат ответа поиска');
 const rows=list.map(x=>({id:Number(x.id),target:Number(x.scheduleTarget??x.target),title:String(x.targetTitle||x.title||x.fullTitle||x.full_title||'').trim()})).filter(x=>Number.isInteger(x.id)&&x.id>0&&[1,2,3].includes(x.target)&&x.title);
 if(list.length&&!rows.length)throw new Error('Формат результатов МИРЭА изменился. Не удалось прочитать найденные расписания.');
 return rows;
}

function officialLessons(target,date){
 const key=calendarKey(target),cache=officialCache[key];if(!cache?.raw)return[];
 const month=dateKey(date).slice(0,7),parseKey=key+':'+month;
 let expanded=expandedCalendars.get(parseKey);
 if(!expanded||expanded.updated!==cache.updated){
  const from=new Date(date.getFullYear(),date.getMonth()-1,1,12),to=new Date(date.getFullYear(),date.getMonth()+2,0,12);
  try{expanded={updated:cache.updated,days:expandOfficialCalendar(cache.raw,dateKey(from),dateKey(to))};expandedCalendars.set(parseKey,expanded)}catch(error){officialError='Не удалось прочитать календарь МИРЭА';return[]}
 }
 const rows=expanded.days[dateKey(date)]||[];
 const chosen=state.subgroups?.[key];
 return filterOwnLessons(rows,chosen,state.lessonVariants?.[key],state.hiddenLessonVariants?.[key]);
}
function currentOfficialTarget(){return state.officialSelection||state.officialGroup||null}
function cacheOfficial(target,raw){
 officialCache[calendarKey(target)]={raw,updated:Date.now(),title:target.title};
 const keys=Object.keys(officialCache).sort((a,b)=>officialCache[b].updated-officialCache[a].updated);for(const key of keys.slice(8))if(key!==calendarKey(state.pinnedGroup))delete officialCache[key];
 try{localStorage.setItem('orbitaOfficialCache',JSON.stringify(officialCache))}catch{toast('Расписание загружено, но кэш не поместился на устройстве')}
}
async function loadOfficial(target,force=false){
 if(!target)return;const sequence=++officialLoadSequence;officialBusy=true;officialError='';officialStale=false;renderPairs();
 const cached=officialCache[calendarKey(target)];
 try{
  if(force||!cached||Date.now()-cached.updated>300000){const raw=await officialRequest('ical',target.id,target.target);expandOfficialCalendar(raw,dateKey(pairsMonday(pairsDate)),dateKey(new Date(pairsDate.getFullYear(),pairsDate.getMonth()+1,0)));cacheOfficial(target,raw)}
 }catch(error){if(sequence===officialLoadSequence){officialError='Не удалось обновить расписание. '+error.message;officialStale=!!cached}}
 finally{if(sequence===officialLoadSequence){officialBusy=false;renderPairs();renderSchedule();updateOfficialHome();syncWidgetLessons()}}
 return sequence===officialLoadSequence?{ok:!officialError,error:officialError}:{ok:false,error:'Расписание обновлялось другим запросом. Повтори проверку.'};
}
function syncWidgetLessons(){
 const target=state.pinnedGroup||state.officialGroup;
 const key=calendarKey(target);
 const cache=officialCache[key];
 const first=moscowParts(new Date()).date;
 const day=new Date(first+'T12:00:00');
 const week={},courseDays={};
 if(cache?.raw){
  for(let offset=0;offset<35;offset++){
   const rows=officialLessons(target,day);
   courseDays[dateKey(day)]=rows.filter(l=>l.type!=='Лекция').map(({title,start,type})=>({title,start,type}));
   if(offset<7)week[dateKey(day)]=rows.map(({start,end,title,room,campus,teacher,type})=>
    ({start,end,title,room,campus,teacher,type}));
   day.setDate(day.getDate()+1);
  }
 }
 state.widgetDays=week;
 state.widgetCourseDays=courseDays;
 state.widgetGroupKey=key;
 state.widgetDate=first;
 state.widgetLessons=week[first]||[];
 state.widgetUpdated=cache?.updated||0;
 if(save()&&typeof syncOwnPairsToCalendar==='function')syncOwnPairsToCalendar();
}
async function selectOfficialTarget(target){
 const previous={officialSelection:state.officialSelection,officialGroup:state.officialGroup,group:state.group,recentGroups:state.recentGroups};state.officialSelection=target;
 if(target.target===1){state.group=target.title;state.officialGroup=target;state.recentGroups=[target.title,...state.recentGroups.filter(x=>x!==target.title)].slice(0,8);$('#group-label').textContent=state.group;$('#settings-group-name').textContent=state.group}
 if(!save()){Object.assign(state,previous);$('#group-label').textContent=state.group;$('#settings-group-name').textContent=state.group;return}
 $('#modal').close();showPage('pairs');await loadOfficial(target);
}
function openOfficialDirectory(type=1,query=''){
 directoryType=Number(type);directorySequence++;
 modal(`<h2>Найти расписание</h2><div class="official-search-types">${[[1,'Группы'],[2,'Преподаватели'],[3,'Аудитории']].map(([id,name])=>`<button data-official-type="${id}" class="${id===directoryType?'selected':''}">${name}</button>`).join('')}</div><label for="official-query">Название группы, фамилия или номер аудитории</label><div class="official-query-row"><input id="official-query" type="search" maxlength="100" value="${safe(query)}" placeholder="Например: ${type===2?'Иванов':type===3?'А-308':state.group}"><button id="official-search-button" class="primary">Найти</button></div><div id="official-search-results"><p>Поиск на schedule-of.mirea.ru</p></div>`);
 $$('[data-official-type]').forEach(button=>button.onclick=()=>openOfficialDirectory(Number(button.dataset.officialType),$('#official-query').value));
 $('#official-search-button').onclick=searchOfficialDirectory;$('#official-query').onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();searchOfficialDirectory()}};
 if(query.trim().length>=2)searchOfficialDirectory();
}
async function searchOfficialDirectory(){
 const query=$('#official-query')?.value.trim();if(!query||query.length<2){$('#official-search-results').textContent='Введи хотя бы 2 символа';return}
 const sequence=++directorySequence,type=directoryType;$('#official-search-results').textContent='Поиск в МИРЭА…';
 try{const rows=normalizeOfficialResults(JSON.parse(await officialRequest('search',query))).filter(row=>row.target===type);if(sequence!==directorySequence||!$('#official-search-results'))return;
  $('#official-search-results').innerHTML=rows.length?rows.map((row,i)=>`<button class="official-result" data-official-result="${i}"><b>${safe(row.title)}</b><span>↗</span></button>`).join(''):'<p>Ничего не найдено. Уточни запрос или выбери другой тип.</p>';
  $$('[data-official-result]').forEach(button=>button.onclick=()=>selectOfficialTarget(rows[Number(button.dataset.officialResult)]));
 }catch(error){if(sequence===directorySequence&&$('#official-search-results'))$('#official-search-results').innerHTML=`<p>Поиск сейчас недоступен. ${safe(error.message)}</p><a href="${OFFICIAL_ORIGIN}" target="_blank" rel="noopener">Открыть официальный сайт ↗</a>`}
}
// Replace every demo data reader used by the timetable and editable home cards.
pairsData=date=>officialLessons(currentOfficialTarget(),date);
const mondayNow=pairsMonday(new Date());base.setTime(mondayNow.getTime());selected=(new Date().getDay()+6)%7;weekOffset=0;
dayData=day=>officialLessons(state.officialGroup|| (currentOfficialTarget()?.target===1?currentOfficialTarget():null),dateAt(day));
const renderPairsBeforeOfficial=renderPairs;
renderPairs=function(){
 renderPairsBeforeOfficial();const target=currentOfficialTarget(),cache=officialCache[calendarKey(target)];
 $('#pairs-group b').textContent=target?.title||state.group||'Выбрать группу';
 $('.pairs-demo').textContent=officialBusy?'Загрузка':officialStale?'Кэш':cache?'МИРЭА':'Нет данных';
 $('#pairs-week-meta').textContent=pairsDate.toLocaleDateString('ru',{month:'long',year:'numeric'});
 $('#pairs-page .pairs-disclaimer').innerHTML=`<a href="${OFFICIAL_ORIGIN}" target="_blank" rel="noopener">Источник: расписание РТУ МИРЭА ↗</a>${cache?'<br>Обновлено '+new Date(cache.updated).toLocaleString('ru'):''}`;
 if(!cache){$('#pairs-results').innerHTML=`<div class="pairs-empty"><h3>${officialBusy?'Загружаем расписание…':officialError?'Нет соединения с МИРЭА':'Выбери расписание'}</h3><p>${safe(officialError||'Найди группу, преподавателя или аудиторию в официальном источнике.')}</p><button class="primary" id="official-empty-action">${target?'Повторить загрузку':'Найти расписание'}</button></div>`;$('#official-empty-action').onclick=()=>target?loadOfficial(target,true):openOfficialDirectory(1,state.group)}
 let status=$('#official-source-status');if(!status){status=document.createElement('div');status.id='official-source-status';$('#pairs-results').before(status)}
 status.textContent=cache&&officialError?'Показана сохранённая копия. '+officialError:'';
};
pairCard=function(lesson,date,next){return `<button class="pair-card ${lesson.color}" data-pair-open="${dateKey(date)}|${lesson.index}"><div class="pair-time"><b>${safe(lesson.start)}</b><span>${safe(lesson.end)}</span></div><div class="pair-content"><h3>${safe(lesson.title)}</h3><div class="pair-meta"><span class="pair-type">${safe(lesson.type)}</span><span class="pair-room">${icon('pin')}${safe(lesson.room)}${lesson.campus?' · '+safe(lesson.campus):''}</span>${next?'<span class="pair-next">следующая</span>':''}</div>${lesson.teacher?`<p class="pair-teacher">${icon('people')}${safe(lesson.teacher)}</p>`:''}${lesson.groups&&currentOfficialTarget()?.target!==1?`<p class="pair-teacher">${safe(lesson.groups)}</p>`:''}</div></button>`};
openPairDetails=function(key,index){const lesson=pairsData(new Date(key+'T12:00:00'))[Number(index)];if(!lesson)return;const noteKey='official:'+lesson.uid;
 modal(`<span class="eyebrow">${safe(lesson.type)}</span><h2>${safe(lesson.title)}</h2><p>${safe(key)} · ${safe(lesson.start)}–${safe(lesson.end)}<br>${safe(lesson.room)} ${safe(lesson.campus)}<br>${safe(lesson.teacher)}<br>${safe(lesson.groups)}</p><label for="pair-note">Заметка</label><textarea id="pair-note" rows="4">${safe(state.notes[noteKey]||'')}</textarea><button class="primary" id="save-pair-note">Сохранить</button>`);$('#save-pair-note').onclick=()=>{state.notes[noteKey]=$('#pair-note').value;if(save()){$('#modal').close();toast('Заметка сохранена')}}};
renderLesson=function(lesson,index,day){const data={...lesson,index};return pairCard(data,dateAt(day),false).replace(/data-pair-open="[^"]*"/,`data-lesson="${day},${index}"`)};
showLesson=function(day,index){const lesson=dayData(day)[index];if(!lesson)return;const noteKey='official:'+lesson.uid;modal(`<h2>${safe(lesson.title)}</h2><p>${safe(lesson.start)}–${safe(lesson.end)} · ${safe(lesson.room)}<br>${safe(lesson.teacher)}</p><textarea id="note" rows="4">${safe(state.notes[noteKey]||'')}</textarea><button class="primary" id="save-note">Сохранить</button>`);$('#save-note').onclick=()=>{state.notes[noteKey]=$('#note').value;if(save())$('#modal').close()}};
function updateOfficialHome(){
 const target=state.officialGroup,today=new Date(),rows=officialLessons(target,today),minutes=today.getHours()*60+today.getMinutes(),next=rows.find(l=>Number(l.start.slice(0,2))*60+Number(l.start.slice(3))>=minutes);
 const active=rows.find(l=>Number(l.start.slice(0,2))*60+Number(l.start.slice(3))<=minutes&&Number(l.end.slice(0,2))*60+Number(l.end.slice(3))>minutes);
 const shown=active||next;
 const nextCard=homeCards.get('next');nextCard.querySelector('.live-pill').textContent=target?target.title:'Расписание МИРЭА';nextCard.querySelector('h2').textContent=shown?.title||(officialCache[calendarKey(target)]?'Следующих пар нет':'Расписание не загружено');nextCard.querySelector('.next-copy>p').textContent=shown?shown.start+'–'+shown.end:'';nextCard.querySelector('.next-place').textContent=shown?shown.room+' '+shown.campus:'';
 let art=nextCard.querySelector('.subject-art');if(!art){art=document.createElement('div');art.className='subject-art';nextCard.querySelector('.next-card').appendChild(art)}
 const title=(shown?.title||'').toLowerCase();
 const rules=[['chem',/хими|полимер|катализ/],['biology',/биолог|биотех|анатом|физиолог|микроб|генет/],['security',/безопас|защит|криптограф|военн/],['network',/сет[ьи]|сетев|телеком|радио|связ[ьи]|антенн|сигнал/],['electronics',/электр|электрон|схемотех|микропроцесс|энергет/],['robot',/робот|автомат|мехатрон|управлени.*техничес/],['design',/график|черчен|дизайн|геодез|начертатель/],['mechanics',/механик|материаловед|сопротивлен|конструир|технологи.*машин/],['economics',/эконом|финанс|бухгалтер|маркетинг|менеджмент|бизнес|предприним/],['law',/право|юрид|закон|государственност/],['history',/истори|культуролог|цивилизац/],['mind',/философ|психолог|социолог|педагог|этик/],['sport',/физическ.*культур|спорт|электив.*физ|волейбол|баскетбол|плаван/],['ecology',/эколог|природ|окружающ/],['project',/проект|практик|исследован|диплом|выпускн/],['code',/интеллект|программ|информ|данны|алгоритм|вычислит|операционн|цифров/],['math',/математ|алгебр|геометр|вероятност|статист|дискрет|дифференц|числен|оптимизац/],['physics',/физик|оптик|квант|термодинамик|астроном/],['language',/язык|лингвист|реч[ьи]|перевод|коммуникац/]];
 const subject=rules.find(([,pattern])=>pattern.test(title))?.[0]||'book';

 const drawings={chem:'<path d="M43 20h34m-27 0v30L28 89q-5 11 8 11h48q13 0 8-11L70 50V20M40 77h40"/><circle cx="56" cy="85" r="3"/><circle cx="67" cy="66" r="3"/>',code:'<rect x="27" y="27" width="66" height="66" rx="17"/><path d="M48 49 38 60l10 11m24-22 10 11-10 11M64 44l-8 32M43 14v13m17-13v13m17-13v13M43 93v13m17-13v13m17-13v13"/>',math:'<path d="M29 33h60M29 87h60M38 44l21 16-21 16m35-32L59 60l14 16"/>',physics:'<ellipse cx="60" cy="60" rx="45" ry="17"/><ellipse cx="60" cy="60" rx="45" ry="17" transform="rotate(60 60 60)"/><ellipse cx="60" cy="60" rx="45" ry="17" transform="rotate(120 60 60)"/><circle cx="60" cy="60" r="5"/>',language:'<path d="M23 28h57M51 18v10M37 39q8 27 35 35M68 28q-4 31-39 51M73 99l15-39 15 39m-24-13h18"/>',book:'<path d="M60 34q-18-14-39-7v65q21-7 39 7 18-14 39-7V27q-21-7-39 7v65M32 44l17 5m-17 9 17 5m23-14 15-5m-15 19 15-5"/>'};
 Object.assign(drawings,{
 biology:'<path d="M37 20q70 25 0 80m46-80q-70 25 0 80M38 29h44M43 45h34M43 75h34M38 91h44"/>',
 security:'<path d="M60 16 94 30v29q0 27-34 45-34-18-34-45V30Z"/><path d="m43 59 12 12 23-26"/>',
 network:'<circle cx="60" cy="60" r="12"/><circle cx="25" cy="25" r="9"/><circle cx="95" cy="25" r="9"/><circle cx="25" cy="95" r="9"/><circle cx="95" cy="95" r="9"/><path d="m33 33 18 18m18 0 18-18M33 87l18-18m18 0 18 18"/>',
 electronics:'<path d="M69 15 32 66h25l-6 39 37-54H63Z"/>',
 robot:'<rect x="25" y="35" width="70" height="57" rx="15"/><path d="M60 35V20m-35 35H15m80 0h10M44 77h32"/><circle cx="60" cy="16" r="4"/><circle cx="43" cy="55" r="5"/><circle cx="77" cy="55" r="5"/>',
 design:'<path d="m24 92 8-26L80 18l22 22-48 48Z M32 66l22 22M24 92l15-4M73 25l22 22"/>',
 mechanics:'<path d="m48 20 24 0 3 15 14 8 14-4 12 21-12 10v16L83 98l-13-9H50l-13 9-20-12V70L5 60l12-21 14 4 14-8Z"/><circle cx="60" cy="60" r="18"/>',
 economics:'<path d="M22 96V65h17v31m13 0V45h17v51m13 0V23h17v73M20 44l27-16 19 8 31-23"/>',
 law:'<path d="M60 20v79M35 99h50M25 37h70M33 37 16 70h34ZM87 37 70 70h34Z"/>',
 history:'<path d="M21 43h78L60 19ZM28 51v40m21-40v40m22-40v40m21-40v40M18 99h84"/>',
 mind:'<path d="M74 103V82q23-10 21-34C92 10 39 10 31 38L19 62h16v23h20v18M53 41q16-16 27 0t-15 24"/>',
 sport:'<circle cx="60" cy="60" r="43"/><path d="M17 60h86M60 17v86M29 29q62 31 0 62m62-62q-62 31 0 62"/>',
 ecology:'<path d="M30 91Q8 33 98 20q5 79-68 71Zm0 0 47-49M45 74l-2-22m17 8 23 1"/>',
 project:'<rect x="25" y="25" width="70" height="79" rx="10"/><rect x="43" y="16" width="34" height="18" rx="5"/><path d="m39 57 5 5 9-12m8 8h20M39 80h42"/>'});
 art.innerHTML='<svg viewBox="0 0 120 120" aria-hidden="true">'+drawings[subject]+'</svg>';if(subject==='book'&&shown){const initials=shown.title.split(/\s+/).filter(Boolean).slice(0,2).map(word=>word[0]).join('').toUpperCase();art.querySelector('svg').innerHTML='<circle cx="60" cy="60" r="40"/><text x="60" y="72" text-anchor="middle" stroke="none" fill="currentColor" font-size="32">'+safe(initials)+'</text>'}art.hidden=!shown;art.setAttribute('aria-hidden','true');
 let live=nextCard.querySelector('.lesson-live');if(!live){live=document.createElement('div');live.className='lesson-live';nextCard.querySelector('.next-copy').appendChild(live)}
 if(active){const begin=Number(active.start.slice(0,2))*60+Number(active.start.slice(3)),end=Number(active.end.slice(0,2))*60+Number(active.end.slice(3));live.innerHTML='<span><i></i> Сейчас идёт · ещё '+(end-minutes)+' мин</span><div class="lesson-progress"><b style="width:'+Math.round((minutes-begin)/(end-begin)*100)+'%"></b></div>'}else live.innerHTML=shown?'<span>Следующая пара</span>':'';
 $('#pair-total').innerHTML=(officialCache[calendarKey(target)]?rows.length:'—')+'<span>пар сегодня</span>';homeCards.get('pairs').querySelector('.stat-card>p').textContent=rows.length?rows[0].start+'–'+rows.at(-1).end:'Нет загруженных занятий';
 if(typeof updateBreakCard==='function')updateBreakCard(rows,minutes,!!officialCache[calendarKey(target)]);
 $('.day-title>span').textContent='Расписание МИРЭА';
}
$('#pairs-group').onclick=()=>openOfficialDirectory(currentOfficialTarget()?.target||1,currentOfficialTarget()?.title||state.group);
$('#group-button').onclick=()=>openOfficialDirectory(1,state.group);
chooseGroup=function(value){openOfficialDirectory(1,value);return false};
const directoryButton=document.createElement('button');directoryButton.className='official-directory-button';directoryButton.id='open-official-directory';directoryButton.innerHTML=icon('people')+'<span>Группы · преподаватели · аудитории</span>';directoryButton.onclick=()=>openOfficialDirectory();$('.pairs-tools').after(directoryButton);
$('#pairs-bell').onclick=()=>{const cache=officialCache[calendarKey(currentOfficialTarget())];modal(`<h2>Расписание МИРЭА</h2><p>${cache?'Последняя загрузка: '+new Date(cache.updated).toLocaleString('ru'):'Данные ещё не загружены.'}</p><button id="refresh-official" class="primary">Обновить сейчас</button>`);$('#refresh-official').onclick=()=>{$('#modal').close();const target=currentOfficialTarget();target?loadOfficial(target,true):openOfficialDirectory(1,state.group)}};
exportPairs=function(){const cache=officialCache[calendarKey(currentOfficialTarget())];if(!cache){toast('Сначала загрузи расписание');return}if(window.OrbitaAndroid?.exportCalendar)window.OrbitaAndroid.exportCalendar(cache.raw);else{const url=URL.createObjectURL(new Blob([cache.raw],{type:'text/calendar'})),link=document.createElement('a');link.href=url;link.download='mirea-schedule.ics';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}};$('#pairs-export').onclick=()=>exportPairs();
const showPageBeforeOfficial=showPage;showPage=function(p){showPageBeforeOfficial(p);if(p==='schedule'){renderSchedule();updateOfficialHome()}if(p==='miniapps'){$$('[data-mini-open="calendar"] small').forEach(el=>el.textContent='Расписание МИРЭА')}if(p==='mini-groups'){$('#mini-groups-page .pairs-disclaimer').textContent='Для загрузки найди группу в официальном поиске МИРЭА.'}};
$('.settings-about p').innerHTML='Данные расписания — schedule-of.mirea.ru.<br>Орбита — независимое приложение.';
const settingsSource=document.createElement('button');settingsSource.className='settings-link';settingsSource.innerHTML='<span>Поиск групп, преподавателей и аудиторий</span><span>›</span>';settingsSource.onclick=()=>openOfficialDirectory();$('.settings-section').appendChild(settingsSource);
$('.demo').textContent='Расписание МИРЭА';
$$('.campus-heading p').forEach(el=>el.textContent='Учебный кампус РТУ МИРЭА');
renderPairs();renderSchedule();updateOfficialHome();
async function initializeOfficial(){
 const current=currentOfficialTarget();
 if(current){await loadOfficial(current,true);return}
 const name=state.group;
 if(!name)return;
 // Some older installs have only a saved group name. A late lookup must
 // never replace a schedule the user selected while it was in flight.
 const sequence=++officialLoadSequence;
 officialBusy=true;renderPairs();
 try {
  const response=await officialRequest('search',name);
  if(sequence!==officialLoadSequence||currentOfficialTarget()||state.group!==name)return;
  const matches=normalizeOfficialResults(JSON.parse(response)).filter(row=>row.target===1&&row.title.toUpperCase()===name.toUpperCase());
  if(matches.length===1){
   const target=matches[0];
   state.pinnedGroup=state.officialGroup=state.officialSelection=target;
   if(typeof rememberGroup==='function')rememberGroup(target);
   if(typeof groupLabels==='function')groupLabels();
   save();await loadOfficial(target,true);return;
  }
  officialError='Группа не найдена однозначно. Выбери её через поиск.';
 }catch(error){
  if(sequence===officialLoadSequence)officialError='Официальный сервер недоступен: '+error.message;
 }finally{
  if(sequence===officialLoadSequence){officialBusy=false;renderPairs()}
 }
}

function openWidgetSchedule(){
 const own=state.pinnedGroup||state.officialGroup;
 if(!own){openSavedGroupPicker();return}
 state.officialSelection={...own};
 pairsDate=new Date(moscowParts(new Date()).date+'T12:00:00');
 pairsMode='day';pairsQuery='';pairsType='all';
 if($('#pairs-search'))$('#pairs-search').value='';
 save();showPage('pairs');loadOfficial(own);
}
initializeOfficial();

setInterval(()=>{if(page==='schedule')updateOfficialHome()},30000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)updateOfficialHome()});
