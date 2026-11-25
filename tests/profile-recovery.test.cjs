'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(new URL('../assets/app.js', 'file://' + __filename), 'utf8');
const initialization = source.slice(0, source.indexOf('let selected='));
const persist = source.slice(source.indexOf('function persistOrbita()'), source.indexOf('save = persistOrbita;'));

function load({native, fallback, diskFull = false}) {
 const disk = new Map(fallback ? [['orbita', fallback]] : []);
 let writes = 0;
 const notice = {setAttribute() {}};
 const context = vm.createContext({
  window: {matchMedia: () => ({matches: false}), OrbitaAndroid: {
   read: () => native,
   write: () => { writes++; return true; }
  }},
  localStorage: {
   getItem: key => disk.get(key),
   setItem: (key, value) => {
    if(diskFull) throw Error('quota');
    disk.set(key, value);
   }
  },
  document: {createElement: () => notice, querySelector: () => ({prepend() {}})},
  toast() {}
 });
 vm.runInContext(initialization + persist, context);
 return {run: expression => vm.runInContext(expression, context), disk, notice, writes: () => writes};
}

const base = {group:'ИКБО-16-24',theme:'pink',homeNote:'Сохранить',notes:{lesson:'Конспект'}};
for (const tasks of [null, {}, [null, 5], [{text:'Пересдача',done:false,dueISO:37}]]) {
 const profile = load({native:JSON.stringify({...base,tasks,notebooks:[null],teamToken:'exclude-this-token'})});
 assert.equal(profile.run('state.schemaVersion'), 1);
 assert.equal(profile.run('state.theme'), 'pink');
 assert.equal(profile.run('state.notes.lesson'), 'Конспект');
 assert.equal(profile.run('Array.isArray(state.tasks)'), true);
 assert.equal(profile.run('state.tasks[0]?.dueISO || ""'), '');
 assert(!profile.disk.get('orbita-recovery-v1').includes('exclude-this-token'));
 assert.equal(profile.run('persistOrbita()'), true);
}
const legacy = load({native:JSON.stringify({...base,tasks:{a:{text:'Отчёт',done:true,workId:'work_1'}}})});
assert.equal(legacy.run('state.tasks[0].workId'), 'work_1');
assert.equal(legacy.run('state.tasks[0].done'), true);

for (const profile of [
 load({native:'{truncated',fallback:JSON.stringify(base)}),
 load({native:JSON.stringify({...base,schemaVersion:9})}),
 load({native:JSON.stringify(base),diskFull:true})
]) {
 assert.equal(profile.run('state.homeNote'), 'Сохранить');
 assert.equal(profile.run('persistOrbita()'), false);
 assert.equal(profile.writes(), 0);
}
console.log('PASS: profile migration, recovered task, secret-free snapshot, protected corrupt/future profiles and write failures');
