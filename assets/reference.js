// Dedicated timetable inspired by the supplied reference; the editable home dashboard is preserved.
const icons={home:'<path d="m3 10 9-7 9 7v10h-6v-7H9v7H3z"/>',calendar:'<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 2v6m10-6v6M3 11h18"/>',map:'<path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2zm6-2v16m6-14v16"/>',grid:'<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',user:'<circle cx="12" cy="7" r="4"/><path d="M4 22c0-9 16-9 16 0"/>',search:'<circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/>',filter:'<path d="M3 7h18M3 17h18"/><circle cx="9" cy="7" r="2"/><circle cx="15" cy="17" r="2"/>',bell:'<path d="M5 17h14l-2-4V9a5 5 0 0 0-10 0v4zm5 4h4"/>',download:'<path d="M12 2v14m-6-6 6 6 6-6M3 21h18"/>',pin:'<path d="M18 9c0 5-6 11-6 11S6 14 6 9a6 6 0 1 1 12 0z"/><circle cx="12" cy="9" r="2"/>',people:'<circle cx="9" cy="7" r="3"/><path d="M3 20v-3a6 6 0 0 1 12 0v3m1-16a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 5"/>'};
icons.check='<rect x="3" y="3" width="18" height="18" rx="5"/><path d="m7 12 3 3 7-7"/>';
icons.settings='<path d="m9 3-1 3-3 1-2 4 2 2v3l4 3 3-1 3 1 4-3v-3l2-2-2-4-3-1-1-3z"/><circle cx="12" cy="12" r="3"/>';
const icon=(key)=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[key]}</svg>`;
document.body.classList.add('reference-ui');
if(!state.referenceDesign){state.theme='dark';state.referenceDesign=true;applyTheme();save()}
const applyThemeBeforeReference=applyTheme;
applyTheme=function(){applyThemeBeforeReference();if(state.theme==='dark'){document.documentElement.style.setProperty('--accent','#a9c4ff');document.documentElement.style.setProperty('--accent-soft','#222c40')}document.querySelector('meta[name="theme-color"]').content=state.theme==='dark'?'#000000':'#f4f5f9'};
applyTheme();
const pairsPage=document.createElement('section');pairsPage.id='pairs-page';
pairsPage.innerHTML=`<div class="pairs-heading"><div><p id="pairs-week-meta"></p><h1>Пары</h1></div><div class="pairs-heading-actions"><button class="pairs-group" id="pairs-group"><b></b><span>⌄</span></button><button class="round-control" id="pairs-filter" aria-label="Фильтр занятий">${icon('filter')}</button></div></div><div class="pairs-tools"><label class="pairs-search">${icon('search')}<input type="search" id="pairs-search" placeholder="Поиск" aria-label="Поиск по предмету, преподавателю или аудитории"></label><button class="round-control bell-control" id="pairs-bell" aria-label="Уведомления">${icon('bell')}<i></i></button><button class="round-control" id="pairs-export" aria-label="Экспорт расписания в календарь">${icon('download')}</button></div><div class="pairs-modes" role="group" aria-label="Вид расписания"><button data-pairs-mode="day">День</button><button data-pairs-mode="week">Неделя</button><button data-pairs-mode="month">Месяц</button></div><div id="pairs-dates"></div><div class="pairs-section-heading"><h2 id="pairs-day-name"></h2><span class="pairs-demo">Демо</span></div><div class="pairs-navigation"><button id="pairs-prev">← нед</button><button id="pairs-today">сегодня</button><button id="pairs-next">нед →</button><span id="pairs-count"></span></div><div id="pairs-filter-status"></div><div id="pairs-results"></div><p class="pairs-disclaimer">Пример расписания · без синхронизации с МИРЭА</p>`;
document.querySelector('main').insertBefore(pairsPage,homeRoot);
const campusPage=document.createElement('section');campusPage.id='campus-page';campusPage.hidden=true;campusPage.innerHTML=`<div class="campus-heading"><span class="eyebrow">РТУ МИРЭА</span><h1>Кампус</h1><p>Адрес из демонстрационного расписания</p></div><article class="campus-card">${icon('map')}<h2>Проспект Вернадского, 78</h2><p>Москва · учебный кампус РТУ МИРЭА</p><a class="primary" href="https://yandex.ru/maps/?text=Москва%20проспект%20Вернадского%2078" target="_blank" rel="noopener">Открыть на карте ↗</a></article><p class="pairs-disclaimer">Аудитории в расписании приведены для примера.</p>`;pairsPage.after(campusPage);
let pairsDate=new Date();pairsDate.setHours(12,0,0,0);
let pairsMode='day',pairsType='all',pairsQuery='';
function dateKey(date){return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`}
function sameDay(a,b){return dateKey(a)===dateKey(b)}
function pairsMonday(date){const copy=new Date(date);copy.setDate(copy.getDate()-(copy.getDay()+6)%7);return copy}
function weekNumber(date){const year=date.getFullYear(),month=date.getMonth();const semester=new Date(month===0?year-1:year,month===0||month>=8?8:1,1,12);return Math.floor(Math.round((pairsMonday(date)-pairsMonday(semester))/86400000)/7)+1}
function pairsData(date){return dayData((date.getDay()+6)%7)}
function filteredPairs(date){return pairsData(date).map((l,i)=>({...l,index:i})).filter(l=>(pairsType==='all'||l.type===pairsType)&&(!pairsQuery||`${l.title} ${l.teacher} ${l.room}`.toLocaleLowerCase('ru').includes(pairsQuery)))}
function pairCount(n){return n%10===1&&n%100!==11?`${n} пара`:n%10>=2&&n%10<=4&&(n%100<12||n%100>14)?`${n} пары`:`${n} пар`}
function dateButton(date,monthView=false){const dow=(date.getDay()+6)%7;return `<button class="pairs-date ${sameDay(date,pairsDate)?'selected':''} ${dow>4?'weekend':''} ${monthView&&date.getMonth()!==pairsDate.getMonth()?'other-month':''}" data-pairs-date="${dateKey(date)}" ${sameDay(date,pairsDate)?'aria-current="date"':''} aria-label="${date.toLocaleDateString('ru',{weekday:'long',day:'numeric',month:'long'})}">${!monthView?`<small>${days[dow]}</small>`:''}<b>${date.getDate()}</b><span class="pair-dots">${pairsData(date).map(l=>`<i class="${l.color}"></i>`).join('')}</span></button>`}
function renderPairDateStrip(){
 const monday=pairsMonday(pairsDate);let html='';
 if(pairsMode==='month'){
  const start=new Date(pairsDate.getFullYear(),pairsDate.getMonth(),1,12);const gridStart=pairsMonday(start);
  html=`<div class="month-heading"><b>${pairsDate.toLocaleDateString('ru',{month:'long',year:'numeric'})}</b></div><div class="pairs-month">${days.map(d=>`<span class="month-weekday">${d}</span>`).join('')}${Array.from({length:42},(_,i)=>{const d=new Date(gridStart);d.setDate(d.getDate()+i);return dateButton(d,true)}).join('')}</div>`;
 }else html=`<div class="pairs-week">${Array.from({length:7},(_,i)=>{const d=new Date(monday);d.setDate(d.getDate()+i);return dateButton(d)}).join('')}</div>`;
 $('#pairs-dates').innerHTML=html;
 $$('[data-pairs-date]').forEach(b=>b.onclick=()=>{pairsDate=new Date(b.dataset.pairsDate+'T12:00:00');renderPairs()});
}
function pairCard(l,date,next){
 return `<button class="pair-card ${l.color}" data-pair-open="${dateKey(date)}|${l.index}" aria-label="${l.start}, ${safe(l.title)}, заметка"><div class="pair-time"><b>${l.start}</b><span>${l.end}</span></div><div class="pair-content"><h3>${safe(l.title)}</h3><div class="pair-meta"><span class="pair-type">${l.type==='Лекция'?'≋ ЛЕК':l.type==='Лабораторная работа'?'⚗ ЛАБ':'✎ ПРАК'}</span><span class="pair-room">${icon('pin')} ${safe(l.room)} · В-78</span>${next?'<span class="pair-next">· следующая</span>':''}</div><p class="pair-teacher">${icon('people')}${safe(l.teacher)}</p></div></button>`;
}
function renderPairList(date){
 const rows=filteredPairs(date),now=new Date(),minutes=now.getHours()*60+now.getMinutes(),current=sameDay(now,date);
 const next=rows.find(l=>Number(l.start.slice(0,2))*60+Number(l.start.slice(3))>=minutes);
 let clockPlaced=false;
 let html=rows.map((l,index)=>{
  const start=Number(l.start.slice(0,2))*60+Number(l.start.slice(3));
  const clock=current&&!clockPlaced&&start>=minutes?(clockPlaced=true,`<div class="pairs-now"><b>${now.toLocaleTimeString('ru',{hour:'2-digit',minute:'2-digit'})}</b><i></i></div>`):'';
  const previous=rows[index-1],gap=previous?(Number(l.start.slice(0,2))*60+Number(l.start.slice(3)))-(Number(previous.end.slice(0,2))*60+Number(previous.end.slice(3))):0;
  return (gap>0?`<div class="pair-break"><i></i>перерыв ${gap} мин<i></i></div>`:'')+clock+pairCard(l,date,next&&next.index===l.index&&current);
 }).join('');
 if(!rows.length)html=`<div class="pairs-empty"><span>✧</span><h3>${pairsQuery||pairsType!=='all'?'Ничего не найдено':'Свободный день'}</h3><p>${pairsQuery||pairsType!=='all'?'Попробуй другой запрос или фильтр.':'Сегодня можно выдохнуть.'}</p></div>`;
 return html;
}
function renderPairs(){
 $('#pairs-group b').textContent=state.group;
 const number=weekNumber(pairsDate);$('#pairs-week-meta').textContent=`${number}-я нед · ${number%2?'нечётная':'чётная'}`;
 $$('[data-pairs-mode]').forEach(b=>{b.classList.toggle('selected',b.dataset.pairsMode===pairsMode);b.setAttribute('aria-pressed',String(b.dataset.pairsMode===pairsMode))});
 renderPairDateStrip();
 $('#pairs-day-name').textContent=sameDay(pairsDate,new Date())?'Сегодня':pairsDate.toLocaleDateString('ru',{day:'numeric',month:'long'});
 let dates=[pairsDate];
 if(pairsMode==='week'){const monday=pairsMonday(pairsDate);dates=Array.from({length:7},(_,i)=>{const d=new Date(monday);d.setDate(d.getDate()+i);return d})}
 $('#pairs-count').textContent=pairCount(dates.reduce((n,d)=>n+filteredPairs(d).length,0));
 $('#pairs-prev').textContent=pairsMode==='month'?'← мес':'← нед';$('#pairs-next').textContent=pairsMode==='month'?'мес →':'нед →';
 $('#pairs-results').innerHTML=dates.map(d=>(pairsMode==='week'?`<h3 class="pairs-weekday-title">${d.toLocaleDateString('ru',{weekday:'long',day:'numeric',month:'long'})}</h3>`:'')+renderPairList(d)).join('');
 $('#pairs-filter').classList.toggle('has-filter',pairsType!=='all');
 $('#pairs-filter-status').innerHTML=pairsType!=='all'?`<button class="filter-chip" id="clear-pairs-filter">${safe(pairsType)} ×</button>`:'';
 if($('#clear-pairs-filter'))$('#clear-pairs-filter').onclick=()=>{pairsType='all';renderPairs()};
 $$('[data-pair-open]').forEach(b=>b.onclick=()=>openPairDetails(...b.dataset.pairOpen.split('|')));
}
function openPairDetails(key,index){
 const date=new Date(key+'T12:00:00'),l=pairsData(date)[Number(index)],noteKey=`date:${key}:${state.group}:${index}`;
 modal(`<span class="eyebrow">${safe(l.type)} · ДЕМО</span><h2>${safe(l.title)}</h2><p>${date.toLocaleDateString('ru',{day:'numeric',month:'long'})} · ${l.start}–${l.end}<br>Аудитория ${safe(l.room)} · Вернадского, 78<br>${safe(l.teacher)}</p><label for="pair-note">Заметка к паре</label><textarea id="pair-note" rows="4" maxlength="2000" placeholder="Что подготовить…">${safe(state.notes[noteKey]||'')}</textarea><button class="primary" id="save-pair-note">Сохранить</button>`);
 $('#save-pair-note').onclick=()=>{const previous=state.notes[noteKey];state.notes[noteKey]=$('#pair-note').value;if(!save()){state.notes[noteKey]=previous;return}$('#modal').close();toast('Заметка сохранена')};
}
$('#pairs-search').oninput=e=>{pairsQuery=e.target.value.trim().toLocaleLowerCase('ru');renderPairs()};
$('#pairs-group').onclick=()=>$('#group-button').click();
const chooseGroupBeforeReference=chooseGroup;chooseGroup=function(value){const ok=chooseGroupBeforeReference(value);if(ok)renderPairs();return ok};
$('#pairs-filter').onclick=()=>{
 modal(`<h2>Какие занятия показывать?</h2><div class="pair-filter-options">${[['all','Все занятия'],['Лекция','Лекции'],['Практическое занятие','Практика'],['Лабораторная работа','Лабораторные']].map(([key,name])=>`<button data-pair-filter="${key}" class="${pairsType===key?'selected':''}">${name}<span>${pairsType===key?'✓':''}</span></button>`).join('')}</div>`);
 $$('[data-pair-filter]').forEach(b=>b.onclick=()=>{pairsType=b.dataset.pairFilter;$('#modal').close();renderPairs()});
};
$$('[data-pairs-mode]').forEach(b=>b.onclick=()=>{pairsMode=b.dataset.pairsMode;renderPairs()});
function shiftPairs(direction){if(pairsMode==='month'){pairsDate.setDate(1);pairsDate.setMonth(pairsDate.getMonth()+direction)}else pairsDate.setDate(pairsDate.getDate()+7*direction);renderPairs()}
$('#pairs-prev').onclick=()=>shiftPairs(-1);$('#pairs-next').onclick=()=>shiftPairs(1);$('#pairs-today').onclick=()=>{pairsDate=new Date();pairsDate.setHours(12,0,0,0);renderPairs()};
$('#pairs-bell').onclick=()=>modal('<h2>Расписание в деморежиме</h2><p>Изменения университета пока не поступают в приложение. Уведомления о переносах появятся после подключения настоящего расписания.</p><a class="primary" style="display:inline-block" href="https://www.mirea.ru/schedule/" target="_blank" rel="noopener">Открыть сайт МИРЭА ↗</a>');
function exportPairs(){
 const monday=pairsMonday(pairsDate),escapeICS=s=>String(s).replace(/\\/g,'\\\\').replace(/\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;');
 const events=[];
 for(let day=0;day<7;day++){const date=new Date(monday);date.setDate(date.getDate()+day);pairsData(date).forEach((l,i)=>{
  const stamp=time=>dateKey(date).replaceAll('-','')+'T'+time.replace(':','')+'00';
  events.push(['BEGIN:VEVENT',`UID:${dateKey(date)}-${i}-${encodeURIComponent(state.group)}@orbita.local`,`DTSTAMP:${new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'')}`,`DTSTART;TZID=Europe/Moscow:${stamp(l.start)}`,`DTEND;TZID=Europe/Moscow:${stamp(l.end)}`,`SUMMARY:${escapeICS('[ДЕМО] '+l.title)}`,`LOCATION:${escapeICS(l.room+' · Вернадского, 78')}`,`DESCRIPTION:${escapeICS('Демонстрационные данные · '+state.group+' · '+l.teacher)}`,'END:VEVENT'].join('\r\n'));
 })}
 const content=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Orbita//Demo Schedule//RU','CALSCALE:GREGORIAN',...events,'END:VCALENDAR',''].join('\r\n');
 if(window.OrbitaAndroid&&window.OrbitaAndroid.exportCalendar){window.OrbitaAndroid.exportCalendar(content);toast('Выбери, куда сохранить файл календаря');return}
 const url=URL.createObjectURL(new Blob([content],{type:'text/calendar;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='orbita-demo.ics';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
$('#pairs-export').onclick=exportPairs;
const showPageBeforeReference=showPage;
showPage=function(p){
 if(p==='cards'){showPage('schedule');startHomeEdit();window.scrollTo({top:0,behavior:'smooth'});return}
 const extra=p==='pairs'||p==='campus';
 if(extra&&homeEditing)cancelHomeEdit();
 showPageBeforeReference(extra?'schedule':p);
 pairsPage.hidden=p!=='pairs';campusPage.hidden=p!=='campus';
 if(extra){homeRoot.hidden=true;page=p}
 document.body.classList.toggle('view-pairs',p==='pairs');document.body.classList.toggle('view-campus',p==='campus');
 $$('.mobile-nav [data-ref-page]').forEach(b=>{const active=b.dataset.refPage===p;b.classList.toggle('active',active);b.setAttribute('aria-current',active?'page':'false')});
 if(p==='pairs')renderPairs();
};
$('.mobile-nav').innerHTML=[['schedule','home','Главная'],['pairs','calendar','Пары'],['campus','map','Кампус'],['miniapps','grid','Мини-приложения'],['settings','settings','Настройки']].map(([p,i,label])=>`<button data-ref-page="${p}" aria-label="${label}">${icon(i)}${p==='pairs'?'<i class="nav-dot"></i>':''}</button>`).join('');
$$('[data-ref-page]').forEach(b=>b.onclick=()=>showPage(b.dataset.refPage));
showPage('schedule');
setInterval(()=>{if(page==='pairs')renderPairs()},60000);
