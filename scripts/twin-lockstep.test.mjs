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
    pair: "state-guard transitive closure",
    // Default left-hand home; members that live elsewhere in validation-plugin
    // carry their own `left` (the plugin splits the closure across three files,
    // the shared copy keeps it in one).
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
      {
        name: "isRouteName",
        left: "packages/validation-plugin/src/type-guards/guards/routes.ts",
      },
      {
        name: "isRequiredFields",
        left: "packages/validation-plugin/src/type-guards/internal/meta-fields.ts",
      },
    ],
    constants: [
      {
        name: "FULL_ROUTE_PATTERN",
        left: "packages/validation-plugin/src/type-guards/internal/router-error.ts",
      },
      {
        name: "MAX_ROUTE_NAME_LENGTH",
        left: "packages/validation-plugin/src/type-guards/internal/router-error.ts",
      },
      // ⚑ The captured intrinsics (#1971). They belong in the COMPARED set
      // rather than the exempt one, and the reason is mechanical: the functions
      // this registry keeps byte-identical reference them by name, so a capture
      // that existed on one side only would either break the comparison or —
      // worse — leave one twin reading the live global while the other reads its
      // captured copy. Comparing them is what makes "identical bodies" mean
      // "identical behaviour".
      "getPrototypeOf",
      "objectValues",
      "hasOwn",
    ],
    // Members of the right-hand file that deliberately have NO twin. Each needs
    // a written reason: this list is the only way a member escapes comparison,
    // so an empty reason is not accepted.
    exempt: {
      isOptionalBag:
        "Shared-only, and deliberately OUTSIDE `isRequiredFields` (#1838). It " +
        "checks the members `State` declares that a restored history entry may " +
        "omit and which the twin has no notion of: validation-plugin validates a " +
        "State the router built, not a `history.state` payload. Putting it inside " +
        "`isRequiredFields` would have forced a matching edit on the other side " +
        "of a pair this registry exists to keep byte-identical. (The " +
        "`RestorableEntry` interface it feeds needs no entry here: this registry " +
        "enumerates functions and constants, and a type exemption is rejected as " +
        "stale.) ⚠ It read `search`, `transition`, `context` until #1837 — " +
        "`search` moved to `isParams`, because it is the one of the three that is " +
        "RESTORED into a channel and it was the only channel no value-level guard " +
        "screened.",
      isStateStrict:
        "The subject of the twin, not a member of it: validation-plugin has no " +
        "isStateStrict — it composes its own state validation from the same " +
        "closure through a different surface. Nothing to compare against.",
    },
    // ⚠ The registry used to list EIGHT functions and no constants, while the
    // right-hand file's own header declares the closure as `isRequiredFields`,
    // `isRouteName`, `isParams` "and its serialization machinery, plus the two
    // route-name constants". Measured on the real files: mutating `isRouteName`,
    // `isRequiredFields` or EITHER constant left the guard GREEN, i.e. it was
    // blind to 2 of 10 functions and to both constants it claimed to protect. A
    // drifted MAX_ROUTE_NAME_LENGTH or FULL_ROUTE_PATTERN makes browser Back
    // reject route names the validation twin accepts, with CI green throughout.
    // The coverage test below now derives the member set from the right-hand
    // file so a newly added member cannot silently escape the comparison the
    // way these four did.
    //
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
    counterpart:
      "packages/validation-plugin/src/type-guards/utilities/type-description.ts",
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

/**
 * Extracts `const <NAME> = …;`'s full text (export prefix excluded).
 *
 * The extractor family used to handle `function <name>(` and nothing else,
 * which is why both route-name constants sat inside the DECLARED contract and
 * outside the enforced one. Walks to the first `;` that is neither in a comment
 * nor in a string — enough for the one-statement constants this registry holds,
 * and the degeneracy assertion below refuses anything that comes back empty.
 */
