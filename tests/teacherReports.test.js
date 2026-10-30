const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function load() { const context = { Date, Map, Set, String, Number, Array, JSON, console }; vm.runInNewContext(fs.readFileSync('teacherReports.js', 'utf8'), context); return context.TeacherReports; }
const row=(name,taskId,date,result,failed=0,attemptId='')=>({name,taskId,date,result,failed,attemptId,lesson:'Занятие 1'});
test('chooses latest attempt by timestamp even when rows are shuffled',()=>{const r=load();const out=r.latestByTask([row('Маша','1','2026-01-03','Решена',0,'b'),row('Маша','1','2026-01-01','Ошибка',1,'a')]);assert.equal(out[0].row.result,'Решена');});
test('does not treat invalid timestamps as a reliable latest order',()=>{const r=load();const out=r.latestByTask([row('Маша','1','bad','Решена',0,'b'),row('Маша','1','','Ошибка',1,'a')]);assert.equal(out[0].orderKnown,false);});
test('counts unique active tasks and keeps assignment percentage unknown',()=>{const r=load();const m=r.metrics([row('Маша','1','2026-01-02','Решена',0,'b'),row('Маша','1','2026-01-01','Ошибка',1,'a'),row('Маша','2','2026-01-01','Ошибка',1,'c')],[{id:1},{id:2},{id:3}]);assert.equal(m.activeTasks,2);assert.equal(m.successfulTasks,1);assert.equal(m.progressPercent,null);});
test('filters and exports all matching rows with safe CSV cells',()=>{const r=load();const rows=[row('Маша','1','2026-01-02','Решена',0,'b'),row('Оля','2','2026-01-03','Ошибка',1,'c')];const filtered=r.filterRows(rows,{lessonId:1,student:'Маша',taskId:'1'});assert.equal(filtered.length,1);const csv=r.csv(filtered,[{label:'Имя',key:'name'},{label:'Решение',key:'solution'}]);assert.match(csv,/Маша/);});
