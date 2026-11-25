'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {webcrypto}=require('node:crypto');
const context=vm.createContext({TextEncoder,crypto:webcrypto,orbitaSchemaVersion:1,window:{},
 isOrbitaRecord:value=>!!value&&typeof value==='object'&&!Array.isArray(value)});
for(const file of ['control-events-model.js','profile-backup.js']){
 vm.runInContext(fs.readFileSync(new URL('../assets/'+file,'file://'+__filename),'utf8'),context);
}

(async()=>{
 const id='mtk_'+('1'.repeat(32));
 const entry=context.cleanControlEvent({id,courseId:'mi-3',courseName:'Физика',term:3,title:'Контрольная',
  type:'exam',date:'2026-11-25',time:'14:00',earned:0,maximum:10,status:'planned',taskId:'task-1',token:'secret'});
 assert.deepEqual([entry.earned,entry.maximum,entry.title],[0,10,'Контрольная']);
 assert.equal(context.controlStatus(entry,'2026-11-25',Date.parse('2026-11-25T11:01:00Z')),'overdue');
 assert.equal(context.controlStatus({...entry,status:'completed'},'2026-12-01',Date.now()),'completed');
 assert.equal(context.controlStatus({...entry,time:''},'2026-11-25',Date.now()),'planned');
 assert.equal(context.controlCalendarTiming('', ''),null);
 assert.equal(context.controlCalendarTiming('2026-02-30',''),null);
 assert.equal(context.controlCalendarTiming('2026-11-25','14:00').start,Date.parse('2026-11-25T11:00:00Z'));
 assert.equal(context.controlCalendarTiming('2026-11-25','').allDay,true);
 assert.equal(context.controlEventList([entry,{...entry,title:'Дубликат'}]).length,1);
 const task=context.makeControlTask(entry,'task-1','25.11.2026');
 assert.equal(context.controlTaskFor(entry,[task]).workId,'task-1');
 const copy=await context.createProfileBackup({tasks:[task],controlEvents:[entry]});
 assert(!copy.includes('secret'));
 const parsed=await context.parseProfileBackup(copy);
 const empty={tasks:[],notebooks:[],notes:{}};
 const restored=context.mergeProfileBackup(empty,parsed,false);
 assert.equal(restored.controlEvents[0].taskId,'task-1');
 assert.equal(restored.controlEvents[0].courseId,'mi-3');
 const merged=context.mergeProfileBackup(restored,parsed,false);
 assert.equal(merged.controlEvents.length,1);
 assert.equal(merged.tasks.length,1);
 const conflicting=context.mergeProfileBackup({...empty,tasks:[{...task,text:'Другая задача'}]},parsed,false);
 assert.equal(conflicting.controlEvents[0].taskId,'');
 const old=await context.parseProfileBackup(JSON.stringify({tasks:[task]}));
 assert.equal(context.mergeProfileBackup(restored,old,false).controlEvents.length,1);
 console.log('PASS control event validation, calendar timing, backup round trip, old data and stable links');
})().catch(error=>{console.error(error);process.exitCode=1});
