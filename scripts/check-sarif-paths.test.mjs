// check-sarif-paths.test.mjs — meta-test for the guard that stops a SARIF
// upload from succeeding while pointing at nothing.
//
// Run:  node --test scripts/check-sarif-paths.test.mjs
//
// ⚠ Fixtures are inline, not produced by running jscpd. The sibling
// `check-deps-audit.test.mjs` documents why that matters: a meta-test that
// shells out to a tool CI does not install passes by never running, and a guard
// for a blind gate is itself blind. The two shapes below are transcribed from
// real reports — jscpd 5.0.12 (scan-root-relative, no base ids: the defect) and
// 5.1.2 (`uriBaseId` + `originalUriBaseIds`: the fix) — so this file keeps
// discriminating whether or not jscpd is installed.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { test } from "node:test";

import {
  checkSarifPaths,
  resolveArtifactLocation,
} from "./check-sarif-paths.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** jscpd ≤ 5.0.16: every uri relative to its own scan root, no base ids. */
const scanRootRelative = {
  runs: [
    {
      results: [
        {
          ruleId: "jscpd/duplicate-code",
          locations: [
            { physicalLocation: { artifactLocation: { uri: "index.ts" } } },
          ],
          relatedLocations: [
            { physicalLocation: { artifactLocation: { uri: "types.ts" } } },
          ],
        },
      ],
    },
  ],
};

/** jscpd ≥ 5.1.1: per-root base ids, absolute, as GitHub documents. */
const withBaseIds = {
  runs: [
    {
      originalUriBaseIds: {
        "%SRCROOT%": { uri: `file://${ROOT}/scripts/` },
        "%SRCROOT1%": { uri: `file://${ROOT}/` },
      },
      results: [
        {
          ruleId: "jscpd/duplicate-code",
          locations: [
            {
              physicalLocation: {
                artifactLocation: {
                  uri: "check-sarif-paths.mjs",
                  uriBaseId: "%SRCROOT%",
                },
              },
            },
          ],
          relatedLocations: [
            {
              physicalLocation: {
                artifactLocation: {
                  uri: "package.json",
                  uriBaseId: "%SRCROOT1%",
                },
              },
            },
          ],
        },
      ],
    },
  ],
};

test("a scan-root-relative report is rejected — this is the #2154 defect", () => {
  const { results, checked, unresolved } = checkSarifPaths(
    scanRootRelative,
    ROOT,
  );

  assert.equal(results, 1);
  // Anti-vacuum: a guard that resolved nothing would also report zero
  // unresolved, so the count of what it LOOKED at is asserted too.
  assert.equal(checked, 2);
  assert.equal(unresolved.length, 2);
  assert.deepEqual(
    unresolved.map((u) => u.path),
    [resolve(ROOT, "index.ts"), resolve(ROOT, "types.ts")],
  );
});

test("a report with per-root base ids resolves to real repository files", () => {
  const { results, checked, unresolved } = checkSarifPaths(withBaseIds, ROOT);

  assert.equal(results, 1);
  assert.equal(checked, 2);
  assert.deepEqual(unresolved, []);
});

test("relatedLocations are checked, not only the primary location", () => {
  const primaryOnlyValid = {
    runs: [
      {
        originalUriBaseIds: { "%SRCROOT%": { uri: `file://${ROOT}/` } },
        results: [
          {
            ruleId: "r",
            locations: [
              {
                physicalLocation: {
                  artifactLocation: {
                    uri: "package.json",
                    uriBaseId: "%SRCROOT%",
                  },
                },
              },
            ],
            relatedLocations: [
              {
                physicalLocation: {
                  artifactLocation: {
                    uri: "nowhere.ts",
                    uriBaseId: "%SRCROOT%",
                  },
                },
              },
            ],
          },
        ],
      },
    ],
  };

  const { checked, unresolved } = checkSarifPaths(primaryOnlyValid, ROOT);

  assert.equal(checked, 2);
  assert.equal(unresolved.length, 1);
  assert.equal(unresolved[0].path, resolve(ROOT, "nowhere.ts"));
});

