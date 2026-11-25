const sdoHost='online-edu.mirea.ru';
const sdoKinds={course:'Курс',assignment:'Задание',lecture:'Лекция',lab:'Лабораторная',
 practice:'Практическая',material:'Материал',lesson:'Урок',quiz:'Тест',forum:'Форум',page:'Страница',folder:'Папка',link:'Учебная ссылка',other:'Прочее'};
const sdoDocumentId=/^[a-f0-9]{64}$/;
const sdoRecordId=/^(?:[a-f0-9]{64}|sdo_[a-f0-9]{32})$/;
const sdoFilesTypes=new Set(['pdf','docx','pptx','xlsx','txt','zip','rar','7z','doc','ppt']);

function canonicalSdoLink(value){
 if(typeof value!=='string'||value.length>2000)return '';
 try{
  const url=new URL(value.trim());
  if(url.origin!=='https://'+sdoHost||url.username||url.password)return '';
  const route=url.pathname;
  if(value.length<=1000&&/^[/]pluginfile[.]php[/][0-9]+[/][a-z][a-z0-9_]+[/][a-z][a-z0-9_]+[/].+/.test(route)&&
     route.split('/').every(part=>!/[/\\\x00-\x1f\x7f]/.test(decodeURIComponent(part))&&
      !['.','..'].includes(decodeURIComponent(part))))return url.origin+route;
  const id=url.searchParams.get('id');
  if((route==='/course/view.php'||/^\/mod\/[a-z][a-z0-9_]{0,38}\/view\.php$/.test(route))&&
     /^\d{1,15}$/.test(id||'')&&url.searchParams.getAll('id').length===1){
   return url.origin+route+'?id='+id;
  }
 }catch{}
 return '';
}

function sdoDiscipline(value){
 if(!value||typeof value.name!=='string'||!value.name.trim())return null;
 const name=value.name.trim().slice(0,240);
 const id=typeof value.id==='string'&&/^[a-zA-Z0-9_-]{1,120}$/.test(value.id)?value.id:'';
 return {id,name,term:Number.isInteger(value.term)&&value.term>0&&value.term<100?value.term:null};
}
function sameSdoDiscipline(a,b){
 return !!a&&!!b&&a.term===b.term&&(a.id&&b.id?a.id===b.id:
  a.name.toLocaleLowerCase('ru').replaceAll('ё','е')===b.name.toLocaleLowerCase('ru').replaceAll('ё','е'));
}
function cleanSdoProfile(value){
 if(!value||typeof value!=='object')return {items:[],attachments:{}};
 const items=[],ids=new Set(),links=new Set();
 for(const input of (Array.isArray(value.items)?value.items:[]).slice(0,500)){
  if(!input||typeof input.id!=='string'||!sdoRecordId.test(input.id)||ids.has(input.id))continue;
  const url=canonicalSdoLink(input.url);
  const document=sdoDocumentId.test(input.id);
  if(document?!!url:!url||links.has(url))continue;
  const title=typeof input.title==='string'?input.title.trim().slice(0,180):'';
  if(!title)continue;
  const courseUrl=url.includes('/course/view.php?');
  const courseId=typeof input.courseId==='string'&&/^sdo_[a-f0-9]{32}$/.test(input.courseId)?input.courseId:'';
  items.push({id:input.id,title,url,document,courseId,
   assignmentId:typeof input.assignmentId==='string'&&/^sdo_[a-f0-9]{32}$/.test(input.assignmentId)?input.assignmentId:'',
   source:input.source==='portal'?'portal':'manual',
   kind:courseUrl?'course':Object.hasOwn(sdoKinds,input.kind)&&input.kind!=='course'?input.kind:'other',
   section:typeof input.section==='string'?input.section.trim().slice(0,100):'',
   discipline:sdoDiscipline(input.discipline),favorite:!!input.favorite,
   extension:sdoFilesTypes.has(input.extension)?input.extension:'',
   size:Number.isSafeInteger(input.size)&&input.size>0&&input.size<=104857600?input.size:0,
   updated:Number.isSafeInteger(input.updated)&&input.updated>=0?input.updated:0});
  ids.add(input.id);
  if(url)links.add(url);
 }
 const attachments={};
 if(value.attachments&&typeof value.attachments==='object'){
  for(const [key,list] of Object.entries(value.attachments).slice(0,500)){
   if(!/^work_[a-zA-Z0-9_-]{1,100}$/.test(key)||!Array.isArray(list))continue;
   const valid=[...new Set(list.filter(id=>typeof id==='string'&&sdoRecordId.test(id)&&ids.has(id)))].slice(0,50);
   if(valid.length)attachments[key]=valid;
  }
 }
 return {items,attachments};
}
function mergeSdoProfiles(current,incoming,allowedTaskIds){
 const saved=cleanSdoProfile(current),copy=cleanSdoProfile(incoming);
 const items=[...saved.items,...copy.items];
 const attachments={...saved.attachments};
 const currentIds=new Map(saved.items.filter(item=>item.url).map(item=>[item.url,item.id]));
 const remap=new Map(copy.items.filter(item=>currentIds.has(item.url)).map(item=>[item.id,currentIds.get(item.url)]));
 for(const [task,list] of Object.entries(copy.attachments)){
  if(allowedTaskIds.has(task))attachments[task]=[...new Set([...(attachments[task]||[]),...list.map(id=>remap.get(id)||id)])];
 }
 return cleanSdoProfile({items:items.map(item=>({...item,courseId:remap.get(item.courseId)||item.courseId,
  assignmentId:remap.get(item.assignmentId)||item.assignmentId})),attachments});
}

function inferSdoDiscipline(title,courses){
 const normalize=value=>String(value||'').toLocaleLowerCase('ru').replaceAll('ё','е')
  .replace(/[^\p{L}\p{N}]+/gu,' ').trim();
 const name=normalize(title);
 const matches=courses.map(sdoDiscipline).filter(course=>{
  if(!course)return false;
  const subject=normalize(course.name);
  return subject.length>=4&&(name===subject||name.startsWith(subject+' '));
 }).sort((a,b)=>normalize(b.name).length-normalize(a.name).length);
 const best=matches[0];
 if(!best)return null;
 const equallySpecific=matches.filter(match=>normalize(match.name).length===normalize(best.name).length);
 return equallySpecific.every(match=>sameSdoDiscipline(best,match))?best:null;
}
