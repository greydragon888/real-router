// Deliberate-twin registry + lockstep enforcement (#1522).
//
// The type-guards dissolution (#1520) left deliberate COPIES of guard code in
// several packages — by design: each consumer owns its subset with no shared
// runtime dependency. That stance has two flavors, decided per pair (#1522):
//
//   LOCKSTEP     — the copies encode ONE contract and must stay code-identical
//                  (comments are free). Drift here is the #1224/#1225 class:
//                  two packages silently disagreeing about the same value shape.
//                  Enforced below by extracting each function from both files
//                  and asserting the comment-stripped bodies are equal.
//   INDEPENDENT  — a namesake or behavioral mirror that legitimately evolves
//                  per consumer. Registered with a written reason so a future
//                  audit neither "fixes" the divergence nor mistakes the entry
//                  for an accidental copy. Enforced only for existence (a
//                  stale registry fails loudly).
//
// Runs in the repo-lints CI job via `node --test scripts/*.test.mjs` — no
// wiring needed. Sonar/jscpd CPD-exclude these files (sonar-project.properties,
// .jscpd.json — see #1523); THIS test is the actual drift guard.
//
// Stdlib node:test/node:assert only (Node 24) — scripts/ is not a vitest
// workspace.

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// ─── Registry ────────────────────────────────────────────────────────────────

const LOCKSTEP = [
  {
    pair: "params-serializability pipeline",
    left: "packages/validation-plugin/src/type-guards/guards/params.ts",
    right: "shared/browser-env/state-guard.ts",
    functions: [
      "isPlainContainer",
      "pushChildren",
      "isSerializableLeaf",
      "visitContainer",
      "isSerializable",
      "isPrimitiveValue",
      "isParams",
      "isParamsUnsafe",
    ],
    // ONE contract, two consumers: validation-plugin vets user-supplied params,
    // state-guard vets history.state params on browser restore. If the
    // serializability rules move (e.g. a new allowed leaf type), BOTH must move
    // — a one-sided edit means restore accepts what validation rejects (or
    // vice versa). Both copies already carry the same #1052 getter-safe
    // hardening; keep it that way.
    onDrift:
      "These functions are ONE contract distributed to two packages (#1520). " +
      "Apply the same code change to BOTH files (comments may differ freely), " +
      "or — if the contracts genuinely need to diverge — move the pair to the " +
      "INDEPENDENT registry with a written reason. See #1522.",
  },
];

const INDEPENDENT = [
  {
    path: "packages/persistent-params-plugin/src/is-primitive-value.ts",
    reason:
      "URL-value contract (string | finite number | boolean; REJECTS " +
      "null/undefined) — a NAMESAKE of the serializability pipeline's " +
      "isPrimitiveValue (which accepts null/undefined as serializable leaves), " +
      "not a twin. Diverged semantics are the point.",
  },
  {
    path: "packages/core/src/engine/validation/route-batch.ts",
    counterpart: "packages/validation-plugin/src/type-guards/utilities/type-description.ts",
    reason:
      "getTypeDescription: already diverged by consumer needs — the " +
      "validation-plugin copy adds an `array[N]` branch and cites #787 where " +
      "the engine copy cites #903. Error-MESSAGE helpers; divergence is benign " +
      "(each package's tests pin its own messages). NOTE: route-batch.ts's " +
      "in-file 'Byte-identical twin' comment predates this divergence.",
  },
  {
    path: "packages/core/src/engine/path-matcher/encoding.ts",
    counterpart: "packages/core/src/engine/search-params/utils.ts",
    reason:
      "totalize vs safeEncode: a behavioral mirror (never-throw encoding of " +
      "lone surrogates), not a textual twin — different shapes (encoder-factory " +
      "wrapper vs direct function) in two zero-dependency engine layers that " +
      "copy rather than import by design (see engine CLAUDE.md).",
  },
];

// ─── Extraction ──────────────────────────────────────────────────────────────

/**
 * Single-pass scanner: for each char, mark whether it is inside a comment.
 * String interiors are tracked separately so brace-depth counting ignores
 * braces inside quotes/templates. Good enough for prettier-formatted TS
 * sources; every consumer below fails loudly (not vacuously) if extraction
 * misbehaves.
 */
