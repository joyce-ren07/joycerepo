const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function makeElement(tagName = 'div') {
  return {
    tagName,
    children: [],
    style: {},
    className: '',
    disabled: false,
    textContent: '',
    value: '',
    _innerHTML: '',
    classList: {
      add() {},
      remove() {},
      toggle() {},
      contains() { return false; },
    },
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    addEventListener() {},
    focus() {},
    querySelectorAll() { return []; },
    closest() { return {querySelectorAll: () => []}; },
    set innerHTML(value) {
      this._innerHTML = String(value);
    },
    get innerHTML() {
      return this._innerHTML;
    },
  };
}

function loadCalendarScript() {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const script = html.match(/<script>([\s\S]*)<\/script>/)[1];
  const elements = new Map();
  const document = {
    createElement: makeElement,
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, makeElement('div'));
      return elements.get(id);
    },
    querySelectorAll() { return []; },
  };
  const context = {
    console,
    document,
    Set,
    Math,
    Date,
    JSON,
    requestAnimationFrame(fn) { fn(); },
    setTimeout(fn) { fn(); return 1; },
    clearTimeout() {},
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(script, context, {filename: 'index.html'});
  return {context, document};
}

function maliciousEvent(title) {
  return {
    id: 999,
    title,
    day: 2,
    startH: 9,
    dur: 1,
    color: '#1a73e8',
    bg: '#e8f0fe',
    effort: '1h',
    priority: 'high',
    likelihood: 'high',
    type: 'deep',
    done: false,
    drift: false,
    driftCount: 0,
    deadline: {day: 3, hour: 17},
  };
}

test('task titles are escaped in calendar and event panel HTML', () => {
  const {context, document} = loadCalendarScript();
  const title = '<img src=x onerror="window.__xss=1">';
  const card = context.buildEventEl(maliciousEvent(title));

  assert.doesNotMatch(card.innerHTML, /<img\b/i);
  assert.match(card.innerHTML, /&lt;img/);

  context.showEventPanel(maliciousEvent(title));
  const panelHtml = document.getElementById('right-panel').innerHTML;
  assert.doesNotMatch(panelHtml, /<img\b/i);
  assert.match(panelHtml, /&lt;img/);
  assert.doesNotMatch(panelHtml, /onclick="openAddTask\('<img/i);
});

test('imported task names are escaped before review and calendar rendering', () => {
  const {context, document} = loadCalendarScript();
  const importedTitle = '<svg onload="window.__xss=1"></svg>';
  const importedId = `evil');window.__xss=1;//`;
  const encodedTitle = JSON.stringify(importedTitle);
  const encodedId = JSON.stringify(importedId);

  vm.runInContext(`
    importPlatform = 'apple';
    importTasks = [{id:${encodedId}, name:${encodedTitle}, due:'<b>Today</b>', priority:'high'}];
    importChecked = new Set([${encodedId}]);
    updateImportStep2();
  `, context);

  const modalHtml = document.getElementById('import-modal-inner').innerHTML;
  assert.doesNotMatch(modalHtml, /<svg onload/i);
  assert.match(modalHtml, /&lt;svg/);
  assert.doesNotMatch(modalHtml, /<b>Today<\/b>/i);
  assert.doesNotMatch(modalHtml, /onclick="toggleImportTask\('evil'\);window\.__xss=1/i);

  vm.runInContext('runImportSchedule();', context);
  const panelHtml = document.getElementById('right-panel').innerHTML;
  assert.doesNotMatch(panelHtml, /<svg onload/i);
  assert.match(panelHtml, /&lt;svg/);

  vm.runInContext('confirmImport();', context);
  const importedCard = vm.runInContext(`buildEventEl(EVENTS.find(e => e.imported && e.title === ${encodedTitle}))`, context);
  assert.doesNotMatch(importedCard.innerHTML, /<svg onload/i);
  assert.match(importedCard.innerHTML, /&lt;svg/);
});
