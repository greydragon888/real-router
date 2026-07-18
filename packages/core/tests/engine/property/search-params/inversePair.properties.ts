import { fc, test } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import { arbSafeString } from "./helpers";
import { build, parseQuery } from "../../../../src/engine/search-params";

import type {
  ArrayFormat,
  NumberFormat,
  Options,
} from "../../../../src/engine/search-params";

/**
 * Inverse-pair contract: `range(parseQuery) ⊆ dom(build)` (#1155/#1156, axis A7).
 *
 * The existing property suite derives every query string from `build(params)`
 * (`helpers.ts` `arbQueryString`/`arbQueryStringWithOpts`), so its domain is the
 * IMAGE of `build`. Any external wire string outside that image — `?a&a=1`,
 * `?a[]`, `x=1&&&x=2` — is structurally invisible, which is why three audit
 * waves + #1037 missed the `parseQuery→build` crash.
 *
 * This file closes the blind zone BY CONSTRUCTION: `arbRawQueryString` produces
 * query strings from the WIRE GRAMMAR directly (key-only / `=value` / repeats /
 * brackets / empty chunks), NOT from `build`. It reaches exactly the inputs
 * `parseQuery` accepts but `build` never emits, making the `parseQuery→build` half of the
 * inverse pair testable.
 */

// A deliberately tiny key pool so repeated keys collide and force array
// accumulation (the `[null, 1]` shape at the heart of #1155). Includes the empty
// key `""` — a type-valid `SearchParams` key exercised by the contract.
const arbGrammarKey = fc.constantFrom("a", "b", "");

// Values incl. the coercion/edge tokens the format strategies special-case
// (boolean "true"/"false", number "1"/"007", comma "a,b") and the empty value
// (`?a=`), which decodes to the empty string, not null.
const arbGrammarValue = fc.oneof(
  arbSafeString,
  fc.constantFrom("true", "false", "1", "007", "a,b", ""),
);

const arbChunk: fc.Arbitrary<string> = fc.oneof(
  fc.constant(""), // empty chunk (between `&&`, leading/trailing `&`) — #1156
  arbGrammarKey, // key-only `?a` → null (none/auto) or true (empty-true)
  fc.tuple(arbGrammarKey, arbGrammarValue).map(([k, v]) => `${k}=${v}`),
  arbGrammarKey.map((k) => `${k}[]`), // brackets key-only
  fc.tuple(arbGrammarKey, arbGrammarValue).map(([k, v]) => `${k}[]=${v}`),
  fc.tuple(arbGrammarKey, fc.nat({ max: 3 })).map(([k, i]) => `${k}[${i}]`),
  fc
    .tuple(arbGrammarKey, fc.nat({ max: 3 }), arbGrammarValue)
    .map(([k, i, v]) => `${k}[${i}]=${v}`),
);

/** Wire-grammar query string — the whole inverse-half, incl. empty key. */
export const arbRawQueryString: fc.Arbitrary<string> = fc
  .array(arbChunk, { minLength: 1, maxLength: 6 })
  .map((chunks) => chunks.join("&"));

const arbArrayFormat: fc.Arbitrary<ArrayFormat> = fc.constantFrom(
  "none",
  "brackets",
  "index",
  "comma",
);
const arbNumberFormat: fc.Arbitrary<NumberFormat> = fc.constantFrom(
  "none",
  "auto",
);

// Full option matrix (incl. nullFormat "hidden" and booleanFormat "empty-true").
const arbAllOptions: fc.Arbitrary<Options> = fc.record({
  arrayFormat: arbArrayFormat,
  booleanFormat: fc.constantFrom("none", "auto", "empty-true"),
  nullFormat: fc.constantFrom("default", "hidden"),
  numberFormat: arbNumberFormat,
});

describe("inverse-pair contract (#1155/#1156, A7)", () => {
  test.prop([arbRawQueryString, arbAllOptions], { numRuns: 500 })(
    "totality: build(parseQuery(qs)) never throws — range(parseQuery) ⊆ dom(build)",
    (qs: string, opts: Options) => {
      const parsed = parseQuery(qs, opts);

      expect(() => build(parsed, opts)).not.toThrow();
    },
  );

  // NOTE on the closure direction. A naive `parseQuery(build(parseQuery(qs))) ≡ parseQuery(qs)`
  // (or the wire-fixpoint `build(parseQuery(build(parseQuery(qs)))) === build(parseQuery(qs))`)
  // is NOT a clean universal contract here and is deliberately NOT asserted: it
  // fails on legitimate, documented behaviour — parseQuery's bracket/repeat
  // array-detection is richer than build's per-format emission (a single-element
  // `[x]` collapses to a scalar under `none`/`comma`; an array boolean `[true]`
  // emits `a=true` under `empty-true` where the scalar emits the bare `a`). The
  // params-first roundtrip in `parseBuild.properties.ts` covers the
  // build→parseQuery→params contract; TOTALITY above is the parseQuery→build half.

  // Named anchors — the exact five wire producers #1155 enumerates plus the
  // #1156 empty-chunk case. Build-throws / junk-params on current code.
  describe("named producers", () => {
    it("#1155: repeated key-only then value (default config)", () => {
      expect(() => build(parseQuery("a&a=1"))).not.toThrow();
    });

    it("#1155: two key-only chunks", () => {
      expect(() => build(parseQuery("a&a"))).not.toThrow();
    });

    it("#1155: brackets key-only", () => {
      const opts = { arrayFormat: "brackets" } as const;

      expect(() => build(parseQuery("a[]", opts), opts)).not.toThrow();
    });

    it("#1155: index key-only", () => {
      const opts = { arrayFormat: "index" } as const;

      expect(() => build(parseQuery("a[0]", opts), opts)).not.toThrow();
    });

    it("#1155: double empty chunk with values", () => {
      expect(() => build(parseQuery("x=1&&&x=2"))).not.toThrow();
    });

    it('#1156: leading empty chunk does not inject a junk "" param', () => {
      // default numberFormat "auto" coerces "1" → 1
      expect(parseQuery("&a=1")).toStrictEqual({ a: 1 });
    });

    it("#1156: interior empty chunks are skipped", () => {
      expect(parseQuery("x=1&&&x=2")).toStrictEqual({ x: [1, 2] });
    });
  });
});
