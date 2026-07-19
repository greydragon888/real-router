// packages/route-tree/tests/property/gate-backstop-parity.properties.ts

import { fc, test } from "@fast-check/vitest";
import { describe, expect } from "vitest";

import { NUM_RUNS } from "./helpers";
import { createRouteTree } from "../../../src/engine/builder/createRouteTree";
import { createMatcher } from "../../../src/engine/createMatcher";
import { validateRoutePath } from "../../../src/engine/validation/routes";

/**
 * Gate ↔ backstop parity (#1320 Tier 2).
 *
 * The route-tree `validateRoutePath` GATE (a whole-path pre-pass) and the
 * path-matcher `registerTree` BACKSTOP (per-segment, during trie insertion)
 * independently reject the same malformed single-path shapes — at DIFFERENT
 * granularities and, for these scans, with SEPARATE implementations (gate
 * char-scan vs backstop regex/embedded logic). The per-segment grammar (name-less,
 * fused/trailing marker, and the two M1 removed forms — optional-removed /
 * constraint-removed, #1516) is single-sourced in the shared `parseSegment`
 * tokenizer, so it cannot drift by construction. The scans below (non-ASCII #1154,
 * dup-param #1151) are still implemented separately on the two layers and cannot be
 * merged without restructuring the perf-sensitive (#1285) / trie-interleaved
 * backstop, so a fix to one could silently drift from the other.
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
    name: "optional param removed (M1)",
    // a `:x?`/`*x?` optional modifier — /:v?, /:v?/x, /*v? — all `optional-removed`
    malformed: fc.oneof(
      arbSafeSegment.map((v) => `/:${v}?`),
      fc.tuple(arbSafeSegment, arbSafeSegment).map(([v, x]) => `/:${v}?/${x}`),
      arbSafeSegment.map((v) => `/*${v}?`),
    ),
    // the same shapes without the trailing `?`
    valid: fc.oneof(
      arbSafeSegment.map((v) => `/:${v}`),
      fc.tuple(arbSafeSegment, arbSafeSegment).map(([v, x]) => `/:${v}/${x}`),
      arbSafeSegment.map((v) => `/*${v}`),
    ),
  },
  {
    name: "regex constraint removed (M1)",
    // a `<re>` constraint (also a stray `<`/`>`) — /:v<\d+>, /a<b>, /a>b
    malformed: fc.oneof(
      arbSafeSegment.map((v) => `/:${v}<[a-z]+>`),
      fc.tuple(arbSafeSegment, arbSafeSegment).map(([a, b]) => `/${a}<${b}>`),
      fc.tuple(arbSafeSegment, arbSafeSegment).map(([a, b]) => `/${a}>${b}`),
    ),
    // the same pieces without the `<`/`>`
    valid: fc.oneof(
      arbSafeSegment.map((v) => `/:${v}`),
      arbSafeSegment.map((s) => `/${s}`),
    ),
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
