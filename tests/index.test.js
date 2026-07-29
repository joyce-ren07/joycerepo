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

test('closing import during connect cancels the stale renderImportStep2 timer', () => {
  const { context, timers } = loadCalendarContext();

  vm.runInContext(`
    openImportModal();
    selectPlatform('google');
    startFakeConnect();
  `, context);

  assert.equal(timers.size, 1, 'connect schedules one timer');

  vm.runInContext('closeImportModal(); openImportModal();', context);

  assert.equal(timers.size, 0, 'reopen must clear the pending connect timer');
  assert.equal(vm.runInContext('importPlatform', context), null);

  // Even if a leaked timer fired, renderImportStep2 must not throw.
  assert.doesNotThrow(() => {
    vm.runInContext('renderImportStep2(); updateImportStep2();', context);
  });
});

test('double connect does not wipe task selections via a stale timer', () => {
  const { context, timers } = loadCalendarContext();

  vm.runInContext(`
    openImportModal();
    selectPlatform('google');
    startFakeConnect();
  `, context);
  const firstTimerCount = timers.size;

  vm.runInContext(`
    closeImportModal();
    openImportModal();
    selectPlatform('google');
    startFakeConnect();
  `, context);

  assert.equal(firstTimerCount, 1);
  assert.equal(timers.size, 1, 'only the latest connect timer should remain');

  flushMs(timers, 1200);

  vm.runInContext(`
    importChecked = new Set(['g1', 'g2']);
  `, context);

  // No second 1200ms callback should remain to reset importChecked.
  flushMs(timers, 1200);

  const selected = JSON.parse(
    vm.runInContext('JSON.stringify([...importChecked])', context),
  );
  assert.deepEqual(selected, ['g1', 'g2']);
});

test('stale connect callback does not jump to another platform without Connect', () => {
  const { context, timers, els } = loadCalendarContext();

  vm.runInContext(`
    openImportModal();
    selectPlatform('google');
    startFakeConnect();
    closeImportModal();
    openImportModal();
    selectPlatform('apple');
  `, context);

  // Stale google timer was cleared; firing nothing should leave step-1 markup.
  flushMs(timers, 1200);

  const html = els['import-modal-inner'].innerHTML;
  assert.match(html, /Choose a platform/);
  assert.doesNotMatch(html, /tasks found/);
  assert.equal(vm.runInContext('importPlatform', context), 'apple');
});
