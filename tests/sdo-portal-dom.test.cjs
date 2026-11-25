'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('/workspace/orbita-qa/node_modules/jsdom');
const source=fs.readFileSync(new URL('../src/ru/mirea/orbita/SdoPortalActivity.java','file://'+__filename),'utf8');
const script=source.match(/String script = """([\s\S]*?)""";/)[1].replaceAll('\\\\','\\');
function scan(path,html){
 const dom=new JSDOM(html,{url:'https://online-edu.mirea.ru'+path,runScripts:'outside-only'});
 for(const a of dom.window.document.querySelectorAll('a')){
  a.getClientRects=()=>a.hidden?[]:[{}];
  Object.defineProperty(a,'innerText',{value:a.textContent});
 }
 for(const heading of dom.window.document.querySelectorAll('h3'))
  Object.defineProperty(heading,'innerText',{value:heading.textContent});
 const links=JSON.parse(JSON.stringify(dom.window.eval(script)));
 dom.window.close();
 return links;
}
const dashboard=scan('/my/courses.php',[
 '<a href="/course/view.php?id=4&sesskey=SECRET">Химия</a>',
 '<a href="/course/view.php?id=4">Дубликат</a>',
 '<a hidden href="/course/view.php?id=5">Скрытый</a>',
 '<a href="https://elsewhere.test/course/view.php?id=6">Сторонний</a>'
].join(''));
assert.deepEqual(dashboard,[{url:'https://online-edu.mirea.ru/course/view.php?id=4',title:'Химия',section:''}]);
const course=scan('/course/view.php?id=4','<li class="section"><h3>Тема 1</h3>'+
 '<a href="/mod/assign/view.php?id=8&token=SECRET">Задание</a>'+
 '<a href="/mod/forum/view.php?id=9">Форум</a></li>');
assert.equal(course.length,2);
assert(course.every(item=>item.section==='Тема 1'));
assert(!JSON.stringify(course).includes('SECRET'));
assert.equal(scan('/login/index.php','<a href="/course/view.php?id=4">Химия</a>'),'');
console.log('PASS visible course links, section titles, duplicate and secret stripping in portal DOM fixture');
