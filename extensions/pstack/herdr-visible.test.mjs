import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runChildVisible } from './index.ts';

const agent = {
  name: 'poteto-agent', description: 'Test agent', systemPrompt: 'Return a result.',
  source: 'bundled', filePath: 'test.md',
};
const task = { agent: 'poteto-agent', task: 'Return the verified result.' };

function fixture(options = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'pstack-herdr-'));
  const bin = path.join(root, 'bin');
  mkdirSync(bin);
  const session = path.join(root, 'session.jsonl');
  writeFileSync(session, JSON.stringify({ type: 'message', message: {
    role: 'assistant', content: [{ type: 'text', text: 'verified result' }],
  } }) + '\n');
  const log = path.join(root, 'calls.jsonl');
  writeFileSync(path.join(bin, 'herdr'), `#!/usr/bin/env node
const { appendFileSync, readFileSync } = require('node:fs');
const args = process.argv.slice(2);
appendFileSync(process.env.HERDR_TEST_LOG, JSON.stringify(args) + '\\n');
let result = { accepted: true };
if (args[0] === 'pane' && args[1] === 'split') result = { pane: { pane_id: 'w9:p2' } };
if (args[0] === 'agent' && args[1] === 'start') result = { agent: { agent_status: 'idle', agent_session: { value: process.env.HERDR_TEST_SESSION } } };
if (args[0] === 'agent' && args[1] === 'get') {
  const gets = readFileSync(process.env.HERDR_TEST_LOG, 'utf8').split('\\n').filter(x => x.includes('"get"')).length;
  result = { agent: { pane_id: 'w9:p2', terminal_id: gets > 1 && process.env.HERDR_TEST_REPLACEMENT ? 'replacement' : 'terminal-2', agent_status: gets > 1 ? (process.env.HERDR_TEST_STATUS || 'idle') : 'idle', state_change_seq: gets > 1 ? 4 : 1 } };
}
if (args[0] === 'agent' && args[1] === 'prompt' && process.env.HERDR_TEST_PROMPT_FAIL) {
  process.stderr.write('timeout: submission outcome unknown');
  process.exit(1);
}
if (args[0] === 'pane' && args[1] === 'process-info') result = { process_info: { foreground_processes: [{ name: process.env.HERDR_TEST_FOREGROUND || 'pi' }] } };
process.stdout.write(JSON.stringify({ result }));
`, { mode: 0o755 });
  const old = {
    PATH: process.env.PATH, HERDR_TEST_LOG: process.env.HERDR_TEST_LOG,
    HERDR_TEST_SESSION: process.env.HERDR_TEST_SESSION, HERDR_TEST_STATUS: process.env.HERDR_TEST_STATUS,
    HERDR_TEST_FOREGROUND: process.env.HERDR_TEST_FOREGROUND,
    HERDR_TEST_PROMPT_FAIL: process.env.HERDR_TEST_PROMPT_FAIL,
    HERDR_TEST_REPLACEMENT: process.env.HERDR_TEST_REPLACEMENT,
  };
  process.env.PATH = `${bin}:${old.PATH}`;
  process.env.HERDR_TEST_LOG = log;
  process.env.HERDR_TEST_SESSION = session;
  for (const [key, value] of Object.entries(options)) process.env[`HERDR_TEST_${key}`] = value;
  return {
    calls: () => readFileSync(log, 'utf8').trim().split('\n').map(JSON.parse),
    cleanup() {
      for (const [key, value] of Object.entries(old)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      rmSync(root, { recursive: true, force: true });
    },
  };
}

test('successful visible subagent result closes its owned pane', async () => {
  const env = fixture();
  try {
    const result = await runChildVisible(agent, task, undefined, tmpdir(), undefined);
    assert.equal(result.exitCode, 0);
    assert.deepEqual(result.messages, [{ role: 'assistant', content: [{ type: 'text', text: 'verified result' }] }]);
    const closes = env.calls().filter(([group, action]) => group === 'pane' && action === 'close');
    assert.deepEqual(closes, [['pane', 'close', 'w9:p2']]);
    assert.match(env.calls().find(([group, action]) => group === 'agent' && action === 'start')[2], /^psub-/);
  } finally {
    env.cleanup();
  }
});

test('uncertain prompt failure preserves its child pane and reports the pane ID', async () => {
  const env = fixture({ PROMPT_FAIL: '1' });
  try {
    const result = await runChildVisible(agent, task, undefined, tmpdir(), undefined);
    assert.equal(result.exitCode, 1);
    assert.match(result.stderr, /w9:p2/);
    assert.deepEqual(env.calls().filter(([group, action]) => group === 'pane' && action === 'close'), []);
  } finally {
    env.cleanup();
  }
});

test('blocked agent is not reported as a completed subagent or closed', async () => {
  const env = fixture({ STATUS: 'blocked' });
  try {
    const result = await runChildVisible(agent, task, undefined, tmpdir(), undefined);
    assert.equal(result.exitCode, 1);
    assert.match(result.stderr, /w9:p2/);
    assert.deepEqual(env.calls().filter(([group, action]) => group === 'pane' && action === 'close'), []);
  } finally {
    env.cleanup();
  }
});

test('replaced agent identity prevents closing the pane', async () => {
  const env = fixture({ REPLACEMENT: '1' });
  try {
    const result = await runChildVisible(agent, task, undefined, tmpdir(), undefined);
    assert.equal(result.exitCode, 1);
    assert.deepEqual(env.calls().filter(([group, action]) => group === 'pane' && action === 'close'), []);
  } finally {
    env.cleanup();
  }
});

test('foreground work preserves the pane and reports deferred cleanup with the result', async () => {
  const env = fixture({ FOREGROUND: 'bash' });
  try {
    const result = await runChildVisible(agent, task, undefined, tmpdir(), undefined);
    assert.equal(result.exitCode, 0);
    assert.deepEqual(result.pane, { kind: 'left-open', id: 'w9:p2', reason: 'foreground process is not only Pi' });
    assert.deepEqual(env.calls().filter(([group, action]) => group === 'pane' && action === 'close'), []);
  } finally {
    env.cleanup();
  }
});
