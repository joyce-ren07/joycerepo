const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const vm = require('node:vm');

function loadDriftSplitApi() {
  const html = readFileSync(new URL('../index.html', `file://${__filename}`), 'utf8');
  const [, script] = html.match(/<script>([\s\S]*)<\/script>/);
  const scriptWithoutInit = script.replace(
    /buildMiniCal\(\);buildSidebarLoad\(\);buildWeekHeader\(\);buildWeekGrid\(\);\s*$/,
    ''
  );
  const context = { console, window: {} };
  vm.createContext(context);
  vm.runInContext(
    `${scriptWithoutInit}
      this.__api = {
        findDriftSplitSlots,
        driftIntervalFree,
        EVENTS,
        WB_BLOCKS,
        TODAY_DAY,
        TODAY_NOW_H,
      };`,
    context
  );
  return context.__api;
}

function fromVm(value) {
  return JSON.parse(JSON.stringify(value));
}

function overlaps(a, b) {
  return a.day === b.day && a.startH < b.startH + b.dur && b.startH < a.startH + a.dur;
}

test('drift split slots are in the future and conflict-free for the seeded Portfolio task', () => {
  const { findDriftSplitSlots, EVENTS, WB_BLOCKS, TODAY_DAY, TODAY_NOW_H } = loadDriftSplitApi();
  const portfolio = [...EVENTS].find(e => e.title === 'Portfolio update');
  assert.ok(portfolio, 'seed data includes Portfolio update');

  const slots = fromVm(findDriftSplitSlots(portfolio.id, 3, 0.67));
  const nowAbs = TODAY_DAY * 24 + TODAY_NOW_H;

  assert.equal(slots.length, 3);
  for (const slot of slots) {
    assert.ok(slot.day * 24 + slot.startH >= nowAbs - 1e-6, 'slot must not be in the past');
    const eventHit = fromVm([...EVENTS]).filter(
      e => e.id !== portfolio.id && overlaps(slot, e)
    );
    const wbHit = fromVm([...WB_BLOCKS]).filter(b => overlaps(slot, b));
    assert.deepEqual(eventHit, [], `slot day=${slot.day} start=${slot.startH} overlaps events`);
    assert.deepEqual(wbHit, [], `slot day=${slot.day} start=${slot.startH} overlaps wellbeing`);
  }

  // Slots within the batch must not overlap each other either
  for (let i = 0; i < slots.length; i++) {
    for (let j = i + 1; j < slots.length; j++) {
      assert.equal(overlaps(slots[i], slots[j]), false, 'batch slots must not overlap');
    }
  }

  // Hardcoded Mon 9 / Tue 10 from the old implementation must not reappear
  assert.equal(
    slots.some(s => s.day === 1 && s.startH === 9),
    false,
    'must not schedule the past Monday 9 AM fragment'
  );
  assert.equal(
    slots.some(s => s.day === 2 && s.startH === 10),
    false,
    'must not double-book Tuesday 10 AM over Read: Chen et al. paper'
  );
});

test('drift split finds no slots when the rest of the week is fully blocked', () => {
  const { findDriftSplitSlots, EVENTS, driftIntervalFree, TODAY_DAY, TODAY_NOW_H } = loadDriftSplitApi();

  // Saturate every candidate hour on remaining days
  const startHours = [9, 10, 11, 14, 15, 16];
  let id = 1000;
  for (let day = TODAY_DAY; day <= 6; day++) {
    for (const startH of startHours) {
      if (day * 24 + startH < TODAY_DAY * 24 + TODAY_NOW_H - 1e-6) continue;
      EVENTS.push({ id: id++, day, startH, dur: 0.67, title: `Block ${day}-${startH}` });
    }
  }

  const slots = fromVm(findDriftSplitSlots(3, 3, 0.67));
  assert.equal(slots.length, 0);
  assert.equal(driftIntervalFree(TODAY_DAY, 20, 0.67, 3, []), true);
});
