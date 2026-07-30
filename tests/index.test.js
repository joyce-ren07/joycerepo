const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const vm = require('node:vm');

function createEl(id) {
  return {
    id,
    style: {},
    classList: {
      _s: new Set(),
      add(c) { this._s.add(c); },
      remove(c) { this._s.delete(c); },
      toggle(c, on) {
        if (on === undefined) {
          if (this._s.has(c)) this._s.delete(c);
          else this._s.add(c);
        } else if (on) this._s.add(c);
        else this._s.delete(c);
      },
      contains(c) { return this._s.has(c); },
    },
    value: '',
    textContent: '',
    innerHTML: '',
    disabled: false,
    focus() {},
    appendChild() {},
    addEventListener() {},
    querySelectorAll() { return []; },
    closest() { return { querySelectorAll() { return []; } }; },
  };
}

function loadCalendarContext() {
  const html = readFileSync(new URL('../index.html', `file://${__filename}`), 'utf8');
  const [, script] = html.match(/<script>([\s\S]*)<\/script>/);
  const scriptWithoutInit = script.replace(
    /buildMiniCal\(\);buildSidebarLoad\(\);buildWeekHeader\(\);buildWeekGrid\(\);\s*$/,
    '',
  );
  const els = {};
  const document = {
    getElementById(id) {
      return els[id] || (els[id] = createEl(id));
    },
    createElement(tag) {
      return createEl(tag);
    },
    querySelectorAll() {
      return [];
    },
  };
  const timers = new Map();
  let nextTimerId = 1;
  const setTimeoutFn = (fn, ms) => {
    const id = nextTimerId++;
    timers.set(id, { fn, ms });
    return id;
  };
  const clearTimeoutFn = (id) => {
    timers.delete(id);
  };
  const context = {
    console,
    window: {},
    document,
    setTimeout: setTimeoutFn,
    clearTimeout: clearTimeoutFn,
    Math,
    Date,
    String,
    parseInt,
    parseFloat,
    requestAnimationFrame: (f) => f(),
  };
  vm.createContext(context);
  vm.runInContext(scriptWithoutInit, context);
  return { context, document, timers, els };
}

function flushMs(timers, ms) {
  for (const [id, t] of [...timers.entries()]) {
    if (t.ms === ms) {
      timers.delete(id);
      t.fn();
    }
  }
}

test('confirmSlot keeps optimize-time effort/priority after modal reopen changes', () => {
  const { context, document, timers } = loadCalendarContext();

  const before = vm.runInContext('EVENTS.length', context);

  vm.runInContext(`
    selEffort = '1h';
    selPriority = 'high';
  `, context);
  document.getElementById('modal-task-input').value = 'Mismatch demo';

  vm.runInContext('runOptimize()', context);
  flushMs(timers, 80);

  const slots = JSON.parse(
    vm.runInContext('JSON.stringify(window._optimizeSlots)', context),
  );
  assert.ok(slots.length >= 1);
  assert.match(slots[0].label, /9:00–10:00|10:00–11:00|11:00/);

  // Simulate: reopen New task, change effort/priority, Cancel (panel stays open).
  vm.runInContext(`
    selEffort = '3h';
    selPriority = 'low';
  `, context);

  vm.runInContext('confirmSlot()', context);
  flushMs(timers, 420);

  const added = JSON.parse(
    vm.runInContext(`JSON.stringify(EVENTS.slice(${before}))`, context),
  );
  assert.equal(added.length, 1);
  assert.equal(added[0].title, 'Mismatch demo');
  assert.equal(added[0].effort, '1h');
  assert.equal(added[0].dur, 1);
  assert.equal(added[0].priority, 'high');
  assert.deepEqual(
    JSON.parse(JSON.stringify(added[0].deadline)),
    { day: 3, hour: 23 },
  );
});

test('runOptimize refreshes snapshotted effort when optimizing again', () => {
  const { context, document, timers } = loadCalendarContext();

  const before = vm.runInContext('EVENTS.length', context);

  vm.runInContext(`
    selEffort = '1h';
    selPriority = 'high';
  `, context);
  document.getElementById('modal-task-input').value = 'First pass';
  vm.runInContext('runOptimize()', context);
  flushMs(timers, 80);

  vm.runInContext(`
    selEffort = '2h';
    selPriority = 'med';
  `, context);
  document.getElementById('modal-task-input').value = 'Second pass';
  vm.runInContext('runOptimize()', context);
  flushMs(timers, 80);

  vm.runInContext('confirmSlot()', context);
  flushMs(timers, 420);

  const added = JSON.parse(
    vm.runInContext(`JSON.stringify(EVENTS.slice(${before}))`, context),
  );
  assert.equal(added.length, 1);
  assert.equal(added[0].title, 'Second pass');
  assert.equal(added[0].effort, '2h');
  assert.equal(added[0].dur, 2);
  assert.equal(added[0].priority, 'med');
  assert.deepEqual(
    JSON.parse(JSON.stringify(added[0].deadline)),
    { day: 5, hour: 17 },
  );
});
