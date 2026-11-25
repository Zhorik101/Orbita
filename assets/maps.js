// Offline floor plans from 0niel/rtu-mirea-mobile (MIT), originating from Pulse MIREA.
const indoorPage=document.getElementById('campus-page');
indoorPage.innerHTML='<div class="campus-heading"><span class="eyebrow">КАРТЫ БЕЗ ИНТЕРНЕТА</span><h1>Корпуса</h1><p>Найди свою аудиторию</p></div><select id="indoor-campus" aria-label="Корпус"></select><p id="indoor-address"></p><div class="official-query-row"><input id="indoor-query" placeholder="Номер аудитории" aria-label="Поиск аудитории"><button class="primary" id="indoor-find">Найти</button></div><div id="indoor-results"></div><div id="indoor-floors" class="official-search-types"></div><div class="indoor-tools"><button id="indoor-minus" aria-label="Уменьшить">−</button><button id="indoor-reset">По размеру</button><button id="indoor-plus" aria-label="Увеличить">+</button></div><div id="indoor-viewport"><div id="indoor-sheet"><img id="indoor-image" alt="План этажа"><span id="indoor-marker" hidden></span></div></div><p class="pairs-disclaimer">Планы: Пульс РТУ МИРЭА · из открытого проекта 0niel/rtu-mirea-mobile (MIT). Сохранённая копия, сентябрь 2026. Перемещай карту пальцем; приближай двумя пальцами или кнопками.</p>';
const campusSelect=$('#indoor-campus');campusSelect.innerHTML=indoorCampuses.map(c=>'<option value="'+c.id+'">'+safe(c.title)+'</option>').join('');
let indoorCampus=indoorCampuses.find(c=>c.id===state.indoorCampus)||indoorCampuses[0],indoorFloor=0,indoorZoom=1;
function showIndoorFloor(index){indoorFloor=index;indoorZoom=1;const f=indoorCampus.floors[index];$('#indoor-image').src='maps/'+f.file;$('#indoor-image').alt=indoorCampus.title+' · '+f.label;$('#indoor-marker').hidden=true;$('#indoor-sheet').style.aspectRatio=f.width+'/'+f.height;$('#indoor-floors').innerHTML=indoorCampus.floors.map((f,i)=>'<button data-indoor-floor="'+i+'" class="'+(i===index?'selected':'')+'">'+safe(f.label)+'</button>').join('');$$('[data-indoor-floor]').forEach(b=>b.onclick=()=>showIndoorFloor(Number(b.dataset.indoorFloor)));resizeIndoor()}
function resizeIndoor(){const viewport=$('#indoor-viewport'),sheet=$('#indoor-sheet');sheet.style.width=Math.max(1,viewport.clientWidth)*indoorZoom+'px';viewport.scrollTo(0,0)}
function chooseIndoorCampus(){indoorCampus=indoorCampuses.find(c=>c.id===campusSelect.value);state.indoorCampus=indoorCampus.id;save();$('#indoor-address').textContent=indoorCampus.address;$('#indoor-results').replaceChildren();showIndoorFloor(0)}
campusSelect.value=indoorCampus.id;campusSelect.onchange=chooseIndoorCampus;
$('#indoor-plus').onclick=()=>{indoorZoom=Math.min(8,indoorZoom*1.5);resizeIndoor()};$('#indoor-minus').onclick=()=>{indoorZoom=Math.max(1,indoorZoom/1.5);resizeIndoor()};$('#indoor-reset').onclick=()=>{indoorZoom=1;resizeIndoor()};
function searchIndoor(){const normalize=v=>v.toUpperCase().replace(/[^А-ЯA-Z0-9]/g,'');const q=normalize($('#indoor-query').value);const matches=q?indoorCampus.rooms.filter(r=>normalize(r.label).includes(q)).slice(0,30):[];$('#indoor-results').innerHTML=matches.length?matches.map((r,i)=>'<button class="official-result" data-indoor-room="'+i+'">'+safe(r.label)+' · '+safe(indoorCampus.floors.find(f=>f.id===r.floor_id)?.label||'')+'</button>').join(''):'<p>Уточни номер аудитории. Показаны только помещения из плана.</p>';$$('[data-indoor-room]').forEach(b=>b.onclick=()=>{showIndoorRoom(matches[Number(b.dataset.indoorRoom)])})}
function showIndoorRoom(r){const i=indoorCampus.floors.findIndex(f=>f.id===r.floor_id);if(i<0)return;showIndoorFloor(i);const f=indoorCampus.floors[i];indoorZoom=3;resizeIndoor();const marker=$('#indoor-marker');marker.hidden=false;marker.style.left=(r.x/f.width*100)+'%';marker.style.top=(r.y/f.height*100)+'%';marker.textContent=r.label;requestAnimationFrame(()=>{const v=$('#indoor-viewport'),s=$('#indoor-sheet');v.scrollTo(r.x/f.width*s.clientWidth-v.clientWidth/2,r.y/f.height*s.clientHeight-v.clientHeight/2)})}
function openLessonRoom(lesson){
 const normalize=value=>String(value||'').toUpperCase().replace(/[АВЕКМНОРСТХ]/g,c=>'ABEKMHOPCTX'['АВЕКМНОРСТХ'.indexOf(c)]).replace(/[^А-ЯA-Z0-9]/g,'');
 const room=normalize(lesson.room),raw=String(lesson.campus||'').trim().toLowerCase();
 const alias=raw.replace(/в/g,'v').replace(/с/g,'s').replace(/мп/g,'mp').replace(/\s/g,'');
 let campus=indoorCampuses.find(c=>c.id===alias||normalize(c.title)===normalize(raw));
 if(!campus&&raw){
  const parts=raw.match(/(78|86|20|1)(?!\d)/g);
  const ids=raw.includes('вернад')?['v-78','v-86']:raw.includes('стром')?['s-20']:raw.includes('пирог')?['mp-1']:[];
  campus=indoorCampuses.find(c=>ids.includes(c.id)&&parts?.includes(c.id.split('-').at(-1)));
 }
 if(!campus){
  const candidates=indoorCampuses.filter(c=>c.rooms.some(r=>normalize(r.label)===room));
  if(!raw&&candidates.length===1)campus=candidates[0];
 }
 $('#modal').close();showPage('campus');
 if(campus){campusSelect.value=campus.id;chooseIndoorCampus()}
 $('#indoor-query').value=lesson.room||'';
 searchIndoor();
 if(!campus){toast('Уточни корпус, чтобы найти аудиторию');return}
 const match=campus.rooms.find(item=>normalize(item.label)===room);
 if(match)showIndoorRoom(match);
 else toast('Аудитория не найдена на плане корпуса');
}
$('#indoor-find').onclick=searchIndoor;$('#indoor-query').onkeydown=e=>{if(e.key==='Enter')searchIndoor()};
const beforeIndoorPage=showPage;showPage=function(p){if(p==='mini-map')p='campus';beforeIndoorPage(p);if(p==='campus')requestAnimationFrame(resizeIndoor)};
const indoorStyle=document.createElement('style');indoorStyle.textContent='#indoor-campus{width:100%;padding:17px;border:1px solid var(--line);border-radius:20px;background:var(--panel);color:var(--text);font-size:16px}#indoor-address{color:var(--muted);font-size:13px}#indoor-query{min-width:0;flex:1;background:var(--panel);color:var(--text);border:1px solid var(--line);padding:15px;border-radius:18px}#indoor-results{max-height:220px;overflow:auto;font-size:12px}#indoor-floors{overflow:auto;margin-top:20px}#indoor-floors button{flex:none;min-width:70px}.indoor-tools{display:flex;justify-content:flex-end;gap:10px;margin:14px 0}.indoor-tools button{min-height:44px;padding:10px 18px;border-radius:15px;background:var(--panel);color:var(--text);border:1px solid var(--line)}#indoor-viewport{height:55vh;overflow:auto;background:#f9fbfe;border-radius:24px;border:1px solid var(--line);touch-action:pan-x pan-y}#indoor-sheet{position:relative;min-width:100%}#indoor-image{width:100%;height:100%;display:block}#indoor-marker{position:absolute;transform:translate(-50%,-100%);padding:8px 12px;background:#d02e62;color:white;border:2px solid white;border-radius:14px;font-size:14px;box-shadow:0 4px 15px #0004}';document.head.appendChild(indoorStyle);chooseIndoorCampus();

