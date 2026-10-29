// Запуск: node stage5_guess_number_tests.js
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const html = fs.readFileSync('index.html', 'utf8');
const codeGs = fs.readFileSync('Code.gs', 'utf8');
function lesson8Catalog() { const start=html.indexOf('const lesson8Tasks=')+'const lesson8Tasks='.length; const end=html.indexOf('\n];',start)+2; return JSON.parse(html.slice(start,end)); }
function fnSrc(source,name){const i=source.indexOf('function '+name+'(');if(i<0)throw new Error('нет функции '+name);const open=source.indexOf('{',i);let d=0,q='',e=false;for(let p=open;p<source.length;p++){const c=source[p];if(q){if(e)e=false;else if(c==='\\')e=true;else if(c===q)q='';continue}if(c==='"'||c==="'"||c==='`'){q=c;continue}if(c==='{')d++;if(c==='}'&&--d===0)return source.slice(i,p+1)}throw new Error('не закрыта функция')}
let count=0;function test(name,fn){count++;fn();console.log('OK   '+name)}
const catalog=lesson8Catalog();
test('занятие 8 начинается шестью этапами проекта и содержит девять задач после него',()=>{assert.deepStrictEqual(catalog.map(t=>t.id),[10,11,12,13,14,15,1,2,3,4,5,6,7,8,9]);assert.deepStrictEqual(catalog.slice(0,6).map(t=>t.projectStage),['base','difficulty','economy','time','hints','final']);assert.deepStrictEqual(catalog.slice(6).map(t=>t.id),[1,2,3,4,5,6,7,8,9])});
test('проектные этапы переносят код и открываются последовательно',()=>{catalog.slice(0,6).forEach((t,i)=>{assert.ok(t.problem&&t.criteria&&t.hint&&t.theory,t.title);if(i)assert.deepStrictEqual(t.starterSourceKeys,[`8-${10+i-1}`]);if(i>0)assert.deepStrictEqual(t.unlockAfterKeys,[`8-${10+i-1}`])});assert.deepStrictEqual(catalog[6].unlockAfterKeys,['8-15'])});
test('кнопка проекта и автоматические проверки этапов подключены',()=>{assert.match(html,/project-nav-link/);assert.match(html,/async function checkProjectStage1Base/);assert.match(html,/project_stage6_bluff:checkProjectStage6Bluff/)});
test('сервер сразу разрешает все этапы и задачи занятия 8',()=>{const ctx={LESSON8_ALL_TASKS_OPEN:true,readTaskObjects_:()=>[]};vm.createContext(ctx);vm.runInContext(fnSrc(codeGs,'taskPrerequisiteGroups_')+'\n'+fnSrc(codeGs,'assertPreviousTaskCompleted_'),ctx);for(const taskId of [10,11,12,13,14,15,1,2,3,4,5,6,7,8,9])assert.doesNotThrow(()=>ctx.assertPreviousTaskCompleted_({accountId:'a'},8,taskId))});
console.log('\nПроверок: '+count+', не пройдено: 0');
