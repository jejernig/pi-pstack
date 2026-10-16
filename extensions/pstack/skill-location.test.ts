import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

const skill = fileURLToPath(new URL("../../skills/poteto-mode/SKILL.md", import.meta.url));
const extension = fileURLToPath(new URL("./index.ts", import.meta.url));

test("poteto-mode directs agents to the injected path instead of an ignored file search", async () => {
  const [instructions, promptSource] = await Promise.all([readFile(skill, "utf8"), readFile(extension, "utf8")]);
  assert.ok(instructions.includes("Read the exact absolute `SKILL.md` path supplied in your agent prompt"), "missing direct skill-path instruction");
  assert.ok(instructions.includes("`rg --files` skips installed packages under ignored `node_modules`"), "missing ignored-path warning");
  assert.ok(promptSource.includes("Read this exact absolute path without searching"), "subagent prompt does not direct agents to the installed skill");
});