// Pinch belongs to the map, never to the application viewport.
const mapGestureView=$('#indoor-viewport');let mapPinch=null;
function mapTouchDistance(touches){return Math.hypot(touches[0].clientX-touches[1].clientX,touches[0].clientY-touches[1].clientY)}
mapGestureView.addEventListener('touchstart',event=>{if(event.touches.length!==2)return;event.preventDefault();const rect=mapGestureView.getBoundingClientRect(),cx=(event.touches[0].clientX+event.touches[1].clientX)/2-rect.left,cy=(event.touches[0].clientY+event.touches[1].clientY)/2-rect.top;mapPinch={distance:mapTouchDistance(event.touches),zoom:indoorZoom,x:(mapGestureView.scrollLeft+cx)/$('#indoor-sheet').clientWidth,y:(mapGestureView.scrollTop+cy)/$('#indoor-sheet').clientHeight}}, {passive:false});
mapGestureView.addEventListener('touchmove',event=>{if(!mapPinch||event.touches.length!==2)return;event.preventDefault();const rect=mapGestureView.getBoundingClientRect(),cx=(event.touches[0].clientX+event.touches[1].clientX)/2-rect.left,cy=(event.touches[0].clientY+event.touches[1].clientY)/2-rect.top;indoorZoom=Math.max(1,Math.min(8,mapPinch.zoom*mapTouchDistance(event.touches)/Math.max(1,mapPinch.distance)));const sheet=$('#indoor-sheet');sheet.style.width=mapGestureView.clientWidth*indoorZoom+'px';mapGestureView.scrollLeft=mapPinch.x*sheet.clientWidth-cx;mapGestureView.scrollTop=mapPinch.y*sheet.clientHeight-cy},{passive:false});
mapGestureView.addEventListener('touchend',event=>{if(event.touches.length<2)mapPinch=null});mapGestureView.addEventListener('touchcancel',()=>mapPinch=null);
