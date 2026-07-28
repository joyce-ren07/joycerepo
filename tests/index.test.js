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
          timers.push({ fn, ms });
          return timers.length;
        }
      : setTimeout;
  const context = {
    console,
    window: {},
    document,
    setTimeout: setTimeoutFn,
    clearTimeout,
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

test('driftBreak ignores a second click before the split mutation runs', () => {
  const { context, timers } = loadCalendarContext('collect');

  vm.runInContext('panelOpen = true; driftEv = EVENTS.find(e => e.id === 3);', context);
  assert.ok(vm.runInContext('driftEv', context));

  vm.runInContext('driftBreak(); driftBreak();', context);

  assert.equal(vm.runInContext('driftEv', context), null);
  const splitTimers = timers.filter((t) => t.ms === 220);
  assert.equal(splitTimers.length, 1, 'only one deferred split should be scheduled');

  splitTimers.forEach((t) => t.fn());
  timers.filter((t) => t.ms === 210).forEach((t) => t.fn());

  const parts = JSON.parse(
    JSON.stringify(
      vm.runInContext(
        'EVENTS.filter(e => String(e.title).startsWith("Portfolio update")).map(e => ({id:e.id,title:e.title,day:e.day,startH:e.startH}))',
        context,
      ),
    ),
  );

  assert.equal(parts.length, 3);
  assert.deepEqual(
    parts.map((p) => p.title),
    ['Portfolio update (1/3)', 'Portfolio update (2/3)', 'Portfolio update (3/3)'],
  );
  assert.equal(
    vm.runInContext('EVENTS.some(e => e.id === 3)', context),
    false,
  );
});

test('driftBreak still splits once when invoked a single time', () => {
  const { context, timers } = loadCalendarContext('collect');

  vm.runInContext('panelOpen = true; driftEv = EVENTS.find(e => e.id === 3);', context);
  vm.runInContext('driftBreak();', context);
  timers.filter((t) => t.ms === 220).forEach((t) => t.fn());

  const parts = JSON.parse(
    JSON.stringify(
      vm.runInContext(
        'EVENTS.filter(e => String(e.title).includes("(1/3)") || String(e.title).includes("(2/3)") || String(e.title).includes("(3/3)"))',
        context,
      ),
    ),
  );
  assert.equal(parts.length, 3);
});
