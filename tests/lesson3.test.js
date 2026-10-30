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

test('lesson 3 catalog keeps all tasks and corrected title', () => {
  assert.equal(tasks.length, 20);
  assert.equal(task(17).title, 'Задача 17. Оканчивается ли год на два нуля');
});

test('lesson 3 covers equality, boundary, and unsorted cases', () => {
  const has = (id, input, expected) => assert.ok(task(id).tests.some(testCase => JSON.stringify(testCase) === JSON.stringify({ input, expected })), `task ${id} should test ${input.join(',')}`);
  has(1, ['5', '5'], 'False');
  has(2, ['5', '5'], '0');
  has(6, ['1142'], 'НЕТ');
  has(10, ['0', '-1', '-2'], 'Нет положительных чисел');
  has(15, ['1', '5', '3'], 'NO');
  has(18, ['10', 'f'], 'YES');
  has(18, ['15', 'f'], 'YES');
});

test('digit tasks declare the mathematical-only checker and corrected output', () => {
  assert.equal(task(6).checker, 'digits_math');
  assert.equal(task(13).checker, 'digits_math');
  assert.ok(task(13).tests.some(testCase => testCase.expected === 'В следующий раз повезет'));
});

test('lesson 3 checker wires the method restriction', () => {
  assert.match(source, /function checkDigitsMath\(code,task\)/);
  assert.match(source, /digits_math:checkDigitsMath/);
  assert.match(source, /method_requirement/);
  assert.match(source, /цифры нужно обрабатывать математически/);
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
  const rejected = await context.checkDigitsMath('n = str(input())\nprint("ДА")', task(6));
  assert.equal(rejected.category, 'method_requirement');
  const accepted = await context.checkDigitsMath('n = int(input())\na = n // 1000\nprint("ДА")', task(6));
  assert.equal(accepted.type, 'success');
});
