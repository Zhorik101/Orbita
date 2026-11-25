const debtMarkLabels={review:'Проверить статус',retake:'Нужна пересдача'};

function cleanDebtMarks(value){
 if(!value||typeof value!=='object'||Array.isArray(value))return {};
 return Object.fromEntries(Object.entries(value).filter(([key,mark])=>
  /^(task|event):[a-zA-Z0-9_-]{1,160}$/.test(key)&&Object.hasOwn(debtMarkLabels,mark)));
}

function collectDebts(tasks,events,marks,today,now){
 const taskById=new Map(tasks.filter(task=>task.workId).map(task=>[task.workId,task]));
 const seen=new Set();
 const result=[];
 function create(task,event){
  const taskMark=task&&marks['task:'+task.workId],eventMark=event&&marks['event:'+event.id];
  const taskDue=task&&controlDateValid(task.dueISO)?task.dueISO:'';
  const taskOpen=!!task&&!task.done, eventOpen=!!event&&event.status!=='completed';
  const workOverdue=taskOpen&&!!taskDue&&taskDue<today;
  const eventOverdue=eventOpen&&controlStatus(event,today,now)==='overdue';
  const review=!!(taskMark||eventMark)||event?.status==='review';
  if(!taskOpen&&!eventOpen&&!review)return;
  const date=[taskOpen?taskDue:'',eventOpen?event.date:''].filter(Boolean).sort()[0]||'';
  const marksForRow=[];
  if(taskMark)marksForRow.push({key:'task:'+task.workId,label:debtMarkLabels[taskMark]});
  if(eventMark)marksForRow.push({key:'event:'+event.id,label:debtMarkLabels[eventMark]});
  result.push({task,event,taskDue,title:event?.title||task?.text||'Работа',
   subject:event?.courseName||task?.subject||'Личное',kind:event?controlTypes[event.type]:task?.kind||'Личная работа',
   date,open:taskOpen||eventOpen,overdue:workOverdue||eventOverdue,review,marks:marksForRow,
   workOverdue,eventOverdue,taskOpen,eventOpen});
 }
 for(const event of events){
  const task=taskById.get(event.taskId);
  if(task&&!seen.has(task.workId)){
   seen.add(task.workId);
   create(task,event);
  }else create(null,event);
 }
 for(const task of tasks)if(task.workId&&!seen.has(task.workId))create(task,null);
 return result;
}
