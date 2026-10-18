import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import registerPstack, { runChildVisible } from './index.ts';

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
  writeFileSync(session, options.EMPTY_SESSION ? '' : JSON.stringify({ type: 'message', message: {
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
if (args[0] === 'agent' && args[1] === 'prompt' && process.env.HERDR_TEST_PROMPT_DELAY) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Number(process.env.HERDR_TEST_PROMPT_DELAY));
}
if (args[0] === 'agent' && args[1] === 'prompt' && process.env.HERDR_TEST_PROMPT_FAIL) {
  process.stderr.write('timeout: submission outcome unknown');
  process.exit(1);
}
if (args[0] === 'agent' && args[1] === 'read' && process.env.HERDR_TEST_EMPTY_SESSION) process.exit(0);
if (args[0] === 'pane' && args[1] === 'process-info') result = { process_info: { foreground_processes: [{ name: process.env.HERDR_TEST_FOREGROUND || 'pi' }] } };
if (args[0] === 'pane' && args[1] === 'close' && process.env.HERDR_TEST_CLOSE_FAIL) {
  process.stderr.write('close response unavailable');
  process.exit(1);
}
process.stdout.write(JSON.stringify({ result }));
`, { mode: 0o755 });
  const old = {
    PATH: process.env.PATH, HERDR_ENV: process.env.HERDR_ENV, HERDR_TEST_LOG: process.env.HERDR_TEST_LOG,
    HERDR_TEST_SESSION: process.env.HERDR_TEST_SESSION, HERDR_TEST_STATUS: process.env.HERDR_TEST_STATUS,
    HERDR_TEST_FOREGROUND: process.env.HERDR_TEST_FOREGROUND,
    HERDR_TEST_PROMPT_FAIL: process.env.HERDR_TEST_PROMPT_FAIL,
    HERDR_TEST_REPLACEMENT: process.env.HERDR_TEST_REPLACEMENT,
    HERDR_TEST_PROMPT_DELAY: process.env.HERDR_TEST_PROMPT_DELAY,
    HERDR_TEST_CLOSE_FAIL: process.env.HERDR_TEST_CLOSE_FAIL,
    HERDR_TEST_EMPTY_SESSION: process.env.HERDR_TEST_EMPTY_SESSION,
  };
  process.env.PATH = `${bin}:${old.PATH}`;
  process.env.HERDR_ENV = '1';
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

function tool() {
  const registered = new Map();
  registerPstack({
    on() {}, registerCommand() {}, registerTool(definition) { registered.set(definition.name, definition); },
  });
  return registered.get('subagent');
}

const ctx = { cwd: tmpdir(), model: undefined, hasUI: false };

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

test('the registered subagent tool returns a result for each mode and closes its pane', async () => {
  for (const [params, mode] of [
    [{ agent: 'poteto-agent', task: 'Reply.' }, 'single'],
    [{ tasks: [{ agent: 'poteto-agent', task: 'Reply.' }] }, 'parallel'],
    [{ chain: [{ agent: 'poteto-agent', task: 'Reply.' }] }, 'chain'],
  ]) {
    const env = fixture();
    try {
      const result = await tool().execute('test', params, undefined, undefined, ctx);
      assert.equal(result.details.mode, mode);
      assert.equal(result.details.results[0].pane.kind, 'closed');
      assert.match(result.content[0].text, /verified result/);
      assert.deepEqual(env.calls().filter(([group, action]) => group === 'pane' && action === 'close'),
        [['pane', 'close', 'w9:p2']]);
    } finally {
      env.cleanup();
    }
  }
});

test('the registered subagent tool reports the pane when a completed result cannot be closed', async () => {
  const env = fixture({ FOREGROUND: 'bash' });
  try {
    const result = await tool().execute('test', { agent: 'poteto-agent', task: 'Reply.' }, undefined, undefined, ctx);
    assert.match(result.content[0].text, /Pane w9:p2: foreground process is not only Pi; left-open/);
    assert.deepEqual(env.calls().filter(([group, action]) => group === 'pane' && action === 'close'), []);
  } finally {
    env.cleanup();
  }
});

test('abort during a submitted prompt leaves the child pane and does not claim a result', async () => {
  const env = fixture({ PROMPT_DELAY: '150' });
  const controller = new AbortController();
  try {
    const pending = runChildVisible(agent, task, undefined, tmpdir(), controller.signal);
    setTimeout(() => controller.abort(), 100);
    const result = await pending;
    assert.equal(result.exitCode, 1);
    assert.match(result.stderr, /w9:p2/);
    assert.deepEqual(env.calls().filter(([group, action]) => group === 'pane' && action === 'close'), []);
  } finally {
    env.cleanup();
  }
});

test('an empty session is not a completed result and does not close the child', async () => {
  const env = fixture({ EMPTY_SESSION: '1' });
  try {
    const result = await runChildVisible(agent, task, undefined, tmpdir(), undefined);
    assert.equal(result.exitCode, 1);
    assert.match(result.stderr, /no completed result/);
    assert.deepEqual(env.calls().filter(([group, action]) => group === 'pane' && action === 'close'), []);
  } finally {
    env.cleanup();
  }
});

test('an unconfirmed close is surfaced without retrying a possibly applied close', async () => {
  const env = fixture({ CLOSE_FAIL: '1' });
  try {
    const result = await runChildVisible(agent, task, undefined, tmpdir(), undefined);
    assert.equal(result.exitCode, 0);
    assert.deepEqual(result.pane, { kind: 'uncertain', id: 'w9:p2', reason: 'pane close was not confirmed' });
    assert.equal(env.calls().filter(([group, action]) => group === 'pane' && action === 'close').length, 1);
  } finally {
    env.cleanup();
  }
});
