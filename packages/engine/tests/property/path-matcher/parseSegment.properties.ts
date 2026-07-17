import { fc, test } from "@fast-check/vitest";
import { describe, expect } from "vitest";

import { buildParamMeta } from "../../../src/path-matcher/buildParamMeta";
import { parseSegment } from "../../../src/path-matcher/parseSegment";

import type { SegmentTokens } from "../../../src/path-matcher/parseSegment";

/**
 * Gate 2 (RFC §8/§10 Phase 1): `parseSegment` is behavior-equivalent to the five
 * current name-boundary parsers on every currently-consistent segment, and
 * deliberately rejects the drifting families (the enumerated §8 flip).
 *
 * The oracle is the LIVE backstop, not re-typed regexes:
 *  - name / kind / constraint  ← `buildParamMeta("/" + seg)` (L1, `URL_PARAM_RGX`)
 *  - optional                  ← `seg.endsWith("?")` (the trie's actual test, L3)
 *
 * A scan-vs-left-to-right divergence on any VALID segment would be a breaking
 * change (§8), so Property A is the real proof; Properties B/C pin the intended
 * rejections.
 */

const SAFE = "abABz09-_.";
const arbSafeChar = fc.constantFrom(...SAFE.split(""));
// A name may carry an interior `:`/`*` (mid-marker, e.g. `a:b` — preserved) but
// never a TRAILING one (that is #1324); guarantee the last char is safe.
const arbName = fc
  .tuple(
    fc.string({
      unit: fc.constantFrom(...`${SAFE}:*`.split("")),
      maxLength: 6,
    }),
    arbSafeChar,
  )
  .map(([body, last]) => body + last);
// VALID-regex bodies only: `buildParamMeta` (the oracle) compiles the constraint
// into a `RegExp` and throws on an invalid body — a downstream concern that
// `parseSegment` deliberately does NOT share (it only tokenizes the `<...>`
// string; regex compilation stays in the consumer). Covers the §8 lazy-`?`
// (`\d?`) and a literal `<` inside the body.
const arbConstraint = fc
  .constantFrom(
    String.raw`\d+`,
    "[a-z]+",
    String.raw`\w`,
    String.raw`v\d`,
    "a",
    "x?y",
    "a<b",
    String.raw`\d?`,
  )
  .map((b) => `<${b}>`);
const arbOpt = fc.boolean();

// ---- valid segment builders (well-formed by construction) ----------------
const arbStatic = fc
  .string({ unit: arbSafeChar, minLength: 1, maxLength: 8 })
  .filter((s) => s.codePointAt(0) !== 58 && s.codePointAt(0) !== 42);
const arbParam = fc
  .tuple(arbName, fc.option(arbConstraint, { nil: undefined }), arbOpt)
  .map(([name, c, opt]) => `:${name}${c ?? ""}${opt ? "?" : ""}`);
const arbSplat = arbName.map((name) => `*${name}`);
const arbValidSeg = fc.oneof(arbStatic, arbParam, arbSplat);

function oracle(seg: string): SegmentTokens {
  const meta = buildParamMeta(`/${seg}`);
  const optional = seg.endsWith("?");

  if (seg.codePointAt(0) === 42) {
    return { kind: "splat", name: meta.spatParams[0] };
  }
  if (seg.codePointAt(0) === 58) {
    const name = meta.urlParams[0];
    const constraint = meta.constraintPatterns.get(name)?.constraint;

    return constraint === undefined
      ? { kind: "param", name, optional }
      : { kind: "param", name, constraint, optional };
  }

  return { kind: "static", text: seg };
}

