const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const html = fs.readFileSync(process.argv[2] || 'index.html', 'utf8');
const codeGs = fs.readFileSync(process.argv[3] || 'Code.gs', 'utf8');
const checkerSource = fs.readFileSync(process.argv[4] || 'checker.js', 'utf8');

function fnSrc(source, name) {
  let from = 0;
  for (;;) {
    const i = source.indexOf('function ' + name + '(', from);
    if (i < 0) throw new Error('нет функции ' + name);
    from = i + 1;
    const open = source.indexOf('{', i);
    let depth = 0, quote = '', escaped = false, lineComment = false, blockComment = false, regex = false;
    // The targeted helpers do not contain template literals with nested function bodies.
    for (let p = open; p < source.length; p++) {
      const c = source[p], next = source[p + 1];
      if (lineComment) { if (c === '\n') lineComment = false; continue; }
      if (blockComment) { if (c === '*' && next === '/') { blockComment = false; p++; } continue; }
      if (quote) { if (escaped) escaped = false; else if (c === '\\') escaped = true; else if (c === quote) quote = ''; continue; }
      if (c === '/' && next === '/') { lineComment = true; p++; continue; }
      if (c === '/' && next === '*') { blockComment = true; p++; continue; }
      if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
      if (c === '{') depth++;
      else if (c === '}' && --depth === 0) {
        const out = source.slice(i, p + 1);
        try { new vm.Script(out); return out; } catch (_) {}
      }
    }
  }
}

let count = 0, failed = 0;
function test(name, fn) {
  count++;
  try { fn(); console.log('OK   ' + name); }
  catch (e) { failed++; console.log('FAIL ' + name + ' | ' + (e && e.message || e)); }
}

