const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const vm = require('node:vm');

function loadCalendarScript() {
  const html = readFileSync(new URL('../index.html', `file://${__filename}`), 'utf8');
  const [, script] = html.match(/<script>([\s\S]*)<\/script>/);
  const scriptWithoutInit = script.replace(
    /buildMiniCal\(\);buildSidebarLoad\(\);buildWeekHeader\(\);buildWeekGrid\(\);\s*$/,
    ''
  );
  const context = {
    console,
    window: {},
  };

  vm.createContext(context);
  vm.runInContext(`${scriptWithoutInit}\nthis.__calTestApi={assignImportSlots,parseDueToDeadline};`, context);
  return context.__calTestApi;
}

test('import scheduler does not assign selected tasks to elapsed slots', () => {
  const { assignImportSlots } = loadCalendarScript();
  const googleTasks = [
    { id: 'g1', name: 'Submit housing application', due: 'Apr 15', priority: 'high' },
    { id: 'g2', name: 'Update LinkedIn profile', due: null, priority: 'none' },
    { id: 'g3', name: 'Draft cover letter - Google internship', due: 'May 1', priority: 'high' },
    { id: 'g4', name: 'Schedule dentist appointment', due: null, priority: 'none' },
    { id: 'g5', name: 'Review midterm feedback', due: 'Apr 10', priority: 'med' },
    { id: 'g6', name: 'Buy birthday gift for roommate', due: 'Apr 13', priority: 'none' },
    { id: 'g7', name: 'Finish data structures homework', due: 'Apr 11', priority: 'high' },
    { id: 'g8', name: 'Respond to study group Slack', due: null, priority: 'none' },
  ];
  const nowAbs = 2 * 24 + 9 + 25 / 60;

  const pastAssignments = assignImportSlots(googleTasks).filter(
    a => a.slot.day * 24 + a.slot.startH < nowAbs - 0.01
  );

  assert.deepEqual(pastAssignments, []);
});

test('import slot labels match the actual assigned calendar day', () => {
  const { assignImportSlots } = loadCalendarScript();
  const [assignment] = assignImportSlots([
    { id: 'due-apr-9', name: 'Due Apr 9 task', due: 'Apr 9', priority: 'med' },
  ]);

  assert.equal(assignment.slot.day, 3);
  assert.match(assignment.slot.label, /^Wed Apr 9,/);
});

test('non-April due dates are treated as outside the visible week', () => {
  const { parseDueToDeadline } = loadCalendarScript();

  assert.deepEqual(parseDueToDeadline('May 1', 0), { day: 6, hour: 17 });
});
