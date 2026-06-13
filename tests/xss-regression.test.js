const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

const helperMatch = html.match(/function escHtml\(value\)\{\n[\s\S]*?\n\}/);
assert(helperMatch, 'escHtml helper should be present');

const sandbox = { result: null };
vm.createContext(sandbox);
vm.runInContext(`${helperMatch[0]}\nresult=escHtml('<img src=x onerror=alert(1)>&"\\'');`, sandbox);
assert.strictEqual(
  sandbox.result,
  '&lt;img src=x onerror=alert(1)&gt;&amp;&quot;&#39;',
  'escHtml should encode HTML metacharacters in task names',
);

[
  /\$\{escHtml\(ev\.title\)\}/,
  /\$\{escHtml\(a\.task\.name\)\}/,
  /\$\{escHtml\(t\.name\)\}/,
  /\$\{escHtml\(p\.name\)\}/,
  /\$\{escHtml\(ev\.source\)\}/,
].forEach(pattern => {
  assert(pattern.test(html), `Expected escaped rendering pattern ${pattern}`);
});

[
  /\$\{ev\.title\}/,
  /\$\{a\.task\.name\}/,
  /\$\{t\.name\}/,
  /\$\{p\.name\}/,
  /\$\{ev\.source\}/,
  /openAddTask\('\$\{ev\.title\}'\)/,
].forEach(pattern => {
  assert(!pattern.test(html), `Found unsafe unescaped rendering pattern ${pattern}`);
});

console.log('XSS regression checks passed');
