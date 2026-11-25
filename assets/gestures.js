// Motion and direct manipulation, shared by the timetable and themed date picker.
const reduceMotion=()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches;
function softAnimate(element,frames,options={}){if(element&&element.animate&&!reduceMotion())element.animate(frames,{duration:210,easing:'cubic-bezier(.2,.8,.2,1)',...options})}
function animateCalendar(direction=1){softAnimate($('#pairs-dates'),[{opacity:.35,transform:`translateX(${direction*24}px)`},{opacity:1,transform:'translateX(0)'}]);softAnimate($('#pairs-results'),[{opacity:.4,transform:`translateX(${direction*15}px)`},{opacity:1,transform:'translateX(0)'}],{duration:240})}
function bindHorizontalSwipe(element,onSwipe){
 let gesture=null,suppressUntil=0;
 element.style.touchAction='pan-y pinch-zoom';
 element.addEventListener('pointerdown',event=>{if(event.target.closest('[data-slot-carousel]')){gesture=null;return}if(event.isPrimary===false||event.button!==0||event.target.closest('input,textarea,select'))return;suppressUntil=0;gesture={id:event.pointerId,x:event.clientX,y:event.clientY,locked:false,vertical:false}});
 element.addEventListener('pointermove',event=>{
  if(!gesture||gesture.id!==event.pointerId)return;
  const dx=event.clientX-gesture.x,dy=event.clientY-gesture.y;
  if(!gesture.locked&&!gesture.vertical&&Math.max(Math.abs(dx),Math.abs(dy))>12){gesture.locked=Math.abs(dx)>Math.abs(dy)*1.4;gesture.vertical=!gesture.locked}
  if(gesture.locked)event.preventDefault();
 },{passive:false});
 element.addEventListener('pointerup',event=>{
  if(!gesture||gesture.id!==event.pointerId)return;
  const dx=event.clientX-gesture.x,dy=event.clientY-gesture.y,valid=!gesture.vertical&&Math.abs(dx)>=Math.max(42,Math.min(80,element.clientWidth*.13))&&Math.abs(dx)>Math.abs(dy)*1.4;
  gesture=null;if(valid){suppressUntil=Date.now()+450;onSwipe(dx<0?1:-1)}
 });
 element.addEventListener('pointercancel',()=>{gesture=null});
 element.addEventListener('click',event=>{if(Date.now()<suppressUntil){event.preventDefault();event.stopImmediatePropagation()}},true);
}
function moveMonth(date,amount){const copy=new Date(date),day=copy.getDate();copy.setDate(1);copy.setMonth(copy.getMonth()+amount);copy.setDate(Math.min(day,new Date(copy.getFullYear(),copy.getMonth()+1,0).getDate()));return copy}
function swipePairs(direction,region){
 if(pairsMode==='month')pairsDate=moveMonth(pairsDate,direction);
 else pairsDate.setDate(pairsDate.getDate()+direction*(pairsMode==='week'||region==='dates'?7:1));
 renderPairs();animateCalendar(direction);
}
bindHorizontalSwipe($('#pairs-dates'),direction=>swipePairs(direction,'dates'));
bindHorizontalSwipe($('#pairs-results'),direction=>swipePairs(direction,'results'));
const shiftPairsBeforeMotion=shiftPairs;shiftPairs=function(direction){shiftPairsBeforeMotion(direction);animateCalendar(direction)};
$$('[data-pairs-mode]').forEach(button=>{const original=button.onclick;button.onclick=()=>{original();animateCalendar()}});
const showPageBeforeMotion=showPage;showPage=function(p){const previous=page;showPageBeforeMotion(p);if(page!==previous){const element=page==='schedule'?homeRoot:document.getElementById(page+'-page');softAnimate(element,[{opacity:0,transform:'translateY(10px)'},{opacity:1,transform:'translateY(0)'}],{duration:220})}};

