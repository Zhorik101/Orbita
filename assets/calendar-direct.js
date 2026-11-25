// Import expanded occurrences directly into a user-selected Android calendar.
let calendarExportDraft=null,calendarExportBusy=false;
function buildCalendarExport(target,days=180){const cached=officialCache[calendarKey(target)];if(!cached?.raw)throw new Error('Сначала загрузи расписание');const first=pairsMonday(new Date()),last=new Date(first);last.setDate(last.getDate()+days);const exclusive=new Date(last);exclusive.setDate(exclusive.getDate()+1);const rows=Object.values(expandOfficialCalendar(cached.raw,dateKey(first),dateKey(last))).flat();return {scope:calendarKey(target),name:target.title,from:Date.parse(dateKey(first)+'T00:00:00+03:00'),to:Date.parse(dateKey(exclusive)+'T00:00:00+03:00'),fromLabel:first.toLocaleDateString('ru'),toLabel:last.toLocaleDateString('ru'),events:rows.map(row=>calendarPairEvent(row,target.title))}}
function readCalendarTargets(){try{return JSON.parse(window.OrbitaAndroid.calendarTargets())}catch{return {permission:false,error:'Не удалось прочитать календари телефона'}}}
function paintCalendarDestinations(){const container=$('#calendar-export-options');if(!container||!calendarExportDraft)return;const data=readCalendarTargets();if(!data.permission){container.innerHTML='<p>Чтобы добавить все пары сразу, разреши доступ к календарю телефона.</p><button class="primary" id="calendar-access">Разрешить доступ</button><p id="calendar-access-status">'+safe(data.error||'')+'</p>';$('#calendar-access').onclick=()=>window.OrbitaAndroid.requestCalendarAccess();return}if(data.error){container.textContent=data.error;return}const calendars=data.calendars||[];if(!calendars.length){container.innerHTML='<p>На телефоне нет доступного календаря для записи. Создай календарь или добавь аккаунт в приложении «Календарь», затем вернись сюда.</p><button id="calendar-reload">Проверить снова</button>';$('#calendar-reload').onclick=paintCalendarDestinations;return}let chosen=calendars.find(c=>c.id===state.calendarDestinationId)?.id||calendars[0].id;container.innerHTML='<p>Куда добавить расписание?</p><div class="calendar-destinations">'+calendars.map((c,i)=>'<button data-calendar-destination="'+i+'" class="'+(c.id===chosen?'selected':'')+'"><span>'+icon('calendar')+'</span><div><b>'+safe(c.name||'Календарь')+'</b><small>'+safe(c.account||'На устройстве')+'</small></div><i>'+(c.id===chosen?'✓':'')+'</i></button>').join('')+'</div><button class="primary" id="calendar-import-confirm">Добавить пары в календарь</button><p id="calendar-import-status" role="status"></p>';$$('[data-calendar-destination]').forEach(b=>b.onclick=()=>{chosen=calendars[Number(b.dataset.calendarDestination)].id;$$('[data-calendar-destination]').forEach(button=>{const active=calendars[Number(button.dataset.calendarDestination)].id===chosen;button.classList.toggle('selected',active);button.querySelector('i').textContent=active?'✓':''})});$('#calendar-import-confirm').disabled=!calendarExportDraft.events.length||calendarExportDraft.events.length>3000;$('#calendar-import-confirm').onclick=()=>{if(calendarExportBusy)return;calendarExportBusy=true;state.calendarDestinationId=chosen;save();$('#calendar-import-confirm').disabled=true;$('#calendar-import-status').textContent='Добавляем пары… Не закрывай приложение до завершения.';window.OrbitaAndroid.directCalendarExport(JSON.stringify({...calendarExportDraft,calendar:chosen}))}}
function openDirectCalendarExport(){if(calendarExportBusy){toast('Дождись завершения добавления пар');return}const target=currentOfficialTarget();if(!target||!officialCache[calendarKey(target)]){toast('Сначала загрузи расписание');return}try{calendarExportDraft=buildCalendarExport(target)}catch(error){toast(error.message);return}modal('<h2>Добавить расписание в календарь?</h2><p><b>'+safe(target.title)+'</b> · пары будут записаны в календарь телефона, без импорта файла.</p><div class="work-chips" id="calendar-export-period"><button data-calendar-period="35">5 недель</button><button data-calendar-period="180" class="selected">6 месяцев</button><button data-calendar-period="365">Год</button></div><p id="calendar-export-summary"></p><p class="calendar-export-note">Повторное добавление обновит пары, ранее импортированные Орбитой в этот календарь. Отменённые пары в выбранном периоде будут удалены из этой копии. Твои другие события не затрагиваются. Это разовый экспорт: для обновления повтори добавление.</p><div id="calendar-export-options"></div>');function summary(){$('#calendar-export-summary').textContent=calendarExportDraft.fromLabel+' — '+calendarExportDraft.toLabel+' · занятий: '+calendarExportDraft.events.length}summary();$$('[data-calendar-period]').forEach(b=>b.onclick=()=>{if(calendarExportBusy)return;try{calendarExportDraft=buildCalendarExport(target,Number(b.dataset.calendarPeriod));$$('[data-calendar-period]').forEach(button=>button.classList.toggle('selected',button===b));summary();paintCalendarDestinations()}catch(error){toast(error.message)}});if(window.OrbitaAndroid?.directCalendarExport)paintCalendarDestinations();else $('#calendar-export-options').innerHTML='<p>Прямое добавление доступно в Android-приложении.</p>'}
window.orbitaCalendarAccessChanged=()=>{if($('#calendar-export-options'))paintCalendarDestinations()};
window.orbitaCalendarExportResult=result=>{calendarExportBusy=false;if(!$('#calendar-export-options')){toast(result.ok?'Расписание добавлено в календарь':result.error||'Не удалось добавить расписание');return}if(result.ok){$('#calendar-export-options').innerHTML='<div class="calendar-export-success"><span>✓</span><h3>Расписание в календаре</h3><p>Добавлено: '+Number(result.added||0)+'<br>Обновлено: '+Number(result.updated||0)+'<br>Удалено отменённых: '+Number(result.removed||0)+'</p><button class="primary" id="calendar-export-done">Готово</button></div>';$('#calendar-export-done').onclick=()=>$('#modal').close()}else{if($('#calendar-import-status'))$('#calendar-import-status').textContent=result.error||'Не удалось завершить добавление. Попробуй ещё раз.';if($('#calendar-import-confirm'))$('#calendar-import-confirm').disabled=false}};
exportPairs=openDirectCalendarExport;$('#pairs-export').onclick=openDirectCalendarExport;
window.addEventListener('focus',()=>{if(!calendarExportBusy&&$('#calendar-export-options')&&!$('#calendar-export-done'))paintCalendarDestinations()});
const calendarExportStyle=document.createElement('style');calendarExportStyle.textContent='.calendar-export-note{font-size:11px!important;line-height:1.6;color:var(--muted)}.calendar-destinations{display:flex;flex-direction:column;gap:8px;max-height:220px;overflow:auto}.calendar-destinations button{display:flex;align-items:center;gap:11px;padding:13px;border:1px solid var(--line);border-radius:17px;text-align:left;color:var(--text)}.calendar-destinations button.selected{border-color:var(--accent);background:var(--accent-soft)}.calendar-destinations button>span{color:var(--accent);width:25px}.calendar-destinations svg{width:24px;height:24px}.calendar-destinations button>div{min-width:0;flex:1}.calendar-destinations b{display:block;font-size:13px;overflow-wrap:anywhere}.calendar-destinations small{display:block;font-size:10px;color:var(--muted);margin-top:5px;overflow-wrap:anywhere}.calendar-destinations i{font-style:normal;color:var(--accent)}#calendar-export-summary{font-size:12px;color:var(--accent)}#calendar-import-status{font-size:12px;line-height:1.6}.calendar-export-success>span{font-size:44px;color:var(--accent)}';document.head.appendChild(calendarExportStyle);

