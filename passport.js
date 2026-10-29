(function (root) {
  'use strict';
  const VERSION = 'solution-passport-v1';
  const MAX_VERSIONS = 30;
  const MAX_EVENTS = 200;
  const storage = () => root.localStorage;
  const key = (accountId, taskId) => `python_passport_v1:${String(accountId || 'local')}:${String(taskId || 'unknown')}`;
  function read(accountId, taskId) {
    try {
      const data = JSON.parse(storage().getItem(key(accountId, taskId)) || '{"versions":[],"events":[]}');
      const seen = new Set();
      data.versions = (Array.isArray(data.versions) ? data.versions : []).filter(version => version.reason !== 'before_restore').filter(version => { if (seen.has(version.code)) return false; seen.add(version.code); return true; });
      data.events = Array.isArray(data.events) ? data.events : [];
      storage().setItem(key(accountId, taskId), JSON.stringify(data));
      return data;
    } catch (_) { return { versions: [], events: [] }; }
  }
  function write(accountId, taskId, data) { storage().setItem(key(accountId, taskId), JSON.stringify(data)); return data; }
  function id(prefix) { return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`; }
  function now() { return new Date().toISOString(); }
  function context(opts) { return { accountId: String(opts.accountId || 'local'), taskId: String(opts.taskId || 'unknown') }; }
  function saveVersion(opts) {
    const c = context(opts), data = read(c.accountId, c.taskId), code = String(opts.code || '');
    const previous = data.versions[0];
    if (data.versions.some(version => version.code === code)) return data.versions.find(version => version.code === code);
    const version = { versionId: id('ver'), accountId: c.accountId, taskId: c.taskId, attemptId: String(opts.attemptId || ''), savedAt: now(), code, label: String(opts.label || '').trim().slice(0, 60), reason: String(opts.reason || 'checkpoint'), parentVersionId: previous ? previous.versionId : '', verification: opts.verification || null, passportVersion: VERSION };
    data.versions.unshift(version); data.versions = data.versions.slice(0, MAX_VERSIONS); write(c.accountId, c.taskId, data); return version;
  }
  function renameVersion(opts) {
    const c = context(opts), data = read(c.accountId, c.taskId), target = data.versions.find(version => version.versionId === String(opts.versionId || ''));
    if (!target) return null;
    target.label = String(opts.label || '').trim().slice(0, 60);
    write(c.accountId, c.taskId, data);
    return target;
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
  function reasonLabel(reason) {
    return { run: 'запуск', verification: 'проверка', checkpoint: 'контрольная точка' }[reason] || String(reason || 'событие');
  }
  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  }
  function render(container, opts) {
    if (!container) return;
    const c = context(opts), versions = listVersions(c.accountId, c.taskId), events = listEvents(c.accountId, c.taskId);
    container.innerHTML = `<div class="passport-summary">Версий: <strong>${versions.length}</strong> · событий: <strong>${events.length}</strong></div>` + (versions.length ? `<ol class="passport-versions">${versions.map(v => { const date = escapeHtml(String(v.savedAt || '').slice(5,16).replace('T',' ')); const label = escapeHtml(v.label || ''); return `<li><button type="button" data-passport-version="${escapeHtml(v.versionId)}">${date}</button><button type="button" class="passport-rename" data-passport-rename="${escapeHtml(v.versionId)}" title="Переименовать версию" aria-label="Переименовать версию">✎</button>${label ? `<span class="passport-label">${label}</span>` : ''}<span class="passport-reason">${escapeHtml(reasonLabel(v.reason))}</span></li>`; }).join('')}</ol>` : '<div class="passport-empty">История появится после запуска или проверки.</div>');
    container.querySelectorAll('[data-passport-version]').forEach(btn => btn.addEventListener('click', () => { const v = versions.find(item => item.versionId === btn.dataset.passportVersion); if (v && opts.onRestore) opts.onRestore(v); }));
    container.querySelectorAll('[data-passport-rename]').forEach(btn => btn.addEventListener('click', () => { const v = versions.find(item => item.versionId === btn.dataset.passportRename); if (v && opts.onRename) opts.onRename(v); }));
  }
  root.SolutionPassport = { VERSION, saveVersion, renameVersion, recordEvent, listVersions, listEvents, diff, render };
})(typeof window === 'undefined' ? globalThis : window);
