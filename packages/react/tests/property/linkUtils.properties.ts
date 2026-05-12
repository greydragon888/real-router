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

  describe("Invariant 3: active class present at most once", () => {
    test.prop([arbActiveClassName, arbBaseClassName], {
      numRuns: NUM_RUNS.standard,
    })(
      "no duplicate activeClassName when already in base",
      (activeClassName, baseClassName) => {
        const result = buildActiveClassName(
          true,
          activeClassName,
          baseClassName,
        );

        expect(result).toBeDefined();

        const tokens = result!.split(/\s+/).filter(Boolean);
        const occurrences = tokens.filter((t) => t === activeClassName).length;

        // Invariant: regardless of whether activeClassName was already in base,
        // it must appear exactly once in the result.
        expect(occurrences).toBe(1);
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
      "buildActiveClassName(true, a, buildActiveClassName(true, a, base)) === buildActiveClassName(true, a, base)",
      (activeClassName, baseClassName) => {
        const once = buildActiveClassName(true, activeClassName, baseClassName);
        const twice = buildActiveClassName(true, activeClassName, once);

        expect(twice).toBe(once);
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
        options?: { hash?: string },
      ) => string | undefined)
    | undefined,
  buildPath: (name: string, params: object) => string,
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
      const href = buildHref(router, "any", {}, { hash: rawHash });

      const stripped = rawHash.startsWith("#") ? rawHash.slice(1) : rawHash;

      if (!stripped) {
        expect(href).toBe(path);

        return;
      }

      const expectedHash = encodeURI(stripped).replaceAll("#", "%23");

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

      const withHash = buildHref(router, "any", {}, { hash: `#${rawHash}` });
      const withoutHash = buildHref(router, "any", {}, { hash: rawHash });

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
        (_n, _p, options) => {
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
          (_n, _p, options) => {
            calls.push({ options });

            return "/url";
          },
          () => "/path",
        );

        buildHref(router, name, {}, { hash: rawHash });

        expect(calls).toHaveLength(1);

        const stripped = rawHash.startsWith("#") ? rawHash.slice(1) : rawHash;

        expect(calls[0].options).toStrictEqual({ hash: stripped });
      },
    );
  });
});

// Canonical serialization tests moved to @real-router/sources canonicalJson.
// See: packages/sources/tests/unit/canonicalJson.test.ts
