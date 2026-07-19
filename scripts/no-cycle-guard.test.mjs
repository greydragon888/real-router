// Regression guard for import-x/no-cycle (#1525).
//
// The rule sat at error level for months while being SILENTLY INERT: without
// `settings["import-x/extensions"]`, import-x's ignore.js defaults valid
// extensions to ['.js','.mjs','.cjs'], so every `.ts` import target failed the
// extension check, no module graph was built, and a textbook value↔value cycle
// linted clean. The fix is three settings in eslint.config.mjs (extensions /
// parsers / external-module-folders, verbatim from flatConfigs.typescript).
//
// This test keeps the rule ALIVE the same way ci-gate-completeness keeps the
// CI gate honest: it writes a transient two-file cycle into packages/core/src,
// lints it with the REAL repo config, and asserts the cycle is reported. If a
// future config change re-kills the graph analysis, this fails loudly instead
// of the gate dying silently again.
//
// Runs in the repo-lints CI job via `node --test scripts/*.test.mjs` (no
// wiring). Budget note: one eslint boot with the repo config + projectService
// costs ~10-20s — acceptable for repo-lints; keep this file to ONE eslint run.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CORE_SRC = join(ROOT, "packages/core/src");

// Underscore-prefixed transient names — never committed, cleaned in finally.
const A = "__no_cycle_guard_fixture_a.ts";
const B = "__no_cycle_guard_fixture_b.ts";

test("import-x/no-cycle reports a fixture cycle under the real repo config (#1525)", () => {
  const aPath = join(CORE_SRC, A);
  const bPath = join(CORE_SRC, B);

  assert.ok(
    !existsSync(aPath) && !existsSync(bPath),
    "fixture files unexpectedly already exist — a previous run failed to clean up; remove them",
  );

  try {
    writeFileSync(
      aPath,
      `import { probeB } from "./${B.replace(/\.ts$/, "")}";\n\nexport const probeA = 1 + probeB;\n`,
    );
    writeFileSync(
      bPath,
      `import { probeA } from "./${A.replace(/\.ts$/, "")}";\n\nexport const probeB = 2;\nexport const probeUse = (): number => probeA;\n`,
    );

    // A found cycle makes eslint exit non-zero — that is the EXPECTED outcome;
    // capture the report either way and assert on its content.
    let output = "";
    try {
      output = execFileSync(
        "pnpm",
        ["exec", "eslint", "--no-cache", `src/${A}`, `src/${B}`],
        { cwd: join(ROOT, "packages/core"), encoding: "utf8" },
      );
    } catch (error) {
      output = `${error.stdout ?? ""}${error.stderr ?? ""}`;
    }

    // Vacuity guard first: prove eslint actually linted OUR files (an empty or
    // wrong-cwd run must not pass as "no cycle reported... because no lint").
    assert.ok(
      output.includes(A),
      `eslint output never mentions ${A} — the fixture was not linted (wrong cwd / config load failure?):\n${output.slice(0, 800)}`,
    );

    assert.ok(
      output.includes("import-x/no-cycle"),
      "the fixture cycle was NOT reported — import-x/no-cycle has gone inert " +
        "again (#1525). Check settings['import-x/extensions'] / " +
        "['import-x/parsers'] in eslint.config.mjs — without them import-x " +
        "ignores .ts import targets and builds no module graph.\n" +
        `eslint output:\n${output.slice(0, 800)}`,
    );
  } finally {
    rmSync(aPath, { force: true });
    rmSync(bPath, { force: true });
  }
});
