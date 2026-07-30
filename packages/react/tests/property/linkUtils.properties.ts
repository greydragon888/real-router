// packages/react/tests/property/linkUtils.properties.ts

/**
 * Property-based tests for shared dom-utils helpers.
 *
 * Confirmed bugs covered (regression-locked):
 * - `buildActiveClassName` must NOT produce double spaces when concatenating
 *   active class to a base className with surrounding/internal whitespace.
 * - Active class must be present in the result whenever isActive=true and
 *   activeClassName is non-empty.
 *
 * Previously included tests for `stableSerialize` — moved to `@real-router/sources`
 * as `canonicalJson` (see `packages/sources/tests/unit/canonicalJson.test.ts`).
 */

import { fc, test } from "@fast-check/vitest";
import { describe, expect } from "vitest";

import { arbHash, NUM_RUNS } from "./helpers";
import { buildActiveClassName, buildHref } from "../../src/dom-utils";

import type { Router } from "@real-router/core";

// Independent re-derivation of encodeFragmentInline's strict #1211 formula: the
// drift sentinel asserts buildHref matches it WITHOUT importing the production
// function (which would be a tautology). Local per adapter — the shared
// `__test-helpers` mirror was retired once the encoder became a one-liner.
const computeExpectedFragment = (rawHash: string): string =>
  encodeURI(rawHash).replaceAll("#", "%23");

// =============================================================================
// buildActiveClassName invariants
// =============================================================================

// Mixed whitespace padding — includes tab/newline/CR per §6.2 Inv 4.
// parseTokens uses `/\S+/g`; a regression to `/[^ ]+/g` would silently
// fail on tab/newline-padded class strings. Including all `\s` characters
// exercises the regex correctly through every buildActiveClassName test.
const arbWhitespacePadding = fc.oneof(
  fc.constant(""),
  fc.constant(" "),
  fc.constant("  "),
  fc.constant("\t"),
  fc.constant("\n"),
  fc.constant("\r"),
  fc.constant(" \t"),
  fc.constant("\n  "),
);

const arbToken = fc.stringMatching(/^[a-z][a-z0-9-]{0,8}$/);

/** Base className built from N tokens with arbitrary whitespace padding. */
const arbBaseClassName: fc.Arbitrary<string> = fc
  .tuple(
    arbWhitespacePadding,
    fc.array(arbToken, { minLength: 0, maxLength: 4 }),
    arbWhitespacePadding,
  )
  .map(([head, tokens, tail]) => `${head}${tokens.join("  ")}${tail}`);

const arbActiveClassName = arbToken;

