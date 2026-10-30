const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'Code.gs'), 'utf8');

function functionBody(name) {
  const start = source.indexOf(`function ${name}`);
  assert.notEqual(start, -1, `function ${name} should exist`);
  const next = source.indexOf('\nfunction ', start + 10);
  return source.slice(start, next === -1 ? source.length : next);
}

test('task rows have an idempotency column', () => {
  assert.match(source, /const TASK_HEADERS[^;]*'ID отправки'/);
  assert.match(source, /'Пройдено тестов'/);
  assert.match(source, /'Версия проверки'/);
});

test('saveTask deduplicates retries for the same account and submission id', () => {
  const saveTask = functionBody('saveTask_');
  assert.match(saveTask, /String\(data\.submissionId/);
  assert.match(saveTask, /LockService\.getScriptLock\(\)/);
  assert.match(saveTask, /duplicate:true/);
  assert.match(saveTask, /session\.accountId/);
  assert.match(saveTask, /passedTests/);
  assert.match(saveTask, /checkerVersion/);
  assert.match(saveTask, /finally \{\s*lock\.releaseLock\(\)/);
});

test('task access supports a per-student teacher override', () => {
  assert.match(source, /const TASK_ACCESS_SHEET_NAME/);
  assert.match(source, /data\.action === 'setTaskAccess'/);
  assert.match(source, /function setTaskAccess_\(data,session\)/);
  assert.match(source, /taskAccessKey_\(session\.accountId,lessonId,taskId\)/);
  assert.match(source, /if\(override&&override\.open===true\)return/);
});

