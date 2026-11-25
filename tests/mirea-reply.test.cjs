'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(new URL('../assets/study-workflow.js', 'file://' + __filename), 'utf8');
const logic = source.slice(source.indexOf('const mireaReplyTimeouts='), source.indexOf('window.orbitaRefreshMireaGrades='));
const pending = new Map();
let counter = 0;
let bridgeRequest;
let renders = 0;
const context = vm.createContext({
 window: {OrbitaAndroid: {loadMireaGrades(id) {bridgeRequest=id;}}},
 setTimeout(callback, delay) {
  assert.equal(delay, 25000);
  pending.set(++counter, callback);
  return counter;
 },
 clearTimeout(id) { pending.delete(id); },
 paintCourseTools() { renders++; },
 page: 'mini-courses'
});
const run = script => vm.runInContext(script, context);
run('let courseGradesLoading=false,courseGradeRefreshError=false,courseGradeRequest=0,courseGradeResult={courses:[{total:15}]};'+logic);
run('loadCourseGrades()');
assert.equal(run('courseGradesLoading'), true);
assert.equal(pending.size, 1);
[...pending.values()][0]();
assert.equal(run('courseGradesLoading'), false);
assert.equal(run('courseGradeRefreshError'), true);
assert.equal(run('courseGradeResult.courses[0].total'), 15);
run(`window.orbitaMireaGrades(${bridgeRequest},{courses:[{total:99}]})`);
assert.equal(run('courseGradeResult.courses[0].total'), 15);
run('loadCourseGrades()');
run(`window.orbitaMireaGrades(${bridgeRequest},{courses:[{total:22}]})`);
assert.equal(run('courseGradeResult.courses[0].total'), 22);
assert.equal(pending.size, 0);
run('window.OrbitaAndroid.loadMireaGrades=()=>{throw Error("bridge")};loadCourseGrades()');
assert.equal(run('courseGradesLoading'), false);
assert.equal(run('courseGradeRefreshError'), true);
assert(renders >= 4);
console.log('PASS: timeout, cached grades, ignored late reply, retry and throwing Android bridge');
