const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function load() {
  const store = new Map();
  const context = { localStorage: { getItem: k => store.get(k) || null, setItem: (k, v) => store.set(k, String(v)) }, Date, Math, JSON, String, Number, console };
  vm.runInNewContext(fs.readFileSync('passport.js', 'utf8'), context);
  return context.SolutionPassport;
}
test('stores versions without duplicating unchanged code and computes diff', () => {
  const p = load();
  const a = p.saveVersion({ accountId: 'a', taskId: '1-1', code: 'print(1)', reason: 'checkpoint' });
  const same = p.saveVersion({ accountId: 'a', taskId: '1-1', code: 'print(1)', reason: 'run' });
  const b = p.saveVersion({ accountId: 'a', taskId: '1-1', code: 'print(2)', reason: 'run' });
  assert.equal(a.versionId, same.versionId); assert.equal(p.listVersions('a', '1-1').length, 2);
  assert.equal(JSON.stringify(p.diff(a.code, b.code)), JSON.stringify([{ line: 1, before: 'print(1)', after: 'print(2)' }]));
});
test('does not create a duplicate version when restoring the same code', () => {
  const p = load();
  p.saveVersion({ accountId: 'a', taskId: '1-1', code: 'print(1)', reason: 'checkpoint' });
  p.saveVersion({ accountId: 'a', taskId: '1-1', code: 'print(2)', reason: 'checkpoint' });
  p.saveVersion({ accountId: 'a', taskId: '1-1', code: 'print(1)', reason: 'before_restore' });
  assert.equal(p.listVersions('a', '1-1').length, 2);
});
test('coalesces rapid code-change events and keeps event metadata only', () => {
  const p = load(); p.recordEvent({ accountId: 'a', taskId: '1-1', type: 'code_changed', metadata: { length: 1 } }); p.recordEvent({ accountId: 'a', taskId: '1-1', type: 'code_changed', metadata: { length: 2 } });
  assert.equal(p.listEvents('a', '1-1').length, 1); assert.deepEqual(p.listEvents('a', '1-1')[0].metadata, { length: 2 });
});
test('does not store clipboard contents', () => {
  const p = load(); p.recordEvent({ accountId: 'a', taskId: '1-1', type: 'paste', metadata: { size: 20, beforeLength: 1, afterLength: 21 } });
  assert.equal(JSON.stringify(p.listEvents('a', '1-1')).includes('clipboard'), false);
});
