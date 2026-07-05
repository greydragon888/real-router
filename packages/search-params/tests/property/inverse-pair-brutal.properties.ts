import { fc, test } from "@fast-check/vitest";
import { describe, expect } from "vitest";

import {
  arbNonCanonicalNumericString,
  arbSafeString,
  arbStringWithComma,
  arbUnicodeString,
} from "./helpers";
import { build, parse } from "../../src";

import type { Options } from "../../src";

/**
 * BRUTAL inverse-pair contract: `range(parse) ⊆ dom(build)` (#1155/#1156, axis A7)
 * — the search-params counterpart of `path-matcher`'s brutal inverse-half sweep.
 *
 * `inversePair.properties.ts` closes the blind zone with the WIRE grammar and the
 * full option matrix. This file stacks every adversarial axis ON TOP of that, in
 * one generator: prototype-name keys (`__proto__`/`constructor`/…), unicode /
 * non-canonical-numeric / comma-bearing / structural values, malformed brackets
 * (`a[`, `a]`), extreme indices (`a[999999999]`), nested brackets (`a[0][1]`),
 * doubled `=`, and depth up to 8 chunks — under all 48 option combinations.
 *
 * Scope: VALID percent only. `parse` throws `URIError` on MALFORMED percent
 * (`%zz`) by design — that input is outside `dom(parse)`, and the router already
 * guards the throw at `SegmentMatcher.#mergeQueryParams` (a try/catch → the URL
 * resolves to UNKNOWN_ROUTE, never a crash — #737). It is therefore not part of
 * this `range(parse) ⊆ dom(build)` contract.
 */

// Collision pool + prototype-name keys (the `Object.hasOwn` / `defineProperty`
// accumulator path) + unicode / special / valid-percent keys.
const arbBrutalKey = fc.oneof(
  fc.constantFrom("a", "b", ""),
  fc.constantFrom(
    "__proto__",
    "constructor",
    "prototype",
    "toString",
    "valueOf",
    "hasOwnProperty",
    "isPrototypeOf",
  ),
  fc.constantFrom("a.b", "a-b", "café", "中", "🎉", "%20", "a%2Bb"),
);

const arbBrutalValue = fc.oneof(
  arbSafeString,
  arbUnicodeString,
  arbStringWithComma,
  arbNonCanonicalNumericString,
  fc.constantFrom(
    "true",
    "false",
    "1",
    "007",
    "-0",
    "",
    "a,b",
    "%20",
    "%2C",
    "%E2%9C%93",
    "a=b",
  ),
);

const arbBrutalChunk: fc.Arbitrary<string> = fc.oneof(
  fc.constant(""), // empty chunk (leading/trailing/`&&`) — #1156
  arbBrutalKey, // key-only → null / true
  fc.tuple(arbBrutalKey, arbBrutalValue).map(([k, v]) => `${k}=${v}`),
  fc.tuple(arbBrutalKey, arbBrutalValue).map(([k, v]) => `${k}==${v}`), // doubled =
  arbBrutalKey.map((k) => `${k}[]`), // brackets key-only
  fc.tuple(arbBrutalKey, arbBrutalValue).map(([k, v]) => `${k}[]=${v}`),
  fc.tuple(arbBrutalKey, fc.nat({ max: 4 })).map(([k, i]) => `${k}[${i}]`),
  fc
    .tuple(arbBrutalKey, fc.nat({ max: 4 }), arbBrutalValue)
    .map(([k, i, v]) => `${k}[${i}]=${v}`),
  arbBrutalKey.map((k) => `${k}[`), // malformed open bracket
  arbBrutalKey.map((k) => `${k}]`), // malformed close bracket
  arbBrutalKey.map((k) => `${k}[999999999]`), // extreme index
  fc
    .tuple(arbBrutalKey, fc.nat({ max: 3 }), fc.nat({ max: 3 }))
    .map(([k, i, j]) => `${k}[${i}][${j}]`), // nested brackets
);

const arbBrutalQs: fc.Arbitrary<string> = fc
  .array(arbBrutalChunk, { minLength: 1, maxLength: 8 })
  .map((chunks) => chunks.join("&"));

const arbAllOptions: fc.Arbitrary<Options> = fc.record({
  arrayFormat: fc.constantFrom("none", "brackets", "index", "comma"),
  booleanFormat: fc.constantFrom("none", "auto", "empty-true"),
  nullFormat: fc.constantFrom("default", "hidden"),
  numberFormat: fc.constantFrom("none", "auto"),
});

describe("inverse-pair BRUTAL (#1155/#1156, A7)", () => {
  test.prop([arbBrutalQs, arbAllOptions], { numRuns: 1000 })(
    "range(parse) ⊆ dom(build): build(parse(qs)) never throws, brutal keys/values/brackets × full matrix",
    (qs: string, opts: Options) => {
      const protoKeysBefore = Object.keys(Object.prototype).length;
      const parsed = parse(qs, opts);

      // TOTALITY — parse's output is always in build's domain.
      expect(() => build(parsed, opts)).not.toThrow();
      // A second wire round (re-parse the built string) must not throw either.
      expect(() => parse(build(parsed, opts), opts)).not.toThrow();
      // A `__proto__` / `constructor` / `prototype` key must not pollute the global prototype.
      expect(Object.keys(Object.prototype)).toHaveLength(protoKeysBefore);
    },
  );
});
