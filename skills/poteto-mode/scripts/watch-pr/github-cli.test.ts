import { afterEach, expect, it } from "bun:test";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GhGitHubReader } from "./github.ts";
import { parsePrNumber } from "./types.ts";

const originalPath = process.env.PATH;
let fixtureDir: string | null = null;

afterEach(() => {
  process.env.PATH = originalPath;
  if (fixtureDir !== null) rmSync(fixtureDir, { recursive: true, force: true });
  fixtureDir = null;
});

it("reads PR checks with a gh version that has no checks --json flag", async () => {
  fixtureDir = mkdtempSync(join(tmpdir(), "watch-pr-gh-"));
  const gh = join(fixtureDir, "gh");
  writeFileSync(gh, `#!/bin/sh
if [ "$1" = "pr" ] && [ "$2" = "checks" ]; then
  printf 'unknown flag: --json\\n' >&2
  exit 1
fi
if [ "$1" = "pr" ] && [ "$2" = "view" ]; then
  printf '{"statusCheckRollup":[{"__typename":"StatusContext","context":"ci","state":"SUCCESS","targetUrl":""}]}\\n'
  exit 0
fi
exit 2
`);
  chmodSync(gh, 0o755);
  process.env.PATH = `${fixtureDir}:${originalPath ?? ""}`;
  const result = await new GhGitHubReader().checksFastPath({
    owner: "owner",
    repo: "repo",
    number: parsePrNumber(42),
  });
  expect(result).toMatchObject({
    kind: "checks",
    checks: [{ name: "ci", kind: "passed" }],
  });
});
