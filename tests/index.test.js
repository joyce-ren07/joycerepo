const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

function extractFunction(name) {
  const start = html.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} should exist`);

  const bodyStart = html.indexOf('{', start);
  let depth = 0;
  for (let i = bodyStart; i < html.length; i++) {
    if (html[i] === '{') depth++;
    if (html[i] === '}' && --depth === 0) return html.slice(start, i + 1);
  }
  throw new Error(`Could not extract ${name}`);
}

function makePanelHarness() {
  const timers = [];
  const panel = {
    style: { border: 'none' },
    classList: {
      classes: new Set(),
      add(name) { this.classes.add(name); },
      remove(name) { this.classes.delete(name); },
      contains(name) { return this.classes.has(name); },
    },
    innerHTML: '',
  };

  const context = {
    panelOpen: false,
    panelCloseTimer: null,
    clearTimeout(id) {
      const idx = timers.findIndex(t => t.id === id);
      if (idx >= 0) timers[idx].cleared = true;
    },
    setTimeout(fn, ms) {
      const id = timers.length + 1;
      timers.push({ id, fn, ms, cleared: false });
      return id;
    },
    document: {
      getElementById(id) {
        assert.equal(id, 'right-panel');
        return panel;
      },
    },
    timers,
    panel,
  };

  vm.runInNewContext(
    `${extractFunction('openPanel')}\n${extractFunction('closePanel')}\nopenPanelFn=openPanel;\nclosePanelFn=closePanel;`,
    context,
  );

  return context;
}

test('runOptimize captures the panel delay before switching views', () => {
  const fn = extractFunction('runOptimize');
  assert.match(fn, /const optimizeDelay=view==='cal'\?80:300;/);
  assert.match(fn, /if\(view!=='cal'\) switchView\('cal'\);/);
  assert.match(fn, /\},optimizeDelay\);/);
  assert.doesNotMatch(fn, /\},view==='cal'\?80:300\);/);
});

test('openPanel cancels a pending close so optimize content is not wiped', () => {
  const ctx = makePanelHarness();

  ctx.openPanelFn('event-A');
  ctx.closePanelFn();
  ctx.openPanelFn('smart-scheduling');

  assert.equal(ctx.panel.innerHTML, 'smart-scheduling');
  assert.equal(ctx.panel.classList.contains('open'), true);
  assert.equal(ctx.panelOpen, true);

  const pending = ctx.timers.filter(t => !t.cleared);
  assert.equal(pending.length, 0);

  // Any previously scheduled closes must not fire and wipe content.
  for (const t of ctx.timers) {
    if (!t.cleared) t.fn();
  }

  assert.equal(ctx.panel.innerHTML, 'smart-scheduling');
  assert.equal(ctx.panel.classList.contains('open'), true);
  assert.equal(ctx.panelOpen, true);
});

test('closePanel still clears the panel when it is not reopened', () => {
  const ctx = makePanelHarness();

  ctx.openPanelFn('event-A');
  ctx.closePanelFn();

  assert.equal(ctx.panel.classList.contains('open'), false);

  const pending = ctx.timers.filter(t => !t.cleared);
  assert.equal(pending.length, 1);
  assert.equal(pending[0].ms, 210);

  pending[0].fn();

  assert.equal(ctx.panel.innerHTML, '');
  assert.equal(ctx.panel.style.border, 'none');
  assert.equal(ctx.panelOpen, false);
  assert.equal(ctx.panelCloseTimer, null);
});