describe("parseSegment ≡ current parsers (gate 2, #1320 parity re-pointed)", () => {
  test.prop([arbValidSeg], { numRuns: 2000 })(
    "A — valid segment: tokens match the live backstop (name/kind/constraint/optional)",
    (seg) => {
      expect(parseSegment(seg)).toStrictEqual(oracle(seg));
    },
  );

  // ---- Property B: the #1324 family — the ONE enumerated accept→reject flip
  const arbTrailing = fc
    .tuple(arbName, fc.constantFrom(":", "*"), fc.constantFrom(":", "*"))
    .map(([name, lead, trail]) => `${lead}${name}${trail}`);

  test.prop([arbTrailing], { numRuns: 500 })(
    "B — trailing bare marker: parseSegment rejects it, and the migrated backstop now AGREES (drift closed)",
    (seg) => {
      // parseSegment adopts the gate's verdict: reject.
      expect(parseSegment(seg)).toStrictEqual({ error: "trailing-marker" });

      // Post-Phase-2 buildParamMeta consumes parseSegment, so it no longer swallows
      // the trailing marker into a param name — the #1324 drift is closed at L1
      // (the enumerated §8 flip; the route was a dead route either way).
      expect(buildParamMeta(`/${seg}`).urlParams).toStrictEqual([]);
    },
  );

  // ---- Property C: the other malformed families reject with a defined code
  const arbFusedMarker = fc
    .tuple(arbStatic, fc.constantFrom(":", "*"), arbName)
    .map(([pre, m, name]) => `${pre}${m}${name}`);
  const arbConstraintInStatic = fc
    .tuple(arbStatic, arbConstraint)
    .map(([pre, c]) => `${pre}${c}`);
  const arbFusedSuffix = fc
    .tuple(arbName, arbConstraint, arbStatic)
    .map(([name, c, suffix]) => `:${name}${c}${suffix}`);
  const arbOptionalSplat = arbName.map((name) => `*${name}?`);

  test.prop([arbFusedMarker], { numRuns: 500 })(
    "C1 — marker fused after a static prefix rejects (#1050)",
    (seg) => {
      expect(parseSegment(seg)).toStrictEqual({ error: "fused-marker" });
    },
  );

  test.prop([arbConstraintInStatic], { numRuns: 500 })(
    "C2 — constraint in a static segment rejects (#1311)",
    (seg) => {
      expect(parseSegment(seg)).toStrictEqual({
        error: "constraint-in-static",
      });
    },
  );

  test.prop([arbFusedSuffix], { numRuns: 500 })(
    "C3 — static text fused to a constraint's `>` rejects (#1150)",
    (seg) => {
      expect(parseSegment(seg)).toStrictEqual({
        error: "fused-constraint-suffix",
      });
    },
  );

  test.prop([arbOptionalSplat], { numRuns: 500 })(
    "C4 — optional splat rejects (#1149)",
    (seg) => {
      expect(parseSegment(seg)).toStrictEqual({ error: "optional-splat" });
    },
  );

  // ---- Property D: total — parseSegment never throws on ANY string ---------
  test.prop([fc.string({ maxLength: 12 })], { numRuns: 3000 })(
    "D — total: returns a token or an error for arbitrary input, never throws",
    (seg) => {
      const r = parseSegment(seg);

      expect("kind" in r || "error" in r).toBe(true);
    },
  );

  // ---- Phase 2 parity-lock: migrated buildParamMeta ≡ the legacy whole-path scan
  const LEGACY_RGX = /([:*])([^/?<]+)(<[^>]*>)?(\?)?/g;

  const legacyExtract = (path: string) => {
    const url: string[] = [];
    const spat: string[] = [];
    const constr = new Map<string, string>();

    for (const [, marker, name, constraint] of path.matchAll(LEGACY_RGX)) {
      url.push(name);
      if (marker === "*") {
        spat.push(name);
      } else if (constraint) {
        // Map = last-wins by name, exactly like buildParamMeta's constraintPatterns.
        constr.set(name, constraint);
      }
    }

    return { url, spat, constr: [...constr] };
  };
  const metaTriple = (path: string) => {
    const meta = buildParamMeta(path);

    return {
      url: [...meta.urlParams],
      spat: [...meta.spatParams],
      constr: [...meta.constraintPatterns].map(
        ([k, v]) => [k, v.constraint] as [string, string],
      ),
    };
  };
  const arbValidPath = fc
    .array(arbValidSeg, { minLength: 1, maxLength: 5 })
    .map((segs) => `/${segs.join("/")}`);

  test.prop([arbValidPath], { numRuns: 2000 })(
    "E — parity: migrated buildParamMeta ≡ legacy URL_PARAM_RGX on a valid path",
    (path) => {
      expect(metaTriple(path)).toStrictEqual(legacyExtract(path));
    },
  );

  it("E2 — parity holds for a constraint containing `/` (the splitter's whole purpose)", () => {
    for (const p of [
      "/x/:id<a/b>/y",
      "/:v<a|b/c>/w",
      String.raw`/users/:id<\d+>/:pid`,
    ]) {
      expect(metaTriple(p)).toStrictEqual(legacyExtract(p));
    }
  });
});
