const test = require('node:test');
const assert = require('node:assert/strict');

require('../checker.js');
const checker = global.PythonTaskChecker;

function task(tests, extra = {}) {
  return { id: 1, title: 'Тест', tests, ...extra };
}

test('accepts different correct solutions across multiple inputs', async () => {
  const tests = [{ input: ['5'], expected: '25' }, { input: ['8'], expected: '64' }, { input: ['0'], expected: '0' }, { input: ['-3'], expected: '9' }];
  const result = await checker.run({
    task: task(tests),
    code: 'number = int(input())\nresult = number * number\nprint(result)',
    runTest: async (code, input) => ({ ok: true, output: String(Number(input[0]) * Number(input[0])) })
  });
  assert.equal(result.type, 'success');
  assert.equal(result.passedTests, 4);
  assert.equal(result.totalTests, 4);
});

test('rejects a hardcoded answer that only matches the first input', async () => {
  const result = await checker.run({
    task: task([{ input: ['5'], expected: '25' }, { input: ['8'], expected: '64' }]),
    code: 'print(25)',
    runTest: async () => ({ ok: true, output: '25' })
  });
  assert.equal(result.type, 'wrong_answer');
  assert.equal(result.category, 'wrong_output');
  assert.equal(result.passedTests, 1);
  assert.equal(result.failedTest, 2);
});

test('keeps sequential input cases independent', async () => {
  const calls = [];
  const result = await checker.run({
    task: task([{ input: ['2', '3'], expected: '5' }, { input: ['10', '-4'], expected: '6' }]),
    code: 'a = int(input())\nb = int(input())\nprint(a + b)',
    runTest: async (code, input) => {
      calls.push([...input]);
      return { ok: true, output: String(Number(input[0]) + Number(input[1])) };
    }
  });
  assert.equal(result.type, 'success');
  assert.deepEqual(calls, [['2', '3'], ['10', '-4']]);
});

test('classifies syntax, missing input and timeout failures', async () => {
  const syntax = await checker.run({ task: task([{ input: [], expected: 'x' }]), code: 'if:', runTest: async () => ({ ok: false, error: 'SyntaxError: invalid syntax' }) });
  const input = await checker.run({ task: task([{ input: ['1'], expected: 'x' }]), code: 'print(input())', runTest: async () => ({ ok: false, error: 'Программа запросила больше входных данных' }) });
  const timeout = await checker.run({ task: task([{ input: [], expected: 'x' }]), code: 'while True: pass', runTest: async () => ({ ok: false, error: 'TimeLimitError: execution limit' }) });
  assert.equal(syntax.category, 'syntax_error');
  assert.equal(input.category, 'missing_input');
  assert.equal(timeout.category, 'timeout');
});

test('does not auto-accept tasks without a test contract', async () => {
  const result = await checker.run({ task: task([]), code: 'print(42)', runTest: async () => ({ ok: true, output: '42' }) });
  assert.equal(result.type, 'manual_review');
  assert.equal(result.category, 'no_tests');
});

test('keeps randomized custom tasks for teacher review', async () => {
  const result = await checker.run({
    task: task([], { checker: 'randomized' }),
    code: 'print("valid-looking output")',
    runTest: async () => ({ ok: true, output: '' }),
    customCheckers: { randomized: async () => ({ type: 'manual_review', category: 'randomized_behavior' }) }
  });
  assert.equal(result.type, 'manual_review');
  assert.equal(result.category, 'randomized_behavior');
});

