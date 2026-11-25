'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {webcrypto}=require('node:crypto');
const context=vm.createContext({TextEncoder,crypto:webcrypto,orbitaSchemaVersion:1,window:{},
 isOrbitaRecord:value=>!!value&&typeof value==='object'&&!Array.isArray(value)});
for(const file of ['control-events-model.js','debts-model.js','profile-backup.js']){
 vm.runInContext(fs.readFileSync(new URL('../assets/'+file,'file://'+__filename),'utf8'),context);
}

(async()=>{
 const tasks=[
  {workId:'linked',text:'Подготовка',subject:'Физика',dueISO:'2026-11-23',done:false},
  {workId:'undated',text:'Без срока',subject:'Физика',done:false},
  {workId:'old',text:'Выполнено',subject:'Физика',dueISO:'2026-11-20',done:true}
 ];
 const id='mtk_'+'1'.repeat(32);
 const event=context.cleanControlEvent({id,title:'Зачётная работа',courseName:'Физика',courseId:'id-3',term:3,
  taskId:'linked',type:'practice',status:'review',date:'2026-11-26'});
 const marks={'task:old':'retake',['event:'+id]:'review','task:undated':'unknown'};
 const clean=context.cleanDebtMarks(marks);
 const today='2026-11-25',now=Date.parse(today+'T12:00:00Z');
 const rows=context.collectDebts(tasks,[event],clean,today,now);
 assert.equal(rows.length,3);
 assert.equal(rows[0].task.workId,'linked');
 assert.equal(rows[0].event.id,id);
 assert.equal(rows[0].overdue,true);
 assert.equal(rows[0].review,true);
 assert.equal(rows[1].task.workId,'undated');
 assert.equal(rows[1].overdue,false);
 assert.equal(rows[1].review,false);
 assert.equal(rows[2].open,false);
 assert.equal(rows[2].review,true);
 tasks[0].done=true;
 const next=context.collectDebts(tasks,[event],{},today,now);
 assert.equal(next[0].event.status,'review');
 assert.equal(next[0].overdue,false);
 assert.equal(next.length,2);
 const copy=await context.createProfileBackup({tasks,controlEvents:[event],debtMarks:clean});
 const data=await context.parseProfileBackup(copy);
 const restored=context.mergeProfileBackup({tasks:[],notebooks:[],notes:{}},data,false);
 assert.equal(restored.controlEvents[0].taskId,'linked');
 assert.equal(restored.debtMarks['task:old'],'retake');
 assert.equal(restored.debtMarks['event:'+id],'review');
 assert.equal(restored.debtMarks['task:undated'],undefined);
 assert.equal(context.mergeProfileBackup(restored,data,false).controlEvents.length,1);
 console.log('PASS linked debts, undated tasks, review marks, independent status and backup recovery');
})().catch(error=>{console.error(error);process.exitCode=1});
