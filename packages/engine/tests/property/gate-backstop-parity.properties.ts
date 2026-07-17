// packages/route-tree/tests/property/gate-backstop-parity.properties.ts

import { fc, test } from "@fast-check/vitest";
import { describe, expect } from "vitest";

import { NUM_RUNS } from "./helpers";
import { createRouteTree } from "../../src/builder/createRouteTree";
import { createMatcher } from "../../src/createMatcher";
import { validateRoutePath } from "../../src/validation/routes";

/**
 * Gate ↔ backstop parity (#1320 Tier 2).
 *
 * The route-tree `validateRoutePath` GATE (a whole-path pre-pass) and the
 * path-matcher `registerTree` BACKSTOP (per-segment, during trie insertion)
 * independently reject the same malformed single-path shapes — at DIFFERENT
 * granularities and, for these scans, with SEPARATE implementations (gate
 * char-scan vs backstop regex/embedded fork logic). Tier 1 of #1320 single-
 * sourced the whole-path scans the two layers could literally share
 * (`hasFusedConstraintSuffix`, `hasConstraintInStaticSegment`,
 * `isConstraintBalanced`); the scans below cannot be merged without restructuring
 * the perf-sensitive (#1285) / trie-interleaved backstop, so a fix to one could
 * silently drift from the other.
 *
 * This property is the CONTRACT that makes the parallel code safe: for every
 * generated single-path shape, the gate verdict and the backstop verdict must
 * MATCH — proven across the input space, not merged in code. If a future edit
 * makes one layer stricter than the other, a generated shape will land in the
 * gap and this fails.
 *
 * Deliberately EXCLUDED — documented single-layer behaviour, NOT parity bugs:
 * - gate-only string-format checks (`//`, whitespace, non-string, `~`): the
 *   backstop consumes an already-segmented, well-formed path.
 *
 * The trailing-marker `/:y*` divergence — gate rejected, backstop accepted — is
 * now CLOSED (#1324): the backstop routes its param/splat name boundary through
 * the same `parseSegment` tokenizer as the gate, so both reject it. It is a
 * parity SCAN class below, no longer an exclusion.
 */

// A route segment of safe lowercase letters — no markers, no constraints, ASCII.
const arbSafeSegment = fc.stringMatching(/^[a-z]{1,8}$/);
const arbNonAscii = fc.constantFrom("é", "ü", "ñ", "ö", "ç", "中", "я");

/** Does the route-tree gate (`validateRoutePath`) reject this path? */
function gateRejects(path: string): boolean {
  try {
    validateRoutePath(path, "r", "addRoute");

    return false;
  } catch {
    return true;
  }
}

/** Does path-matcher's build + `registerTree` backstop reject this path? */
function backstopRejects(path: string): boolean {
  try {
    const tree = createRouteTree("", "", [{ name: "r", path }]);

    createMatcher().registerTree(tree);

    return false;
  } catch {
    return true;
  }
}

/**
 * One reject-class: a `malformed` generator (both layers MUST reject) plus a
 * `valid` near-miss generator (both layers MUST accept). Asserting the absolute
 * verdict on each side proves parity (they agree) AND discrimination (the
 * generators actually straddle the boundary).
 */
interface ScanClass {
  readonly name: string;
  readonly malformed: fc.Arbitrary<string>;
  readonly valid: fc.Arbitrary<string>;
}

