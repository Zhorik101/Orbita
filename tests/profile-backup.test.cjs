'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {webcrypto}=require('node:crypto');
const source=fs.readFileSync(new URL('../assets/profile-backup.js','file://'+__filename),'utf8');
const context=vm.createContext({
 TextEncoder,crypto:webcrypto,orbitaSchemaVersion:1,window:{},
 isOrbitaRecord:value=>!!value&&typeof value==='object'&&!Array.isArray(value)
});
vm.runInContext(source,context);
(async()=>{
 const task={workId:'unique',text:'Пересдача',done:true,driveToken:'secret'};
 const raw={tasks:[task],notebooks:[{id:'n',title:'План',body:'Лекция'}],notes:{lesson:'Заметка'},
  theme:'pink',homeLayout:[{id:'tasks',size:'large'}],teamSession:{token:'secret'},calendarAutoSync:{account:'secret'}};
 const exported=await context.createProfileBackup(raw);
 assert(!exported.includes('secret'));
 const decoded=await context.parseProfileBackup(exported);
 assert.equal(decoded.tasks[0].workId,'unique');
 assert.equal(decoded.notes.lesson,'Заметка');
 assert.equal(decoded.theme,'pink');
 await assert.rejects(context.parseProfileBackup(exported.replace('Пересдача','Сломано')),/Контрольная сумма/);
 await assert.rejects(context.parseProfileBackup(JSON.stringify({...raw,schemaVersion:10})),/более новой/);
 await assert.rejects(context.parseProfileBackup(JSON.stringify({tasks:null,notes:{}})),/повреждён/);
 const legacy=await context.parseProfileBackup(JSON.stringify(raw));
 const current={tasks:[{...task,done:false}],notebooks:[],notes:{lesson:'Свежая заметка'},theme:'blue',widgetTaskRevision:42};
 const merged=context.mergeProfileBackup(current,legacy,true);
 assert.equal(merged.tasks.length,1);
 assert.equal(merged.tasks[0].done,false);
 assert.equal(merged.notebooks[0].body,'Лекция');
 assert.equal(merged.notes.lesson,'Свежая заметка');
 assert.equal(merged.theme,'pink');
 assert.equal(merged.widgetTaskRevision,42);
 assert.equal(context.mergeProfileBackup(merged,decoded,false).notebooks.length,1);
 assert.equal(context.mergeProfileBackup(current,decoded,false).theme,'blue');
 console.log('PASS portable backup, digest, legacy 2.0, duplicate-free merge and secret exclusion');
})().catch(error=>{console.error(error);process.exitCode=1});