function scan(src) {
  const inComment = new Uint8Array(src.length);
  const inString = new Uint8Array(src.length);
  let state = "code"; // code | line | block | sq | dq | tpl

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    const next = src[i + 1];

    switch (state) {
      case "code":
        if (c === "/" && next === "/") state = "line";
        else if (c === "/" && next === "*") state = "block";
        else if (c === "'") state = "sq";
        else if (c === '"') state = "dq";
        else if (c === "`") state = "tpl";
        break;
      case "line":
        if (c === "\n") state = "code";
        break;
      case "block":
        if (c === "*" && next === "/") {
          inComment[i] = 1;
          inComment[i + 1] = 1;
          i += 1;
          state = "code";
          continue;
        }
        break;
      case "sq":
        if (c === "\\") i += 1;
        else if (c === "'") state = "code";
        break;
      case "dq":
        if (c === "\\") i += 1;
        else if (c === '"') state = "code";
        break;
      case "tpl":
        if (c === "\\") i += 1;
        else if (c === "`") state = "code";
        break;
    }

    if (state === "line" || state === "block") inComment[i] = 1;
    else if (state === "sq" || state === "dq" || state === "tpl") {
      // The opening quote itself was marked in "code"; interiors only.
      if (src[i] !== "'" && src[i] !== '"' && src[i] !== "`") inString[i] = 1;
    }
  }

  return { inComment, inString };
}

/** Extracts `function <name>(...)`'s full text (export prefix excluded). */
function extractFunction(src, name) {
  const { inComment, inString } = scan(src);
  const re = new RegExp(`(^|\\n)(export )?function ${name}\\(`, "g");

  let m;
  while ((m = re.exec(src)) !== null) {
    const fnStart = m.index + m[1].length + (m[2]?.length ?? 0);
    if (inComment[fnStart] || inString[fnStart]) continue;

    // Walk to the body's closing brace, counting only code-braces.
    let depth = 0;
    let seenBrace = false;
    for (let i = fnStart; i < src.length; i++) {
      if (inComment[i] || inString[i]) continue;
      if (src[i] === "{") {
        depth += 1;
        seenBrace = true;
      } else if (src[i] === "}") {
        depth -= 1;
        if (seenBrace && depth === 0) {
          return { text: src.slice(fnStart, i + 1), offset: fnStart };
        }
      }
    }
  }

  return null;
}

/** Comment-stripped, blank-line-free, right-trimmed lines of a function. */
function normalize(src, { text, offset }) {
  const { inComment } = scan(src);
  let out = "";

  for (let i = 0; i < text.length; i++) {
    out += inComment[offset + i] ? " " : text[i];
  }

  return out
    .split("\n")
    .map((l) => l.replace(/\s+$/, ""))
    .filter((l) => l.trim() !== "");
}

// ─── Lockstep enforcement ────────────────────────────────────────────────────

for (const entry of LOCKSTEP) {
  test(`lockstep: ${entry.pair} — ${entry.left} ↔ ${entry.right}`, () => {
    const leftSrc = readFileSync(join(ROOT, entry.left), "utf8");
    const rightSrc = readFileSync(join(ROOT, entry.right), "utf8");
    let totalLines = 0;

    for (const fn of entry.functions) {
      const left = extractFunction(leftSrc, fn);
      const right = extractFunction(rightSrc, fn);

      // Vacuity guards: a renamed/moved function must fail HERE (update the
      // registry consciously), never silently shrink the comparison.
      assert.ok(left, `${fn}() not found in ${entry.left} — renamed/moved? Update the LOCKSTEP registry. ${entry.onDrift}`);
      assert.ok(right, `${fn}() not found in ${entry.right} — renamed/moved? Update the LOCKSTEP registry. ${entry.onDrift}`);

      const a = normalize(leftSrc, left);
      const b = normalize(rightSrc, right);

      assert.ok(a.length >= 3, `${fn}() extraction from ${entry.left} degenerated (${a.length} lines) — extractor bug, do not trust a green run`);
      totalLines += a.length;

      assert.deepEqual(
        b,
        a,
        `${fn}() drifted between the twins.\n  left:  ${entry.left}\n  right: ${entry.right}\n${entry.onDrift}`,
      );
    }

    // Pair-level floor: the pipeline is ~150+ code lines; a collapse below the
    // floor means the extractor (or a mass deletion) gutted the comparison.
    assert.ok(
      totalLines >= 100,
      `lockstep comparison shrank to ${totalLines} normalized lines — extractor bug or mass deletion; do not trust a green run`,
    );
  });
}

// ─── Independent-registry hygiene ────────────────────────────────────────────

test("independent registry: files exist and reasons are written", () => {
  for (const entry of INDEPENDENT) {
    assert.ok(
      existsSync(join(ROOT, entry.path)),
      `stale INDEPENDENT entry: ${entry.path} is gone — drop or update the registry entry`,
    );
    if (entry.counterpart) {
      assert.ok(
        existsSync(join(ROOT, entry.counterpart)),
        `stale INDEPENDENT entry: counterpart ${entry.counterpart} is gone — drop or update the registry entry`,
      );
    }
    assert.ok(
      entry.reason.length >= 40,
      `INDEPENDENT entry ${entry.path} needs a real written reason`,
    );
  }
});
