const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

assert.match(html, /function escapeHtml\(value\)/, 'dynamic HTML escaping helper should exist');

[
  '${ev.title}',
  '${t.name}',
  '${a.task.name}',
  '${ev.source}',
  "openAddTask('${ev.title}')",
  "toggleImportTask('${t.id}')",
].forEach((needle) => {
  assert.equal(html.includes(needle), false, `raw user-controlled interpolation remains: ${needle}`);
});

[
  'escapeHtml(ev.title)',
  'escapeHtml(t.name)',
  'escapeHtml(a.task.name)',
  'escapeHtml(ev.source)',
  "openAddTask(window._panelEventPrefill||'')",
  'toggleImportTask(${jsArg(t.id)})',
].forEach((needle) => {
  assert.equal(html.includes(needle), true, `expected escaped rendering path missing: ${needle}`);
});

