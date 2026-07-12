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
  vm.runInContext(`${scriptWithoutInit}\nthis.__calTestApi={deadlineForDriftSegment};`, context);
  return context.__calTestApi;
}

test('drift split keeps the original task deadline on every segment', () => {
  const { deadlineForDriftSegment } = loadCalendarScript();
  const overdueTask = {
    title: 'Portfolio update',
    deadline: { day: 1, hour: 9 },
  };

  const segmentDeadlines = [1, 2, 3].map(day => deadlineForDriftSegment(overdueTask, day));

  assert.deepEqual(segmentDeadlines, [
    { day: 1, hour: 9 },
    { day: 1, hour: 9 },
    { day: 1, hour: 9 },
  ]);
});

test('drift split assigns per-segment fallback deadlines when no original deadline exists', () => {
  const { deadlineForDriftSegment } = loadCalendarScript();
  const taskWithoutDeadline = { title: 'Open-ended cleanup' };

  assert.deepEqual(deadlineForDriftSegment(taskWithoutDeadline, 2), { day: 2, hour: 17 });
});
