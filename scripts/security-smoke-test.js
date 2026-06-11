const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const match = html.match(/<script>([\s\S]*)<\/script>/);
if (!match) throw new Error('Unable to find inline script in index.html');

function makeElement() {
  return {
    _innerHTML: '',
    children: [],
    style: {},
    className: '',
    disabled: false,
    appendChild(child) { this.children.push(child); },
    addEventListener() {},
    focus() {},
    querySelectorAll() { return []; },
    closest() { return { querySelectorAll() { return []; } }; },
    classList: { add() {}, remove() {}, toggle() {} },
    set innerHTML(value) { this._innerHTML = String(value); },
    get innerHTML() { return this._innerHTML; },
    set textContent(value) { this._textContent = String(value); },
    get textContent() { return this._textContent || ''; },
  };
}

const elements = new Map();
const document = {
  createElement: makeElement,
  getElementById(id) {
    if (!elements.has(id)) elements.set(id, makeElement());
    return elements.get(id);
  },
  querySelectorAll() { return []; },
};

const context = {
  document,
  window: {},
  console,
  setTimeout(fn) { if (typeof fn === 'function') fn(); return 0; },
  clearTimeout() {},
  requestAnimationFrame(fn) { if (typeof fn === 'function') fn(); return 0; },
};
context.window = context;

const assertions = `
const maliciousTitle = '<img src=x onerror="globalThis.__xss=true">';
const maliciousEvent = {
  id: 999,
  title: maliciousTitle,
  day: TODAY_DAY,
  startH: 10,
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
  deadline: {day: TODAY_DAY, hour: 17},
};

const renderedEvent = buildEventEl(maliciousEvent).innerHTML;
if (renderedEvent.includes('<img') || !renderedEvent.includes('&lt;img')) {
  throw new Error('Calendar event title was not HTML-escaped');
}

let panelHtml = '';
openPanel = html => { panelHtml = html; };
showEventPanel(maliciousEvent);
if (panelHtml.includes('<img') || !panelHtml.includes('&lt;img')) {
  throw new Error('Event detail panel title was not HTML-escaped');
}
if (panelHtml.includes('openAddTask(\\'')) {
  throw new Error('Event detail panel still injects task titles into inline JavaScript');
}

importPlatform = 'apple';
importTasks = [{id: 'bad-id', name: maliciousTitle, due: 'Apr 9', priority: 'high'}];
importChecked = new Set(['bad-id']);
updateImportStep2();
const importHtml = document.getElementById('import-modal-inner').innerHTML;
if (importHtml.includes('<img') || !importHtml.includes('&lt;img')) {
  throw new Error('Import review task name was not HTML-escaped');
}
`;

vm.runInNewContext(`${match[1]}\n${assertions}`, context, { filename: 'index.html' });
console.log('security smoke test passed');