function extractConstant(src, name) {
  const { inComment, inString } = scan(src);
  const re = new RegExp(`(^|\\n)(export )?const ${name}\\b`, "g");

  let m;
  while ((m = re.exec(src)) !== null) {
    const start = m.index + m[1].length + (m[2]?.length ?? 0);
    if (inComment[start] || inString[start]) continue;

    for (let i = start; i < src.length; i++) {
      if (inComment[i] || inString[i]) continue;
      if (src[i] === ";")
        return { text: src.slice(start, i + 1), offset: start };
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

/** `"name"` or `{ name, left }` → `{ name, left }` against the entry default. */
const resolveMember = (member, entry) =>
  typeof member === "string"
    ? { name: member, left: entry.left }
    : { name: member.name, left: member.left ?? entry.left };

for (const entry of LOCKSTEP) {
  const sources = new Map();
  const read = (path) => {
    if (!sources.has(path))
      sources.set(path, readFileSync(join(ROOT, path), "utf8"));
    return sources.get(path);
  };

  test(`lockstep: ${entry.pair} — ${entry.right} ↔ validation-plugin`, () => {
    const rightSrc = read(entry.right);
    let totalLines = 0;

    const compare = (kind, extract, member, minLines) => {
      const { name, left } = resolveMember(member, entry);
      const leftSrc = read(left);
      const a = extract(leftSrc, name);
      const b = extract(rightSrc, name);

      // Vacuity guards: a renamed/moved member must fail HERE (update the
      // registry consciously), never silently shrink the comparison.
      assert.ok(
        a,
        `${kind} ${name} not found in ${left} — renamed/moved? Update the LOCKSTEP registry. ${entry.onDrift}`,
      );
      assert.ok(
        b,
        `${kind} ${name} not found in ${entry.right} — renamed/moved? Update the LOCKSTEP registry. ${entry.onDrift}`,
      );

      const an = normalize(leftSrc, a);
      const bn = normalize(rightSrc, b);

      assert.ok(
        an.length >= minLines,
        `${kind} ${name} extraction from ${left} degenerated (${an.length} lines) — extractor bug, do not trust a green run`,
      );
      totalLines += an.length;

      assert.deepEqual(
        bn,
        an,
        `${kind} ${name} drifted between the twins.\n  left:  ${left}\n  right: ${entry.right}\n${entry.onDrift}`,
      );
    };

    for (const fn of entry.functions)
      compare("function", extractFunction, fn, 3);
    for (const c of entry.constants ?? [])
      compare("const", extractConstant, c, 1);

    // Pair-level floor: the closure is ~180+ code lines; a collapse below the
    // floor means the extractor (or a mass deletion) gutted the comparison.
    assert.ok(
      totalLines >= 100,
      `lockstep comparison shrank to ${totalLines} normalized lines — extractor bug or mass deletion; do not trust a green run`,
    );
  });

  // The registry is a hand-written list mirroring a FILE, so it drifts the way
  // every such list drifts: the file grows a member and the list does not. That
  // is how `isRouteName`, `isRequiredFields` and both constants ended up inside
  // the declared contract and outside the enforced one. Derive the member set
  // from the right-hand file instead of trusting the list to be complete.
  test(`lockstep coverage: every member of ${entry.right} is compared or exempt`, () => {
    const rightSrc = read(entry.right);
    const { inComment, inString } = scan(rightSrc);

    const declared = [];
    const re = /(^|\n)(export )?(function|const) ([A-Z_a-z]\w*)/g;
    let m;
    while ((m = re.exec(rightSrc)) !== null) {
      const at = m.index + m[1].length;
      if (inComment[at] || inString[at]) continue;
      declared.push(m[4]);
    }

    assert.ok(
      declared.length >= 10,
      `only ${declared.length} top-level members found in ${entry.right} — extractor bug, do not trust a green run`,
    );

    const covered = new Set([
      ...entry.functions.map((f) => resolveMember(f, entry).name),
      ...(entry.constants ?? []).map((c) => resolveMember(c, entry).name),
      ...Object.keys(entry.exempt ?? {}),
    ]);

    assert.deepEqual(
      declared.filter((name) => !covered.has(name)),
      [],
      `${entry.right} declares members the LOCKSTEP registry neither compares nor exempts.\n` +
        `Add each to \`functions\` / \`constants\` (with its own \`left\` if it lives elsewhere), ` +
        `or to \`exempt\` with a written reason.\n${entry.onDrift}`,
    );

    for (const [name, reason] of Object.entries(entry.exempt ?? {})) {
      assert.ok(
        declared.includes(name),
        `stale exemption: ${name} is no longer declared in ${entry.right} — drop it from \`exempt\``,
      );
      assert.ok(
        reason.length >= 40,
        `exemption ${name} needs a real written reason — it is the only way a member escapes comparison`,
      );
    }
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