function syncOwnPairsToCalendar(){
 if(!state.calendarAutoSync?.pairs||!window.OrbitaAndroid?.syncCalendarPairs)return;
 const own=state.pinnedGroup||state.officialGroup,key=calendarKey(own);
 const cache=officialCache[key];
 if(!own||!cache?.raw)return;
 try{window.OrbitaAndroid.syncCalendarPairs(JSON.stringify(calendarSyncPairsPayload(cache.raw,own,state.subgroups?.[key],new Date(),state.lessonVariants?.[key],state.hiddenLessonVariants?.[key])))}
 catch{}
}
if(window.OrbitaAndroid?.syncCalendarPairs){
 const calendarSettings=document.createElement('section');
 calendarSettings.className='settings-section';
 calendarSettings.innerHTML='<div class="settings-section-title"><span class="settings-section-icon">'+icon('calendar')+
  '</span><div><h3>Синхронизация календаря</h3></div></div><button class="settings-link" id="configure-auto-calendar">Google Календарь →</button>';
 $('.settings-about').before(calendarSettings);
 $('#configure-auto-calendar').onclick=openAutoCalendar;
}
function openAutoCalendar(){
 const data=readCalendarTargets(),config=state.calendarAutoSync||{};
 modal('<h2>Google Календарь</h2><div id="automatic-calendar-options"></div>');
 const root=$('#automatic-calendar-options');
 if(!data.permission){
  root.innerHTML='<p>Разреши Орбите доступ к календарям телефона.</p><button class="primary" id="auto-calendar-permission">Разрешить доступ</button>';
  $('#auto-calendar-permission').onclick=()=>window.OrbitaAndroid.requestCalendarAccess();
  return;
 }
 const calendars=(data.calendars||[]).filter(calendar=>calendar.accountType==='com.google');
 if(!calendars.length){
  root.textContent='Добавь Google-аккаунт в Android и включи синхронизацию календаря.';
  return;
 }
 root.innerHTML='<label for="auto-calendar-id">Календарь</label><select id="auto-calendar-id">'+
  calendars.map(item=>'<option value="'+Number(item.id)+'">'+safe([...new Set([item.name,item.account].map(value=>String(value||'').trim()).filter(Boolean))].join(' · '))+'</option>').join('')+
  '</select><label class="calendar-sync-toggle"><span>Пары моей группы</span><input type="checkbox" role="switch" id="auto-calendar-pairs"></label>'+
  '<label class="calendar-sync-toggle"><span>Задачи со сроком</span><input type="checkbox" role="switch" id="auto-calendar-tasks"></label>'+
  '<p>Пары на 60 дней вперёд. Задачи со сроком — на весь день до отметки о выполнении.</p>'+
  '<p>При отключении или смене календаря добавленные записи сохраняются.</p>'+
  '<button class="primary" id="save-auto-calendar">Сохранить</button><p id="auto-calendar-status" role="status"></p>';
 if(calendars.some(item=>item.id===config.id))$('#auto-calendar-id').value=String(config.id);
 $('#auto-calendar-pairs').checked=!!config.pairs;$('#auto-calendar-tasks').checked=!!config.tasks;
 const message=$('#auto-calendar-status');
 message.textContent=window.OrbitaAndroid.calendarSyncStatus?.()||'';
 $('#save-auto-calendar').onclick=()=>{
  const previous=state.calendarAutoSync;
  state.calendarAutoSync={id:Number($('#auto-calendar-id').value),pairs:$('#auto-calendar-pairs').checked,tasks:$('#auto-calendar-tasks').checked};
  if(!save()){state.calendarAutoSync=previous;return}
  syncOwnPairsToCalendar();
  message.textContent=state.calendarAutoSync.pairs||state.calendarAutoSync.tasks?
   'Настройки сохранены. Android отправит изменения в Google при синхронизации.':'Автосинхронизация выключена.';
 };
}
const previousCalendarAccessChanged=window.orbitaCalendarAccessChanged;
window.orbitaCalendarAccessChanged=()=>{
 previousCalendarAccessChanged?.();
 if($('#automatic-calendar-options'))openAutoCalendar();
};
syncOwnPairsToCalendar();

