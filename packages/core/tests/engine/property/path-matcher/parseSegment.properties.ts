import { fc, test } from "@fast-check/vitest";
import { describe, expect } from "vitest";

import { buildParamMeta } from "../../../../src/engine/path-matcher/buildParamMeta";
import { parseSegment } from "../../../../src/engine/path-matcher/parseSegment";

import type { SegmentTokens } from "../../../../src/engine/path-matcher/parseSegment";

/**
 * `parseSegment` is the single source of the 3-token grammar (`static | :param |
 * *splat`, M1). These properties prove it (A) tokenizes every valid segment in
 * agreement with the metadata a consumer reads, (B/C) rejects each malformed /
 * removed family with the right code, and (D) is total — never throws on any
 * string. The oracle is the LIVE `buildParamMeta`, not a re-typed regex.
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

// A `<...>` body (a former constraint) — now always a rejection.
const arbConstraintBody = fc.constantFrom(
  String.raw`\d+`,
  "[a-z]+",
  String.raw`\w`,
  "a",
  "x?y",
  "a<b",
  String.raw`\d?`,
);

// ---- valid segment builders (well-formed by construction) ----------------
const arbStatic = fc
  .string({ unit: arbSafeChar, minLength: 1, maxLength: 8 })
  .filter((s) => s.codePointAt(0) !== 58 && s.codePointAt(0) !== 42);
const arbParam = arbName.map((name) => `:${name}`);
const arbSplat = arbName.map((name) => `*${name}`);
const arbValidSeg = fc.oneof(arbStatic, arbParam, arbSplat);

function oracle(seg: string): SegmentTokens {
  const meta = buildParamMeta(`/${seg}`);

  if (seg.codePointAt(0) === 42) {
    return { kind: "splat", name: meta.spatParams[0] };
  }
  if (seg.codePointAt(0) === 58) {
    return { kind: "param", name: meta.urlParams[0] };
  }

  return { kind: "static", text: seg };
}

describe("parseSegment — 3-token grammar (M1)", () => {
  test.prop([arbValidSeg], { numRuns: 2000 })(
    "A — valid segment: tokens match the live buildParamMeta (name/kind)",
    (seg) => {
      expect(parseSegment(seg)).toStrictEqual(oracle(seg));
    },
  );

  // ---- Property B: trailing bare marker (#1324) ----------------------------
  const arbTrailing = fc
    .tuple(arbName, fc.constantFrom(":", "*"), fc.constantFrom(":", "*"))
    .map(([name, lead, trail]) => `${lead}${name}${trail}`);

  test.prop([arbTrailing], { numRuns: 500 })(
    "B — trailing bare marker rejects (#1324), and buildParamMeta extracts no param",
    (seg) => {
      expect(parseSegment(seg)).toStrictEqual({ error: "trailing-marker" });
      expect(buildParamMeta(`/${seg}`).urlParams).toStrictEqual([]);
    },
  );

  // ---- Property C: the malformed / removed families ------------------------
  const arbFusedMarker = fc
    .tuple(arbStatic, fc.constantFrom(":", "*"), arbName)
    .map(([pre, m, name]) => `${pre}${m}${name}`);
  const arbConstrainedParam = fc
    .tuple(arbName, arbConstraintBody)
    .map(([name, c]) => `:${name}<${c}>`);
  const arbConstraintInStatic = fc
    .tuple(arbStatic, arbConstraintBody)
    .map(([pre, c]) => `${pre}<${c}>`);
  const arbOptionalParam = arbName.map((name) => `:${name}?`);
  const arbOptionalSplat = arbName.map((name) => `*${name}?`);

  test.prop([arbFusedMarker], { numRuns: 500 })(
    "C1 — marker fused after a static prefix rejects (#1050)",
    (seg) => {
      expect(parseSegment(seg)).toStrictEqual({ error: "fused-marker" });
    },
  );

  test.prop([fc.oneof(arbConstrainedParam, arbConstraintInStatic)], {
    numRuns: 500,
  })(
    "C2 — any `<...>` constraint rejects as `constraint-removed` (M1)",
    (seg) => {
      expect(parseSegment(seg)).toStrictEqual({ error: "constraint-removed" });
    },
  );

  test.prop([fc.oneof(arbOptionalParam, arbOptionalSplat)], { numRuns: 500 })(
    "C3 — any trailing `?` optional rejects as `optional-removed` (M1)",
    (seg) => {
      expect(parseSegment(seg)).toStrictEqual({ error: "optional-removed" });
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

  // ---- Property E: a valid path's param names round-trip through the meta ---
  const arbValidPath = fc
    .array(arbValidSeg, { minLength: 1, maxLength: 5 })
    .map((segs) => `/${segs.join("/")}`);

  test.prop([arbValidPath], { numRuns: 2000 })(
    "E — every `:`/`*`-led segment of a valid path becomes a urlParam, in order",
    (path) => {
      const expected = path
        .split("/")
        .filter((s) => s.startsWith(":") || s.startsWith("*"))
        .map((s) => {
          const t = parseSegment(s);

          return "error" in t ? "" : (t as { name: string }).name;
        });

      expect([...buildParamMeta(path).urlParams]).toStrictEqual(expected);
    },
  );
});
