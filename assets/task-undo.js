// Keep a short undo window for each explicit completion or deletion in the app.
const recentWorkActions = new Map();
const workUndoDuration = 8000;
const workUndoBar = document.createElement('div');
workUndoBar.className = 'work-undo-bar';
workUndoBar.hidden = true;
workUndoBar.setAttribute('role','status');
workUndoBar.setAttribute('aria-live','polite');
document.body.appendChild(workUndoBar);

function paintWorkUndo() {
 const now = Date.now();
 for (const [id, entry] of recentWorkActions) {
  const task = state.tasks.find(task => task.workId === id);
  const valid = entry.removed ? !task : task?.done;
  if (entry.expires <= now || !valid) recentWorkActions.delete(id);
 }
 const latest = [...recentWorkActions].at(-1);
 workUndoBar.hidden = !latest;
 if (!latest) { workUndoBar.replaceChildren(); return; }
 const [id, entry] = latest;
 workUndoBar.innerHTML = '<div><b>'+(entry.removed?'Работа удалена':'Работа выполнена')+'</b><small>'+
  safe(entry.title)+'</small></div><button id="undo-latest-work">Отменить</button>';
 $('#undo-latest-work').onclick = () => undoWorkAction(id);
}

function undoWorkAction(id) {
 const entry = recentWorkActions.get(id);
 if (!entry || entry.expires <= Date.now()) { paintWorkUndo(); renderTasks(); return; }
 const task = state.tasks.find(task => task.workId === id);
 if (entry.removed && !task) {
  const index = Math.min(entry.index, state.tasks.length);
  state.tasks.splice(index, 0, entry.removed);
  if (!save()) { state.tasks.splice(index,1); return; }
 } else if (!entry.removed && task?.done) {
  task.done = false;
  if (!save()) { task.done = true; return; }
 }
 recentWorkActions.delete(id);
 paintWorkUndo();
 renderTasks();
 refreshWorkCards();
}

changeWork = function(index, action) {
 const task = state.tasks[index];
 if (!task || !['done','delete'].includes(action)) return false;
 const remove = action === 'delete';
 if (!remove && task.done) return false;
 if (remove) state.tasks.splice(index,1);
 else task.done = true;
 if (!save()) {
  if (remove) state.tasks.splice(index,0,task);
  else task.done = false;
  return false;
 }
 if(!remove)window.orbitaCelebrate?.(task);
 const entry = {title:task.text, expires:Date.now()+workUndoDuration};
 if (remove) Object.assign(entry, {removed:task,index});
 recentWorkActions.delete(task.workId);
 recentWorkActions.set(task.workId,entry);
 paintWorkUndo();
 renderTasks();
 refreshWorkCards();
 setTimeout(()=>{
  if (recentWorkActions.get(task.workId) !== entry) return;
  recentWorkActions.delete(task.workId);
  paintWorkUndo();
  renderTasks();
 },workUndoDuration);
 return true;
};

const completedPanel=document.createElement('details');
completedPanel.className='completed-work-panel';
completedPanel.innerHTML='<summary>Выполненные задачи <span id="completed-work-count">0</span></summary><div id="completed-work-list"></div>';
$('#full-tasks').after(completedPanel);

