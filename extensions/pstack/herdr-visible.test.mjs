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

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'pstack-herdr-'));
  const bin = path.join(root, 'bin');
  mkdirSync(bin);
  const session = path.join(root, 'session.jsonl');
  writeFileSync(session, JSON.stringify({ type: 'message', message: {
    role: 'assistant', content: [{ type: 'text', text: 'verified result' }],
  } }) + '\n');
  const log = path.join(root, 'calls.jsonl');
  writeFileSync(path.join(bin, 'herdr'), `#!/usr/bin/env node
const { appendFileSync } = require('node:fs');
const args = process.argv.slice(2);
appendFileSync(process.env.HERDR_TEST_LOG, JSON.stringify(args) + '\\n');
let result = { accepted: true };
if (args[0] === 'pane' && args[1] === 'split') result = { pane: { pane_id: 'w9:p2' } };
if (args[0] === 'agent' && args[1] === 'start') result = { agent: { agent_status: 'idle', agent_session: { value: process.env.HERDR_TEST_SESSION } } };
if (args[0] === 'agent' && args[1] === 'list') result = { agents: [{ name: args[2], pane_id: 'w9:p2', terminal_id: 'terminal-2', agent_status: process.env.HERDR_TEST_STATUS || 'idle', state_change_seq: 4 }] };
if (args[0] === 'pane' && args[1] === 'process-info') result = { process_info: { foreground_processes: [{ name: 'pi' }] } };
process.stdout.write(JSON.stringify({ result }));
`, { mode: 0o755 });
  const old = {
    PATH: process.env.PATH, HERDR_TEST_LOG: process.env.HERDR_TEST_LOG,
    HERDR_TEST_SESSION: process.env.HERDR_TEST_SESSION, HERDR_TEST_STATUS: process.env.HERDR_TEST_STATUS,
  };
  process.env.PATH = `${bin}:${old.PATH}`;
  process.env.HERDR_TEST_LOG = log;
  process.env.HERDR_TEST_SESSION = session;
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
  } finally {
    env.cleanup();
  }
});
