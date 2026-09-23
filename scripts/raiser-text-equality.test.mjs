// The shared raiser fixture, read by the text-equality guard's renderer (#2537).
//
// `render` is the one renderer the guard runs against BOTH revisions, so a site
// it resolves to the wrong binding renders the wrong head on both sides and the
// comparison stays green. Nothing else runs it: the guard is invoked by hand, per
// family, and prints a diff rather than failing on one.
//
// The fixture is SHARED — every reader of a raiser head answers for every site in
// `packages/core/tests/fixtures/raiser-heads`, each in its own terms. This reader
// renders a dynamic door as `${}` so that both revisions collapse it identically.
// `two-bindings.ts` is the row that matters: a renderer resolving a name
// file-wide gives both sites the second binding's head.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  globSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { render } from "./raiser-text-equality.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE = join(ROOT, "packages/core/tests/fixtures/raiser-heads");

test("the shared raiser fixture: each site renders its own binding's head", () => {
  const rendered = {};

  for (const file of globSync(`${FIXTURE}/**/*.ts`)) {
    rendered[relative(FIXTURE, file)] = [
      ...render(file, readFileSync(file, "utf8")).out,
    ];
  }

  // A new file in the fixture reds this until its answer is written here.
  assert.deepEqual(rendered, {
    "bare-receiver.ts": ["[router] a bare receiver names no door at all"],
    "binding-after-use.ts": [
      "[router.matchPath] this site is written above the binding that serves it",
    ],
    "code-flavour.ts": [
      "[router.navigateToState] a code refusal names its binding through a call",
    ],
    "dynamic-door.ts": ["[router.${}] a dynamic door arrives as an argument"],
    "static-door.ts": [
      "[router.buildPath] a static door is written into the binding",
    ],
    "two-bindings.ts": [
      "[router.Segment Matcher] the first binding plants a door no reader may accept",
      "[router.navigate] the second binding shares the first one's name",
    ],
  });
});

test("the CLI runs when it is invoked through a symlink whose name holds a space", () => {
  // Node resolves a main module's symlinks, so a guard comparing
  // `import.meta.url` with `file://${argv[1]}` never matches this path: the
  // guard would print nothing and exit 0, which reads as "no text moved".
  const dir = mkdtempSync(join(tmpdir(), "text-equality-guard-"));

  try {
    const link = join(dir, "linked scripts");

    symlinkSync(join(ROOT, "scripts"), link);

    const run = spawnSync(
      process.execPath,
      [join(link, "raiser-text-equality.mjs")],
      { cwd: ROOT, encoding: "utf8" },
    );

    // Either answer proves main() ran — the comparison, or its refusal of an
    // empty file set. The verdict depends on the branch; silence is the defect.
    assert.notEqual(
      `${run.stdout}${run.stderr}`.trim(),
      "",
      "main() did not run",
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
