import { fc, test } from "@fast-check/vitest";
import { describe, expect } from "vitest";

import {
  arbNonCanonicalNumericString,
  arbSafeString,
  arbStringWithComma,
  arbUnicodeString,
} from "./helpers";
import { build, parseQuery } from "../../../src/search-params";

import type { Options } from "../../../src/search-params";

/**
 * BRUTAL inverse-pair contract: `range(parseQuery) ⊆ dom(build)` (#1155/#1156, axis A7)
 * — the search-params counterpart of `path-matcher`'s brutal inverse-half sweep.
 *
 * `inversePair.properties.ts` closes the blind zone with the WIRE grammar and the
 * full option matrix. This file stacks every adversarial axis ON TOP of that, in
 * one generator: prototype-name keys (`__proto__`/`constructor`/…), unicode /
 * non-canonical-numeric / comma-bearing / structural values, malformed brackets
 * (`a[`, `a]`), extreme indices (`a[999999999]`), nested brackets (`a[0][1]`),
 * doubled `=`, and depth up to 8 chunks — under all 48 option combinations.
 *
 * Scope: VALID percent only. `parseQuery` throws `URIError` on MALFORMED percent
 * (`%zz`) by design — that input is outside `dom(parseQuery)`, and the router already
 * guards the throw at `SegmentMatcher.#mergeQueryParams` (a try/catch → the URL
 * resolves to UNKNOWN_ROUTE, never a crash — #737). It is therefore not part of
 * this `range(parseQuery) ⊆ dom(build)` contract.
 *
 * Lone (unpaired) surrogates ARE in scope (#1314): `parseQuery` accepts one verbatim
 * (its non-percent decode is identity), and `build` must not throw on it — the
 * former blind axis that made the whole suite pass while `build(parseQuery("a=\uD800"))`
 * threw `URIError`. `safeEncode` now sanitizes it to U+FFFD, so totality holds; the
 * `LONE`/`PAIR` tokens below arm the generators for it, and the value-oracle block
 * pins the (lossy but total) result.
 */

const LONE_SURROGATE = "\uD800"; // unpaired high surrogate

// Collision pool + prototype-name keys (the `Object.hasOwn` / `defineProperty`
// accumulator path) + unicode / special / valid-percent / lone-surrogate keys.
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
  fc.constantFrom(
    "a.b",
    "a-b",
    "café",
    "中",
    "🎉",
    "%20",
    "a%2Bb",
    LONE_SURROGATE,
    `a${LONE_SURROGATE}b`,
  ),
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
    LONE_SURROGATE,
    `x${LONE_SURROGATE}`,
    "\uDC00",
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
  // Non-numeric bracket content (`a[b]`): the bracket carries a NAME, not an
  // index — `parseQuery` treats it as an array push, not a positional insert. Was a
  // qs-first generator gap (audit 2026-07-07): the wire grammar emitted only
  // numeric `[i]` / empty `[]`, so `build(parseQuery("a[b]=x"))` was never exercised.
  fc
    .tuple(arbBrutalKey, fc.constantFrom("b", "x", "id"))
    .map(([k, b]) => `${k}[${b}]`),
  fc
    .tuple(arbBrutalKey, fc.constantFrom("b", "x", "id"), arbBrutalValue)
    .map(([k, b, v]) => `${k}[${b}]=${v}`),
  // Percent-encoded brackets (`a%5B%5D`): the `[]` is ENCODED, so `parseQuery` reads
  // the literal key `a[]` (a scalar), NOT an array — the encoded-bracket edge.
  // Same audit gap: only raw `[]` was generated.
  arbBrutalKey.map((k) => `${k}%5B%5D`),
  fc.tuple(arbBrutalKey, arbBrutalValue).map(([k, v]) => `${k}%5B%5D=${v}`),
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
    "range(parseQuery) ⊆ dom(build): build(parseQuery(qs)) never throws, brutal keys/values/brackets × full matrix",
    (qs: string, opts: Options) => {
      const protoKeysBefore = Object.keys(Object.prototype).length;
      const parsed = parseQuery(qs, opts);

      // TOTALITY — parseQuery's output is always in build's domain.
      expect(() => build(parsed, opts)).not.toThrow();
      // A second wire round (re-parseQuery the built string) must not throw either.
      expect(() => parseQuery(build(parsed, opts), opts)).not.toThrow();
      // A `__proto__` / `constructor` / `prototype` key must not pollute the global prototype.
      expect(Object.keys(Object.prototype)).toHaveLength(protoKeysBefore);
    },
  );
});

describe("lone surrogate — total but lossy (#1314)", () => {
  test("build sanitizes a lone surrogate to U+FFFD instead of throwing (scalar)", () => {
    expect(build(parseQuery(`a=${LONE_SURROGATE}`))).toBe("a=%EF%BF%BD");
  });

  test("build sanitizes a lone surrogate array element (Format Roundtrips #9)", () => {
    expect(build({ a: [LONE_SURROGATE] })).toBe("a=%EF%BF%BD");
  });

  test("first round-trip mutates the garbage to U+FFFD, then stabilises", () => {
    // \uD800 is non-round-trippable garbage; build → %EF%BF%BD → parseQuery → U+FFFD.
    const once = parseQuery(build(parseQuery(`a=${LONE_SURROGATE}`)));

    expect(once).toStrictEqual({ a: "�" });
    // Idempotent thereafter — no further drift (Format Roundtrips #20).
    expect(parseQuery(build(once))).toStrictEqual({ a: "�" });
  });
});

describe("over-encoded coercion — locked as documented (#1317)", () => {
  // Type coercion is asymmetric between number (reads the DECODED value) and the
  // boolean word-match (reads the RAW value only). Over-encoding an unreserved char
  // is legal per RFC 3986, so two wire spellings of one value can decode to
  // different types. This is a deliberate, documented contract (INVARIANTS
  // Parse/Build #11), NOT a fixed bug — the oracle pins the CURRENT behavior so a
  // future coercion change is caught and the asymmetry cannot drift silently.
  test("number coerces THROUGH percent-encoding (decoded value)", () => {
    expect(parseQuery("a=42")).toStrictEqual({ a: 42 });
    expect(parseQuery("a=4%32")).toStrictEqual({ a: 42 }); // %32 → "2" → 42
    expect(parseQuery("a=%2D5")).toStrictEqual({ a: -5 }); // %2D → "-"
  });

  test("boolean words match RAW only — an over-encoded 'true' stays a string", () => {
    expect(parseQuery("a=true")).toStrictEqual({ a: true });
    expect(parseQuery("a=%74rue")).toStrictEqual({ a: "true" }); // %74 → "t"; raw ≠ "true"
    expect(parseQuery("a=tru%65")).toStrictEqual({ a: "true" });
  });
});