const SCANS: readonly ScanClass[] = [
  {
    name: "fused mid-segment marker (#1050)",
    // a marker (`:`/`*`) after a static prefix within a segment — /a:b, /foo*bar
    malformed: fc
      .tuple(arbSafeSegment, fc.constantFrom(":", "*"), arbSafeSegment)
      .map(([s, m, n]) => `/${s}${m}${n}`),
    // a clean marker-led segment — /:id, /*rest
    valid: fc
      .tuple(fc.constantFrom(":", "*"), arbSafeSegment)
      .map(([m, n]) => `/${m}${n}`),
  },
  {
    name: "trailing parameter marker (#1324)",
    // a param/splat name ending in a bare marker — /:y*, /:y:, /*y:
    malformed: fc
      .tuple(
        fc.constantFrom(":", "*"),
        arbSafeSegment,
        fc.constantFrom(":", "*"),
      )
      .map(([m, n, t]) => `/${m}${n}${t}`),
    // a clean marker-led name, no trailing marker — /:id, /*rest
    valid: fc
      .tuple(fc.constantFrom(":", "*"), arbSafeSegment)
      .map(([m, n]) => `/${m}${n}`),
  },
  {
    name: "optional modifier on a marker-less segment (#1241 / #1324 §4)",
    // a marker-less segment with a trailing `?` — `/faq?` — is an optional with no
    // param name. The backstop rejects it via its `endsWith("?")` optional fork and
    // the gate via `findSegmentGrammarError`; both now consume parseSegment's SAME
    // name-less verdict, so they agree (this was the F1 gate↔backstop drift).
    malformed: arbSafeSegment.map((s) => `/${s}?`),
    // the same static without the trailing `?`
    valid: arbSafeSegment.map((s) => `/${s}`),
  },
  {
    name: "non-ASCII static (#1154)",
    // a non-ASCII code point in a STATIC segment — /café, /меню
    malformed: fc
      .tuple(arbSafeSegment, arbNonAscii, arbSafeSegment)
      .map(([a, c, b]) => `/${a}${c}${b}`),
    valid: arbSafeSegment.map((s) => `/${s}`),
  },
  {
    name: "optional splat (#1149)",
    // a splat carrying the optional marker — /*path?
    malformed: arbSafeSegment.map((n) => `/*${n}?`),
    // a plain required splat — /*rest
    valid: arbSafeSegment.map((n) => `/*${n}`),
  },
  {
    name: "unconstrained optional before splat (#1264)",
    // an unconstrained optional directly before a splat — /:v?/*rest
    malformed: fc
      .tuple(arbSafeSegment, arbSafeSegment)
      .map(([v, r]) => `/:${v}?/*${r}`),
    // a REQUIRED param before a splat carries a validity signal — /:id/*rest
    // (distinct names, else /:c/*c is a param+splat dup, a DIFFERENT reject)
    valid: fc
      .tuple(arbSafeSegment, arbSafeSegment)
      .filter(([v, r]) => v !== r)
      .map(([v, r]) => `/:${v}/*${r}`),
  },
  {
    name: "duplicate param name (#1151)",
    // the same param name twice within one path — /:id/:id
    malformed: arbSafeSegment.map((n) => `/:${n}/:${n}`),
    // two distinct param names — /:a/:b
    valid: fc
      .tuple(arbSafeSegment, arbSafeSegment)
      .filter(([a, b]) => a !== b)
      .map(([a, b]) => `/:${a}/:${b}`),
  },
  {
    name: "two optionals before splat (#1287)",
    // two CONSTRAINED optionals directly before a splat — /:a<c>?/:b<c>?/*rest.
    // Constrained so #1264's single-unconstrained-optional scan doesn't fire first;
    // all three names distinct so it isn't a #1151 dup / param+splat clash instead.
    malformed: fc
      .tuple(arbSafeSegment, arbSafeSegment, arbSafeSegment)
      .filter(([a, b, r]) => new Set([a, b, r]).size === 3)
      .map(([a, b, r]) => `/:${a}<[a-z]+>?/:${b}<[a-z]+>?/*${r}`),
    // a SINGLE constrained optional before a splat IS supported (#1264 A1) — both accept
    valid: fc
      .tuple(arbSafeSegment, arbSafeSegment)
      .filter(([v, r]) => v !== r)
      .map(([v, r]) => `/:${v}<[a-z]+>?/*${r}`),
  },
];

describe("gate ↔ backstop parity (#1320 Tier 2)", () => {
  describe.each(SCANS)("$name", (scan) => {
    test.prop([scan.malformed], { numRuns: NUM_RUNS.standard })(
      "malformed → BOTH gate and backstop reject",
      (path) => {
        expect(gateRejects(path)).toBe(true);
        expect(backstopRejects(path)).toBe(true);
      },
    );

    test.prop([scan.valid], { numRuns: NUM_RUNS.standard })(
      "valid near-miss → NEITHER gate nor backstop rejects",
      (path) => {
        expect(gateRejects(path)).toBe(false);
        expect(backstopRejects(path)).toBe(false);
      },
    );
  });
});
