const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync(require('node:path').join(__dirname,'..','index.html'),'utf8');
const tasks=JSON.parse(html.split('const lesson9Tasks=')[1].split(';\nconst COURSE_CONFIG=')[0]);
const context={};vm.createContext(context);
vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'..','checker.js'),'utf8'),context);
vm.runInContext(html.slice(html.indexOf('function stripPythonCommentsAndStrings('),html.indexOf('async function checkDigitsMath(')),context);
vm.runInContext(html.slice(html.indexOf('async function checkLesson9For('),html.indexOf('async function checkTask(')),context);
test('lesson 9 follows lesson 8 and preserves all 17 document exercises',()=>{
 assert.match(html,/id:9,title:"Занятие 9",status:"published",subtitle:"Цикл for",tasks:lesson9Tasks/);
 assert.deepEqual(tasks.map(t=>t.id),Array.from({length:17},(_,i)=>i+1));
 assert.ok(html.indexOf('{id:9,title:')>html.indexOf('{id:8,title:'));
 for(const t of tasks){assert.ok(t.tests.length);assert.equal(t.checker,'lesson9_for');}
});
test('for checker rejects missing loop and forbidden if, ignores comments and strings',async()=>{
 context.runOneTest=async()=>({ok:true,output:'1 3 5 7 9'});
 assert.equal((await context.checkLesson9For('print("for i in range(3):")',tasks[0])).category,'method_requirement');
 assert.equal((await context.checkLesson9For('for i in range(10):\n    if i % 2: print(i)',tasks[12])).category,'method_requirement');
 const t={...tasks[12],tests:[tasks[12].tests[0]]};
 assert.equal((await context.checkLesson9For('for i in range(1, 10, 2):\n    print(i) # if is not used',t)).type,'success');
});
test('numeric sequence checker accepts newline output and rejects incorrect answers',async()=>{
 const t={...tasks[13],tests:[tasks[13].tests[2]]};
 context.runOneTest=async()=>({ok:true,output:'3\n'});
 assert.equal((await context.checkLesson9For('for i in [3]: print(i)',t)).type,'success');
 context.runOneTest=async()=>({ok:true,output:'4'});
 assert.equal((await context.checkLesson9For('for i in [4]: print(i)',t)).type,'wrong_answer');
});
test('lesson 9 starts without supplied code and uses answer fields for count tasks',()=>{
 assert.ok(tasks.every(t=>t.starter===''));
 assert.deepEqual(tasks.filter(t=>t.answerMode==='number').map(t=>t.id),[3,4]);
 assert.match(html,/if\(isLesson9NumberAnswer\(t\)\)\{taskExamples.innerHTML='';return\}/);
});
test('numeric submissions reject incorrect answers and save correct answers through existing flow',async()=>{
 const task={...tasks[2],key:'9-3',lessonId:9};
 let value='15',sends=0;
 const ctx={state:{codes:{},solved:{},attempts:{}},document:{getElementById:()=>({value})},runButton:{},saveState(){},showStatus(){},recordVerificationResult(){},recordTaskFailure(){},hideTaskHints(){},renderNav(){},updateStats(){},updateProgress(){},updateSubmitButton(){},sendTaskResult:async()=>{sends++;return {success:false}}};
 vm.createContext(ctx);
 vm.runInContext(html.slice(html.indexOf('async function submitLesson9NumberAnswer('),html.indexOf('async function runPython(')),ctx);
 await ctx.submitLesson9NumberAnswer(task);
 assert.equal(sends,0);assert.equal(ctx.state.solved[task.key],undefined);
 value='14';await ctx.submitLesson9NumberAnswer(task);
 assert.equal(sends,1);assert.equal(ctx.state.solved[task.key],true);
 assert.equal(ctx.state.confirmedSolved,undefined,'failed save must not confirm completion');
});
test('lesson 9 places Caesar cipher at task 13',()=>{
 assert.deepEqual(tasks.slice(9,13).map(t=>t.short),['Запуск ракеты','Чаевые','Все нечётные на отрезке','Шифр Цезаря']);
 assert.deepEqual(tasks.slice(9,13).map(t=>t.id),[10,11,12,13]);
});
