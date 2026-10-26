(function (root) {
  'use strict';

  const VERSION = 'python-checker-v2';

  function normalizeOutput(value) {
    return String(value == null ? '' : value).replace(/\r\n/g, '\n').trim();
  }

  function normalizeComparableOutput(value) {
    return normalizeOutput(value).replace(/(?<![\w])(-?\d+\.\d+)(?![\w])/g, (token) => {
      const number = Number(token);
      return Number.isFinite(number) ? String(number) : token;
    });
  }

  function errorCategory(error) {
    const text = String(error || '').toLowerCase();
    if (/syntaxerror|invalid syntax|eol while scanning|string literal|unexpected eof/.test(text)) return 'syntax_error';
    if (/indentationerror|unexpected indent|unindent/.test(text)) return 'indentation_error';
    if (/valueerror|invalid literal/.test(text)) return 'input_value_error';
    if (/eoferror|недоста|more input|входных данных/.test(text)) return 'missing_input';
    if (/timelimit|execution limit|too many instructions|time limit|infinite/.test(text)) return 'timeout';
    if (/zerodivisionerror|division by zero/.test(text)) return 'division_by_zero';
    if (/nameerror|name .* is not defined/.test(text)) return 'name_error';
    if (/typeerror|unsupported operand type|can only concatenate/.test(text)) return 'type_error';
    if (/indexerror/.test(text)) return 'index_error';
    if (/keyerror/.test(text)) return 'key_error';
    if (/attributeerror/.test(text)) return 'attribute_error';
    return 'runtime_error';
  }

  function baseResult(type, category, totalTests, passedTests) {
    return { type, category, checkerVersion: VERSION, passedTests: Number(passedTests) || 0, totalTests: Number(totalTests) || 0, checkedAt: new Date().toISOString() };
  }

  async function run(options) {
    const task = options && options.task;
    const code = String(options && options.code || '').trim();
    const runTest = options && options.runTest;
    const customCheckers = options && options.customCheckers || {};
    if (!task || typeof runTest !== 'function') return baseResult('invalid', 'checker_configuration', 0, 0);
    if (!code) return baseResult('invalid', 'empty_code', 0, 0);
    if (task.checker) {
      const checker = customCheckers[task.checker];
      if (typeof checker !== 'function') return baseResult('manual_review', 'unsupported_checker', 0, 0);
      const custom = await checker(code);
      if (!custom || custom.type === 'manual_review') return Object.assign(baseResult('manual_review', (custom && custom.category) || 'manual_review', 0, 0), custom || {});
      return Object.assign(baseResult(custom.type || 'wrong_answer', custom.category || custom.type || 'custom_checker', custom.totalTests || 0, custom.passedTests || 0), custom);
    }
    const tests = Array.isArray(task.tests) ? task.tests : [];
    if (!tests.length) return baseResult('manual_review', 'no_tests', 0, 0);
    let passedTests = 0;
    for (let index = 0; index < tests.length; index += 1) {
      const test = tests[index] || {};
      let result;
      try { result = await runTest(code, Array.isArray(test.input) ? test.input : []); }
      catch (error) { result = { ok: false, error: String(error && error.message || error) }; }
      if (!result || !result.ok) {
        const error = result && result.error;
        return Object.assign(baseResult('execution_error', errorCategory(error), tests.length, passedTests), { failedTest: index + 1, error: String(error || 'Неизвестная ошибка выполнения.') });
      }
      const actual = normalizeComparableOutput(result.output);
      const expected = normalizeComparableOutput(test.expected);
      if (actual !== expected) return Object.assign(baseResult('wrong_answer', 'wrong_output', tests.length, passedTests), { failedTest: index + 1, expected: test.expected, actual: result.output });
      passedTests += 1;
    }
    return baseResult('success', 'all_tests_passed', tests.length, passedTests);
  }
  root.PythonTaskChecker = { VERSION, errorCategory, normalizeOutput, normalizeComparableOutput, run };
})(typeof window === 'undefined' ? globalThis : window);
