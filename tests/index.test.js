const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function loadScheduler() {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1].replace(
    'buildMiniCal();buildSidebarLoad();buildWeekHeader();buildWeekGrid();',
    '',
  );
  const context = { console, window: {} };
  vm.createContext(context);
  vm.runInContext(
    `${script}
      this.__importScheduler = {
        assignImportSlots,
        importSlotIsAvailable,
        slots: IMPORT_SLOT_POOL,
      };`,
    context,
  );
  return context;
}

test('import availability rejects calendar and wellbeing conflicts', () => {
  const context = loadScheduler();

  assert.equal(
    vm.runInContext('__importScheduler.importSlotIsAvailable(2, 9, 1.5)', context),
    false,
    'the interval overlaps the existing 10 AM event',
  );
  assert.equal(
    vm.runInContext('__importScheduler.importSlotIsAvailable(3, 12, 1)', context),
    false,
    'the interval overlaps the 12:30 PM wellbeing block',
  );
  assert.equal(
    vm.runInContext('__importScheduler.importSlotIsAvailable(3, 10, 1)', context),
    true,
  );
});

test('import scheduler leaves tasks unscheduled when every candidate is occupied', () => {
  const context = loadScheduler();
  vm.runInContext(
    `__importScheduler.slots.forEach((slot, i) => {
      EVENTS.push({
        id: 1000 + i,
        day: slot.day,
        startH: slot.startH,
        dur: 2,
      });
    });`,
    context,
  );

  const assignments = JSON.parse(
    vm.runInContext(
      `JSON.stringify(__importScheduler.assignImportSlots([
        { id: 'new', name: 'Imported task', due: null, priority: 'high' },
      ]))`,
      context,
    ),
  );

  assert.deepEqual(assignments, []);
});