describe("buildActiveClassName — Property Tests", () => {
  describe("Invariant 1: result never contains double spaces (when isActive)", () => {
    // Bug-1 regression: active concat used to produce 'base  active'.
    // The invariant applies to the active-concat code path; when isActive=false
    // the function returns baseClassName as-is by design.
    test.prop([arbActiveClassName, arbBaseClassName], {
      numRuns: NUM_RUNS.thorough,
    })(
      "no '  ' substring when isActive=true",
      (activeClassName, baseClassName) => {
        const result = buildActiveClassName(
          true,
          activeClassName,
          baseClassName,
        );

        // arbActiveClassName always produces a non-empty token, so the
        // active-concat path always returns a defined string. A regression
        // that returns undefined here would silently pass without this
        // explicit assertion.
        expect(result).toBeDefined();
        expect(result).not.toContain("  ");
      },
    );
  });

  describe("Invariant 2: active class present when isActive=true", () => {
    test.prop([arbActiveClassName, arbBaseClassName], {
      numRuns: NUM_RUNS.standard,
    })(
      "result contains activeClassName as a token",
      (activeClassName, baseClassName) => {
        const result = buildActiveClassName(
          true,
          activeClassName,
          baseClassName,
        );

        expect(result).toBeDefined();

        const tokens = result!.split(/\s+/).filter(Boolean);

        expect(tokens).toContain(activeClassName);
      },
    );
  });

  describe("Invariant 3: buildActiveClassName never ADDS a duplicate of the active token (§5.4-consistent)", () => {
    test.prop([arbActiveClassName, arbBaseClassName], {
      numRuns: NUM_RUNS.standard,
    })(
      "active token count is preserved from base (added once iff absent)",
      (activeClassName, baseClassName) => {
        const result = buildActiveClassName(
          true,
          activeClassName,
          baseClassName,
        );

        expect(result).toBeDefined();

        const tokens = result!.split(/\s+/).filter(Boolean);
        const occurrences = tokens.filter((t) => t === activeClassName).length;

        // §5.4 behaviour lock: buildActiveClassName dedupes ONLY the active
        // token it would add — it preserves pre-existing duplicates in base
        // (see the "Behaviour lock … (review §5.4)" suite below). So the active
        // token appears exactly once when it was absent from base, and exactly
        // as many times as it already did when present — NOT collapsed to 1.
        // The earlier `toBe(1)` contradicted §5.4 and flakily failed when the
        // generator produced a base repeating the active token (e.g. active
        // "c" + base " \tc  c \t" → "c c").
        const baseOccurrences = (baseClassName.match(/\S+/g) ?? []).filter(
          (t) => t === activeClassName,
        ).length;

        expect(occurrences).toBe(baseOccurrences === 0 ? 1 : baseOccurrences);
      },
    );
  });

  describe("Invariant 4: result preserves base when isActive=false", () => {
    test.prop([arbActiveClassName, arbBaseClassName], {
      numRuns: NUM_RUNS.standard,
    })("isActive=false → returns baseClassName as-is", (a, base) => {
      expect(buildActiveClassName(false, a, base)).toBe(base);
    });
  });

  describe("Invariant 5: whitespace-only active token → base preserved", () => {
    // parseTokens splits on `\S+`; whitespace-only and empty strings yield
    // zero tokens. In that branch buildActiveClassName must return
    // `baseClassName ?? undefined` — note `??`, not `?:`, so empty string
    // base is preserved verbatim and not coerced to undefined.
    test.prop(
      [
        fc.oneof(fc.constant(""), fc.constant(" "), fc.constant("  ")),
        arbBaseClassName,
      ],
      { numRuns: NUM_RUNS.standard },
    )(
      "whitespace-only activeClassName returns baseClassName verbatim",
      (whitespaceActive, baseClassName) => {
        const result = buildActiveClassName(
          true,
          whitespaceActive,
          baseClassName,
        );

        // arbBaseClassName always produces a string (possibly empty/whitespace);
        // never undefined. Result must equal that string by reference value.
        expect(result).toBe(baseClassName);
      },
    );
  });

  describe("Invariant 7: whitespace normalization — output never contains consecutive whitespace runs (review §6 MED)", () => {
    // Stronger than Inv 1 (which only forbids the `"  "` substring): every
    // form of `\s+` collapses to a single ASCII space in the output. A
    // regression that swaps `\S+` matching for character iteration would
    // pass Inv 1 (no double-space) but might emit `tab` or `newline` in
    // the middle of the result — this invariant catches that surface.
    test.prop([arbActiveClassName, arbBaseClassName], {
      numRuns: NUM_RUNS.thorough,
    })(
      "result contains no tab / newline / CR / consecutive-space substrings",
      (activeClassName, baseClassName) => {
        const result = buildActiveClassName(
          true,
          activeClassName,
          baseClassName,
        );

        expect(result).toBeDefined();
        // Single regex covers every `\s` flavor + repeated spaces.
        expect(result!).not.toMatch(/[\t\n\r]|\s{2,}/);
      },
    );
  });

  describe("Edge-case: very long base className (review §5 LOW)", () => {
    // Guards against an O(n²) regression — `new Set(baseTokens)` + linear
    // dedup loop over active tokens must scale to long inputs. We don't
    // assert wall-time (flaky in CI), but we lock down the structural
    // contract: result is a string, contains the active token exactly once,
    // and never re-inserts existing duplicates.
    const arbLongBaseClassName = fc
      .integer({ min: 256, max: 1024 })
      .map((count) =>
        Array.from({ length: count }, (_, i) => `cls-${i}`).join(" "),
      );

    test.prop([arbActiveClassName, arbLongBaseClassName], {
      numRuns: NUM_RUNS.standard,
    })(
      "long base (256..1024 unique tokens) + isActive=true preserves token shape",
      (activeClassName, baseClassName) => {
        const result = buildActiveClassName(
          true,
          activeClassName,
          baseClassName,
        );

        expect(result).toBeDefined();

        const tokens = result!.split(/\s+/).filter(Boolean);

        // Active token appears exactly once.
        const activeCount = tokens.filter((t) => t === activeClassName).length;

        expect(activeCount).toBe(1);

        // Base tokens preserved in count: base had K unique cls-N tokens,
        // result has K + 1 tokens (those K plus the active token).
        const baseTokenCount = baseClassName
          .split(/\s+/)
          .filter(Boolean).length;

        expect(tokens).toHaveLength(baseTokenCount + 1);
      },
    );
  });

  describe("Invariant 8: double-apply with different active tokens accumulates both (review §6 LOW)", () => {
    // `f(true, B, f(true, A, base))` must contain BOTH A and B (and the
    // base tokens). The implementation walks active over base tokens via
    // Set membership; chaining two calls with distinct tokens validates
    // the union semantics rather than replace-active semantics.
    test.prop([arbToken, arbToken, arbBaseClassName], {
      numRuns: NUM_RUNS.standard,
    })(
      "buildActiveClassName(true, B, buildActiveClassName(true, A, base)) contains both A and B",
      (tokenA, tokenB, baseClassName) => {
        fc.pre(tokenA !== tokenB);

        const inner = buildActiveClassName(true, tokenA, baseClassName);
        const outer = buildActiveClassName(true, tokenB, inner);

        expect(outer).toBeDefined();

        const tokens = outer!.split(/\s+/).filter(Boolean);

        expect(tokens).toContain(tokenA);
        expect(tokens).toContain(tokenB);
      },
    );
  });

  describe("Behaviour lock: dedup applies to active token only, NOT to existing duplicates in base (review §5.4)", () => {
    // Confirmed gotcha: `buildActiveClassName(true, "active", "x x")` returns
    // `"x x active"` — the function dedups the active class against base
    // tokens, but it does NOT dedupe pre-existing duplicates in base. The
    // implementation uses `parseTokens(base)` then `new Set(baseTokens)` for
    // membership, but pushes onto the original `baseTokens` array (which keeps
    // any duplicates intact). This test locks the behavior so a future
    // "clean-up" refactor doesn't silently change the contract.
    test("base 'x  x' + active 'y' → 'x x y' (duplicate x preserved)", () => {
      expect(buildActiveClassName(true, "y", "x  x")).toBe("x x y");
    });

    test("base 'a b a' + active 'a' → 'a b a' (active already in base; existing duplicate preserved)", () => {
      expect(buildActiveClassName(true, "a", "a b a")).toBe("a b a");
    });

    test("base 'foo  bar  foo  baz' + active 'qux' → 'foo bar foo baz qux'", () => {
      expect(buildActiveClassName(true, "qux", "foo  bar  foo  baz")).toBe(
        "foo bar foo baz qux",
      );
    });
  });

  describe("Invariant 6: strict idempotency — apply-twice returns the exact same string", () => {
    // The first apply normalizes whitespace (parseTokens collapses any `\s+`
    // padding into single-space joins). The second apply over the already-
    // normalized output must therefore reproduce the exact same string —
    // not just the same token set. Strict-eq catches regressions that would
    // re-order tokens or re-insert padding on the second pass.
    test.prop([arbActiveClassName, arbBaseClassName], {
      numRuns: NUM_RUNS.standard,
    })(
      "isActive=true: apply-twice equals apply-once",
      (activeClassName, baseClassName) => {
        const once = buildActiveClassName(true, activeClassName, baseClassName);
        const twice = buildActiveClassName(true, activeClassName, once);

        expect(twice).toBe(once);
      },
    );

    test.prop([arbActiveClassName, arbBaseClassName], {
      numRuns: NUM_RUNS.standard,
    })(
      "isActive=false: apply-twice equals apply-once (returns base as-is)",
      (activeClassName, baseClassName) => {
        const once = buildActiveClassName(
          false,
          activeClassName,
          baseClassName,
        );
        const twice = buildActiveClassName(false, activeClassName, once);

        expect(twice).toBe(once);
      },
    );

    // Whitespace-heavy base: first apply normalizes `\s+` into single spaces.
    // Third apply must be identical to second — confirms the normalized output
    // is a fixed-point regardless of how many times the function is called.
    test.prop(
      [
        arbActiveClassName,
        fc
          .tuple(
            arbWhitespacePadding,
            fc.array(arbToken, { minLength: 1, maxLength: 4 }),
            arbWhitespacePadding,
          )
          .map(([h, tokens, t]) => `${h}${tokens.join(" ".repeat(3))}${t}`),
      ],
      { numRuns: NUM_RUNS.standard },
    )(
      "whitespace-heavy base: third apply equals second apply (fully stable fixed-point)",
      (activeClassName, messyBase) => {
        const once = buildActiveClassName(true, activeClassName, messyBase);
        const twice = buildActiveClassName(true, activeClassName, once);
        const thrice = buildActiveClassName(true, activeClassName, twice);

        expect(thrice).toBe(twice);
      },
    );

    // Mixed isActive order: applying false after true returns the active-applied
    // string as-is (isActive=false just returns its base argument). Confirms
    // that a false-pass over an already-processed string is a no-op.
    test.prop([arbActiveClassName, arbBaseClassName], {
      numRuns: NUM_RUNS.standard,
    })(
      "isActive=false over isActive=true result returns that result unchanged",
      (activeClassName, baseClassName) => {
        const activeResult = buildActiveClassName(
          true,
          activeClassName,
          baseClassName,
        );
        const passthrough = buildActiveClassName(
          false,
          activeClassName,
          activeResult,
        );

        expect(passthrough).toBe(activeResult);
      },
    );
  });
});

