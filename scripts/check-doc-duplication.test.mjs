// Mutation guard for the docblock/doc duplication checker.
//
// A green guard that guards nothing is the failure mode this repo has hit
// before, so every threshold in `check-doc-duplication.mjs` gets a falsifying
// input here — a fixture that MUST red — plus the negative control that must
// stay green. If a future edit makes a threshold inert, the matching case flips.
//
// Runs in the repo-lints CI job via `node --test scripts/*.test.mjs`.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test, afterEach } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = join(ROOT, "scripts", "check-doc-duplication.mjs");
const FIXTURE = join(ROOT, "tmp-doc-dup-fixture");

/** 12 distinctive tokens — comfortably over MIN_TOKENS, so the gate is the score. */
const DUP =
  "The navigation pipeline canonicalises a caller intent before the matcher " +
  "observes any declared route parameter.";

/** 7 distinctive tokens — under MIN_TOKENS, and over the 40-char length filter. */
const SHORT = "Canonicalisation happens before matching declared routes here.";

/** One sentence, no internal full stop, > 4x DUP's token count. */
const HUGE =
  "The navigation pipeline canonicalises a caller intent before the matcher " +
  "observes any declared route parameter, and the surrounding machinery also " +
  "handles subscription bookkeeping, plugin registration ordering, dependency " +
  "container lifetimes, transition cancellation, guard evaluation, redirect " +
  "resolution, query serialisation, history integration, scroll restoration, " +
  "focus management, error propagation, server rendering handoff, cache " +
  "invalidation, telemetry sampling, bundle splitting, prefetch scheduling, " +
  "hydration mismatch reporting, locale negotiation and viewport tracking.";

/** Padded so the block clears MIN_BLOCK_LINES; the payload is the last line. */
const block = (sentence, lines = 34) => {
  const filler = Array.from(
    { length: lines - 3 },
    (_, i) =>
      ` * Filler line ${i} that says nothing a document would ever repeat.`,
  );

  return ["/**", ...filler, ` * ${sentence}`, " */"].join("\n");
};

const build = ({ doc, comment, blockLines }) => {
  rmSync(FIXTURE, { recursive: true, force: true });
  mkdirSync(join(FIXTURE, "packages", "demo", "src"), { recursive: true });
  writeFileSync(
    join(FIXTURE, "packages", "demo", "ARCHITECTURE.md"),
    `# Demo\n\n${doc}\n`,
  );
  writeFileSync(
    join(FIXTURE, "packages", "demo", "src", "thing.ts"),
    `${block(comment, blockLines)}\nexport const thing = 1;\n`,
  );
};

const run = (...args) => {
  const r = spawnSync("node", [SCRIPT, `--root=${FIXTURE}`, ...args], {
    encoding: "utf8",
  });

  return { code: r.status, out: (r.stdout ?? "") + (r.stderr ?? "") };
};

afterEach(() => rmSync(FIXTURE, { recursive: true, force: true }));

test("a restated sentence absent from the baseline FAILS", () => {
  build({ doc: DUP, comment: DUP });
  // An EMPTY baseline, so the failure is the pair and not the missing file —
  // that arm has its own case at the end.
  writeFileSync(join(FIXTURE, "doc-duplication-baseline.json"), "{}\n");

  const r = run();

  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /restate the package's own docs/);
});

test("NEGATIVE CONTROL — an unrelated docblock sentence passes", () => {
  build({
    doc: DUP,
    comment:
      "Scroll restoration reads the stored offset and applies it after the " +
      "browser has finished its own layout work.",
  });
  assert.equal(run("--update").code, 0);
  assert.equal(run().code, 0);
});

test("MIN_BLOCK_LINES — the same restatement in a SHORT docblock is ignored", () => {
  build({ doc: DUP, comment: DUP, blockLines: 12 });
  // No baseline exists, so a hit would fail; passing proves the block was skipped.
  assert.equal(run("--update").code, 0);

  const r = run("--all");

  assert.equal(r.code, 0, r.out);
  assert.doesNotMatch(r.out, /thing\.ts/);
});

test("MIN_TOKENS — a restatement too short to be distinctive is ignored", () => {
  build({ doc: SHORT, comment: SHORT });
  assert.equal(run("--update").code, 0);
  assert.doesNotMatch(run("--all").out, /thing\.ts/);
});

test("MAX_DOC_RATIO — a match inside a much longer doc sentence is ignored", () => {
  build({ doc: HUGE, comment: DUP });
  assert.equal(run("--update").code, 0);
  assert.doesNotMatch(run("--all").out, /thing\.ts/);
});

test("the baseline is a RATCHET — accepted pairs pass, a new one fails", () => {
  build({ doc: DUP, comment: DUP });
  assert.equal(run("--update").code, 0);
  assert.equal(run().code, 0);

  // A second restated sentence, not in the baseline.
  const second =
    "Plugin registration wraps every declared lifecycle hook before the " +
    "dependency container becomes readable.";

  writeFileSync(
    join(FIXTURE, "packages", "demo", "ARCHITECTURE.md"),
    `# Demo\n\n${DUP}\n\n${second}\n`,
  );
  writeFileSync(
    join(FIXTURE, "packages", "demo", "src", "other.ts"),
    `${block(second)}\nexport const other = 1;\n`,
  );

  const r = run();

  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /other\.ts/);
});

test("the baseline key is CONTENT — a line moved above the sentence keeps it accepted", () => {
  build({ doc: DUP, comment: DUP });
  assert.equal(run("--update").code, 0);

  // The same sentence, with the whole block pushed DOWN the file — its start
  // line moves, its content does not. A line-keyed baseline reds here; this is
  // the mutant that proved the earlier version of this cell was inert, because
  // the block began at line 1 either way.
  writeFileSync(
    join(FIXTURE, "packages", "demo", "src", "thing.ts"),
    `const preamble = 1;\nconst more = 2;\n\n${block(DUP, 38)}\nexport const thing = preamble + more;\n`,
  );
  assert.equal(run().code, 0);
});

test("...and editing the SENTENCE itself re-surfaces it", () => {
  build({ doc: DUP, comment: DUP });
  assert.equal(run("--update").code, 0);

  const edited = DUP.replace("canonicalises", "normalises");

  writeFileSync(
    join(FIXTURE, "packages", "demo", "ARCHITECTURE.md"),
    `# Demo\n\n${DUP}\n${edited}\n`,
  );
  writeFileSync(
    join(FIXTURE, "packages", "demo", "src", "thing.ts"),
    `${block(edited)}\nexport const thing = 1;\n`,
  );
  assert.equal(run().code, 1);
});

test("a missing baseline fails rather than passing vacuously", () => {
  build({ doc: DUP, comment: DUP });

  const r = run();

  assert.equal(r.code, 1);
  assert.match(r.out, /is missing/);
});
