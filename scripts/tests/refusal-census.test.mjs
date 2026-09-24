// The shared raiser fixture, read by the refusal census (#2487, #2537).
//
// The census counts and prints and nothing gates on it, so a tag it resolves to
// the wrong binding moves a printed number and nobody notices. This pins the
// parse under every number it prints: which class a tag builds and which head
// its binding writes.
//
// The fixture is SHARED — every reader of a raiser head answers for every site in
// `packages/core/tests/fixtures/raiser-heads`, each in its own terms. The census
// spells a dynamic door as `${}`, the way the literal form spelled it, so its
// counts stay comparable across a conversion. `two-bindings.ts` is the row that
// matters: a census resolving a name file-wide counts both sites under the second
// binding's door.

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

import ts from "typescript";

import { raiserTag } from "../refusal-census.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const FIXTURE = join(ROOT, "packages/core/tests/fixtures/raiser-heads");

test("the shared raiser fixture: each tag counts under its own binding's head", () => {
  const counted = {};

  for (const file of globSync(`${FIXTURE}/**/*.ts`)) {
    const source = ts.createSourceFile(
      file,
      readFileSync(file, "utf8"),
      ts.ScriptTarget.Latest,
      /* setParentNodes */ true,
      ts.ScriptKind.TS,
    );
    const tags = [];
    const walk = (node) => {
      const tag = raiserTag(node);

      if (tag !== undefined) tags.push(`${tag.flavour} ${tag.head.trim()}`);

      ts.forEachChild(node, walk);
    };

    walk(source);
    counted[relative(FIXTURE, file)] = tags;
  }

  // A new file in the fixture reds this until its answer is written here.
  assert.deepEqual(counted, {
    "bare-receiver.ts": ["Error [router]"],
    "binding-after-use.ts": ["TypeError [router.matchPath]"],
    "code-flavour.ts": ["RouterError [router.navigateToState]"],
    "dynamic-door.ts": ["TypeError [router.${}]"],
    "static-door.ts": ["TypeError [router.buildPath]"],
    "two-bindings.ts": [
      "TypeError [router.Segment Matcher]",
      "TypeError [router.navigate]",
    ],
  });
});

test("the CLI runs when it is invoked through a symlink whose name holds a space", () => {
  // Node resolves a main module's symlinks, so a guard comparing
  // `import.meta.url` with `file://${argv[1]}` never matches this path: the
  // census would print nothing and exit 0, which reads as a quiet tree.
  const dir = mkdtempSync(join(tmpdir(), "census-guard-"));

  try {
    const link = join(dir, "linked scripts");

    symlinkSync(join(ROOT, "scripts"), link);

    const run = spawnSync(
      process.execPath,
      [join(link, "refusal-census.mjs")],
      { cwd: ROOT, encoding: "utf8" },
    );

    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, /^REFUSALS with a bracketed head: \d+/u);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