function removeCompletedWorks(ids){
 const previous=state.tasks;
 state.tasks=previous.filter(task=>!task.done||!ids.has(task.workId));
 if(!save()){state.tasks=previous;return false}
 for(const id of ids)recentWorkActions.delete(id);
 paintWorkUndo();renderTasks();refreshWorkCards();
 return true;
}
function confirmDeleteCompletedWork(id){
 let info={};
 try{info=JSON.parse(window.OrbitaAndroid?.workAttachments?.(id)||'{}')}catch{}
 if(!(info.files?.length||info.pending)||!window.OrbitaAndroid?.trashCompletedWorkFiles){
  removeCompletedWorks(new Set([id]));return;
 }
 modal('<h2>Удалить выполненную задачу?</h2><p>Можно оставить вложения на Google Диске или перенести их в корзину.</p>'+
  '<div class="completed-delete-actions"><button class="primary" id="completed-task-only">Удалить только задачу</button>'+
  '<button class="settings-link" id="completed-task-and-files">Удалить задачу и перенести файлы в корзину</button></div><p id="completed-trash-status" role="status"></p>');
 const files=$('#completed-task-and-files'),only=$('#completed-task-only');
 only.onclick=()=>{if(removeCompletedWorks(new Set([id])))$('#modal').close()};
 files.onclick=()=>{
  files.disabled=only.disabled=true;
  const status=$('#completed-trash-status');
  status.dataset.workId=id;status.textContent='Переносим вложения в корзину Google Диска…';
  window.OrbitaAndroid.trashCompletedWorkFiles(id);
 };
}
function paintCompletedWorks(){
 const done=state.tasks.filter(task=>task.done);
 $('#completed-work-count').textContent=done.length;
 const list=$('#completed-work-list');
 if(!done.length){list.innerHTML='<p>Пока нет выполненных задач.</p>';return}
 list.innerHTML=done.map(task=>'<div class="completed-work-row"><div><b>'+safe(task.text)+
  '</b><small>'+safe(task.subject||'')+'</small></div><button data-delete-completed="'+safe(task.workId)+
  '" aria-label="Удалить '+safe(task.text)+'">Удалить</button></div>').join('')+
  '<button id="clear-completed-work">Очистить выполненные</button><div id="confirm-clear-completed" hidden>'+
  '<p>Удалить все выполненные задачи? Файлы на Google Диске останутся.</p><button id="confirm-completed-delete">Удалить все</button> <button id="cancel-completed-delete">Отмена</button></div>';
 list.querySelectorAll('[data-delete-completed]').forEach((button,index)=>{
  button.onclick=()=>confirmDeleteCompletedWork(button.dataset.deleteCompleted);
  window.addControlTaskLink?.(done[index],button.previousElementSibling.lastElementChild);
 });
 const confirmation=$('#confirm-clear-completed');
 $('#clear-completed-work').onclick=()=>{confirmation.hidden=false;$('#confirm-completed-delete').focus()};
 $('#cancel-completed-delete').onclick=()=>{confirmation.hidden=true;$('#clear-completed-work').focus()};
 $('#confirm-completed-delete').onclick=()=>removeCompletedWorks(new Set(state.tasks.filter(task=>task.done).map(task=>task.workId)));
}
renderTasks = function() {
 const active = pendingWorks();
 const recent = state.tasks.filter(t => t.done && recentWorkActions.get(t.workId)?.expires > Date.now());
 function row(task) {
  return '<div class="task work-task-row"><input type="checkbox" data-work-done="'+task.index+
   '" aria-label="Выполнить '+safe(task.text)+'"><button class="edit-work" data-edit-work="'+safe(task.workId)+
   '" aria-label="Изменить '+safe(task.text)+'"><b>'+safe(task.text)+'</b><p>'+safe(shortSubject(task.subject))+' · '+safe(task.due)+
   '</p>'+(task.comment?'<p class="work-row-comment">'+safe(task.comment)+'</p>':'')+
   '</button><button data-work-delete="'+task.index+'" aria-label="Удалить '+safe(task.text)+'">×</button></div>';
 }
 const finished = recent.map(task => '<div class="task work-recent-row"><span class="work-done-mark" aria-hidden="true">✓</span><div><b>'+
  safe(task.text)+'</b><p>Только что выполнено</p></div><button data-undo-work="'+safe(task.workId)+'">Отменить</button></div>').join('');
 $('#task-list').innerHTML = active.slice(0,4).map(row).join('') + finished || '<p class="work-list-empty">Нет несданных работ</p>';
 $('#full-tasks').innerHTML = active.map(row).join('') + finished || '<p class="work-list-empty">Пока нет несданных работ</p>';
 $('#task-count').textContent = active.length;
 paintCompletedWorks();
 $$('[data-work-done]').forEach(b=>b.onchange=()=>changeWork(Number(b.dataset.workDone),'done'));
 $$('[data-edit-work]').forEach(b=>b.onclick=()=>addTask(null,{workId:b.dataset.editWork}));
 $$('[data-work-delete]').forEach(b=>b.onclick=()=>changeWork(Number(b.dataset.workDelete),'delete'));
 $$('[data-undo-work]').forEach(b=>b.onclick=()=>undoWorkAction(b.dataset.undoWork));
};
// New work also needs stable identity, without changing its chosen type or subject.
const saveBeforeWorkIdentity=save;save=function(){for(const task of state.tasks)if(!task.workId)task.workId='work_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,10);return saveBeforeWorkIdentity()};
const compactWorkStyle=document.createElement('style');compactWorkStyle.textContent=`
.reference-ui #tasks-page .standalone{min-height:0!important;height:auto!important;padding:21px 20px!important;max-width:720px;border-radius:25px}.reference-ui #tasks-page .standalone>h2{font-size:22px;margin:0 0 8px;line-height:1.3}.reference-ui #tasks-page .standalone>p{margin:0 0 14px;font-size:12px;line-height:1.5;color:var(--muted)}.reference-ui #full-tasks{margin:0;display:block}.reference-ui .work-task-row,.reference-ui .work-recent-row{display:flex;align-items:flex-start;gap:10px;margin:0!important;padding:11px 0!important;min-height:0!important;border-bottom:1px solid var(--line)}.reference-ui .work-task-row>input{margin:3px 0 0!important;width:20px;min-width:20px;height:20px}.reference-ui .work-task-row>div,.reference-ui .work-recent-row>div{flex:1;min-width:0}.reference-ui .work-task-row b,.reference-ui .work-recent-row b{font-size:13px!important;line-height:1.4;display:block}.reference-ui .work-task-row p,.reference-ui .work-recent-row p{font-size:11px!important;line-height:1.45;margin:4px 0 0!important;overflow-wrap:anywhere}.reference-ui .work-task-row>button{min-width:34px;min-height:34px;padding:0 5px;font-size:20px;line-height:1;color:var(--muted)}.reference-ui .work-recent-row>button{color:var(--accent);font-size:11px;min-height:36px;padding:4px 6px}.reference-ui .work-recent-row b{color:var(--muted);text-decoration:line-through}.work-done-mark{width:20px;min-width:20px;margin-top:2px;color:var(--accent);font-size:18px}.reference-ui .work-list-empty{margin:10px 0!important;font-size:12px;line-height:1.6;color:var(--muted)}.reference-ui #new-task{margin-top:14px;padding:12px 18px;font-size:13px;border-radius:16px;min-height:45px}.reference-ui .home-card[data-card=tasks]>.tasks-card{height:auto!important;min-height:0!important}.reference-ui .tasks-card>.section-caption{margin:0 0 9px}.reference-ui .tasks-card>.section-title{margin-bottom:12px!important;padding-bottom:12px!important}.reference-ui .all-tasks{padding-top:12px;margin-top:6px}.work-undo-bar{position:fixed;z-index:95;left:18px;right:18px;bottom:calc(var(--system-bottom,0px) + 88px);max-width:430px;margin:0 auto;padding:12px 14px;box-sizing:border-box;display:flex;align-items:center;gap:12px;background:var(--panel);color:var(--text);border:1px solid var(--line);border-radius:19px;box-shadow:0 5px 30px #0004}.work-undo-bar>div{min-width:0;flex:1}.work-undo-bar b{display:block;font-size:12px;line-height:1.4}.work-undo-bar small{display:block;font-size:10px;color:var(--muted);line-height:1.4;margin-top:3px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}.work-undo-bar button{min-height:40px;padding:8px 10px;border-radius:12px;background:var(--accent-soft);color:var(--accent);font-size:12px}.work-undo-bar[hidden]{display:none!important}@media(prefers-reduced-motion:no-preference){.work-undo-bar:not([hidden]){animation:work-undo-appear .2s ease-out}@keyframes work-undo-appear{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}}
`;document.head.appendChild(compactWorkStyle);$('#tasks-page .standalone>h2').textContent='Учебные работы';$('#tasks-page .standalone>p').textContent='Отмечай готовое — его можно отменить в течение 8 секунд.';
renderTasks();save();

window.orbitaRepaintTasks = function() {
 paintWorkUndo();
 renderTasks();
 refreshWorkCards();
 if(page==='mini-windows' && typeof paintGapIdeas==='function') paintGapIdeas();
};
