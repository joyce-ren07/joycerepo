const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

function extractFunction(name) {
  const start = html.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} should exist`);

  const bodyStart = html.indexOf('{', start);
  let depth = 0;
  for (let i = bodyStart; i < html.length; i++) {
    if (html[i] === '{') depth++;
    if (html[i] === '}' && --depth === 0) return html.slice(start, i + 1);
  }
  throw new Error(`Could not extract ${name}`);
}

test('event panel wires the remove button to the selected event', () => {
  assert.match(html, /id="remove-task-btn"/);
  assert.match(
    html,
    /getElementById\('remove-task-btn'\)\.addEventListener\('click',\(\)=>removeEvent\(ev\.id\)\)/,
  );
});

test('removeEvent removes the event and refreshes calendar load surfaces', () => {
  const calls = [];
  const context = {
    EVENTS: [{ id: 1 }, { id: 2 }, { id: 3 }],
    buildWeekGrid: () => calls.push('grid'),
    buildSidebarLoad: () => calls.push('sidebar'),
    buildWeekHeader: () => calls.push('header'),
    closePanel: () => calls.push('close'),
    showToast: message => calls.push(message),
  };

  vm.runInNewContext(
    `${extractFunction('removeEvent')}
     result = removeEvent(2);
     remainingIds = EVENTS.map(event => event.id);`,
    context,
  );

  assert.equal(context.result, true);
  assert.deepEqual(Array.from(context.remainingIds), [1, 3]);
  assert.deepEqual(calls, [
    'grid',
    'sidebar',
    'header',
    'close',
    'Task removed from your calendar.',
  ]);
});

test('removeEvent leaves state untouched when the event no longer exists', () => {
  const calls = [];
  const context = {
    EVENTS: [{ id: 1 }],
    buildWeekGrid: () => calls.push('grid'),
    buildSidebarLoad: () => calls.push('sidebar'),
    buildWeekHeader: () => calls.push('header'),
    closePanel: () => calls.push('close'),
    showToast: message => calls.push(message),
  };

  vm.runInNewContext(
    `${extractFunction('removeEvent')}
     result = removeEvent(99);
     remainingIds = EVENTS.map(event => event.id);`,
    context,
  );

  assert.equal(context.result, false);
  assert.deepEqual(Array.from(context.remainingIds), [1]);
  assert.deepEqual(calls, []);
});