// =============================================================================
// buildHref invariants
// =============================================================================

function makeFakeRouter(
  buildUrl:
    | ((
        name: string,
        params: object,
        search?: object,
        options?: { hash?: string },
      ) => string | undefined)
    | undefined,
  buildPath: (name: string, params: object, search?: object) => string,
): Router {
  return { buildUrl, buildPath } as unknown as Router;
}

describe("buildHref — Property Tests", () => {
  describe("Invariant 5: falls back to buildPath when buildUrl returns undefined", () => {
    test.prop([fc.string({ minLength: 1, maxLength: 16 })], {
      numRuns: NUM_RUNS.standard,
    })("buildUrl=()=>undefined uses buildPath result", (path) => {
      const router = makeFakeRouter(
        () => undefined,
        () => path,
      );

      expect(buildHref(router, "any", {})).toBe(path);
    });
  });

  describe("Invariant 6: prefers buildUrl when defined and returns string", () => {
    test.prop(
      [
        fc.string({ minLength: 1, maxLength: 16 }),
        fc.string({ minLength: 1, maxLength: 16 }),
      ],
      { numRuns: NUM_RUNS.standard },
    )("returns buildUrl result, not buildPath", (url, path) => {
      const router = makeFakeRouter(
        () => url,
        () => path,
      );

      expect(buildHref(router, "any", {})).toBe(url);
    });
  });

  describe("Invariant 7: returns undefined and logs error when both throw", () => {
    test.prop([fc.string({ minLength: 1, maxLength: 12 })], {
      numRuns: NUM_RUNS.standard,
    })("throws → undefined", (name) => {
      const router = makeFakeRouter(
        () => {
          throw new Error("no");
        },
        () => {
          throw new Error("no");
        },
      );
      const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      expect(buildHref(router, name, {})).toBeUndefined();
      expect(errSpy).toHaveBeenCalledWith(
        expect.stringMatching(
          /^\[real-router\] Route ".+" is not defined\. The element will render without an href attribute\.$/,
        ),
      );

      errSpy.mockRestore();
    });
  });

  describe("Invariant 8: hash encoding (RFC 3986 + defensive %23 for #)", () => {
    // buildPath fallback path: appended fragment must be encoded via encodeURI
    // with `#` defensively replaced by `%23`. This guards #532 against a future
    // refactor that swaps in a less strict encoder.
    test.prop([arbHash, fc.string({ minLength: 1, maxLength: 12 })], {
      numRuns: NUM_RUNS.thorough,
    })("fallback path → hash is encodeURI'd and # → %23", (rawHash, path) => {
      const router = makeFakeRouter(undefined, () => path);
      const href = buildHref(router, "any", {}, undefined, rawHash);

      const stripped = rawHash.startsWith("#") ? rawHash.slice(1) : rawHash;

      if (!stripped) {
        expect(href).toBe(path);

        return;
      }

      const expectedHash = computeExpectedFragment(stripped);

      expect(href).toBe(`${path}#${expectedHash}`);

      // No literal `#` in the fragment portion — verifies the defensive
      // %23 replacement actually fired.
      const fragment = href!.slice(`${path}#`.length);

      expect(fragment).not.toContain("#");
    });
  });

  describe("Invariant 9: leading `#` is stripped before encoding/passing", () => {
    // `<Link hash="#section">` and `<Link hash="section">` must produce the
    // same href — the leading `#` is a convenience, not part of the fragment.
    test.prop(
      [
        fc.string({ minLength: 1, maxLength: 12 }),
        fc.string({ minLength: 1, maxLength: 12 }),
      ],
      {
        numRuns: NUM_RUNS.standard,
      },
    )("hash='#x' and hash='x' produce identical href", (rawHash, path) => {
      // rawHash must not already start with "#" so we can prepend one safely.
      fc.pre(!rawHash.startsWith("#"));

      const router = makeFakeRouter(undefined, () => path);

      const withHash = buildHref(router, "any", {}, undefined, `#${rawHash}`);
      const withoutHash = buildHref(router, "any", {}, undefined, rawHash);

      expect(withHash).toBe(withoutHash);
    });
  });

  describe("Invariant 10: buildUrl receives { hash } object, not { hash: undefined }", () => {
    // Plugins like browser-plugin distinguish `options === undefined` (no hash
    // intent) from `options = { hash: "" }` (explicit empty fragment). The
    // helper must NOT call buildUrl with `{ hash: undefined }` — that would
    // mislead plugins about consumer intent.
    test.prop([fc.string({ minLength: 1, maxLength: 12 })], {
      numRuns: NUM_RUNS.standard,
    })("no-hash call → buildUrl receives options=undefined", (name) => {
      const calls: { options: unknown }[] = [];
      const router = makeFakeRouter(
        (_n, _p, _search, options) => {
          calls.push({ options });

          return "/url";
        },
        () => "/path",
      );

      buildHref(router, name, {});

      expect(calls).toHaveLength(1);
      expect(calls[0].options).toBeUndefined();
    });

    test.prop(
      [
        fc.string({ minLength: 1, maxLength: 12 }),
        fc.string({ minLength: 0, maxLength: 12 }),
      ],
      { numRuns: NUM_RUNS.standard },
    )(
      "with-hash call → buildUrl receives { hash: <stripped> }",
      (name, rawHash) => {
        const calls: { options: unknown }[] = [];
        const router = makeFakeRouter(
          (_n, _p, _search, options) => {
            calls.push({ options });

            return "/url";
          },
          () => "/path",
        );

        buildHref(router, name, {}, undefined, rawHash);

        expect(calls).toHaveLength(1);

        const stripped = rawHash.startsWith("#") ? rawHash.slice(1) : rawHash;

        expect(calls[0].options).toStrictEqual({ hash: stripped });
      },
    );
  });

  describe("Invariant 11: fragment never contains literal `#` (review §6 MED)", () => {
    // Generalizes the `not.toContain("#")` assertion buried in Inv 8 to a
    // standalone, full-input-surface check. After encoding, any `#` in the
    // fragment must be `%23` — the literal character is forbidden. A
    // regression to a less strict encoder would surface here even if the
    // round-trip in Inv 8 happens to skip the `#`-bearing arbitrary draws.
    //
    // `arbPathLike` restricts the synthetic path to characters that
    // `router.buildPath` actually emits (no `#`/`%`/`?`). Real router paths
    // never contain `#` — fc.string would generate one and shift the
    // separator detection, producing a false negative on the fragment
    // slice.
    const arbPathLike = fc.stringMatching(/^[A-Za-z0-9/_-]{1,12}$/);

    test.prop([arbHash, arbPathLike], { numRuns: NUM_RUNS.thorough })(
      "no literal `#` appears in the rendered fragment portion of href",
      (rawHash, path) => {
        const router = makeFakeRouter(undefined, () => path);
        const href = buildHref(router, "any", {}, undefined, rawHash);

        const stripped = rawHash.startsWith("#") ? rawHash.slice(1) : rawHash;

        if (!stripped) {
          expect(href).toBe(path);

          return;
        }

        // Path has no `#` by construction → indexOf finds the separator.
        const separator = href!.indexOf("#");

        expect(separator).toBeGreaterThanOrEqual(0);

        const fragment = href!.slice(separator + 1);

        // The helper replaces ALL `#` with `%23` — a simple includes-check
        // catches a regression to a less defensive encoder.
        expect(fragment).not.toContain("#");
      },
    );
  });

  describe("Invariant 12: empty-string from buildUrl falls back to buildPath (review §5.2 Bug 1)", () => {
    // Bug 1 was: `if (url !== undefined) return url` accepted `""` as valid,
    // producing `<a href="">` which resolves to the current page URL (silent
    // self-navigation). The fix: `typeof url === "string" && url.length > 0`
    // — any falsy / non-string result delegates to `buildPath` instead.
    test.prop([fc.string({ minLength: 1, maxLength: 16 })], {
      numRuns: NUM_RUNS.standard,
    })("buildUrl=()=>'' uses buildPath result, not ''", (path) => {
      const router = makeFakeRouter(
        () => "",
        () => path,
      );

      expect(buildHref(router, "any", {})).toBe(path);
    });

    test.prop(
      [
        fc.string({ minLength: 1, maxLength: 8 }),
        fc.string({ minLength: 1, maxLength: 16 }),
      ],
      { numRuns: NUM_RUNS.standard },
    )(
      "buildUrl=()=>'' + hash → falls back to buildPath + appended fragment",
      (hash, path) => {
        // Mirror buildHref's leading-`#` strip behaviour; if the stripped
        // hash is empty (e.g. raw input was just `"#"`), the fallback path
        // appends no fragment per documented contract.
        const stripped = hash.startsWith("#") ? hash.slice(1) : hash;

        const router = makeFakeRouter(
          () => "",
          () => path,
        );

        const href = buildHref(router, "any", {}, undefined, hash);

        if (stripped.length === 0) {
          expect(href).toBe(path);
        } else {
          expect(href).toBe(`${path}#${computeExpectedFragment(stripped)}`);
        }
      },
    );
  });

  describe("Invariant 13: null from buildUrl falls back to buildPath (review §5.2 Bug 1)", () => {
    // Defensive contract: BuildUrlFn type is `string | undefined`, but a
    // misbehaving plugin returning `null` (type-contract violation) must NOT
    // surface as `<a href={null}>` — fall back to buildPath instead.
    test.prop([fc.string({ minLength: 1, maxLength: 16 })], {
      numRuns: NUM_RUNS.standard,
    })("buildUrl=()=>null uses buildPath result", (path) => {
      const router = makeFakeRouter(
        (() => null) as unknown as Parameters<typeof makeFakeRouter>[0],
        () => path,
      );

      expect(buildHref(router, "any", {})).toBe(path);
    });
  });
});

// Canonical serialization tests moved to @real-router/sources canonicalJson.
// See: packages/sources/tests/unit/canonicalJson.test.ts
