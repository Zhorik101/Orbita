const moscowClock=new Intl.DateTimeFormat('en-GB',{
 timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit',
 hour:'2-digit',minute:'2-digit',hourCycle:'h23'
});
function moscowParts(instant){
 const p=Object.fromEntries(moscowClock.formatToParts(instant).map(part=>[part.type,part.value]));
 return {date:p.year+'-'+p.month+'-'+p.day,time:p.hour+':'+p.minute};
}
function officialParts(time){
 if(time.zone?.tzid==='UTC'||time.zone?.tzid==='Z')return moscowParts(time.toJSDate());
 return {date:`${time.year}-${String(time.month).padStart(2,'0')}-${String(time.day).padStart(2,'0')}`,time:`${String(time.hour).padStart(2,'0')}:${String(time.minute).padStart(2,'0')}`};
}
function officialLessonType(raw){const value=String(raw||'').trim().toLowerCase().replaceAll('ё','е');if(/экзам|^экз$|^э$/.test(value))return 'Экзамен';if(/зачет|^зач$|^з$|^зд$|^дз$/.test(value))return 'Зачёт';if(/консульт|^конс$|^кт$/.test(value))return 'Консультация';if(/лек|^лк$/.test(value))return 'Лекция';if(/лаб|^лр$|^лб$/.test(value))return 'Лабораторная работа';if(/прак|^пр$/.test(value))return 'Практическое занятие';return String(raw||'Занятие')}
function expandOfficialCalendar(text,from,to){
 if(!text.includes('BEGIN:VCALENDAR'))throw new Error('Мирэа вернул ответ без календаря');
 const calendar=new ICAL.Component(ICAL.parse(text));
 for(const zone of calendar.getAllSubcomponents('vtimezone'))ICAL.TimezoneService.register(zone.getFirstPropertyValue('tzid'),new ICAL.Timezone(zone));
 const components=calendar.getAllSubcomponents('vevent'),result={};
 const exceptionsByUid=new Map();
 for(const component of components){
  if(!component.hasProperty('recurrence-id'))continue;
  const uid=component.getFirstPropertyValue('uid');
  if(!exceptionsByUid.has(uid))exceptionsByUid.set(uid,[]);
  exceptionsByUid.get(uid).push(component);
 }
 for(const component of components){
  if(component.hasProperty('recurrence-id'))continue;
  const event=new ICAL.Event(component);if(!event.startDate||event.startDate.isDate)continue;
  for(const exception of (exceptionsByUid.get(event.uid)||[]))event.relateException(exception);
  const iterator=event.iterator();let start,loops=0;
  while((start=iterator.next())&&++loops<50000){
   const rough=officialParts(start).date;if(rough>to)break;
   const occurrence=event.getOccurrenceDetails(start),entry=occurrence.item.component;
   if(String(entry.getFirstPropertyValue('status')||'').toUpperCase()==='CANCELLED')continue;
   const begin=officialParts(occurrence.startDate),end=officialParts(occurrence.endDate);if(begin.date<from||begin.date>to)continue;
   const prop=name=>String(entry.getFirstPropertyValue(name)||component.getFirstPropertyValue(name)||'');
   const multi=name=>(entry.getAllProperties(name).length?entry:component).getAllProperties(name).map(p=>String(p.getFirstValue())).filter(Boolean).join(', ');
   const auditorium=entry.getFirstProperty('x-meta-auditorium')||component.getFirstProperty('x-meta-auditorium');
   const rawType=prop('x-meta-full_lesson_type')||prop('x-meta-lesson_type');
   const type=officialLessonType(rawType);
   const lesson={uid:event.uid+'@'+start.toString(),date:begin.date,title:prop('x-meta-discipline')||prop('summary')||'Занятие',type,teacher:multi('x-meta-teacher'),groups:multi('x-meta-group'),room:String(auditorium?.getParameter('number')||auditorium?.getFirstValue()||prop('location')||'Не указана'),campus:String(auditorium?.getParameter('campus')||''),start:begin.time,end:end.time,color:type==='Лекция'?'violet':type==='Лабораторная работа'?'blue':'green'};
   const explicit=prop('x-meta-subgroup')||prop('x-meta-sub-group');
   const tagged=prop('description').split(/\r?\n/).map(line=>line.trim()).find(line=>/^(?:подгруппа|п\/г)\s*№?\s*\d{1,2}$/i.test(line))||'';
   lesson.subgroup=String(explicit.match(/^\s*(?:подгруппа\s*)?(\d{1,2})\s*$/i)?.[1]||
     tagged.match(/(?:^|[\s(,;])(?:подгруппа|п\/г)\s*№?\s*(\d{1,2})(?!\d)/i)?.[1]||'');
   (result[begin.date]||=[]).push(lesson);
   if(!event.isRecurring())break;
  }
 }
 for(const list of Object.values(result))list.sort((a,b)=>a.start.localeCompare(b.start)||a.title.localeCompare(b.title));
 return result;
}
function scheduleSnapshot(raw){const start=new Date();start.setHours(12,0,0,0);const end=new Date(start);end.setDate(end.getDate()+35);return Object.values(expandOfficialCalendar(raw,moscowParts(start).date,moscowParts(end).date)).flat().map(l=>({uid:l.uid,date:l.date,start:l.start,end:l.end,title:l.title,room:l.room,campus:l.campus,teacher:l.teacher,type:l.type}))}
function snapshotBaseId(row){const uid=String(row.uid||'');return uid.slice(0,uid.lastIndexOf('@'))||uid}
function scheduleDiff(before,after){const remaining=new Set(after.map((_,i)=>i)),changes=[];const cutoff=moscowParts(new Date()).date;for(const old of before.filter(r=>r.date>=cutoff)){let index=after.findIndex((r,i)=>remaining.has(i)&&r.uid===old.uid);if(index<0){let nearest=Infinity;for(const i of remaining){const row=after[i],distance=Math.abs(Date.parse(row.date+'T'+row.start)-Date.parse(old.date+'T'+old.start));if(snapshotBaseId(row)===snapshotBaseId(old)&&distance<=3*86400000&&distance<nearest){nearest=distance;index=i}}}if(index<0){changes.push({kind:'Отменена пара',before:old});continue}remaining.delete(index);const row=after[index];if(['date','start','end','title','room','campus','teacher','type'].some(k=>row[k]!==old[k]))changes.push({kind:row.date!==old.date||row.start!==old.start||row.end!==old.end?'Перенос пары':'Изменение пары',before:old,after:row})}for(const i of remaining)if(after[i].date>=cutoff)changes.push({kind:'Добавлена пара',after:after[i]});return changes}

function calendarPairEvent(row, group) {
 const types={'Лекция':['📖','9','Лек'],'Практическое занятие':['✍️','2','Практ'],'Лабораторная работа':['🧪','3','Лаб'],
  'Экзамен':['📝','11','Экз'],'Зачёт':['✅','6','Зач'],'Консультация':['💬','5','Конс']};
 const [badge,colorKey,abbr]=types[row.type]||['📚','','Пара'];
 const shortNames=[
  [/^органическая химия$/i,'Органика'],
  [/^информационные технологии в химии$/i,'ИТ в химии'],
  [/^системы искусственного интеллекта и большие данные$/i,'ИИ и данные'],
  [/^начертательная геометрия/i,'Начерталка'],
  [/^специальные главы высшей математики/i,'Спецмат'],
  [/^физическая культура/i,'Физкультура'],
  [/^иностранный язык/i,'Ин. язык']
 ];
 const name=shortNames.find(([pattern])=>pattern.test(row.title))?.[1]||row.title;
 return {
  uid:row.uid,title:badge+' ['+abbr+'] '+name,colorKey,
  start:Date.parse(row.date+'T'+row.start+':00+03:00'),
  end:Date.parse(row.date+'T'+row.end+':00+03:00'),
  location:[row.room,row.campus].filter(Boolean).join(' · '),
  description:[row.title,row.type,row.teacher,row.subgroup?'Подгруппа '+row.subgroup:'',
   'Группа '+group,'Источник: schedule-of.mirea.ru'].filter(Boolean).join('\n')
 };
}

function lessonVariantKey(row){return JSON.stringify([row.title,row.type])}
function lessonVariantId(row){
 return row.teacher?.trim()?JSON.stringify(['teacher',row.teacher.trim()]):JSON.stringify(['room',row.campus||'',row.room||'']);
}
function parallelLessonSets(rows){
 const slots=new Map();
 for(const row of rows){
  if(row.subgroup||!['Лабораторная работа','Практическое занятие'].includes(row.type))continue;
  if(!row.teacher?.trim()&&(!row.room||row.room==='Не указана'))continue;
  const slot=JSON.stringify([row.date,row.start,lessonVariantKey(row)]);
  if(!slots.has(slot))slots.set(slot,[]);
  slots.get(slot).push(row);
 }
 return [...slots.values()].filter(group=>new Set(group.map(lessonVariantId)).size>1);
}
function hiddenLessonKey(row){
 return JSON.stringify([row.title,row.type,row.subgroup?'Подгруппа '+row.subgroup:
  (row.teacher?.trim()||[row.room,row.campus].filter(Boolean).join(' · '))]);
}
function filterOwnLessons(rows,subgroup,variants,hiddenChoices){
 const omitted=new Set(hiddenChoices||[]);
 const parallel=new Set(parallelLessonSets(rows).flat());
 if(omitted.size)rows=rows.filter(row=>!(row.subgroup||parallel.has(row))||!omitted.has(hiddenLessonKey(row)));
 const matches=subgroup?rows.filter(row=>!row.subgroup||row.subgroup===subgroup):rows;
 if(!variants)return matches;
 const hidden=new Set();
 for(const group of parallelLessonSets(matches)){
  const selected=variants[lessonVariantKey(group[0])];
  if(!selected||!group.some(row=>lessonVariantId(row)===selected))continue;
  for(const row of group)if(lessonVariantId(row)!==selected)hidden.add(row);
 }
 return matches.filter(row=>!hidden.has(row));
}

function calendarSyncPairsPayload(raw, target, subgroup, now=new Date(), variants=null, hiddenChoices=null){
 const first=moscowParts(now).date;
 const exclusive=new Date(first+'T00:00:00Z');
 exclusive.setUTCDate(exclusive.getUTCDate()+61);
 const limit=exclusive.toISOString().slice(0,10);
 const last=new Date(exclusive.getTime()-86400000).toISOString().slice(0,10);
 const rows=Object.values(expandOfficialCalendar(raw,first,last)).flat();
 return {
  scope:'1:'+target.id,
  from:Date.parse(first+'T00:00:00+03:00'),
  to:Date.parse(limit+'T00:00:00+03:00'),
  events:filterOwnLessons(rows,subgroup,variants,hiddenChoices)
   .map(row=>calendarPairEvent(row,target.title))
 };
}
