// In-app card dashboard. DOM nodes are moved intact so existing schedule/task handlers survive edits.
const homeCatalog = {
 deadlines:{name:'Ближайшие работы',icon:'☑',description:'Лабы, чертежи и контрольные к сдаче'},
 rooms:{name:'Аудитории дня',icon:'⌖',description:'Где проходят твои занятия'},
 subjects:{name:'Мои предметы',icon:'▤',description:'Быстро добавить работу по дисциплине'},
 progress:{name:'Прогресс задач',icon:'✓',description:'Сколько дел уже выполнено'},
 week:{name:'Учебная неделя',icon:'▦',description:'Занятия на ближайшие семь дней'},
 shortcuts:{name:'Быстрый доступ',icon:'↗',description:'Карты, заметки и инструменты'},
 today:{name:'Дата и группа',icon:'☀',description:'Сегодняшний день и твоя группа'},
 next:{name:'Ближайшая пара',icon:'✦',description:'Занятие, время и аудитория',selector:'.next-card'},
 schedule:{name:'Расписание',icon:'▦',description:'Дни недели и список занятий',selector:'.schedule-panel'},
 pairs:{name:'Пары за день',icon:'▤',description:'Короткая сводка учебного дня',selector:'.stat-card:not(.free)'},
 break:{name:'Перерыв',icon:'☕',description:'Время, чтобы выдохнуть',selector:'.stat-card.free'},
 tasks:{name:'Мои задачи',icon:'☑',description:'Дела с отметкой выполнения',selector:'.tasks-card'},
 note:{name:'Моя заметка',icon:'✎',description:'Важное всегда перед глазами'}
};
if(window.OrbitaAndroid?.openAttendanceScanner){
 homeCatalog.attendanceQr={name:'QR посещения',icon:'⌗',description:'Открыть сканер для отметки на паре'};
}
const defaultHomeLayout = [
 {id:'next',size:'large'},{id:'pairs',size:'small'},
 {id:'break',size:'small'},...(homeCatalog.attendanceQr?[{id:'attendanceQr',size:'large',detail:'compact'}]:[]),{id:'schedule',size:'large'},
 {id:'tasks',size:'large'},{id:'note',size:'large'}
];
function normalizeHomeLayout(input){
 const seen=new Set();
 if(!Array.isArray(input)) return defaultHomeLayout.map(x=>({...x})).filter(x=>x.id!=='next'||state.dashboard.next).filter(x=>!['pairs','break'].includes(x.id)||state.dashboard.stats).filter(x=>x.id!=='tasks'||state.dashboard.tasks);
 return input.filter(x=>x&&homeCatalog[x.id]&&!seen.has(x.id)&&seen.add(x.id)).map(x=>({id:x.id,size:x.size==='small'?'small':'large',...(['compact','normal','expanded'].includes(x.detail)?{detail:x.detail}:{}),...(Number.isFinite(x.height)?{height:Math.max(180,Math.min(['pairs','break'].includes(x.id)?360:640,x.height))}:{})}));
}
state.homeLayout=normalizeHomeLayout(state.homeLayout);
if(homeCatalog.attendanceQr&&!state.attendanceQrIntroduced){
 if(!state.homeLayout.some(card=>card.id==='attendanceQr')){
  const scheduleIndex=state.homeLayout.findIndex(card=>card.id==='schedule');
  state.homeLayout.splice(scheduleIndex<0?state.homeLayout.length:scheduleIndex,0,{id:'attendanceQr',size:'large',detail:'compact'});
 }
 state.attendanceQrIntroduced=true;
}
let homeDraft=null,homeEditing=false,homeDrag=null;
const homeCards=new Map(),homeRoot=$('#schedule-page');
const homeToolbar=document.createElement('div');homeToolbar.className='home-toolbar';
const homeGrid=document.createElement('div');homeGrid.className='home-grid';
const homeParking=document.createElement('div');homeParking.hidden=true;
const homeEmpty=document.createElement('div');homeEmpty.className='home-empty';
homeEmpty.innerHTML='<span>✧</span><h2>Твой экран — твои карточки</h2><p>Добавь расписание, задачи или заметку.</p><button class="primary" id="empty-add-card">+ Добавить карточку</button>';
Object.entries(homeCatalog).forEach(([id,info])=>{
 const wrapper=document.createElement('section');wrapper.className='home-card';wrapper.dataset.card=id;wrapper.setAttribute('aria-label',info.name);
 const controls=document.createElement('div');controls.className='home-card-controls';
 let content;
 if(info.selector) content=$(info.selector);
 else if(id!=='note'){content=document.createElement('section');content.className='home-note extra-card';content.dataset.extra=id;}
 else {content=document.createElement('section');content.className='home-note';content.innerHTML='<div class="section-title"><h2>Моя заметка</h2><button class="plus" id="edit-home-note" aria-label="Редактировать заметку">✎</button></div><div class="home-note-text"></div><span class="home-note-caption">Только для тебя · на этом устройстве</span>';}
 const resize=document.createElement('button');resize.className='home-resize';resize.setAttribute('aria-label','Изменить размер: '+info.name);resize.innerHTML='<span></span>';resize.onpointerdown=e=>beginCardResize(e,id);resize.onkeydown=e=>resizeCardKey(e,id);wrapper.append(controls,content,resize);homeCards.set(id,wrapper);
});
homeRoot.replaceChildren(homeToolbar,homeGrid,homeEmpty,homeParking);
function currentHomeLayout(){return homeEditing?homeDraft:state.homeLayout}
function renderHomeNote(){
 const text=homeCards.get('note').querySelector('.home-note-text');
 text.textContent=state.homeNote||'Что важно сегодня? Запиши здесь — и это останется под рукой.';
 text.classList.toggle('placeholder',!state.homeNote);
}
function commitHomeLayout(){
 const previous=state.homeLayout;
 state.homeLayout=homeDraft.map(x=>({...x}));
 if(!save()){state.homeLayout=previous;return false;}
 homeEditing=false;homeDraft=null;renderHome();toast('Главный экран сохранён');return true;
}
function cancelHomeEdit(){homeDrag=null;homeEditing=false;homeDraft=null;renderHome()}
function startHomeEdit(){if(homeEditing)return;homeDraft=state.homeLayout.map(x=>({...x}));homeEditing=true;renderHome()}
function changeHomeCard(id,action){
 if(!homeEditing)return;
 const index=homeDraft.findIndex(x=>x.id===id);if(index<0)return;
 if(action==='remove')homeDraft.splice(index,1);
 if(action==='size')homeDraft[index].size=homeDraft[index].size==='small'?'large':'small';
 const next=action==='up'?index-1:action==='down'?index+1:index;
 if(next!==index&&next>=0&&next<homeDraft.length){const [card]=homeDraft.splice(index,1);homeDraft.splice(next,0,card)}
 renderHome();
}
function renderHome(){
 const layout=currentHomeLayout();
 homeRoot.classList.toggle('home-editing',homeEditing);
 homeToolbar.innerHTML=homeEditing?'<div><b>Изменить главный экран</b><small>Порядок — за ⠿ · размер — за угол</small></div><div class="home-toolbar-actions"><button id="home-cancel">Отмена</button><button class="home-done" id="home-done">Готово</button></div>':'<div><b>Мои карточки</b></div><button class="home-edit-button" id="home-edit">Изменить</button>';
 if(!homeEditing){
  const edit=$('#home-edit');
  edit.previousElementSibling.classList.add('home-toolbar-caption');
  const actions=document.createElement('div');
  actions.className='home-quick-actions';
  const grades=document.createElement('button');
  grades.type='button';
  grades.className='home-grades-shortcut';
  grades.textContent='Баллы БРС';
  grades.onclick=()=>{showPage('mini-courses');window.scrollTo(0,0)};
  edit.replaceWith(actions);
  if(window.OrbitaAndroid?.loadMireaGrades)actions.append(grades);
  if(window.OrbitaAndroid?.openAttendanceScanner&&!layout.some(card=>card.id==='attendanceQr')){
   const qr=document.createElement('button');
   qr.type='button';
   qr.className='home-grades-shortcut';
   qr.textContent='QR';
   qr.setAttribute('aria-label','Сканировать QR посещения');
   qr.onclick=()=>openAttendanceScanner();
   actions.append(qr);
  }
  actions.append(edit);
 }
 if(homeEditing){$('#home-cancel').onclick=cancelHomeEdit;$('#home-done').onclick=commitHomeLayout}else $('#home-edit').onclick=startHomeEdit;
 homeCards.forEach(card=>homeParking.appendChild(card));
 homeGrid.replaceChildren();
 layout.forEach((item,index)=>{
  const card=homeCards.get(item.id),info=homeCatalog[item.id];
  card.dataset.size=item.size;card.hidden=false;const content=card.querySelector(info.selector||'.home-note');content.hidden=false;content.style.height='';content.style.minHeight=item.height?Math.min(['pairs','break'].includes(item.id)?360:640,item.height)+'px':'';card.classList.toggle('has-custom-height',!!item.height);card.querySelector('.home-resize').hidden=!homeEditing;
  const controls=card.querySelector('.home-card-controls');controls.hidden=!homeEditing;
  controls.innerHTML=homeEditing?`<div class="card-edit-label"><button class="card-drag-handle" data-drag="${item.id}" aria-label="Перетащить: ${info.name}">⠿</button><b>${info.name}</b></div><div class="card-edit-actions"><button data-card-action="up" ${index===0?'disabled':''} aria-label="Поднять: ${info.name}">↑</button><button data-card-action="down" ${index===layout.length-1?'disabled':''} aria-label="Опустить: ${info.name}">↓</button><button class="card-remove" data-card-action="remove" aria-label="Убрать: ${info.name}">−</button></div>`:'';
  controls.querySelectorAll('[data-card-action]').forEach(b=>b.onclick=()=>changeHomeCard(item.id,b.dataset.cardAction));
  const handle=controls.querySelector('[data-drag]');if(handle)handle.onpointerdown=e=>beginHomeDrag(e,item.id);
  homeGrid.appendChild(card);
 });
 const columns=window.innerWidth>900?4:2;let used=0,last=null;
 for(const item of layout){const card=homeCards.get(item.id);let span=item.id==='schedule'?columns:item.size==='small'?1:2;if(used+span>columns){used=0}card.dataset.span=span;card.style.gridColumn='span '+span;used+=span;last=card;if(used===columns){used=0;last=null}}

 if(homeEditing){const add=document.createElement('button');add.className='home-add-tile';add.innerHTML='<span>+</span>Добавить карточку';add.onclick=openHomeCatalog;homeGrid.appendChild(add)}
 homeEmpty.hidden=layout.length>0||homeEditing;
 renderHomeNote();
}
function openHomeCatalog(){
 if(!homeEditing)startHomeEdit();
 modal(`<h2>Добавить карточку</h2><p>Выбери, что будет на главном экране.</p><div class="home-card-catalog">${Object.entries(homeCatalog).map(([id,info])=>{const added=homeDraft.some(x=>x.id===id);return `<button data-add-home="${id}" ${added?'disabled':''}><span class="catalog-icon">${info.icon}</span><div><b>${info.name}</b><small>${info.description}</small></div><span>${added?'✓':'+'}</span></button>`}).join('')}</div><button id="home-reset" class="home-reset">Вернуть стандартный набор</button>`);
 $$('[data-add-home]').forEach(b=>b.onclick=()=>{homeDraft.push({id:b.dataset.addHome,size:'large'});$('#modal').close();renderHome()});
 $('#home-reset').onclick=()=>{homeDraft=defaultHomeLayout.map(x=>({...x}));$('#modal').close();renderHome()};
}
function beginHomeDrag(event,id){
 if(event.button!==0||!homeEditing)return;
 event.preventDefault();
 homeDrag={id,y:event.clientY,x:event.clientX,moved:false};
 homeCards.get(id).classList.add('is-dragging');
}
document.addEventListener('pointermove',event=>{
 if(!homeDrag)return;
 event.preventDefault();
 if(Math.hypot(event.clientX-homeDrag.x,event.clientY-homeDrag.y)<8)return;
 homeDrag.moved=true;
 // Allow dragging through a long mobile dashboard without releasing the handle.
 if(event.clientY<110)window.scrollBy(0,-14);
 else if(event.clientY>window.innerHeight-110)window.scrollBy(0,14);
 const target=document.elementFromPoint(event.clientX,event.clientY)?.closest('.home-card');
 if(!target||target.dataset.card===homeDrag.id)return;
 const from=homeDraft.findIndex(x=>x.id===homeDrag.id),to=homeDraft.findIndex(x=>x.id===target.dataset.card);
 if(from<0||to<0)return;
 const [item]=homeDraft.splice(from,1);homeDraft.splice(to,0,item);
 const source=homeCards.get(homeDrag.id);
 homeGrid.insertBefore(source,from<to?target.nextSibling:target);
},{passive:false});
function finishHomeDrag(){if(!homeDrag)return;homeCards.get(homeDrag.id).classList.remove('is-dragging');homeDrag=null;renderHome()}
document.addEventListener('pointerup',finishHomeDrag);
document.addEventListener('pointercancel',finishHomeDrag);
$('#empty-add-card').onclick=openHomeCatalog;
homeCards.get('note').querySelector('#edit-home-note').onclick=()=>{
 modal(`<h2>Моя заметка</h2><textarea id="home-note-input" maxlength="2000" rows="7" placeholder="Планы, мысли, напоминания…">${safe(state.homeNote||'')}</textarea><button class="primary" id="save-home-note">Сохранить</button>`);
 $('#save-home-note').onclick=()=>{const previous=state.homeNote;state.homeNote=$('#home-note-input').value;if(!save()){state.homeNote=previous;return}$('#modal').close();renderHomeNote();toast('Заметка сохранена')};
};
const originalShowPage=showPage;
showPage=function(p){
 if(homeEditing&&p!=='schedule')cancelHomeEdit();
 originalShowPage(p);
 if(p==='schedule'){$('#crumb').textContent='Главная';$('#page-title').innerHTML='Мой день<span> в орбите</span><span class="spark">✳</span>';$('#page-subtitle').textContent='Твои карточки, твой порядок, твой ритм.';}
};
$$('[data-page="schedule"]').forEach(b=>{if(b.closest('.mobile-nav'))b.innerHTML='▦<small>Главная</small>';else b.innerHTML='<span>▦</span> Главная'});
const homeSettings=document.createElement('section');homeSettings.className='standalone widget-settings';homeSettings.innerHTML='<span class="eyebrow">ТВОЙ ГЛАВНЫЙ ЭКРАН</span><h2>Собери свой день</h2><p>Добавляй карточки, меняй их размер и порядок прямо на главном экране.</p><button class="primary" id="settings-edit-home">Настроить карточки</button>';
$('#settings-page').appendChild(homeSettings);
$('#settings-edit-home').onclick=()=>{showPage('schedule');startHomeEdit();window.scrollTo({top:0,behavior:'smooth'})};
renderHome();showPage('schedule');save();

window.addEventListener("resize",()=>{if(!homeDrag)renderHome()});
