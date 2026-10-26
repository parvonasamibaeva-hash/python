(function (root) {
  'use strict';
  const VERSION = 'solution-passport-v1';
  const MAX_VERSIONS = 30;
  const MAX_EVENTS = 200;
  const storage = () => root.localStorage;
  const key = (accountId, taskId) => `python_passport_v1:${String(accountId || 'local')}:${String(taskId || 'unknown')}`;
  function read(accountId, taskId) {
    try { return JSON.parse(storage().getItem(key(accountId, taskId)) || '{"versions":[],"events":[]}'); }
    catch (_) { return { versions: [], events: [] }; }
  }
  function write(accountId, taskId, data) { storage().setItem(key(accountId, taskId), JSON.stringify(data)); return data; }
  function id(prefix) { return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`; }
  function now() { return new Date().toISOString(); }
  function context(opts) { return { accountId: String(opts.accountId || 'local'), taskId: String(opts.taskId || 'unknown') }; }
  function saveVersion(opts) {
    const c = context(opts), data = read(c.accountId, c.taskId), code = String(opts.code || '');
    const previous = data.versions[0];
    if (previous && previous.code === code) return previous;
    const version = { versionId: id('ver'), accountId: c.accountId, taskId: c.taskId, attemptId: String(opts.attemptId || ''), savedAt: now(), code, reason: String(opts.reason || 'checkpoint'), parentVersionId: previous ? previous.versionId : '', verification: opts.verification || null, passportVersion: VERSION };
    data.versions.unshift(version); data.versions = data.versions.slice(0, MAX_VERSIONS); write(c.accountId, c.taskId, data); return version;
  }
  function recordEvent(opts) {
    const c = context(opts), data = read(c.accountId, c.taskId), type = String(opts.type || 'unknown'), at = now();
    const last = data.events[0];
    if (last && type === 'code_changed' && last.type === type && Date.now() - Date.parse(last.occurredAt) < 2000) { last.metadata = opts.metadata || {}; last.occurredAt = at; write(c.accountId, c.taskId, data); return last; }
    const event = { eventId: id('evt'), accountId: c.accountId, taskId: c.taskId, attemptId: String(opts.attemptId || ''), type, occurredAt: at, metadata: opts.metadata || {}, passportVersion: VERSION };
    data.events.unshift(event); data.events = data.events.slice(0, MAX_EVENTS); write(c.accountId, c.taskId, data); return event;
  }
  function listVersions(accountId, taskId) { return read(accountId, taskId).versions; }
  function listEvents(accountId, taskId) { return read(accountId, taskId).events; }
  function diff(a, b) {
    const left = String(a || '').split('\n'), right = String(b || '').split('\n'), rows = [], n = Math.max(left.length, right.length);
    for (let i = 0; i < n; i += 1) if (left[i] !== right[i]) rows.push({ line: i + 1, before: left[i] === undefined ? '' : left[i], after: right[i] === undefined ? '' : right[i] });
    return rows;
  }
  function render(container, opts) {
    if (!container) return;
    const c = context(opts), versions = listVersions(c.accountId, c.taskId), events = listEvents(c.accountId, c.taskId);
    container.innerHTML = `<div class="passport-summary">Сохранённых версий: <strong>${versions.length}</strong> · Событий: <strong>${events.length}</strong></div>` + (versions.length ? `<ol class="passport-versions">${versions.map(v => `<li><button type="button" data-passport-version="${v.versionId}">${v.savedAt.replace('T',' ').slice(0,19)}</button> <span>${v.reason}</span></li>`).join('')}</ol>` : '<div class="passport-empty">История появится после изменений кода.</div>');
    container.querySelectorAll('[data-passport-version]').forEach(btn => btn.addEventListener('click', () => { const v = versions.find(item => item.versionId === btn.dataset.passportVersion); if (v && opts.onRestore) opts.onRestore(v); }));
  }
  root.SolutionPassport = { VERSION, saveVersion, recordEvent, listVersions, listEvents, diff, render };
})(typeof window === 'undefined' ? globalThis : window);
