(function (root) {
  'use strict';
  function timestamp(row) {
    const value = row && (row.date || row.checkedAt);
    if (!value) return null;
    const parsed = Date.parse(String(value));
    return Number.isNaN(parsed) ? null : parsed;
  }
  function attemptKey(row) { return String(row && (row.attemptId || row.submissionId || '') || ''); }
  function chooseLatest(current, candidate) {
    const a = timestamp(current), b = timestamp(candidate);
    if (a === null && b === null) {
      const ka = attemptKey(current), kb = attemptKey(candidate);
      if (ka === kb) return { row: current, known: false };
      return { row: ka > kb ? current : candidate, known: false };
    }
    if (a === null) return { row: candidate, known: true };
    if (b === null) return { row: current, known: true };
    if (a !== b) return { row: b > a ? candidate : current, known: true };
    const ka = attemptKey(current), kb = attemptKey(candidate);
    return { row: kb >= ka ? candidate : current, known: true };
  }
  function latestByTask(rows) {
    const map = new Map();
    (rows || []).forEach((row, index) => {
      const key = `${row.name || 'Без имени'}::${row.taskId || ''}`;
      if (!map.has(key)) map.set(key, { row, orderKnown: timestamp(row) !== null, sourceIndex: index });
      else {
        const selected = chooseLatest(map.get(key).row, row);
        map.set(key, { row: selected.row, orderKnown: map.get(key).orderKnown && selected.known, sourceIndex: index });
      }
    });
    return [...map.values()];
  }
  function status(row) {
    const result = String(row && row.result || '').toLowerCase();
    if (result === 'решена' || result === 'успешно' || result === 'success') return 'success';
    if (Number(row && row.failed || 0) >= 5 || /manual|review|провер/i.test(String(row && row.errorCategory || ''))) return 'attention';
    if (result) return 'failed';
    return 'unknown';
  }
  function filterRows(rows, filters) {
    const f = filters || {};
    const from = f.from ? Date.parse(`${f.from}T00:00:00`) : null;
    const to = f.to ? Date.parse(`${f.to}T23:59:59`) : null;
    return (rows || []).filter(row => {
      if (f.lessonId !== undefined && f.lessonId !== '' && row.lesson && String(row.lesson) !== `Занятие ${f.lessonId}`) return false;
      if (f.student && row.name !== f.student) return false;
      if (f.taskId && String(row.taskId) !== String(f.taskId)) return false;
      const time = timestamp(row);
      if (from !== null && (time === null || time < from)) return false;
      if (to !== null && (time === null || time > to)) return false;
      if (f.status && status(row) !== f.status) return false;
      return true;
    });
  }
  function metrics(rows, tasks) {
    const latest = latestByTask(rows || []);
    const unique = latest.map(item => item.row);
    const active = unique.filter(row => row.taskId !== '').length;
    const successful = unique.filter(row => status(row) === 'success').length;
    const failed = unique.filter(row => status(row) === 'failed').length;
    const attention = unique.filter(row => status(row) === 'attention').length;
    return { unique, activeTasks: active, successfulTasks: successful, failedTasks: failed, attentionTasks: attention, possibleTasks: null, progressPercent: null, assignmentDataAvailable: false, taskCount: Array.isArray(tasks) ? tasks.length : null };
  }
  function csv(rows, fields) {
    const cell = value => { let text = String(value == null ? '' : value); if (/^[=+\-@]/.test(text)) text = `'${text}`; return `"${text.replace(/"/g, '""')}"`; };
    return ['\uFEFF' + fields.map(field => cell(field.label)).join(';')].concat((rows || []).map(row => fields.map(field => cell(typeof field.value === 'function' ? field.value(row) : row[field.key])).join(';'))).join('\r\n');
  }
  function report(rows, options) {
    const filtered = filterRows(rows, options && options.filters);
    const m = metrics(filtered, options && options.tasks);
    return { filters: options && options.filters || {}, rows: filtered, metrics: m, attention: m.unique.filter(row => status(row) === 'attention') };
  }
  root.TeacherReports = { timestamp, latestByTask, filterRows, status, metrics, csv, report };
})(typeof window === 'undefined' ? globalThis : window);
