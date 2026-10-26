// Запуск: node stage5_guess_number_tests.js
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const html = fs.readFileSync('index.html', 'utf8');
const codeGs = fs.readFileSync('Code.gs', 'utf8');
const checkerSource = fs.readFileSync('checker.js', 'utf8');

function fnSrc(source, name) {
  let from = 0;
  for (;;) {
    const regular = source.indexOf('function ' + name + '(', from);
    const asyncAt = source.indexOf('async function ' + name + '(', from);
    const i = regular < 0 ? asyncAt : (asyncAt < 0 ? regular : Math.min(regular, asyncAt));
    if (i < 0) throw new Error('нет функции ' + name);
    from = i + 1;
    const open = source.indexOf('{', i);
    let depth = 0, quote = '', escaped = false, lineComment = false, blockComment = false;
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
function lesson8Catalog() {
  const start = html.indexOf('const lesson8Tasks=') + 'const lesson8Tasks='.length;
  const end = html.indexOf('\n];', start) + 2;
  return JSON.parse(html.slice(start, end));
}
let count = 0, failed = 0;
function test(name, fn) {
  count++;
  try { fn(); console.log('OK   ' + name); }
  catch (e) { failed++; console.log('FAIL ' + name + ' | ' + (e && e.message || e)); }
}
async function testAsync(name, fn) {
  count++;
  try { await fn(); console.log('OK   ' + name); }
  catch (e) { failed++; console.log('FAIL ' + name + ' | ' + (e && e.message || e)); }
}

const catalog = lesson8Catalog();
const project = catalog.filter(t => t.id >= 9 && t.id <= 15);
test('lesson 8 has seven unique project stages after its original eight tasks', () => {
  assert.deepStrictEqual(catalog.map(t => t.id), Array.from({length:15}, (_,i)=>i+1));
  assert.strictEqual(project.length, 7);
  assert.strictEqual(new Set(catalog.map(t => `8-${t.id}`)).size, 15);
});
test('each project stage has conditions, criteria, examples, hints and learning explanation', () => {
  project.forEach(t => {
    assert.ok(t.problem && t.criteria && t.examples && t.hint && t.theory, t.title);
    assert.ok(t.checker, t.title + ' checker');
  });
});
test('the original lesson-5 project and its manual-review checker remain intact', () => {
  assert.match(html, /id:13,title:"Задача 13\. Проект «Угадай число»"[\s\S]{0,2400}checker:"guess",tests:\[\]/);
  assert.match(html, /function checkGuessProject\(\)\{return \{type:'manual_review',category:'dynamic_behavior'\}\}/);
  assert.match(html, /starterSourceKeys/);
  assert.match(html, /const initialCode=stored!==undefined\?stored:\(sourceCode\|\|t\.starter\|\|''\)/);
  const loadSegment=html.slice(html.indexOf('const initialCode='),html.indexOf('stdinInput.value=state.inputs',html.indexOf('const initialCode=')));
  assert.doesNotMatch(loadSegment,/state\.solved\[t\.key\]=true/);
});
test('optional extensions do not count against the mandatory student progress total', () => {
  assert.strictEqual(project[0].optional, undefined);
  assert.ok(project.slice(1).every(t => t.optional === true));
  assert.match(fnSrc(html, 'updateStats'), /visibleTasks\.filter\(t=>t\.optional!==true\)/);
  assert.match(fnSrc(html, 'buildStudentDashboard'), /Дополнительные этапы/);
});
test('mandatory progress omits the duplicate base stage only when the old result is confirmed', () => {
  const ctx={
    allTasks:[
      {key:'8-8',lessonId:8,id:8,title:'Предыдущая задача'},
      {key:'8-9',lessonId:8,id:9,title:'Базовая игра',skipIfConfirmedKey:'5-13'},
      {key:'8-10',lessonId:8,id:10,title:'Дополнительный этап',optional:true},
      {key:'1-1',lessonId:1,id:1,title:'Другая обязательная задача'}
    ],COURSE_CONFIG:{maxLessonNumber:36},authSession:{role:'student'},
    state:{confirmedSolved:{'5-13':true,'8-8':true},solved:{},ratings:{}},
    lessonIsVisibleForCurrentStudent:()=>true,lessonWithinCourseLimit:id=>Number(id)<=36,
    taskCompletionConfirmed:t=>!!ctx.state.confirmedSolved[t.key],getLesson:id=>({title:'Занятие '+id}),
    solvedCount:{textContent:''},hardestTask:{textContent:''},hardestList:{innerHTML:''}
  };
  vm.createContext(ctx);vm.runInContext(fnSrc(html,'updateStats'),ctx);ctx.updateStats();
  assert.strictEqual(ctx.solvedCount.textContent,'1 / 2');
  ctx.state.confirmedSolved['5-13']=false;ctx.updateStats();
  assert.strictEqual(ctx.solvedCount.textContent,'1 / 3');
});
test('old completed game skips the duplicate base step but code alone does not', () => {
  const lesson = {id:8,tasks:catalog.map(t=>({...t,lessonId:8,key:`8-${t.id}`}))};
  const ctx = {state:{confirmedSolved:{},solved:{},unsentResults:{}},authSession:{role:'student'},lessonIsVisibleForCurrentStudent:()=>true,getLesson:id=>Number(id)===8?lesson:null};
  vm.createContext(ctx); vm.runInContext(fnSrc(html,'taskIsAvailable'),ctx);
  assert.strictEqual(ctx.taskIsAvailable(lesson.tasks[8]), false); // not yet completed task 8-8
  ctx.state.confirmedSolved['8-8']=true;
  assert.strictEqual(ctx.taskIsAvailable(lesson.tasks[8]), true); // base step visible without a legacy completion
  ctx.state.confirmedSolved['5-13']=true;
  assert.strictEqual(ctx.taskIsAvailable(lesson.tasks[8]), false); // old task is server-confirmed, not merely saved code
  assert.strictEqual(ctx.taskIsAvailable(lesson.tasks[9]), true); // continue at counter/limit
});
test('optional project branch unlocks after the shared core, not after every extension', () => {
  const lesson = {id:8,tasks:catalog.map(t=>({...t,lessonId:8,key:`8-${t.id}`}))};
  const ctx = {state:{confirmedSolved:{'8-8':true,'8-9':true,'8-10':true,'8-11':true},solved:{},unsentResults:{}},authSession:{role:'student'},lessonIsVisibleForCurrentStudent:()=>true,getLesson:id=>Number(id)===8?lesson:null};
  vm.createContext(ctx); vm.runInContext(fnSrc(html,'taskIsAvailable'),ctx);
  assert.strictEqual(ctx.taskIsAvailable(lesson.tasks[11]), true); // optional difficulty follows task 11
  assert.strictEqual(ctx.taskIsAvailable(lesson.tasks[12]), false); // hot/cold waits for difficulty
  assert.strictEqual(ctx.taskIsAvailable(lesson.tasks[14]), true); // research challenge bypasses optional 12–14
  ctx.authSession={role:'teacher'};
  assert.strictEqual(ctx.taskIsAvailable(lesson.tasks[12]), true); // teacher sees all stages
});
test('manual review stores the submitted code and creates a confirmed task row on acceptance', () => {
  assert.match(codeGs,/const REVIEW_HEADERS = \[.*'ID проверки'.*'Код решения'.*'ID попытки'.*\]/s);
  assert.match(fnSrc(codeGs,'saveManualReview_'),/'Код решения':code/);
  assert.match(fnSrc(codeGs,'setManualReviewStatus_'),/recordManualReviewCompletion_\(row,headers/);
  assert.match(fnSrc(codeGs,'recordManualReviewCompletion_'),/'Результат':'Решена'/);
  assert.match(fnSrc(html,'submitManualReview'),/type:'manualReview'/);
  assert.match(fnSrc(html,'restoreStudentProgress'),/state\.confirmedSolved\[match\.key\]=true/);
});
test('server prerequisites mirror the legacy route and research branch', () => {
  let rows = [
    {'ID аккаунта':'a','Занятие':'Занятие 8','№ задачи':8,'Результат':'Решена'},
    {'ID аккаунта':'a','Занятие':'Занятие 5','№ задачи':13,'Результат':'Решена'}
  ];
  const ctx={readTaskObjects_:()=>rows}; vm.createContext(ctx);
  vm.runInContext([fnSrc(codeGs,'taskPrerequisiteGroups_'),fnSrc(codeGs,'assertPreviousTaskCompleted_')].join('\n'),ctx);
  assert.throws(()=>ctx.assertPreviousTaskCompleted_({accountId:'a'},8,9),/уже подтверждена/);
  assert.doesNotThrow(()=>ctx.assertPreviousTaskCompleted_({accountId:'a'},8,10));
  assert.throws(()=>ctx.assertPreviousTaskCompleted_({accountId:'a'},8,15),/предыдущие шаги/);
  rows=rows.concat([
    {'ID аккаунта':'a','Занятие':'Занятие 8','№ задачи':10,'Результат':'Решена'},
    {'ID аккаунта':'a','Занятие':'Занятие 8','№ задачи':11,'Результат':'Решена'}
  ]);
  assert.doesNotThrow(()=>ctx.assertPreviousTaskCompleted_({accountId:'a'},8,15));
});

test('deterministic random/time harness is limited to test runs and checks exact ranges', () => {
  const ctx={JSON,Number,Array}; vm.createContext(ctx);
  vm.runInContext([fnSrc(html,'controlledTestPrelude'),fnSrc(html,'controlledTestApply'),fnSrc(html,'controlledTestMetadata'),fnSrc(html,'parseControlledTestOutput')].join('\n'),ctx);
  const opts={randomRange:[1,20],randomValues:[10],clockValues:[100,104]};
  const prelude=ctx.controlledTestPrelude(opts),apply=ctx.controlledTestApply(opts);
  assert.doesNotMatch(prelude,/random\.randint = __guess_test_randint/);
  assert.match(apply,/random\.randint = __guess_test_randint/);
  assert.match(prelude,/__guess_test_original_randint = random\.randint/);
  assert.match(prelude,/__guess_test_random_calls = \[\]/);
  assert.match(prelude,/__guess_test_random_calls\.append\(\(a, b\)\)/);
  assert.match(prelude,/__guess_test_clock_calls\.append\(value\)/);
  assert.match(prelude,/__guess_test_original_time = time\.time/);
  assert.match(prelude,/a != 1 or b != 20/);
  assert.match(apply,/time\.time = __guess_test_time/);
  assert.match(html,/function runOneTest\(code,inputValues,options\)/);
  assert.match(html,/inputsUsed:inputIndex/);
  assert.match(html,/function controlledTestCleanup/);
  assert.match(html,/function controlledTestMetadata/);
  assert.match(html,/function parseControlledTestOutput/);
  assert.match(html,/finally:/);
  assert.match(html,/random\.randint = __guess_test_original_randint/);
  assert.match(html,/controlledTestCleanup/);
  const parsed=ctx.parseControlledTestOutput('1\n__GUESS_TEST_RANDOM__[(1, 20), (1, 20)]\n__GUESS_TEST_CLOCK__[100, 104]');
  assert.strictEqual(parsed.output,'1');
  assert.strictEqual(JSON.stringify(parsed.randomCalls),JSON.stringify([[1,20],[1,20]]));
  assert.strictEqual(JSON.stringify(parsed.clockCalls),JSON.stringify([100,104]));
});

const checkerCtx = {console,Date,Set,Map,Number,String,Object,Array,JSON,Math,PythonTaskChecker:{errorCategory:()=> 'runtime_error'}};
vm.createContext(checkerCtx);
vm.runInContext([
  fnSrc(html,'guessProjectText'),fnSrc(html,'guessProjectHasSuccess'),fnSrc(html,'guessProjectSegmentHas'),fnSrc(html,'guessProjectCasePassed'),
  fnSrc(html,'runGuessProjectCases'),fnSrc(html,'checkGuess2Base'),fnSrc(html,'checkGuess2Attempts'),
  fnSrc(html,'checkGuess2Replay'),fnSrc(html,'checkGuess2Difficulty'),fnSrc(html,'checkGuess2HotCold'),
  fnSrc(html,'checkGuess2Timer'),fnSrc(html,'checkGuess2Research')
].join('\n'),checkerCtx);
function mockRunOneTest(code,input,options={}) {
  if(code==='import time\nprint(time.time())')return Promise.resolve({ok:true,output:'100.0',inputsUsed:0,outputBeforeFirstInput:'100.0',inputSegments:[],randomCalls:null,clockCalls:null});
  if(code==='print(time.time())')return Promise.resolve({ok:true,output:'100.0',inputsUsed:0,outputBeforeFirstInput:'100.0',inputSegments:[],randomCalls:null,clockCalls:Array.isArray(options.clockValues)?[options.clockValues[0]]:null});
  if(typeof code==='string'&&code.startsWith('print(random.randint(1, 100))'))return Promise.resolve({ok:true,output:String(options.randomValues[0]),inputsUsed:0,outputBeforeFirstInput:String(options.randomValues[0]),inputSegments:[],randomCalls:[[1,100]],clockCalls:null});
  const used=input.length;
  let before='',segments=[],randomCalls=Array.isArray(options.randomRange)&&Array.isArray(options.randomValues)?options.randomValues.map(()=>options.randomRange.slice()):null;
  let clockCalls=Array.isArray(options.clockValues)?(code==='GOOD_TIMER'?options.clockValues.slice(0,2):options.clockValues.slice(0,1)):null;
  if(code==='GOOD_BASE'){
    if(input.length===1)segments=['Угадал!'];
    else if(input[2]==='73')segments=['Моё число больше!','Моё число больше!','Угадал!'];
    else segments=['Моё число больше!','Моё число меньше!','Угадал!'];
  }else if(code==='FAKE_BASE'){
    segments=['Моё число больше!','Моё число меньше!','Угадал!'];randomCalls=[];
  }else if(code==='GOOD_ATTEMPTS'){
    before='Попытка 1 из 3';
    if(input[2]==='50'||input[2]==='73')segments=['Моё число больше!\nПопытка 2 из 3','Моё число меньше!\nПопытка 3 из 3','Угадал!'];
    else segments=['Моё число больше!\nПопытка 2 из 3','Моё число меньше!\nПопытка 3 из 3','Моё число больше!\nПопытки закончились! Загаданное число: 50'];
  }else if(code==='GOOD_REPLAY'){
    before='Попытка 1 из 3';segments=['Моё число больше!\nПопытка 2 из 3','Угадал!\nСыграть ещё раз?','Попытка 1 из 3','Угадал!\nСыграть ещё раз?',''];
  }else if(code==='GOOD_DIFFICULTY'){
    before='Выбери 1, 2 или 3';
    segments=input.includes('4')?['Неверный выбор. Выбери 1, 2 или 3.\nВыбери 1, 2 или 3.','Попытка 1 из 3','Угадал!\nСыграть ещё раз?','']:['Попытка 1 из 3','Угадал!\nСыграть ещё раз?',''];
  }else if(code==='GOOD_HOTCOLD'){
    before='Попытка 1 из 3';
    segments=input[0]==='5'?['Моё число больше!\nПопытка 2 из 3','Моё число больше!\nГорячо!\nПопытка 3 из 3','Угадал!\nСыграть ещё раз?','']:['Моё число больше!\nПопытка 2 из 3','Моё число больше!\nХолодно!\nПопытка 3 из 3','Угадал!\nСыграть ещё раз?',''];
  }else if(code==='GOOD_TIMER'){
    before='Попытка 1 из 3';segments=['Моё число больше!\nПопытка 2 из 3','Угадал!\nСыграть ещё раз?\nВремя игры: 4.0 секунд',''];
  }else if(code==='GOOD_RESEARCH'){
    const normalized=input.map(value=>String(value).toLowerCase()).join('|');
    const sequences={
      'больше|меньше|больше|больше|больше|угадал':[50,75,62,68,71,73],
      'меньше|меньше|меньше|меньше|меньше|угадал':[50,25,12,6,3,1],
      'больше|больше|больше|больше|больше|больше|угадал':[50,75,88,94,97,99,100]
    };
    const guesses=sequences[normalized]||[50,75,62,68,71,73];
    before='Моя попытка: '+guesses[0];segments=guesses.slice(1).map(value=>'Моя попытка: '+value).concat(['Компьютер угадал!']);
  }else if(code==='BAD_RESEARCH'){
    before='Моя попытка: 50';segments=['Моя попытка: 80','Моя попытка: 62','Моя попытка: 68','Моя попытка: 71','Моя попытка: 73','Компьютер угадал!'];
  }
  const output=[before,...segments].filter(Boolean).join('\n');
  return Promise.resolve({ok:true,output,inputsUsed:used,outputBeforeFirstInput:before,inputSegments:segments,randomCalls,clockCalls});
}
checkerCtx.runOneTest=mockRunOneTest;
(async()=>{
  await testAsync('base checker exercises first-try win and both comparison directions',async()=>{
    const r=await checkerCtx.checkGuess2Base('GOOD_BASE');assert.strictEqual(r.type,'success');assert.strictEqual(r.passedTests,3);
  });
  await testAsync('base checker rejects a static-output solution that never uses random.randint',async()=>{
    const r=await checkerCtx.checkGuess2Base('FAKE_BASE');assert.strictEqual(r.type,'wrong_answer');assert.strictEqual(r.category,'random_range_or_call_count');
  });
  await testAsync('attempt checker covers last-attempt win and exhausted limit',async()=>{
    const r=await checkerCtx.checkGuess2Attempts('GOOD_ATTEMPTS');assert.strictEqual(r.type,'success');assert.strictEqual(r.totalTests,3);
  });
  await testAsync('replay checker covers a second round and case-insensitive answers',async()=>{
    const r=await checkerCtx.checkGuess2Replay('GOOD_REPLAY');assert.strictEqual(r.type,'success');assert.strictEqual(r.passedTests,2);
  });
  await testAsync('difficulty checker tests all three ranges and invalid-choice retry',async()=>{
    const r=await checkerCtx.checkGuess2Difficulty('GOOD_DIFFICULTY');assert.strictEqual(r.type,'success');assert.strictEqual(r.totalTests,4);
  });
  await testAsync('hot/cold checker tests relative distance',async()=>{
    const r=await checkerCtx.checkGuess2HotCold('GOOD_HOTCOLD');assert.strictEqual(r.type,'success');
  });
  await testAsync('timer checker verifies time.time and elapsed seconds',async()=>{
    const r=await checkerCtx.checkGuess2Timer('GOOD_TIMER');assert.strictEqual(r.type,'success');
  });
  await testAsync('research challenge checks multiple targets and case variations before teacher review',async()=>{
    const r=await checkerCtx.checkGuess2Research('GOOD_RESEARCH');assert.strictEqual(r.type,'manual_review');assert.strictEqual(r.passedTests,4);assert.strictEqual(r.totalTests,4);assert.match(r.reviewCriteria,/объяснением/);
  });
  await testAsync('research challenge rejects a wrong midpoint sequence',async()=>{
    const r=await checkerCtx.checkGuess2Research('BAD_RESEARCH');assert.strictEqual(r.type,'wrong_answer');assert.strictEqual(r.category,'binary_search_sequence');
  });
  await testAsync('time module unavailability falls back to an explicit manual-review path',async()=>{
    const original=checkerCtx.runOneTest;checkerCtx.runOneTest=async()=>({ok:false,error:'ImportError: time unavailable'});
    const r=await checkerCtx.checkGuess2Timer('GOOD_TIMER');checkerCtx.runOneTest=original;
    assert.strictEqual(r.type,'manual_review');assert.strictEqual(r.category,'time_module_unavailable');
  });
  console.log(`\nПроверок: ${count}, не пройдено: ${failed}`);
  process.exit(failed?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