// Static catalog and guardrails.
const lessonIds = [...html.matchAll(/\{id:(\d+),title:'Занятие \d+',status:'published',subtitle:/g)].map(m => Number(m[1]));
test('course config declares maximum 36 and only real lessons 1–8', () => {
  assert.match(html, /const COURSE_CONFIG=\{maxLessonNumber:null,lessons:\[/);
  assert.doesNotMatch(html, /maxLessonNumber:36/);
  assert.match(codeGs, /maxLessonNumber:COURSE_MAX_LESSON_NUMBER/);
  assert.deepStrictEqual(lessonIds, [1,2,3,4,5,6,7,8]);
  assert.doesNotMatch(html, /id="solvedCount">0 \/ 114/);
});
test('lesson access UI iterates real lesson IDs, not index + 1', () => {
  const f = fnSrc(html, 'renderLessonAccessControls');
  assert.match(f, /realLessons\.map\(lesson=>/);
  assert.match(f, /const id=Number\(lesson\.id\)/);
  assert.doesNotMatch(f, /i\+1/);
});
test('task IDs remain stable; lesson 8 contains the nine document tasks', () => {
  const starts=[...html.matchAll(/const\s+([A-Za-z0-9_]+Tasks)\s*=\s*\[/g)];
  let arrays=0;
  starts.forEach((m,i)=>{
    const end=i+1<starts.length?starts[i+1].index:html.indexOf('const COURSE_CONFIG',m.index);
    const chunk=html.slice(m.index,end);
    const ids=[...chunk.matchAll(/\bid\s*:\s*(\d+)\s*,\s*title\s*:|"id"\s*:\s*(\d+)\s*,\s*"title"\s*:/g)].map(x=>Number(x[1]||x[2]));
    if(ids.length){arrays++;if(m[1]==='lesson8Tasks')assert.deepStrictEqual(ids,[10,11,12,13,14,1,2,3,4,5,6,7,8,9],m[1]+' project then document order');else if(m[1]==='lesson5Tasks')assert.deepStrictEqual([...ids].sort((a,b)=>a-b),[1,2,3,4,5,6,7,8,9,10,11,12,14],m[1]+' removed task 13');else assert.deepStrictEqual([...ids].sort((a,b)=>a-b),Array.from({length:ids.length},(_,j)=>j+1),m[1]+' stable IDs');}
  });
  assert.ok(arrays>=8);
});
test('new lessons default closed unless explicitly configured', () => {
  assert.match(html, /const LESSON_ACCESS_DEFAULT_OPEN=false/);
  assert.match(fnSrc(html, 'lessonDefaultAccess'), /lesson\.accessDefault===true/);
  assert.match(fnSrc(html, 'lessonIsVisibleForCurrentStudent'), /lesson\.status!=='published'/);
  assert.match(fnSrc(html, 'renderLessonAccessControls'), /!published\?'disabled':'/);
});
test('server no longer has a 20-lesson limit and uses a shared max constant', () => {
  assert.match(codeGs, /const COURSE_MAX_LESSON_NUMBER = 36/);
  assert.match(codeGs, /lessonId>COURSE_MAX_LESSON_NUMBER/);
  assert.doesNotMatch(codeGs, /lessonId>20/);
  assert.doesNotMatch(codeGs, /\[1-9\]\|1\[0-9\]\|20\)/);
});
test('student dashboard excludes closed and empty lessons from progress', () => {
  assert.match(fnSrc(html, 'buildStudentDashboard'), /lessons\.filter\(lesson=>Array\.isArray\(lesson\.tasks\)&&lesson\.tasks\.length>0&&lessonIsVisibleForCurrentStudent/);
  assert.match(fnSrc(html, 'updateStats'), /visibleTasks=authSession&&authSession\.role==='student'\?courseTasks\.filter/);
  assert.match(fnSrc(html, 'updateStats'), /countedTasks=authSession&&authSession\.role==='student'\?visibleTasks\.filter\(t=>t\.optional!==true\):visibleTasks/);
  assert.match(fnSrc(html, 'updateStats'), /progressTasks=legacyGuessCompleted\?countedTasks\.filter\(t=>t\.legacyAliasKey!=='5-13'\):countedTasks/);
});
test('manual-review queue uses the catalog condition and criteria without copying hidden tests', () => {
  const start=html.indexOf('async function loadManualReviews(){');
  const end=html.indexOf('async function reviewManualTask(',start);
  const f=html.slice(start,end);
  assert.match(f, /task\.problem/);assert.match(f, /Критерии проверки/);assert.match(f, /task\.tests\.length/);
  assert.doesNotMatch(f, /expected.*join|test\.expected/);
});
test('server has manual-review endpoints and completion persistence', () => {
  assert.match(codeGs, /data\.action === 'getManualReviews'/);
  assert.match(codeGs, /data\.action === 'getStudentManualReviews'/);
  assert.match(codeGs, /data\.action === 'setManualReviewStatus'/);
  assert.match(codeGs, /recordManualReviewCompletion_/);
});
test('client blocks direct selection of locked tasks and hides future titles', () => {
  assert.match(fnSrc(html, 'selectTask'), /!taskIsAvailable\(t\)/);
  assert.match(fnSrc(html, 'renderNav'), /arr\.filter\(t=>taskIsAvailable\(t\)\)/);
  assert.match(fnSrc(html, 'loadTask'), /!taskIsAvailable\(selected\)/);
});
test('client unlocks only from server-confirmed completion', () => {
  assert.match(fnSrc(html, 'taskIsAvailable'), /taskCompletionConfirmed\(previous\)/);
  assert.match(fnSrc(html, 'taskIsAvailable'), /task\.projectStage==='base'/);
  assert.match(fnSrc(html, 'taskIsAvailable'), /task\.legacyAliasKey/);
  assert.match(fnSrc(html, 'taskIsAvailable'), /unlockAfterKeys/);
  assert.match(fnSrc(html, 'taskIsAvailable'), /unlockAfterAnyKeys/);
  assert.match(fnSrc(html, 'markResultSent'), /state\.confirmedSolved\[key\]=true/);
  assert.match(fnSrc(html, 'restoreStudentProgress'), /state\.confirmedSolved\[match\.key\]=true/);
});
test('first contextual hint opens after two failed checks', () => {
  assert.match(html, /const MAX_FAILED_ATTEMPTS=2/);
  assert.match(fnSrc(html, 'availableHintCount'), /a-MAX_FAILED_ATTEMPTS\+1/);
});
test('hints are cleared and disabled after successful completion', () => {
  assert.match(fnSrc(html, 'hideTaskHints'), /delete state\.hintDiagnostics\[t\.key\]/);
  assert.match(fnSrc(html, 'renderHint'), /state\.solved\[t\.key\]\|\|taskCompletionConfirmed/);
  assert.match(fnSrc(html, 'updateHintButton'), /hintButton\.disabled=true/);
});

const lessons = [
  { id: 10, status: 'published', tasks: [{id:1,key:'10-1',lessonId:10,hint:'first\n\nsecond'},{id:2,key:'10-2',lessonId:10,hint:'first\n\nsecond'},{id:3,key:'10-3',lessonId:10,hint:'first\n\nsecond'}] },
  { id: 2, status: 'draft', tasks: [{id:1,key:'2-1',lessonId:2,hint:'one'}] },
  { id: 7, status: 'published', tasks: [{id:1,key:'7-1',lessonId:7,hint:'one'}] },
  { id: 37, status: 'published', tasks: [{id:1,key:'37-1',lessonId:37,hint:'one'}] }
];
const ctx = {
  lessons, COURSE_CONFIG:{maxLessonNumber:36,lessons}, allTasks: lessons.flatMap(l => l.tasks), authSession: {role:'student',accountId:'student-1'},
  state: {solved:{},confirmedSolved:{},unsentResults:{},attempts:{},hintDiagnostics:{}},
  lessonAccessState: {'thursday:10':true,'thursday:7':true}, lessonAccessGroup:'thursday', LESSON_ACCESS_DEFAULT_OPEN:false,
  MAX_FAILED_ATTEMPTS:2,
  hintParts:t=>String(t.hint||'').split(/\n\s*\n/).filter(Boolean),
  normalizeOutput:x=>String(x==null?'':x).replace(/\r\n/g,'\n').trim()
};
vm.createContext(ctx);
const helperNames=['getLesson','lessonWithinCourseLimit','lessonDefaultAccess','effectiveLessonAccess','lessonIsVisibleForCurrentStudent','taskCompletionConfirmed','taskIsAvailable','firstAvailableStudentTask','availableHintCount','diagnoseFailure'];
vm.runInContext(helperNames.map(n=>fnSrc(html,n)).join('\n'),ctx);
const task=(key)=>ctx.allTasks.find(t=>t.key===key);
test('first task is open; later tasks stay hidden before confirmation', () => {
  assert.strictEqual(ctx.taskIsAvailable(task('10-1')), true);
  assert.strictEqual(ctx.taskIsAvailable(task('10-2')), false);
  assert.strictEqual(ctx.taskIsAvailable(task('10-3')), false);
});
test('next task opens after previous result is confirmed by server', () => {
  ctx.state.confirmedSolved['10-1']=true;
  assert.strictEqual(ctx.taskIsAvailable(task('10-2')), true);
  assert.strictEqual(ctx.taskIsAvailable(task('10-3')), false);
  ctx.state.confirmedSolved['10-2']=true;
  assert.strictEqual(ctx.taskIsAvailable(task('10-3')), true);
});
test('local success with failed save does not unlock the next task', () => {
  ctx.state.confirmedSolved={ '10-1':true };
  ctx.state.solved['10-2']=true;
  ctx.state.unsentResults['10-2']=true;
  assert.strictEqual(ctx.taskIsAvailable(task('10-2')), true);
  assert.strictEqual(ctx.taskIsAvailable(task('10-3')), false);
});
test('completed tasks remain available for review', () => {
  ctx.state.confirmedSolved={'10-1':true};
  assert.strictEqual(ctx.taskIsAvailable(task('10-1')), true);
});
test('closed or draft lesson cannot be opened by a student', () => {
  assert.strictEqual(ctx.lessonIsVisibleForCurrentStudent(2), false);
  assert.strictEqual(ctx.lessonIsVisibleForCurrentStudent(10), true);
  assert.strictEqual(ctx.lessonIsVisibleForCurrentStudent(36), false);
  assert.strictEqual(ctx.lessonIsVisibleForCurrentStudent(37), false);
});
test('hint levels follow the two-failure threshold', () => {
  const t=task('10-1');ctx.state.attempts[t.key]=0;
  assert.strictEqual(ctx.availableHintCount(t,1),0);
  assert.strictEqual(ctx.availableHintCount(t,2),1);
  assert.strictEqual(ctx.availableHintCount(t,3),2);
});
test('diagnostics distinguish syntax, type, and wrong-output failures', () => {
  const t=task('10-1');
  const syntax=ctx.diagnoseFailure(t,{type:'execution_error',category:'syntax_error',error:'SyntaxError: invalid syntax'},'print(');
  const types=ctx.diagnoseFailure(t,{type:'execution_error',category:'type_error',error:'TypeError: unsupported operand type'},'input() + 1');
  const output=ctx.diagnoseFailure(t,{type:'wrong_answer',category:'wrong_output',expected:'Answer: 4',actual:'4',passedTests:0,totalTests:3},'print(4)');
  assert.notStrictEqual(syntax,types);assert.notStrictEqual(types,output);
  assert.match(syntax,/синтаксис|кавычки|скобки/i);assert.match(types,/тип|input\(\)/i);assert.match(output,/подписи|текста/i);
});
test('task-specific diagnostic rules override generic fallbacks', () => {
  const t={key:'x',diagnostics:{wrong_output:'Проверь именно граничное значение.'}};
  assert.strictEqual(ctx.diagnoseFailure(t,{type:'wrong_answer',category:'wrong_output',expected:'1',actual:'2'},'print(2)'), 'Проверь именно граничное значение.');
});

// Server helper behavior without a live Apps Script connection.
const serverCtx = {COURSE_MAX_LESSON_NUMBER:36, readTaskObjects_:()=>[], ensureLegacyLessonAccess_:()=>{}, findAccountById_:()=>({group:'thursday'}), readLessonAccess_:()=>({'thursday:8':true}), LEGACY_PUBLISHED_LESSON_IDS:[1,2,3,4,5,6,7,8]};
vm.createContext(serverCtx);
vm.runInContext([fnSrc(codeGs,'parseLessonNumber_'),fnSrc(codeGs,'assertStudentLessonAccess_'),fnSrc(codeGs,'taskPrerequisiteGroups_'),fnSrc(codeGs,'assertPreviousTaskCompleted_')].join('\n'),serverCtx);
test('server lesson parser accepts 36 and rejects 37', () => {
  assert.strictEqual(serverCtx.parseLessonNumber_('Занятие 36'),36);
  assert.strictEqual(serverCtx.parseLessonNumber_('Занятие 37'),null);
  assert.strictEqual(serverCtx.parseLessonNumber_('Занятие 08'),8);
  assert.strictEqual(serverCtx.parseLessonNumber_('lesson 8'),null);
});
test('server rejects a closed lesson and allows explicit group access', () => {
  assert.doesNotThrow(()=>serverCtx.assertStudentLessonAccess_({role:'student',accountId:'a',group:'thursday'},8));
  assert.throws(()=>serverCtx.assertStudentLessonAccess_({role:'student',accountId:'a',group:'thursday'},9),/не открыл/);
});
test('server opens project stage 1, then the project and document routes in order', () => {
  serverCtx.readTaskObjects_=()=>[];
  assert.doesNotThrow(()=>serverCtx.assertPreviousTaskCompleted_({accountId:'a'},8,10));
  assert.throws(()=>serverCtx.assertPreviousTaskCompleted_({accountId:'a'},8,11),/предыдущую задачу/);
  serverCtx.readTaskObjects_=()=>[{'ID аккаунта':'a','Занятие':'Занятие 8','№ задачи':10,'Результат':'Решена'}];
  assert.doesNotThrow(()=>serverCtx.assertPreviousTaskCompleted_({accountId:'a'},8,11));
  assert.throws(()=>serverCtx.assertPreviousTaskCompleted_({accountId:'a'},8,1),/предыдущую задачу/);
  serverCtx.readTaskObjects_=()=>[{'ID аккаунта':'a','Занятие':'Занятие 8','№ задачи':14,'Результат':'Решена'}];
  assert.doesNotThrow(()=>serverCtx.assertPreviousTaskCompleted_({accountId:'a'},8,1));
  serverCtx.readTaskObjects_=()=>[{'ID аккаунта':'a','Занятие':'Занятие 8','№ задачи':1,'Результат':'Решена'}];
  assert.doesNotThrow(()=>serverCtx.assertPreviousTaskCompleted_({accountId:'a'},8,2));
});
test('historical task 5-13 does not replace the project route', () => {
  serverCtx.readTaskObjects_=()=>[{'ID аккаунта':'a','Занятие':'Занятие 5','№ задачи':13,'Результат':'Решена'}];
  assert.doesNotThrow(()=>serverCtx.assertPreviousTaskCompleted_({accountId:'a'},8,10));
  assert.throws(()=>serverCtx.assertPreviousTaskCompleted_({accountId:'a'},8,1),/предыдущую задачу/);
});

const checkerCtx={console,Date,Set,Map,Number,String,Object,Array,JSON,Math};
vm.createContext(checkerCtx);
vm.runInContext(checkerSource,checkerCtx);
test('checker classifies common Python errors separately', () => {
  const c=checkerCtx.PythonTaskChecker.errorCategory;
  assert.strictEqual(c('SyntaxError: invalid syntax'),'syntax_error');
  assert.strictEqual(c('TypeError: unsupported operand type'),'type_error');
  assert.strictEqual(c("NameError: name 'x' is not defined"),'name_error');
  assert.strictEqual(c('ZeroDivisionError: division by zero'),'division_by_zero');
  assert.strictEqual(c('EOFError: no more input'),'missing_input');
});

console.log(`\nПроверок: ${count}, не пройдено: ${failed}`);
process.exit(failed?1:0);