test("an undefined uriBaseId throws instead of being skipped", () => {
  assert.throws(
    () =>
      resolveArtifactLocation({ uri: "a.ts", uriBaseId: "%NOPE%" }, {}, ROOT),
    /not defined in originalUriBaseIds/,
  );
});

test("a chained uriBaseId throws instead of resolving half of it", () => {
  assert.throws(
    () =>
      resolveArtifactLocation(
        { uri: "a.ts", uriBaseId: "%CHILD%" },
        {
          "%CHILD%": { uri: "src/", uriBaseId: "%PARENT%" },
          "%PARENT%": { uri: `file://${ROOT}/` },
        },
        ROOT,
      ),
    /chained base ids are not handled/,
  );
});

test("an empty uri throws instead of resolving to the repository root", () => {
  // Without this the empty string resolves to `root` itself, which exists, so
  // a location naming nothing would be reported as perfectly fine.
  assert.throws(
    () => resolveArtifactLocation({ uri: "" }, {}, ROOT),
    /without a uri/,
  );
});

test("a location without a physicalLocation.artifactLocation throws", () => {
  assert.throws(
    () =>
      checkSarifPaths(
        { runs: [{ results: [{ ruleId: "r", locations: [{}] }] }] },
        ROOT,
      ),
    /without a physicalLocation\.artifactLocation/,
  );
});

test("an artifactLocation without a uri throws", () => {
  assert.throws(() => resolveArtifactLocation({}, {}, ROOT), /without a uri/);
});

test("an absolute file: uri needs no base id", () => {
  assert.equal(
    resolveArtifactLocation({ uri: `file://${ROOT}/package.json` }, {}, ROOT),
    resolve(ROOT, "package.json"),
  );
});

test("a report with no results checks nothing and reports nothing", () => {
  const { results, checked, unresolved } = checkSarifPaths(
    { runs: [{ results: [] }] },
    ROOT,
  );

  assert.equal(results, 0);
  assert.equal(checked, 0);
  assert.deepEqual(unresolved, []);
});

test("results carrying no location are counted, so the CLI can refuse them", () => {
  const { results, checked } = checkSarifPaths(
    { runs: [{ results: [{ ruleId: "r" }] }] },
    ROOT,
  );

  // results > 0 while checked === 0 is the shape `main` exits 1 on: a report
  // was read and nothing was learned from it.
  assert.equal(results, 1);
  assert.equal(checked, 0);
});

// The exit code IS the contract — the whole point of the guard is that CI reads
// it — so it is pinned here rather than left to the one manual run that proved
// it once.
const runCli = (sarif) => {
  const dir = mkdtempSync(join(tmpdir(), "sarif-paths-"));
  const file = join(dir, "report.sarif");

  writeFileSync(file, JSON.stringify(sarif));

  return spawnSync(
    process.execPath,
    [join(ROOT, "scripts/check-sarif-paths.mjs"), file, ROOT],
    { encoding: "utf8" },
  );
};

test("CLI exits 1 on a report whose paths resolve to nothing", () => {
  const { status, stderr } = runCli(scanRootRelative);

  assert.equal(status, 1);
  assert.match(stderr, /do not name a file in/);
});

test("CLI exits 0 on a report whose paths resolve", () => {
  const { status, stdout } = runCli(withBaseIds);

  assert.equal(status, 0);
  assert.match(stdout, /all 2 locations resolve/);
});

test("CLI exits 0 on a report with no results at all", () => {
  const { status, stdout } = runCli({ runs: [{ results: [] }] });

  assert.equal(status, 0);
  assert.match(stdout, /no results to resolve/);
});

test("CLI exits 1 when results carry no location — read, and learned nothing", () => {
  const { status, stderr } = runCli({ runs: [{ results: [{ ruleId: "r" }] }] });

  assert.equal(status, 1);
  assert.match(stderr, /carry no location to resolve/);
});

test("CLI exits 2 without arguments", () => {
  const { status, stderr } = spawnSync(
    process.execPath,
    [join(ROOT, "scripts/check-sarif-paths.mjs")],
    { encoding: "utf8" },
  );

  assert.equal(status, 2);
  assert.match(stderr, /usage:/);
});
