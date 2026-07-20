const assert = require('node:assert/strict');
const { mkdtempSync, mkdirSync, readFileSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

test('restores the SSH remote when a token-authenticated push fails', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'device-flow-push-'));
  const binDir = join(tempDir, 'bin');
  const gitLog = join(tempDir, 'git.log');
  const fakeGit = join(binDir, 'git');
  mkdirSync(binDir);
  writeFileSync(fakeGit, `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$GIT_LOG"
if [[ "$1" == "push" ]]; then
  exit 17
fi
`, { mode: 0o755 });

  const script = resolve(__dirname, '../scripts/device-flow-push.sh');
  const result = spawnSync('bash', [script], {
    encoding: 'utf8',
    env: {
      ...process.env,
      GH_TOKEN: 'test-token',
      GIT_LOG: gitLog,
      PATH: `${binDir}:${process.env.PATH}`,
    },
  });

  assert.equal(result.status, 17);
  assert.deepEqual(readFileSync(gitLog, 'utf8').trim().split('\n'), [
    'remote set-url origin https://joyce-ren07:test-token@github.com/joyce-ren07/joycerepo.git',
    'push -u origin main',
    `-C ${resolve(__dirname, '..')} remote set-url origin git@github.com:joyce-ren07/joycerepo.git`,
  ]);
});
