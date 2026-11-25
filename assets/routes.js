// Routes follow source graph edges only; disconnected rooms never receive invented links.
const routeBox=document.createElement('section');routeBox.className='indoor-route-box';routeBox.innerHTML='<h2>Маршрут</h2><p>Укажи, где ты находишься, и куда нужно попасть.</p><input id="route-from" list="route-rooms" placeholder="Откуда · аудитория" aria-label="Начало маршрута"><input id="route-to" list="route-rooms" placeholder="Куда · аудитория" aria-label="Конец маршрута"><datalist id="route-rooms"></datalist><button class="primary" id="route-build">Построить маршрут</button><button id="route-clear">Сбросить</button><p id="route-status" role="status"></p><div id="route-steps"></div>';
$('#indoor-floors').before(routeBox);
let indoorRoute=[],routeChoices=new Map();
let routeDataPending=null;
function loadedIndoorGraph(id){
 return typeof indoorGraphs==='undefined'?null:indoorGraphs[id]||null;
}
function loadIndoorGraphs(){
 if(typeof indoorGraphs!=='undefined')return Promise.resolve();
 if(routeDataPending)return routeDataPending;
 routeDataPending=new Promise((resolve,reject)=>{
  const script=document.createElement('script');
  script.src='route-data.js';
  const fail=()=>{script.remove();reject(new Error('Не удалось загрузить маршруты'))};
  script.onerror=fail;
  script.onload=()=>{if(typeof indoorGraphs==='undefined')fail();else resolve()};
  document.head.appendChild(script);
 }).catch(error=>{routeDataPending=null;throw error});
 return routeDataPending;
}
function prepareIndoorRoutes(){
 if(loadedIndoorGraph(indoorCampus.id)){refreshRouteChoices();return}
 const status=$('#route-status');
 status.textContent='Загружаем данные маршрутов…';
 loadIndoorGraphs().then(()=>{
  if(page!=='campus'&&routeBox.hidden)return;
  refreshRouteChoices();
  if(typeof updateMapAvailability==='function')updateMapAvailability();
  if(typeof drawFacilities==='function')drawFacilities();
 }).catch(()=>{
  if(page!=='campus'&&routeBox.hidden)return;
  status.textContent='Маршруты не загрузились. Нажми «Построить», чтобы повторить.';
 });
}
function routeLabel(node){return node.label+' · '+(indoorCampus.floors.find(f=>f.id===node.floor_id)?.label||node.floor_id)}
function resetIndoorRoute(){indoorRoute=[];$('#route-status').textContent='';$('#route-steps').replaceChildren();paintIndoorRoute()}
function refreshRouteChoices(){resetIndoorRoute();routeChoices=new Map();for(const n of loadedIndoorGraph(indoorCampus.id)?.nodes||[]){if(n.room_id&&n.label){let label=routeLabel(n);if(routeChoices.has(label))label+=' · '+n.room_id;routeChoices.set(label,n.id)}}$('#route-rooms').innerHTML=[...routeChoices].map(([label])=>'<option value="'+safe(label)+'"></option>').join('');$('#route-from').value='';$('#route-to').value='';$('#route-build').disabled=typeof indoorGraphs!=='undefined'&&!routeChoices.size;if(!routeChoices.size)$('#route-status').textContent='Для этого корпуса в исходных данных нет сети проходов. Доступен поиск аудитории на плане.'}
function findIndoorRoute(graph,from,to){
 const nodes=new Map(graph.nodes.map(n=>[n.id,n])),adj=new Map();for(const e of graph.edges){if(!nodes.has(e.from_node_id)||!nodes.has(e.to_node_id))continue;const weight=Number(e.distance_meters??e.traversal_cost);if(!Number.isFinite(weight)||weight<0)continue;const add=(a,b)=>{if(!adj.has(a))adj.set(a,[]);adj.get(a).push({to:b,weight,edge:e})};add(e.from_node_id,e.to_node_id);if(e.bidirectional)add(e.to_node_id,e.from_node_id)}
 const distances=new Map([[from,0]]),previous=new Map(),queue=[{id:from,distance:0}];while(queue.length){queue.sort((a,b)=>b.distance-a.distance);const current=queue.pop();if(current.distance!==distances.get(current.id))continue;if(current.id===to){const path=[];let id=to;while(id){path.unshift(nodes.get(id));id=previous.get(id)}return {path,distance:current.distance}}for(const next of adj.get(current.id)||[]){const d=current.distance+next.weight;if(d<(distances.get(next.to)??Infinity)){distances.set(next.to,d);previous.set(next.to,current.id);queue.push({id:next.to,distance:d})}}}return null;
}
function paintIndoorRoute(){let overlay=$('#indoor-route-overlay');if(!overlay){overlay=document.createElementNS('http://www.w3.org/2000/svg','svg');overlay.id='indoor-route-overlay';$('#indoor-sheet').appendChild(overlay)}const floor=indoorCampus.floors[indoorFloor];overlay.setAttribute('viewBox','0 0 '+floor.width+' '+floor.height);overlay.replaceChildren();let segment=[];const flush=()=>{if(segment.length>1){const line=document.createElementNS(overlay.namespaceURI,'polyline');line.setAttribute('points',segment.map(n=>n.x+','+n.y).join(' '));line.setAttribute('fill','none');line.setAttribute('stroke','var(--accent)');line.setAttribute('stroke-width','5');line.setAttribute('vector-effect','non-scaling-stroke');line.setAttribute('stroke-linejoin','round');line.setAttribute('stroke-linecap','round');overlay.appendChild(line)}segment=[]};for(const n of indoorRoute){if(n.floor_id===floor.id)segment.push(n);else flush()}flush();for(const [index,n] of indoorRoute.entries()){if(n.floor_id!==floor.id)continue;const previous=indoorRoute[index-1],next=indoorRoute[index+1];if(index!==0&&index!==indoorRoute.length-1&&previous?.floor_id===n.floor_id&&next?.floor_id===n.floor_id)continue;const circle=document.createElementNS(overlay.namespaceURI,'circle');circle.setAttribute('cx',n.x);circle.setAttribute('cy',n.y);circle.setAttribute('r',Math.max(floor.width,floor.height)*.006);circle.setAttribute('fill',index===indoorRoute.length-1?'#e54c83':'var(--accent)');overlay.appendChild(circle)}}
const floorBeforeRoute=showIndoorFloor;showIndoorFloor=function(index){floorBeforeRoute(index);paintIndoorRoute()};const campusBeforeRoute=chooseIndoorCampus;chooseIndoorCampus=function(){campusBeforeRoute();if(loadedIndoorGraph(indoorCampus.id))refreshRouteChoices();else prepareIndoorRoutes()};campusSelect.onchange=chooseIndoorCampus;
$('#route-clear').onclick=resetIndoorRoute;
$('#route-build').onclick=()=>{if(!loadedIndoorGraph(indoorCampus.id)){prepareIndoorRoutes();return}resetIndoorRoute();const from=routeChoices.get($('#route-from').value),to=routeChoices.get($('#route-to').value);if(!from||!to){$('#route-status').textContent='Выбери обе аудитории из подсказок.';return}if(from===to){$('#route-status').textContent='Ты уже в выбранной аудитории.';return}const route=findIndoorRoute(loadedIndoorGraph(indoorCampus.id),from,to);if(!route){$('#route-status').textContent='В исходном плане нет связного пути между этими аудиториями. Попробуй другую точку старта.';return}indoorRoute=route.path;const visits=[];for(const n of indoorRoute)if(visits.at(-1)!==n.floor_id)visits.push(n.floor_id);$('#route-status').textContent='Маршрут построен · '+visits.length+' участков по этажам. Позиция автоматически не определяется.';$('#route-steps').innerHTML=visits.map((id,i)=>'<button data-route-floor="'+id+'">'+(i+1)+'. '+safe(indoorCampus.floors.find(f=>f.id===id)?.label||id)+(i?' · переход по лестнице':' · начало')+'</button>').join('');$$('[data-route-floor]').forEach(b=>b.onclick=()=>showIndoorFloor(indoorCampus.floors.findIndex(f=>f.id===b.dataset.routeFloor)));showIndoorFloor(indoorCampus.floors.findIndex(f=>f.id===indoorRoute[0].floor_id))};
const routeStyle=document.createElement('style');routeStyle.textContent='.indoor-route-box{padding:20px;background:var(--panel);border:1px solid var(--line);border-radius:24px;margin:18px 0}.indoor-route-box h2{font-size:20px;margin:0 0 10px}.indoor-route-box p{font-size:12px;color:var(--muted);line-height:1.6}.indoor-route-box input{width:100%;padding:14px;background:var(--bg);color:var(--text);border:1px solid var(--line);border-radius:15px;margin:6px 0;box-sizing:border-box}#route-clear{padding:14px;color:var(--muted)}#route-steps{display:flex;gap:8px;flex-wrap:wrap}#route-steps button{background:var(--accent-soft);color:var(--accent);padding:10px;border-radius:12px;font-size:11px}#indoor-route-overlay{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}';document.head.appendChild(routeStyle);refreshRouteChoices();

const showPageBeforeRouteLoad=showPage;
showPage=function(target){
 showPageBeforeRouteLoad(target);
 if(page==='campus'&&!loadedIndoorGraph(indoorCampus.id))prepareIndoorRoutes();
 else if(page==='campus'&&!routeChoices.size)refreshRouteChoices();
};
