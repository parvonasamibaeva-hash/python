const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const index = fs.readFileSync('index.html', 'utf8');
const passport = fs.readFileSync('passport.js', 'utf8');

test('passport versions are created from run or verification code, not typing debounce', () => {
  assert.match(index, /passportCheckpoint\(runTaskForPassport,'run',null,code\)/);
  assert.match(index, /passportCheckpoint\(t,'verification',result,code\)/);
  assert.doesNotMatch(index, /setTimeout\(\(\)=>passportCheckpoint\(t,'checkpoint'/);
  assert.match(index, /onRename:version=>/);
  assert.match(index, /SolutionPassport\.renameVersion/);
  assert.match(passport, /data-passport-rename/);
});

test('lesson 5 active catalog no longer contains task 13', () => {
  assert.doesNotMatch(index, /title:"Задача 13\. Проект «Угадай число»"/);
  assert.match(index, /title:"Задача 14\. Играем в рулетку"/);
});

test('editor height follows the number of code lines', () => {
  assert.match(index, /const EDITOR_MIN_HEIGHT=160/);
  assert.match(index, /function resizeEditorToContent\(\)/);
  assert.match(index, /editor\.lineCount\(\)\*lineHeight/);
  assert.match(index, /editor\.setSize\(null,contentHeight\+'px'\)/);
  assert.match(index, /editor\.on\('change',\(\)=>\{resizeEditorToContent\(\)/);
});

test('lesson 8 has its own ten-question quiz with two bonus questions', () => {
  assert.match(index, /const lesson8QuizQuestions=\[/);
  assert.strictEqual((index.match(/bonus:true/g) || []).length, 2);
  assert.match(index, /l\.id===1\|\|l\.id===5\|\|l\.id===6\|\|l\.id===7\|\|l\.id===8/);
  assert.match(index, /lessonId===8\?lesson8QuizQuestions/);
  assert.match(index, /activeQuizLesson===8\?`\$\{quizState\.score\} \/ \$\{quizMainTotal\(\)\} баллов/);
});

test('all lesson 8 project stages and tasks are available immediately', () => {
  assert.match(index, /const LESSON8_ALL_TASKS_OPEN=true/);
  assert.match(index, /task\.lessonId\)===8&&LESSON8_ALL_TASKS_OPEN\)return true/);
});

test('free terminal opens the editor and terminal cards', () => {
  assert.match(index, /<section class="card" id="passportCard">/);
  assert.match(index, /<section class="card" id="editorCard">/);
  assert.match(index, /const passportCard=document\.getElementById\('passportCard'\),editorCard=document\.getElementById\('editorCard'\)/);
  assert.match(index, /if\(editorCard\)editorCard\.hidden=false/);
  assert.match(index, /if\(editorWrap\)editorWrap\.hidden=false/);
});

test('autocomplete includes variables and functions from the current Python code', () => {
  assert.match(index, /function pythonUserSymbols\(cm\)/);
  assert.match(index, /const assignment=\/\^/);
  assert.match(index, /pythonUserSymbols\(cm\)\.map\(name=>\[name,'переменная из программы'\]\)/);
});

test('step debugger supports standard random and math modules', () => {
  assert.match(index, /function debugModuleMember\(module,member\)/);
  assert.match(index, /randint:/);
  assert.match(index, /sqrt:x=>Math\.sqrt/);
  assert.match(index, /statisticsFns/);
  assert.match(index, /random\|math\|statistics\|time/);
  assert.match(index, /from\\s\+\(random\|math\|statistics\|time\)/);
  assert.match(index, /__mod_/);
});

test('coin flip checker controls random outcomes and verifies the stopping sequence', () => {
  assert.match(index, /async function checkCoinFlip\(code\)/);
  assert.match(index, /coinValues/);
  assert.match(index, /coin_did_not_stop/);
  assert.match(index, /all_tests_passed/);
  assert.match(index, /бросков/);
});

test('mobile code input opens autocomplete and uses suitable keyboard hints', () => {
  assert.match(index, /editor\.on\('inputRead',\(cm,change\)=>/);
  assert.match(index, /CodeMirror\.showHint\(cm,CodeMirror\.hint\.python,\{completeSingle:false,closeOnUnfocus:true\}\)/);
  assert.match(index, /id="terminalInput"[^>]+inputmode="text"[^>]+enterkeyhint="enter"/);
  assert.match(index, /id="debugInput"[^>]+inputmode="text"[^>]+enterkeyhint="enter"/);
  assert.match(index, /id="numericAnswer"[^>]+inputmode="numeric"[^>]+enterkeyhint="done"/);
});
