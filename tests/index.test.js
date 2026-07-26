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
  const context = {
    console,
    window: {},
    document,
    setTimeout,
    clearTimeout,
    Math,
    Date,
    String,
    parseInt,
    parseFloat,
  };
  vm.createContext(context);
  vm.runInContext(scriptWithoutInit, context);
  return { context, document };
}

test('confirmSlot ignores mid-flight selectSlot changes', async () => {
  const { context, document } = loadCalendarContext();

  const slots = vm.runInContext('buildOptimizeSlots(1,{day:3,hour:23})', context);
  assert.ok(slots.length >= 3);

  vm.runInContext(`
    window._pendingOptimizeName = 'Race task';
    window._optimizeSlots = buildOptimizeSlots(1,{day:3,hour:23});
    window._pendingOptimizeDeadline = {day:3,hour:23};
    selSlot = 0;
    selEffort = '1h';
    selPriority = 'high';
  `, context);

  const confirmed = JSON.parse(JSON.stringify(vm.runInContext('window._optimizeSlots[0]', context)));
  const alternateIdx = slots.length - 1;
  const alternate = JSON.parse(JSON.stringify(slots[alternateIdx]));
  assert.notEqual(confirmed.day, alternate.day);

  const before = vm.runInContext('EVENTS.length', context);
  vm.runInContext('confirmSlot()', context);
  vm.runInContext(`selectSlot(${alternateIdx})`, context);

  assert.equal(vm.runInContext('selSlot', context), 0);
  assert.equal(vm.runInContext('slotConfirming', context), true);
  assert.match(document.getElementById('confirm-btn').textContent, /Adding/);

  await new Promise(resolve => setTimeout(resolve, 450));

  const added = JSON.parse(JSON.stringify(vm.runInContext('EVENTS[EVENTS.length-1]', context)));
  assert.equal(vm.runInContext('EVENTS.length', context), before + 1);
  assert.equal(added.title, 'Race task');
  assert.equal(added.day, confirmed.day);
  assert.equal(added.startH, confirmed.startH);
  assert.notEqual(added.day, alternate.day);
  assert.equal(vm.runInContext('slotConfirming', context), false);
});

test('confirmSlot schedules the initially selected slot for the default high-priority flow', async () => {
  const { context } = loadCalendarContext();

  vm.runInContext(`
    window._pendingOptimizeName = 'Essay draft';
    window._optimizeSlots = buildOptimizeSlots(1,{day:3,hour:23});
    window._pendingOptimizeDeadline = {day:3,hour:23};
    selSlot = 0;
    selEffort = '1h';
    selPriority = 'high';
  `, context);

  const expected = JSON.parse(JSON.stringify(vm.runInContext('window._optimizeSlots[selSlot]', context)));
  const before = vm.runInContext('EVENTS.length', context);
  vm.runInContext('confirmSlot()', context);
  // Attempt to flip selection toward the past Monday candidate while Adding…
  vm.runInContext('selectSlot(window._optimizeSlots.length-1)', context);

  await new Promise(resolve => setTimeout(resolve, 450));

  const added = JSON.parse(JSON.stringify(vm.runInContext('EVENTS[EVENTS.length-1]', context)));
  assert.equal(vm.runInContext('EVENTS.length', context), before + 1);
  assert.equal(added.day, expected.day);
  assert.equal(added.startH, expected.startH);
});
