// Student tools live under one icon; each tile opens a working tool.
state.notebooks=Array.isArray(state.notebooks)?state.notebooks:[];
state.favoriteGroups=Array.isArray(state.favoriteGroups)?state.favoriteGroups:[];
const miniPages={};
function createMiniPage(id,html){const section=document.createElement('section');section.id=id+'-page';section.className='mini-page';section.hidden=true;section.innerHTML=html;homeRoot.after(section);miniPages[id]=section;return section}
const miniBack=()=>'<button class="mini-back" data-mini-back>'+courseChevron('left')+'<span>Мини-приложения</span></button>';
createMiniPage('miniapps',`<div class="mini-heading"><span class="eyebrow">ТВОИ ИНСТРУМЕНТЫ</span><h1>Мини-приложения</h1><p>Всё для учёбы. В одном месте.</p></div><div class="mini-grid" id="mini-grid"></div><div class="mini-local-caption">${icon('grid')}<span>Твой набор на каждый день</span></div>`);
createMiniPage('mini-notes',`${miniBack()}<div class="mini-heading mini-heading-row"><div><span class="eyebrow">ИДЕИ И ВАЖНОЕ</span><h1>Заметки</h1></div><button class="mini-add" id="mini-new-note" aria-label="Добавить заметку">+</button></div><label class="mini-search">${icon('search')}<input id="mini-notes-search" type="search" placeholder="Найти заметку" aria-label="Поиск заметок"></label><div id="mini-notes-list" class="mini-notes-list"></div>`);
createMiniPage('mini-groups',`${miniBack()}<div class="mini-heading"><span class="eyebrow">РТУ МИРЭА</span><h1>Группы</h1><p>Выбирай свою группу и сохраняй избранные.</p></div><div class="mini-current-group"><span>ТВОЯ ГРУППА</span><b id="mini-current-group"></b><small>Восстанавливается при каждом запуске</small></div><label class="mini-search">${icon('search')}<input id="mini-groups-search" type="search" placeholder="Найти среди сохранённых" aria-label="Поиск сохранённых групп"></label><div id="mini-groups-list"></div><button class="primary mini-wide-button" id="mini-enter-group">+ Ввести свою группу</button><p class="pairs-disclaimer">Выбор группы сохраняет её название. Занятия пока демонстрационные, без загрузки расписания университета.</p>`);
createMiniPage('mini-map',`${miniBack()}${campusPage.innerHTML}`);
const tasksBack=document.createElement('div');tasksBack.className='mini-tasks-back';tasksBack.innerHTML=miniBack();$('#tasks-page').prepend(tasksBack);
$$('[data-mini-back]').forEach(button=>button.onclick=()=>showPage('miniapps'));
function miniNotes(){
 const notes=state.notebooks.map(note=>({...note}));
 if(state.homeNote)notes.unshift({id:'home',title:'Заметка с главной',body:state.homeNote,updated:0});
 return notes;
}
function openPulseGrades(account=false){
 if(window.OrbitaAndroid?.openPulseGrades){
  window.OrbitaAndroid.openPulseGrades(document.documentElement.style.getPropertyValue('--bg').trim(),account===true);
 }else toast('Вход МИРЭА доступен в приложении Android');
}
function renderMiniHub(){
 const pending=state.tasks.filter(task=>!task.done).length;
 const tiles=[
  {id:'mini-map',icon:'map',name:'Карты',caption:'Кампус и маршруты',color:'mint',meta:'РТУ МИРЭА'},
  {id:'mini-notes',icon:'edit',name:'Заметки',caption:'Мысли, планы, конспекты',color:'peach',meta:`Заметок: ${miniNotes().length}`},
  {id:'mini-groups',icon:'people',name:'Группы',caption:'Твоя группа и избранные',color:'violet',meta:state.group},
  {id:'tasks',icon:'check',name:'Задачи',caption:'Всё, что нужно сделать',color:'blue',meta:pending?`Осталось: ${pending}`:'Всё сделано'},
  {id:'cards',icon:'grid',name:'Карточки',caption:'Настроить главный экран',color:'pink',meta:'Свой порядок'},
  {id:'calendar',icon:'calendar',name:'Календарь',caption:'Посмотреть весь месяц',color:'yellow',meta:'Расписание · демо'}
 ];
 $('#mini-grid').innerHTML=tiles.map(tile=>`<button class="mini-tile ${tile.color}" data-mini-open="${tile.id}"><span class="mini-tile-top"><i>${icon(tile.icon)}</i><span>↗</span></span><b>${tile.name}</b><p>${tile.caption}</p><small>${safe(tile.meta)}</small></button>`).join('');
 $$('[data-mini-open]').forEach(button=>button.onclick=()=>{
  if(button.dataset.miniOpen==='calendar'){pairsMode='month';showPage('pairs');return}
  showPage(button.dataset.miniOpen);
 });
}
icons.edit='<path d="m15 4 5 5M4 20l5-1L21 7a2 2 0 0 0-5-5L4 14z"/>';
function renderMiniNotes(){
 const query=$('#mini-notes-search').value.trim().toLocaleLowerCase('ru'),notes=miniNotes().filter(note=>`${note.title} ${note.body}`.toLocaleLowerCase('ru').includes(query));
 $('#mini-notes-list').innerHTML=notes.length?notes.map(note=>`<button class="mini-note" data-note="${safe(note.id)}"><span class="mini-note-mark">✎</span><h3>${safe(note.title||'Без названия')}</h3><p>${safe(note.body||'')}</p><small>${note.id==='home'?'Также на главном экране':new Date(note.updated).toLocaleDateString('ru',{day:'numeric',month:'long'})}</small></button>`).join(''):`<div class="mini-empty"><span>✎</span><h3>${query?'Ничего не найдено':'Место для твоих мыслей'}</h3><p>${query?'Попробуй другой запрос.':'Создай первую заметку — она сохранится на устройстве.'}</p>${query?'':'<button class="primary" id="empty-create-note">+ Создать заметку</button>'}</div>`;
 $$('[data-note]').forEach(button=>button.onclick=()=>editMiniNote(button.dataset.note));
 if($('#empty-create-note'))$('#empty-create-note').onclick=()=>editMiniNote();
}
function editMiniNote(id){
 const existing=miniNotes().find(note=>note.id===id);
 modal(`<span class="eyebrow">СОХРАНЯЕТСЯ НА УСТРОЙСТВЕ</span><h2>${existing?'Редактировать заметку':'Новая заметка'}</h2><label for="mini-note-title">Заголовок</label><input id="mini-note-title" maxlength="120" placeholder="Название заметки" value="${safe(existing?.title||'')}" ${id==='home'?'readonly':''}><label for="mini-note-body">Текст</label><textarea id="mini-note-body" maxlength="10000" rows="8" placeholder="Что важно запомнить…">${safe(existing?.body||'')}</textarea><div class="mini-note-actions">${existing?'<button class="mini-delete-note" id="mini-delete-note">Удалить</button>':''}<button class="primary" id="mini-save-note">Сохранить</button></div>`);
 $('#mini-save-note').onclick=()=>{
  const title=$('#mini-note-title').value.trim(),body=$('#mini-note-body').value.trim();if(!title&&!body){$('#mini-note-title').focus();return}
  const previous=state.notebooks,previousHome=state.homeNote;
  if(id==='home')state.homeNote=body;
  else {const note={id:id||('note-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8)),title:title||'Без названия',body,updated:Date.now()};state.notebooks=[note,...state.notebooks.filter(n=>n.id!==id)]}
  if(!save()){state.notebooks=previous;state.homeNote=previousHome;return}
  renderHomeNote();$('#modal').close();renderMiniNotes();toast('Заметка сохранена');
 };
 if($('#mini-delete-note'))$('#mini-delete-note').onclick=()=>{
  modal('<h2>Удалить заметку?</h2><p>Её текст будет удалён с этого устройства.</p><div class="mini-note-actions"><button id="mini-keep-note">Отмена</button><button class="primary" id="mini-confirm-delete">Удалить</button></div>');
  $('#mini-keep-note').onclick=()=>editMiniNote(id);
  $('#mini-confirm-delete').onclick=()=>{
   const previous=state.notebooks,previousHome=state.homeNote;
   if(id==='home')state.homeNote='';else state.notebooks=state.notebooks.filter(note=>note.id!==id);
   if(!save()){state.notebooks=previous;state.homeNote=previousHome;return}
   renderHomeNote();$('#modal').close();renderMiniNotes();toast('Заметка удалена');
  };
 };
}
$('#mini-new-note').onclick=()=>editMiniNote();$('#mini-notes-search').oninput=renderMiniNotes;
function renderMiniGroups(){
 $('#mini-current-group').textContent=state.group;
 const query=$('#mini-groups-search').value.trim().toUpperCase(),groups=[...new Set([state.group,...state.favoriteGroups,...state.recentGroups,'ИКБО-16-24','ИВБО-01-24','БСБО-05-24'])].filter(group=>group.includes(query));
 $('#mini-groups-list').innerHTML=groups.length?groups.map(group=>`<div class="mini-group-row"><button data-select-group="${safe(group)}"><span class="mini-group-icon">${icon('people')}</span><span><b>${safe(group)}</b><small>${group===state.group?'Выбрана сейчас':'Выбрать группу'}</small></span>${group===state.group?'<i>✓</i>':''}</button><button class="mini-favorite ${state.favoriteGroups.includes(group)?'selected':''}" data-favorite-group="${safe(group)}" aria-label="${state.favoriteGroups.includes(group)?'Убрать из избранного':'В избранное'}: ${safe(group)}" aria-pressed="${state.favoriteGroups.includes(group)}">${state.favoriteGroups.includes(group)?'★':'☆'}</button></div>`).join(''):'<div class="mini-empty"><p>Среди сохранённых нет такой группы.<br>Добавь её кнопкой ниже.</p></div>';
 $$('[data-select-group]').forEach(button=>button.onclick=()=>{if(chooseGroup(button.dataset.selectGroup))renderMiniGroups()});
 $$('[data-favorite-group]').forEach(button=>button.onclick=()=>{
  const group=button.dataset.favoriteGroup,previous=state.favoriteGroups;
  state.favoriteGroups=previous.includes(group)?previous.filter(g=>g!==group):[...previous,group];
  if(!save()){state.favoriteGroups=previous;return}renderMiniGroups();
 });
}
$('#mini-groups-search').oninput=renderMiniGroups;
$('#mini-enter-group').onclick=()=>$('#group-button').click();
const chooseGroupBeforeMini=chooseGroup;chooseGroup=function(value){const ok=chooseGroupBeforeMini(value);if(ok){renderMiniGroups();if(page==='miniapps')renderMiniHub()}return ok};
const showPageBeforeMini=showPage;
showPage=function(p){
 const enteringHub=p==='miniapps'&&page!==p;
 const mini=Object.hasOwn(miniPages,p);
 showPageBeforeMini(mini?'schedule':p);
 Object.entries(miniPages).forEach(([key,element])=>element.hidden=key!==p);
 if(mini){homeRoot.hidden=true;page=p}
 document.body.classList.toggle('view-mini',mini||p==='tasks');
 if(mini||p==='tasks')$$('[data-ref-page]').forEach(button=>{const active=button.dataset.refPage==='miniapps';button.classList.toggle('active',active);button.setAttribute('aria-current',active?'page':'false')});
 if(p==='miniapps')renderMiniHub();if(p==='mini-notes')renderMiniNotes();if(p==='mini-groups')renderMiniGroups();
 if(enteringHub)window.scrollTo(0,0);
};
function handleAppBack(){
 if(page==='miniapps'){showPage('pairs');return true}
 if(['mini-map','mini-notes','mini-groups','tasks'].includes(page)){showPage('miniapps');return true}
 return false;
}
save();
