const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = readFileSync(join(__dirname, '..', 'index.html'), 'utf8');

function loadFunction(name) {
  const match = source.match(new RegExp(`function ${name}\\([^)]*\\)\\{[\\s\\S]*?\\n\\}`));
  assert.ok(match, `${name} should be declared`);
  return vm.runInNewContext(`(${match[0]})`);
}

test('event size classes preserve titles in constrained calendar blocks', () => {
  const eventSizeClass = loadFunction('eventSizeClass');

  assert.equal(eventSizeClass(0.5), ' compact');
  assert.equal(eventSizeClass(1), ' short');
  assert.equal(eventSizeClass(1.5), ' medium');
  assert.equal(eventSizeClass(2), '');

  assert.match(source, /\.cal-event\.compact>:not\(\.event-title\)\{display:none\}/);
  assert.match(source, /\.cal-event\.short \.event-deadline,[^{]+\{display:none\}/);
  assert.match(source, /\.cal-event\.medium \.import-source-badge\{display:none\}/);
});

test('normal and imported event builders apply duration-aware classes', () => {
  const uses = source.match(/eventSizeClass\(ev\.dur\)/g) || [];
  assert.equal(uses.length, 2);
  assert.match(source, /className='cal-event imported event-pop'\+eventSizeClass\(ev\.dur\)/);
});
