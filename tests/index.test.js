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
        saveOptimizedEvent,
        events: EVENTS,
      };`,
    context,
  );

  return context.__scheduler;
}

test('rescheduling replaces the original event without changing its deadline', () => {
  const { events, saveOptimizedEvent } = loadScheduler();
  const original = events.find(event => event.id === 3);
  const originalCount = events.length;
  const originalDeadline = JSON.parse(JSON.stringify(original.deadline));

  const wasRescheduled = saveOptimizedEvent({
    title: original.title,
    day: 3,
    startH: 10,
    dur: 1,
    color: '#1a73e8',
    bg: '#e8f0fe',
    effort: '1h',
    priority: 'high',
    likelihood: 'high',
    type: 'deep',
    done: false,
    drift: false,
    driftCount: 0,
    deadline: { day: 3, hour: 23 },
  }, original.id);

  assert.equal(wasRescheduled, true);
  assert.equal(events.length, originalCount);
  assert.equal(events.filter(event => event.title === original.title).length, 1);

  const moved = events.find(event => event.id === original.id);
  assert.equal(moved.day, 3);
  assert.equal(moved.startH, 10);
  assert.equal(moved.drift, false);
  assert.deepEqual(JSON.parse(JSON.stringify(moved.deadline)), originalDeadline);
});

test('optimizing a new task still appends a new event', () => {
  const { events, saveOptimizedEvent } = loadScheduler();
  const originalCount = events.length;

  const wasRescheduled = saveOptimizedEvent({
    title: 'New task',
    day: 4,
    startH: 14,
    dur: 1,
    color: '#1a73e8',
    bg: '#e8f0fe',
    effort: '1h',
    priority: 'med',
    likelihood: 'med',
    type: 'deep',
    done: false,
    drift: false,
    driftCount: 0,
    deadline: { day: 5, hour: 17 },
  });

  assert.equal(wasRescheduled, false);
  assert.equal(events.length, originalCount + 1);
  assert.equal(events.at(-1).title, 'New task');
});
