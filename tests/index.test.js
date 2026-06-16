const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

class ElementStub {
  constructor(idOrTag) {
    this.id = idOrTag;
    this.children = [];
    this.style = {};
    this.className = '';
    this.innerHTML = '';
    this.textContent = '';
    this.value = '';
    this.disabled = false;
    this.listeners = {};
    this.classList = {
      add: (...names) => {
        const current = new Set(this.className.split(/\s+/).filter(Boolean));
        names.forEach(name => current.add(name));
        this.className = [...current].join(' ');
      },
      remove: (...names) => {
        const remove = new Set(names);
        this.className = this.className.split(/\s+/).filter(name => name && !remove.has(name)).join(' ');
      },
      toggle: (name, force) => {
        const current = new Set(this.className.split(/\s+/).filter(Boolean));
        const shouldAdd = force ?? !current.has(name);
        if (shouldAdd) current.add(name);
        else current.delete(name);
        this.className = [...current].join(' ');
      },
    };
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  addEventListener(type, handler) {
    this.listeners[type] = handler;
  }

  focus() {}

  closest() {
    return {querySelectorAll: () => []};
  }
}

function loadApp() {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const script = html.match(/<script>([\s\S]*)<\/script>/)[1];
  const elements = new Map();
  const document = {
    createElement: tag => new ElementStub(tag),
    getElementById: id => {
      if (!elements.has(id)) elements.set(id, new ElementStub(id));
      return elements.get(id);
    },
    querySelectorAll: () => [],
  };
  const context = vm.createContext({
    document,
    window: {},
    console,
    clearTimeout,
    setTimeout: (fn) => {
      if (typeof fn === 'function') fn();
      return 0;
    },
    requestAnimationFrame: fn => fn(),
  });
  vm.runInContext(script, context);
  return {context, document};
}

test('calendar event rendering escapes task titles', () => {
  const {context} = loadApp();
  const malicious = `<img src=x onerror=globalThis.__xss=1> "quotes" & 'single'`;

  const el = context.buildEventEl({
    id: 999,
    title: malicious,
    day: 2,
    startH: 9,
    dur: 1,
    color: '#111',
    bg: '#fff',
    effort: '1h',
    priority: 'high',
    likelihood: 'high',
    type: 'deep',
    done: false,
    drift: false,
    driftCount: 0,
    deadline: {day: 3, hour: 17},
  });

  assert.doesNotMatch(el.innerHTML, /<img/i);
  assert.match(el.innerHTML, /&lt;img src=x onerror=globalThis.__xss=1&gt;/);
  assert.match(el.innerHTML, /&quot;quotes&quot; &amp; &#39;single&#39;/);
});

test('event panel does not embed task titles in inline JavaScript', () => {
  const {context, document} = loadApp();
  const malicious = `');globalThis.__xss=1;//`;

  context.showEventPanel({
    id: 1000,
    title: malicious,
    day: 2,
    startH: 10,
    dur: 1,
    effort: '1h',
    priority: 'high',
    likelihood: 'high',
    drift: false,
    deadline: {day: 3, hour: 17},
  });

  const panelHtml = document.getElementById('right-panel').innerHTML;
  assert.doesNotMatch(panelHtml, /openAddTask\('/);
  assert.match(panelHtml, /openPanelPrefill\(\)/);
  assert.match(panelHtml, /&#39;\);globalThis.__xss=1;\/\//);

  context.openPanelPrefill();
  assert.equal(document.getElementById('modal-task-input').value, malicious);
});

test('import review escapes external task names and ids', () => {
  const {context, document} = loadApp();

  vm.runInContext(`
    importPlatform = 'apple';
    importTasks = [{
      id: "x');globalThis.__xss=1;//",
      name: '<img src=x onerror=globalThis.__xss=1>',
      due: 'Apr <9>',
      priority: 'high',
    }];
    importChecked = new Set();
    updateImportStep2();
  `, context);

  const importHtml = document.getElementById('import-modal-inner').innerHTML;
  assert.doesNotMatch(importHtml, /<img/i);
  assert.match(importHtml, /&lt;img src=x onerror=globalThis.__xss=1&gt;/);
  assert.match(importHtml, /Due Apr &lt;9&gt;/);
  assert.match(importHtml, /onclick="toggleImportTask\(&quot;x&#39;\);globalThis.__xss=1;\/\/&quot;\)"/);
});

test('import slot labels match the rendered calendar week', () => {
  const {context} = loadApp();
  const labels = vm.runInContext('IMPORT_SLOT_POOL.map(slot => slot.label)', context);

  assert.deepEqual(labels.slice(0, 4), [
    'Wed Apr 9, 10 AM',
    'Wed Apr 9, 2 PM',
    'Thu Apr 10, 9 AM',
    'Thu Apr 10, 1 PM',
  ]);
  assert.equal(labels.includes('Mon Apr 14, 11 AM'), false);
  assert.equal(labels.includes('Tue Apr 15, 3 PM'), false);
});
