import assert from 'node:assert/strict';
import { readFileSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { test } from 'node:test';

const skillDir = resolve(import.meta.dirname);
const skill = readFileSync(join(skillDir, 'SKILL.md'), 'utf8');
const potetoMode = readFileSync(join(skillDir, '../poteto-mode/SKILL.md'), 'utf8');

test('global architecture skill declares an invocable name and explicit coverage', () => {
  assert.match(skill, /^---\nname: beauty-pageant-architecture\ndescription: .+\n---\n/);
  assert.doesNotMatch(skill, /disable-model-invocation: true/);
  for (const part of [
    'frontend', 'backend', 'backend-only', 'authorization', 'domain',
    'thin', 'Rust', 'SOLID', 'not verified', 'real request and response',
  ]) {
    assert.ok(skill.includes(part), `missing architecture check: ${part}`);
  }
});

test('Poteto Mode points to the skill for frontend and backend changes', () => {
  assert.match(potetoMode, /Frontend or backend application changes/);
  assert.match(potetoMode, /including backend-only changes/);
  assert.equal(realpathSync(join(skillDir, '../poteto-mode/../beauty-pageant-architecture/SKILL.md')), join(skillDir, 'SKILL.md'));
});
