import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const potetoDir = fileURLToPath(new URL('../skills/poteto-mode/', import.meta.url));
const skill = readFileSync(resolve(potetoDir, 'SKILL.md'), 'utf8');

test('poteto mode gives a resolvable path for every principle leaf', () => {
  assert.ok(skill.includes('leaf skills live at `../principle-*/SKILL.md`'), 'sibling leaf path guidance is missing');
  const principles = [...skill.matchAll(/\(\*\*(principle-[\w-]+)\*\*\)/g)].map((match) => match[1]);
  assert.ok(principles.length >= 20, 'principle entries were found');
  for (const principle of principles) {
    const leaf = resolve(potetoDir, '..', principle, 'SKILL.md');
    assert.ok(existsSync(leaf), `${principle} must resolve to ${leaf}`);
  }
});
