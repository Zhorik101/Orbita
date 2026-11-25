'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {webcrypto}=require('node:crypto');
const ctx=vm.createContext({URL,TextEncoder,crypto:webcrypto,orbitaSchemaVersion:1,window:{},
 isOrbitaRecord:value=>!!value&&typeof value==='object'&&!Array.isArray(value)});
for(const file of ['sdo-model.js','profile-backup.js'])
 vm.runInContext(fs.readFileSync(new URL('../assets/'+file,'file://'+__filename),'utf8'),ctx);
(async()=>{
 const courseId='sdo_'+'1'.repeat(32),copyId='sdo_'+'2'.repeat(32),fileId='a'.repeat(64);
 const url='https://online-edu.mirea.ru/course/view.php?id=81';
 assert.equal(ctx.canonicalSdoLink(url+'&sesskey=SECRET#section-1'),url);
 for(const invalid of ['javascript:alert(1)','https://online-edu.mirea.ru.evil.org/course/view.php?id=81',
  'https://evil@online-edu.mirea.ru/course/view.php?id=81','http://online-edu.mirea.ru/course/view.php?id=81',
  url+'&id=22','https://online-edu.mirea.ru/login/index.php?id=81'])assert.equal(ctx.canonicalSdoLink(invalid),'');
 const discipline={id:'chem',term:3,name:'Химия'};
 assert.equal(ctx.inferSdoDiscipline('Химия_Экзамен (часть 1/2)',[discipline]).id,'chem');
 assert.equal(ctx.inferSdoDiscipline('Химия (часть 1/2)',[discipline,{...discipline,term:4}]),null);
 assert.equal(ctx.inferSdoDiscipline('Химия и физика',[discipline,{id:'chem-phys',term:3,name:'Химия и физика'}]).id,'chem-phys');
 const course={id:courseId,title:'Органическая химия',url:url+'&token=SECRET',discipline};
 const file={id:fileId,title:'Практика.pptx',extension:'pptx',size:2048,courseId,sourceUri:'content://SECRET'};
 const task={workId:'work_1',text:'Подготовиться',subject:'Химия',done:false};
 const profile={tasks:[task],sdo:{items:[course,file],attachments:{work_1:[fileId,fileId]},cookie:'SECRET'}};
 const json=await ctx.createProfileBackup(profile);
 assert(!json.includes('SECRET'));
 const copy=await ctx.parseProfileBackup(json);
 assert.equal(copy.sdo.items[0].url,url);
 assert.equal(copy.sdo.items[0].discipline.term,3);
 assert.equal(copy.sdo.items[1].extension,'pptx');
 const wrong={id:'lang',term:3,name:'Иностранный язык'};
 const legacyCourses=['Иностранный язык (английский)','Основы химической физики_Экзамен','Физика (часть 2)','Учебный отдел ИТХТ']
  .map((title,i)=>({id:'sdo_'+String(i+3).repeat(32),title,url:'https://online-edu.mirea.ru/course/view.php?id='+String(91+i),
   discipline:wrong,source:'portal',updated:1234,disciplineEdited:i===3}));
 const migrated=ctx.cleanSdoProfile({items:[...legacyCourses,{...file,courseId:legacyCourses[1].id}],attachments:{work_1:[fileId]}});
 assert.deepEqual(Array.from(migrated.items.slice(0,3),item=>item.discipline),[null,null,null]);
 assert.equal(migrated.items[3].discipline.id,'lang');
 assert.equal(migrated.items[4].courseId,legacyCourses[1].id);
 assert.equal(migrated.attachments.work_1[0],fileId);
 assert.equal(ctx.inferSdoDiscipline(migrated.items[2].title,[{id:'physics',name:'Физика',term:2}]).term,2);
 assert.equal(ctx.inferSdoDiscipline(migrated.items[2].title,[{id:'physics',name:'Физика',term:2},{id:'physics',name:'Физика',term:3}]),null);
 const existing={tasks:[],notebooks:[],notes:{},sdo:{items:[{...course,id:copyId}],attachments:{}}};
 const restored=ctx.mergeProfileBackup(existing,copy,false);
 assert.equal(restored.sdo.items.length,2);
 assert.equal(restored.sdo.items[1].courseId,copyId);
 assert.equal(restored.sdo.attachments.work_1.length,1);
 assert.equal(restored.sdo.attachments.work_1[0],fileId);
 assert(!ctx.sameSdoDiscipline(discipline,{...discipline,term:2}));
 assert.equal(ctx.mergeProfileBackup(restored,copy,false).sdo.items.length,2);
 const legacy=await ctx.parseProfileBackup(JSON.stringify({tasks:[task]}));
 assert.equal(ctx.mergeProfileBackup(restored,legacy,false).sdo.items.length,2);
 console.log('PASS official link allowlist, secret stripping, semester links, duplicate import and profile compatibility');
})().catch(error=>{console.error(error);process.exitCode=1});
