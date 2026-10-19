import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const skill = readFileSync(new URL('./SKILL.md', import.meta.url), 'utf8');

test('source searches discover each candidate path before reading or rg', () => {
  assert.ok(/Before (?:reading|searching).*candidate.*repository_discover/.test(skill), 'missing path discovery preflight');
  assert.ok(/(?:read|rg).*returned path/.test(skill), 'search must use discovered paths');
  assert.ok(/missing.*neighboring paths/.test(skill), 'missing-path result must guide the search');
});
