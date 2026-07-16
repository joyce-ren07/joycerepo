const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const vm = require('node:vm');

function loadScheduler() {
  const html = readFileSync(new URL('../index.html', `file://${__filename}`), 'utf8');
  const [, script] = html.match(/<script>([\s\S]*)<\/script>/);
  const scriptWithoutInit = script.replace(
    /buildMiniCal\(\);buildSidebarLoad\(\);buildWeekHeader\(\);buildWeekGrid\(\);\s*$/,
    '',
  );
  const context = vm.createContext({ console, window: {} });

  vm.runInContext(
    `${scriptWithoutInit}
      this.__scheduler = {
        buildOptimizeSlots,
        slotIsAvailable,
        now: TODAY_DAY * 24 + TODAY_NOW_H,
      };`,
    context,
  );

  return context.__scheduler;
}

test('optimizer excludes elapsed and occupied candidate windows', () => {
  const { buildOptimizeSlots, slotIsAvailable, now } = loadScheduler();
  const slots = JSON.parse(JSON.stringify(buildOptimizeSlots(1, { day: 3, hour: 23 })));

  assert.equal(slots.length, 3);
  assert.equal(
    slots.some(slot => slot.day === 3 && slot.startH === 9),
    false,
    'the Wednesday 9 AM candidate overlaps an existing event',
  );
  assert.equal(
    slots.some(slot => slot.day * 24 + slot.startH < now),
    false,
    'the optimizer must not recommend elapsed windows',
  );
  assert.equal(
    slots.every(slot => slotIsAvailable(slot.day, slot.startH, 1)),
    true,
    'every recommendation must be free of event and wellbeing conflicts',
  );
});

test('optimizer treats wellbeing blocks as unavailable', () => {
  const { slotIsAvailable } = loadScheduler();

  assert.equal(slotIsAvailable(1, 11, 2), false);
  assert.equal(slotIsAvailable(5, 10, 2), true);
});
