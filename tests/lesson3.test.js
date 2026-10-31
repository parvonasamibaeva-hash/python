const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const start = source.indexOf('const lesson3Tasks=');
const end = source.indexOf('const lesson4Tasks=', start);
assert.notEqual(start, -1);
assert.notEqual(end, -1);
const tasks = vm.runInNewContext(source.slice(start, end).replace('const lesson3Tasks=', '').replace(/;\s*$/, ''));
const task = id => tasks.find(item => item.id === id);

test('lesson 3 catalog keeps only binary if/else tasks and renumbers them', () => {
  assert.equal(tasks.length, 18);
  assert.deepEqual(Array.from(tasks, item => item.id), Array.from({ length: 18 }, (_, i) => i + 1));
  assert.equal(task(15).title, 'Задача 15. Оканчивается ли год на два нуля');
  assert.deepEqual(Array.from(tasks.filter(item => item.teacherRepeat), item => item.id), [2, 6, 9]);
  assert.equal(tasks.some(item => /\belif\b/i.test([item.short, item.problem, item.hint, item.theory, item.starter].join('\n'))), false);
});

test('lesson 3 covers equality, boundary, and unsorted cases', () => {
  const has = (id, input, expected) => assert.ok(task(id).tests.some(testCase => JSON.stringify(testCase) === JSON.stringify({ input, expected })), `task ${id} should test ${input.join(',')}`);
  has(1, ['5', '5'], 'False');
  has(2, ['5', '5'], '0');
  has(5, ['1142'], 'НЕТ');
  has(9, ['0', '-1', '-2'], 'Нет положительных чисел');
  has(13, ['1', '5', '3'], 'NO');
  has(16, ['10', 'f'], 'YES');
  has(16, ['15', 'f'], 'YES');
});

test('digit tasks declare the mathematical-only checker and corrected output', () => {
  assert.equal(task(5).checker, 'digits_math');
  assert.equal(task(11).checker, 'digits_math');
  assert.ok(task(11).tests.some(testCase => testCase.expected === 'В следующий раз повезет'));
});

test('lesson 3 checker wires the method restriction', () => {
  assert.match(source, /function checkDigitsMath\(code,task\)/);
  assert.match(source, /digits_math:checkDigitsMath/);
  assert.match(source, /method_requirement/);
  assert.match(source, /цифры нужно обрабатывать математически/);
});

test('lesson 3 renumbering keeps old local progress and report rows aligned', () => {
  assert.match(source, /LESSON3_CONTENT_VERSION='if-else-v1'/);
  assert.match(source, /lesson3TaskMap=\{1:1,2:2,4:3,5:4,6:5,7:6,8:7,9:8,10:9,11:10,13:11,14:12,15:13,16:14,17:15,18:16,19:17,20:18\}/);
  assert.match(source, /function canonicalLesson3TaskId\(lesson,taskId,title\)/);
});

test('teacher dashboard renders repeat markers for annotated tasks', () => {
  assert.match(source, /teacher-repeat-badge/);
  assert.match(source, /x\.task\.teacherRepeat/);
  assert.match(source, /повтор темы/);
});

test('mathematical digit checker rejects conversion to strings but allows numeric code', async () => {
  const startChecker = source.indexOf('function stripPythonCommentsAndStrings');
  const endChecker = source.indexOf('function coinFlipOutputMatches', startChecker);
  const context = {
    String,
    Array,
    Object,
    PythonTaskChecker: { run: async () => ({ type: 'success', passedTests: 3, totalTests: 3 }) },
    runOneTest: async () => ({ ok: true })
  };
  vm.runInNewContext(source.slice(startChecker, endChecker), context);
  const rejected = await context.checkDigitsMath('n = str(input())\nprint("ДА")', task(5));
  assert.equal(rejected.category, 'method_requirement');
  const accepted = await context.checkDigitsMath('n = int(input())\na = n // 1000\nprint("ДА")', task(5));
  assert.equal(accepted.type, 'success');
});
