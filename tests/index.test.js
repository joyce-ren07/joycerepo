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

function loadCalendarContext(timerMode = 'collect') {
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
  const timers = [];
  const setTimeoutFn =
    timerMode === 'collect'
      ? (fn, ms) => {
          const id = timers.length + 1;
          timers.push({ id, fn, ms });
          return id;
        }
      : setTimeout;
  const clearTimeoutFn =
    timerMode === 'collect'
      ? (id) => {
          const idx = timers.findIndex((t) => t.id === id);
          if (idx >= 0) timers.splice(idx, 1);
        }
      : clearTimeout;
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
  return { context, document, timers };
}

function portfolioParts(context) {
  return JSON.parse(
    JSON.stringify(
      vm.runInContext(
        'EVENTS.filter(e => String(e.title).includes("Portfolio update")).map(e => ({id:e.id,title:e.title,day:e.day,startH:e.startH}))',
        context,
      ),
    ),
  );
}

test('driftRemove cancels an in-flight driftBreak instead of resurrecting fragments', () => {
  const { context, timers } = loadCalendarContext('collect');

  vm.runInContext('panelOpen = true; driftEv = EVENTS.find(e => e.id === 3);', context);
  vm.runInContext('driftBreak(); driftRemove();', context);

  // Break's 220ms timer must have been cleared; only panel-close timer may remain.
  assert.equal(
    timers.filter((t) => t.ms === 220).length,
    0,
    'pending split timer should be cancelled',
  );
  timers.slice().forEach((t) => t.fn());

  const parts = portfolioParts(context);
  assert.deepEqual(parts, [], 'removed drifting task must stay gone');
  assert.equal(vm.runInContext('driftEv', context), null);
  assert.equal(vm.runInContext('driftBreakTimer', context), null);
});

test('driftRemove then driftBreak does not resurrect a deleted task', () => {
  const { context, timers } = loadCalendarContext('collect');

  vm.runInContext('panelOpen = true; driftEv = EVENTS.find(e => e.id === 3);', context);
  vm.runInContext('driftRemove(); driftBreak();', context);
  timers.slice().forEach((t) => t.fn());

  assert.deepEqual(portfolioParts(context), []);
  assert.equal(vm.runInContext('EVENTS.some(e => e.id === 3)', context), false);
});

test('driftBreak still splits once when invoked a single time', () => {
  const { context, timers } = loadCalendarContext('collect');

  vm.runInContext('panelOpen = true; driftEv = EVENTS.find(e => e.id === 3);', context);
  vm.runInContext('driftBreak();', context);
  timers.filter((t) => t.ms === 220).forEach((t) => t.fn());

  const parts = portfolioParts(context);
  assert.equal(parts.length, 3);
  assert.deepEqual(
    parts.map((p) => p.title),
    ['Portfolio update (1/3)', 'Portfolio update (2/3)', 'Portfolio update (3/3)'],
  );
  assert.equal(vm.runInContext('EVENTS.some(e => e.id === 3)', context), false);
});

test('driftBreak ignores a second click before the split mutation runs', () => {
  const { context, timers } = loadCalendarContext('collect');

  vm.runInContext('panelOpen = true; driftEv = EVENTS.find(e => e.id === 3);', context);
  vm.runInContext('driftBreak(); driftBreak();', context);

  const splitTimers = timers.filter((t) => t.ms === 220);
  assert.equal(splitTimers.length, 1, 'only one deferred split should be scheduled');
  splitTimers.forEach((t) => t.fn());

  assert.equal(portfolioParts(context).length, 3);
});