// Animate both position and dimensions, rebasing interrupted animations at their visible rect.
const homeResizeAnimations=new Map();
function captureHomeRects(){const rects=new Map([...homeCards].filter(([,card])=>card.parentElement===homeGrid).map(([id,card])=>[id,card.getBoundingClientRect()]));for(const animation of homeResizeAnimations.values())animation.cancel();homeResizeAnimations.clear();return rects}
function animateHomeRects(before,duration=200){
 if(reduceMotion())return;
 for(const [id,card] of homeCards){if(card.parentElement!==homeGrid)continue;const old=before.get(id),now=card.getBoundingClientRect();if(!old||!now.width||!now.height)continue;
 const dx=Math.max(-20,Math.min(20,old.left-now.left)),dy=Math.max(-20,Math.min(20,old.top-now.top));
 if(Math.abs(old.left-now.left)+Math.abs(old.top-now.top)+Math.abs(old.width-now.width)+Math.abs(old.height-now.height)<.5)continue;
 // Visual feedback only: never animate layout dimensions or scale text.
 const animation=card.animate([{transform:`translate(${dx}px,${dy}px)`,opacity:.85},{transform:'translate(0,0)',opacity:1}],{duration,easing:'cubic-bezier(.2,.8,.2,1)'});
 homeResizeAnimations.set(id,animation);animation.onfinish=()=>{if(homeResizeAnimations.get(id)===animation)homeResizeAnimations.delete(id)};
 }
}
// Resize uses the bottom-right handle. Width snaps to grid; height follows the finger.
let cardResize=null;
function beginCardResize(event,id){
 if(!homeEditing||event.button!==0||event.isPrimary===false)return;
 event.preventDefault();event.stopPropagation();
 const card=homeCards.get(id),content=card.querySelector(homeCatalog[id].selector||'.home-note'),rect=content.getBoundingClientRect();
 cardResize={id,pointer:event.pointerId,x:event.clientX,y:event.clientY,width:card.getBoundingClientRect().width,height:rect.height||210,previous:{...homeDraft.find(item=>item.id===id)}};
 card.classList.add('is-resizing');
 try{event.currentTarget.setPointerCapture(event.pointerId)}catch{}
}
function updateCardResize(event){
 if(!cardResize||event.pointerId!==cardResize.pointer||!homeEditing)return;
 event.preventDefault();const before=captureHomeRects();const item=homeDraft.find(x=>x.id===cardResize.id);if(!item)return;
 const card=homeCards.get(item.id),dx=event.clientX-cardResize.x,dy=event.clientY-cardResize.y;
 item.height=Math.max(180,Math.min(['pairs','break'].includes(item.id)?360:640,Math.round(cardResize.height+dy)));
 if(Math.abs(dx)>22&&item.id!=='schedule'){
  const columns=window.innerWidth>900?4:2,width=homeGrid.getBoundingClientRect().width||window.innerWidth-40;
  item.size=cardResize.width+dx>width/columns*1.5?'large':'small';
 }
 item.detail=item.height>=320?'expanded':item.height<=190?'compact':'normal';card.dataset.size=item.size;if(item.id!=='schedule')card.style.gridColumn='span '+(item.size==='small'?1:2);card.classList.add('has-custom-height');card.querySelector(homeCatalog[item.id].selector||'.home-note').style.minHeight=item.height+'px';
}
function finishCardResize(cancel=false){
 if(!cardResize)return;const current=cardResize;
 if(cancel&&homeEditing){const index=homeDraft.findIndex(x=>x.id===current.id);if(index>=0)homeDraft[index]=current.previous}
 homeCards.get(current.id).classList.remove('is-resizing');cardResize=null;renderHome();
}
document.addEventListener('pointermove',updateCardResize,{passive:false});
document.addEventListener('pointerup',event=>{if(cardResize&&event.pointerId===cardResize.pointer)finishCardResize()});
document.addEventListener('pointercancel',()=>finishCardResize(true));
function resizeCardKey(event,id){
 if(!homeEditing||!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.key))return;
 event.preventDefault();const item=homeDraft.find(x=>x.id===id);
 if(event.key==='ArrowLeft')item.size='small';else if(event.key==='ArrowRight')item.size='large';
 else item.height=Math.max(180,Math.min(['pairs','break'].includes(id)?360:640,(item.height||210)+(event.key==='ArrowDown'?24:-24)));
 renderHome();homeCards.get(id).querySelector('.home-resize').focus();
}