function showWorkAttachmentControls(task){
 const root=document.createElement('section');
 root.className='work-attachments';root.dataset.workAttachmentId=task.workId;
 root.innerHTML='<b>Вложения Google Календаря</b><div data-work-files></div><p role="status" data-file-status></p>';
 $('#save-work-template').before(root);
 paintWorkAttachments(root,task.workId);
}
function paintWorkAttachments(root,id){
 const list=root.querySelector('[data-work-files]');
 list.replaceChildren();
 let data={};
 try{data=JSON.parse(window.OrbitaAndroid.workAttachments(id))}catch{}
 for(const file of data.files||[]){
  if(!/^https:\/\/(?:drive|docs)\.google\.com\//i.test(file.url))continue;
  const link=document.createElement('a');
  link.href=file.url;link.textContent='📎 '+file.name;
  list.append(link);
 }
 const button=document.createElement('button');
 button.type='button';button.className='settings-link';
 const retry=!!(data.pending||data.selected);
 button.id='work-attachment-action';
 button.textContent=retry?'Повторить прикрепление':'📎 Прикрепить файл';
 button.onclick=()=>{
  if(!state.calendarAutoSync?.tasks){
   root.querySelector('[data-file-status]').textContent='Включи синхронизацию задач с Google Календарём в настройках.';
   return;
  }
  button.disabled=true;
  root.querySelector('[data-file-status]').textContent=retry?'Подключаемся к Google…':'Выбери PDF, документ или фото для загрузки в свой Google Диск.';
  window.OrbitaAndroid.attachWorkFile(id,retry);
 };
 list.append(button);
}
window.orbitaAttachmentResult=(id,message,trashed=false)=>{
 const trashStatus=$('#completed-trash-status');
 if(trashed){
  const removed=removeCompletedWorks(new Set([id]));
  if(trashStatus?.dataset.workId===id&&$('#modal').open){
   if(removed)$('#modal').close();
   else{
    trashStatus.textContent='Вложения в корзине. Не удалось удалить задачу, попробуй удалить её отдельно.';
    $('#completed-task-only').disabled=false;
   }
  }
  if(removed)toast('Вложения в корзине Google Диска.');
  return;
 }
 if(trashStatus?.dataset.workId===id&&$('#modal').open){
  trashStatus.textContent=message;
  $('#completed-task-and-files').disabled=$('#completed-task-only').disabled=false;
  return;
 }
 const root=$('[data-work-attachment-id]');
 if(!root?.isConnected||!$('#modal').open||root.dataset.workAttachmentId!==id){toast(message);return}
 paintWorkAttachments(root,id);
 if(message.startsWith('Прикрепляем'))root.querySelector('button').disabled=true;
 root.querySelector('[data-file-status]').textContent=message;
};
