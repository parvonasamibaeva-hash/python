const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync(require('node:path').join(__dirname, '..', 'index.html'), 'utf8');

function functionBody(name) {
  const start = html.indexOf(`function ${name}`);
  assert.notEqual(start, -1, `function ${name} should exist`);
  const next = html.indexOf('\nfunction ', start + 10);
  return html.slice(start, next === -1 ? html.length : next);
}

test('teacher solution view does not restore student data into the teacher editor', () => {
  const view = functionBody('viewStudentAccount');
  assert.doesNotMatch(view, /restoreStudentProgress\s*\(/);

  const dashboard = functionBody('buildStudentDashboard');
  assert.match(dashboard, /teacherViewingStudent/);
  assert.match(dashboard, /openStudentSolutionPreview/);
  assert.match(functionBody('openStudentSolutionPreview'), /Режим просмотра/);
});

test('task submissions carry a stable id and bounded network request', () => {
  const send = functionBody('sendTaskResult');
  assert.match(send, /taskSubmissionIds/);
  assert.match(send, /submissionId/);
  assert.match(send, /AbortController/);
  assert.match(send, /setTimeout\(\(\)=>controller\.abort\(\),20000\)/);
});

test('local progress and Python input checks remain wired', () => {
  assert.match(html, /editor\.on\('change'/);
  assert.match(html, /saveState\(\)/);
  assert.match(functionBody('runOneTest'), /inputfun/);
  assert.match(functionBody('checkTask'), /for\(const test of \(t\.tests\|\|\[\]\)\)/);
  assert.match(html, /lesson1Tasks/);
  assert.match(html, /lesson7Tasks|homeworkTasks/);
});

test('offline task results remain visible for retry', () => {
  assert.match(functionBody('markResultSent'), /unsentResults/);
  assert.match(functionBody('updateSyncLine'), /Отправить ещё раз/);
});
