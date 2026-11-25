const controlTypes={test:'Тест',exam:'Контрольная',lab:'Лабораторная',practice:'Практическая',other:'Другое'};
const controlStatuses={planned:'Запланировано',completed:'Выполнено',overdue:'Просрочено',review:'Требует проверки'};
const controlIdPattern=/^mtk_[a-f0-9]{32}$/;

function controlDateValid(value){
 if(typeof value!=='string'||!/^20\d{2}-\d{2}-\d{2}$/.test(value))return false;
 const date=new Date(value+'T00:00:00Z');
 return Number.isFinite(+date)&&date.toISOString().slice(0,10)===value;
}

function cleanControlEvent(item){
 if(!item||typeof item!=='object'||!controlIdPattern.test(item.id))return null;
 const field=(key,max)=>typeof item[key]==='string'?item[key].trim().slice(0,max):'';
 const title=field('title',160),courseName=field('courseName',240);
 if(!title||!courseName)return null;
 const date=controlDateValid(item.date)?item.date:'';
 const time=date&&typeof item.time==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(item.time)?item.time:'';
 const points=key=>typeof item[key]==='number'&&Number.isFinite(item[key])&&item[key]>=0&&item[key]<=100000?item[key]:null;
 const term=Number.isInteger(item.term)&&item.term>0&&item.term<100?item.term:null;
 return {id:item.id,courseId:field('courseId',120),courseName,term,title,date,time,
  type:Object.hasOwn(controlTypes,item.type)?item.type:'other',
  status:['planned','completed','review'].includes(item.status)?item.status:'planned',
  earned:points('earned'),maximum:points('maximum'),notes:field('notes',2000),taskId:field('taskId',160)};
}

function controlEventList(value){
 if(!Array.isArray(value))return [];
 const seen=new Set();
 return value.map(cleanControlEvent).filter(item=>{
  if(!item||seen.has(item.id))return false;
  seen.add(item.id);
  return true;
 });
}

function controlStatus(event,today,now){
 if(event.status!=='planned')return event.status;
 if(!event.date)return 'planned';
 return event.date<today||(event.time&&Date.parse(event.date+'T'+event.time+':00+03:00')<now)?'overdue':'planned';
}

function controlCalendarTiming(date,time){
 if(!controlDateValid(date))return null;
 if(time&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))return null;
 const start=Date.parse(date+(time?'T'+time+':00+03:00':'T00:00:00Z'));
 return {start,end:start+(time?3600000:86400000),allDay:!time};
}

function controlTaskFor(event,tasks){
 return event.taskId?tasks.find(task=>task.workId===event.taskId):undefined;
}

function makeControlTask(event,workId,dueLabel){
 return {workId,text:event.title,kind:controlTypes[event.type],subject:event.courseName,
  dueISO:event.date,due:dueLabel,comment:event.notes,done:false};
}
