import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

const helperMatch = html.match(/function escHtml\(value\)\{[^\n]+\}\nfunction jsSingleQuotedAttr\(value\)\{[^\n]+\}/);
assert.ok(helperMatch, 'escaping helpers should be present');

const context = {};
vm.runInNewContext(`${helperMatch[0]}; result = {
  escapedHtml: escHtml('<img src=x onerror=alert(1)>&"\\''),
  escapedAttr: jsSingleQuotedAttr("bad'id\\n<img>")
};`, context);

assert.equal(
  context.result.escapedHtml,
  '&lt;img src=x onerror=alert(1)&gt;&amp;&quot;&#39;',
);
assert.equal(context.result.escapedAttr, 'bad\\&#39;id\\n&lt;img&gt;');

assert.match(html, /<div class="event-title">\$\{escHtml\(ev\.title\)\}<\/div>/);
assert.doesNotMatch(html, /<div class="event-title">\$\{ev\.title\}<\/div>/);
assert.doesNotMatch(html, /onclick="openAddTask\('\$\{ev\.title\}'\)"/);