// The task date chooser is drawn in app colors, avoiding the Android teal/white system dialog.
const dateDialog=document.createElement('dialog');dateDialog.id='date-picker';dateDialog.setAttribute('aria-label','Выбор даты');document.body.appendChild(dateDialog);
let datePickerMonth=new Date(),datePickerDraft=null,datePickerCommit=null;
function openThemedDatePicker(value,commit){
 datePickerDraft=/^\d{4}-\d{2}-\d{2}$/.test(value)?new Date(value+'T12:00:00'):null;
 datePickerMonth=new Date(datePickerDraft||new Date());datePickerMonth.setDate(1);datePickerCommit=commit;
 dateDialog.innerHTML='<div class="date-picker-top"><small id="date-picker-year"></small><h2 id="date-picker-selection"></h2></div><div class="date-picker-month-nav"><button id="date-picker-prev" aria-label="Предыдущий месяц">‹</button><b id="date-picker-month-label"></b><button id="date-picker-next" aria-label="Следующий месяц">›</button></div><div id="date-picker-grid"></div><div class="date-picker-shortcuts"><button id="date-picker-today">Сегодня</button><button id="date-picker-clear">Без срока</button></div><div class="date-picker-actions"><button id="date-picker-cancel">Отмена</button><button id="date-picker-apply">Выбрать</button></div>';
 $('#date-picker-prev').onclick=()=>shiftDatePicker(-1);$('#date-picker-next').onclick=()=>shiftDatePicker(1);
 $('#date-picker-today').onclick=()=>{datePickerDraft=new Date();datePickerDraft.setHours(12,0,0,0);datePickerMonth=new Date(datePickerDraft);datePickerMonth.setDate(1);renderDatePicker()};
 $('#date-picker-clear').onclick=()=>{datePickerCommit('');dateDialog.close()};
 $('#date-picker-cancel').onclick=()=>dateDialog.close();
 $('#date-picker-apply').onclick=()=>{if(!datePickerDraft)return;datePickerCommit(dateKey(datePickerDraft));dateDialog.close()};
 bindHorizontalSwipe($('#date-picker-grid'),shiftDatePicker);renderDatePicker();dateDialog.showModal();
}
function shiftDatePicker(direction){datePickerMonth=moveMonth(datePickerMonth,direction);renderDatePicker();softAnimate($('#date-picker-grid'),[{opacity:.35,transform:`translateX(${direction*20}px)`},{opacity:1,transform:'translateX(0)'}])}
function renderDatePicker(){
 const reference=datePickerDraft||new Date();$('#date-picker-year').textContent=reference.getFullYear();$('#date-picker-selection').textContent=datePickerDraft?datePickerDraft.toLocaleDateString('ru',{weekday:'short',day:'numeric',month:'short'}):'Выбери дату';
 $('#date-picker-month-label').textContent=datePickerMonth.toLocaleDateString('ru',{month:'long',year:'numeric'});
 const start=pairsMonday(datePickerMonth);
 $('#date-picker-grid').innerHTML='<div class="date-picker-days">'+days.map(day=>`<span>${day}</span>`).join('')+Array.from({length:42},(_,i)=>{const date=new Date(start);date.setDate(date.getDate()+i);return `<button data-pick-date="${dateKey(date)}" class="${datePickerDraft&&sameDay(date,datePickerDraft)?'selected':''} ${date.getMonth()!==datePickerMonth.getMonth()?'outside':''} ${sameDay(date,new Date())?'today':''}" aria-label="${date.toLocaleDateString('ru',{day:'numeric',month:'long',year:'numeric'})}">${date.getDate()}</button>`}).join('')+'</div>';
 $$('[data-pick-date]').forEach(button=>button.onclick=()=>{datePickerDraft=new Date(button.dataset.pickDate+'T12:00:00');renderDatePicker()});
 $('#date-picker-apply').disabled=!datePickerDraft;
}
const addTaskBeforeCalendar=addTask;addTask=function(){
 addTaskBeforeCalendar();const input=$('#task-date');input.type='hidden';
 const button=document.createElement('button');button.type='button';button.className='themed-task-date';button.id='task-date-button';button.innerHTML=icon('calendar')+'<span>Выбрать дату</span>';
 input.after(button);button.onclick=()=>openThemedDatePicker(input.value,value=>{input.value=value;button.querySelector('span').textContent=value?new Date(value+'T12:00:00').toLocaleDateString('ru',{day:'numeric',month:'long',year:'numeric'}):'Без срока'});
};
$('#add-task').onclick=$('#new-task').onclick=()=>addTask();
dateDialog.addEventListener('click',event=>{if(event.target===dateDialog)dateDialog.close()});

const renderHomeBeforeMotion=renderHome;
renderHome=function(){const before=captureHomeRects();renderHomeBeforeMotion();animateHomeRects(before,260)};
