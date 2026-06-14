const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function createElement() {
  return {
    children: [],
    className: '',
    style: {},
    textContent: '',
    classList: {
      add() {},
      remove() {},
      toggle() {},
    },
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    addEventListener() {},
    set innerHTML(value) {
      this._innerHTML = String(value);
      this.children = [];
    },
    get innerHTML() {
      return this._innerHTML || '';
    },
  };
}

function loadApp() {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const scriptMatch = html.match(/<script>([\s\S]*)<\/script>/);
  assert.ok(scriptMatch, 'index.html should contain an inline script');

  const elements = new Map();
  const document = {
    createElement,
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, createElement());
      return elements.get(id);
    },
    querySelectorAll() {
      return [];
    },
  };

  const context = {
    console,
    document,
    setTimeout() {
      return 0;
    },
    clearTimeout() {},
    requestAnimationFrame(fn) {
      fn();
    },
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(scriptMatch[1], context);
  return { context, elements };
}

function run(context, source) {
  return vm.runInContext(source, context);
}

test('task titles are escaped before calendar and panel HTML rendering', () => {
  const { context, elements } = loadApp();
  const payload = '<img src=x onerror="alert(1)">';
  const eventLiteral = JSON.stringify({
    id: 999,
    title: payload,
    day: 2,
    startH: 9,
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
    deadline: { day: 4, hour: 17 },
  });

  const calendarHtml = run(context, `buildEventEl(${eventLiteral}).innerHTML`);
  assert.match(calendarHtml, /&lt;img src=x/);
  assert.doesNotMatch(calendarHtml, /<img src=x/);

  run(context, `showEventPanel(${eventLiteral})`);
  const panelHtml = elements.get('right-panel').innerHTML;
  assert.match(panelHtml, /&lt;img src=x/);
  assert.doesNotMatch(panelHtml, /<img src=x/);
  assert.doesNotMatch(panelHtml, /onclick="openAddTask\('<img/);
});

test('import task names are escaped in review and confirmation HTML', () => {
  const { context, elements } = loadApp();
  const taskId = 'x" onclick="alert(1)';
  const taskName = '<svg onload="alert(1)"></svg>';

  run(
    context,
    `
      importPlatform = 'apple';
      importTasks = [{id:${JSON.stringify(taskId)},name:${JSON.stringify(taskName)},due:'Apr 10',priority:'high'}];
      importChecked = new Set([${JSON.stringify(taskId)}]);
      updateImportStep2();
    `,
  );

  const reviewHtml = elements.get('import-modal-inner').innerHTML;
  assert.match(reviewHtml, /&lt;svg onload=/);
  assert.doesNotMatch(reviewHtml, /<svg onload=/);
  assert.doesNotMatch(reviewHtml, /onclick="toggleImportTask\('x" onclick=/);

  run(
    context,
    `
      const assignments = assignImportSlots(importTasks);
      openPanel(\`
        <div>
          \${assignments.map((a,i)=>\`
            <div class="import-queue-item">
              <div class="import-queue-num">\${i+1}</div>
              <div><div class="import-queue-name">\${escapeHtml(a.task.name)}</div></div>
            </div>\`).join('')}
        </div>\`);
    `,
  );
  const queueHtml = elements.get('right-panel').innerHTML;
  assert.match(queueHtml, /&lt;svg onload=/);
  assert.doesNotMatch(queueHtml, /<svg onload=/);
});

test('import due-date parsing handles multi-digit April dates', () => {
  const { context } = loadApp();

  assert.deepEqual(
    JSON.parse(run(context, `JSON.stringify(parseDueToDeadline('Apr 10', 0))`)),
    { day: 4, hour: 17 },
  );
  assert.deepEqual(
    JSON.parse(run(context, `JSON.stringify(parseDueToDeadline('Apr 12', 0))`)),
    { day: 6, hour: 17 },
  );
  assert.equal(run(context, `fmtDeadlineLine(parseDueToDeadline('Apr 15', 0))`), 'Due Apr 15 5 PM');
});

test('import slot labels match the stored calendar day', () => {
  const { context } = loadApp();

  const mismatches = JSON.parse(
    run(context, `JSON.stringify(IMPORT_SLOT_POOL.filter(s => s.label !== importSlotLabel(s.day, s.startH)))`),
  );
  assert.deepEqual(mismatches, []);
  assert.equal(run(context, `IMPORT_SLOT_POOL.find(s => s.day === 1 && s.startH === 11).label`), 'Mon Apr 7, 11 AM');
});
