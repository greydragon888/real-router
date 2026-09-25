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
// CI gate honest: it builds a transient two-file cycle, lints it with the REAL
// config of packages/core, and asserts the cycle is reported. If a future
// config change re-kills the graph analysis, this fails loudly instead of the
// gate dying silently again.
//
// The cycle lives in a mirror of `packages/core/src` under os.tmpdir(), never in
// the checkout (#2563). The suite runs its files concurrently, and a fixture
// written into the live `packages/core/src` made a sibling's glob-then-read of
// that directory fail with ENOENT. The config is the one ESLint's own lookup
// finds for a file in `packages/core/src`, the mirror is linted from that
// config's directory, and the test asserts the mirror's file gets the same
// rules, settings and parser options as the real path.
//
// Runs in the repo-lints CI job via `node --test scripts/tests/*.test.mjs` (no
// wiring). Keep this file to ONE lint run.

import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { ESLint } from "eslint";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const A = "__no_cycle_guard_fixture_a.ts";
const B = "__no_cycle_guard_fixture_b.ts";

/** What decides whether no-cycle runs on a file, and how. */
const decisive = ({ rules, settings, languageOptions }) => ({
  rules,
  settings,
  parserOptions: languageOptions?.parserOptions,
});

test("import-x/no-cycle reports a fixture cycle under core's real config (#1525)", async () => {
  // The path a core source file would have. Nothing is written there.
  const probe = join(ROOT, "packages/core/src", A);
  const real = new ESLint({ cwd: ROOT });
  const configFile = await real.findConfigFile(probe);

  assert.ok(configFile, "no ESLint config applies to packages/core/src");

  // Physical: on macOS os.tmpdir() is a symlink, and import-x keys its module
  // graph by the resolved path, so a cycle between `/var/…` files is never closed.
  const mirror = realpathSync(mkdtempSync(join(tmpdir(), "no-cycle-guard-")));
  const fileA = join(mirror, relative(ROOT, probe));
  const fileB = join(dirname(fileA), B);

  try {
    mkdirSync(dirname(fileA), { recursive: true });
    // Typed parsing needs the fixture inside a project, and nothing more: the
    // rule under test reads import-x's settings, not types.
    writeFileSync(
      join(mirror, "packages", "core", "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          strict: true,
          target: "ES2022",
          module: "ESNext",
          moduleResolution: "Bundler",
          noEmit: true,
        },
        include: ["src"],
      }),
    );
    writeFileSync(
      fileA,
      `import { probeB } from "./${B.replace(/\.ts$/, "")}";\n\nexport const probeA = 1 + probeB;\n`,
    );
    writeFileSync(
      fileB,
      `import { probeA } from "./${A.replace(/\.ts$/, "")}";\n\nexport const probeB = 2;\nexport const probeUse = (): number => probeA;\n`,
    );

    const mirrored = new ESLint({
      cwd: join(mirror, relative(ROOT, dirname(configFile))),
      overrideConfigFile: configFile,
    });

    assert.deepEqual(
      decisive(await mirrored.calculateConfigForFile(fileA)),
      decisive(await real.calculateConfigForFile(probe)),
      "the mirror's file does not get the config a real core source file gets",
    );

    const results = await mirrored.lintFiles([fileA, fileB]);

    assert.deepEqual(
      results.map(({ filePath }) => filePath).toSorted(),
      [fileA, fileB].toSorted(),
    );
    for (const { filePath, messages } of results) {
      assert.deepEqual(
        messages.filter(({ fatal }) => fatal),
        [],
        `${filePath} did not parse`,
      );
      assert.ok(
        messages.some(
          ({ ruleId, severity, message }) =>
            ruleId === "import-x/no-cycle" &&
            severity === 2 &&
            message.startsWith("Dependency cycle"),
        ),
        "the fixture cycle was NOT reported — import-x/no-cycle has gone inert " +
          "again (#1525). Check settings['import-x/extensions'] / " +
          "['import-x/parsers'] in eslint.config.mjs — without them import-x " +
          "ignores .ts import targets and builds no module graph.\n" +
          `${filePath}:\n${JSON.stringify(messages, null, 2).slice(0, 800)}`,
      );
    }
  } finally {
    rmSync(mirror, { recursive: true, force: true });
  }
});
