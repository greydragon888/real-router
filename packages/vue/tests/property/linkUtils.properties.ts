// packages/vue/tests/property/linkUtils.properties.ts

/**
 * Property-based tests for shared dom-utils helpers used by Vue's `<Link>`.
 *
 * The DOM-utils module is symlinked from `shared/dom-utils/` and shipped to
 * every framework adapter. These invariants mirror the React/Preact adapter
 * property tests — duplicated rather than imported because each adapter owns
 * its property-test surface (per `INVARIANTS.md`).
 *
 * Covers:
 * - `buildActiveClassName`: no double spaces, active-token presence,
 *   single-occurrence dedup, base-preservation when inactive, whitespace
 *   active fallback, behaviour-lock for pre-existing duplicates, strict
 *   idempotency.
 * - `buildHref`: `buildUrl`-undefined fallback, `buildUrl` preference, throw
 *   handling, RFC 3986 + `%23` hash encoding, leading-`#` strip, opts.hash
 *   propagation (undefined vs. defined).
 *
 * Closes §2.2 review items for `buildHref`, `buildActiveClassName`,
 * `parseTokens`.
 */

import { fc, test } from "@fast-check/vitest";
import { describe, expect, vi } from "vitest";

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

// Mixed whitespace padding — includes tab/newline/CR. `parseTokens` uses
// `/\S+/g`; a regression to `/[^ ]+/g` would silently fail on tab/newline-
// padded class strings. Including all `\s` characters exercises the regex
// correctly through every buildActiveClassName test.
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

        expect(result).toBe(baseClassName);
      },
    );
  });

  describe("Behaviour lock: dedup applies to active token only, NOT to existing duplicates in base", () => {
    // Confirmed gotcha: `buildActiveClassName(true, "active", "x x")` returns
    // `"x x active"` — the function dedups the active class against base
    // tokens, but it does NOT dedupe pre-existing duplicates in base. The
    // implementation uses `parseTokens(base)` then `new Set(baseTokens)` for
    // membership, but pushes onto the original `baseTokens` array (which keeps
    // any duplicates intact). This test locks the behaviour so a future
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
// parseTokens — contract locks (exercised via buildActiveClassName)
//
// `parseTokens` is a private helper (`/\S+/g` regex). Its contracts are
// observable through every `buildActiveClassName` call. These tests name the
// contracts explicitly so a regex regression (`/[^ ]+/g`, missing `\S`)
// surfaces with a meaningful failure message rather than a generic Inv 1/5 hit.
// =============================================================================

describe("parseTokens — contract locks (via buildActiveClassName)", () => {
  describe("Empty string → zero tokens (no base contribution)", () => {
    // parseTokens("") → [] — empty string produces no tokens.
    // Via buildActiveClassName: empty base with an active class that isn't already
    // present must yield exactly that active class (no phantom base tokens).
    test.prop([arbToken], { numRuns: NUM_RUNS.standard })(
      'base="" → result is exactly the active class',
      (active) => {
        const result = buildActiveClassName(true, active, "");
        const tokens = result?.split(/\s+/).filter(Boolean) ?? [];

        expect(tokens).toStrictEqual([active]);
      },
    );
  });

  describe("Whitespace-only → zero tokens (tabs, newlines, mixed)", () => {
    // parseTokens uses `/\S+/g` — `\S` excludes all Unicode whitespace, not
    // just ASCII spaces. A regression to `/[^ ]+/g` would leave `\t`/`\n`
    // as tokens, producing "active\tclass" style output.
    const arbWhitespaceOnly = fc.oneof(
      fc.constant("\t"),
      fc.constant("\n"),
      fc.constant("\r"),
      fc.constant(" \t\n\r "),
      fc.constant("\t  \t"),
    );

    test.prop([arbToken, arbWhitespaceOnly], { numRuns: NUM_RUNS.standard })(
      "whitespace-only base (tab/newline) → result is exactly the active class",
      (active, wsBase) => {
        const result = buildActiveClassName(true, active, wsBase);
        const tokens = result?.split(/\s+/).filter(Boolean) ?? [];

        expect(tokens).toStrictEqual([active]);
      },
    );
  });

  describe("Roundtrip: tokens joined and re-parsed yield the same set", () => {
    // parseTokens(parseTokens(s).join(" ")) must equal parseTokens(s) —
    // re-parsing a normalized (single-spaced) token string must be a no-op.
    // This is observable through buildActiveClassName: after the first call
    // normalizes the base string, a second call with the normalized output
    // must produce the identical result (no new tokens appear, none disappear).
    //
    // Guard: when `base` already contains the active token, stripping it
    // breaks the order invariant (active-already-present preserves the
    // original position; strip-and-re-add appends it). That case is covered
    // by the strict-idempotency test (Inv 6) — here we exclude it via fc.pre
    // so the assertion targets the genuine roundtrip path.
    test.prop([arbToken, arbBaseClassName], { numRuns: NUM_RUNS.standard })(
      "re-applying to already-normalized output is a no-op",
      (active, base) => {
        const baseTokens = base.split(/\s+/).filter(Boolean);

        fc.pre(!baseTokens.includes(active));

        const once = buildActiveClassName(true, active, base);
        // Strip the active class from the first result to get the normalized base.
        const normalizedBase = once
          ?.split(/\s+/)
          .filter(Boolean)
          .filter((t) => t !== active)
          .join(" ");
        const twice = buildActiveClassName(true, active, normalizedBase ?? "");

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
        search?: object,
        options?: { hash?: string },
      ) => string | undefined)
    | undefined,
  buildPath: (name: string, params: object, search?: object) => string,
): Router {
  return { buildUrl, buildPath } as unknown as Router;
}

describe("buildHref — Property Tests", () => {
  describe("Invariant 1: falls back to buildPath when buildUrl returns undefined", () => {
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

  describe("Invariant 2: prefers buildUrl when defined and returns string", () => {
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

  describe("Invariant 3: returns undefined and logs error when both throw", () => {
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

  describe("Invariant 4: hash encoding (RFC 3986 + defensive %23 for #)", () => {
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

  describe("Invariant 5: leading `#` is stripped before encoding/passing", () => {
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

  describe("Invariant 6: buildUrl receives { hash } object, not { hash: undefined }", () => {
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
});
