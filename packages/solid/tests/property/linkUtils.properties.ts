// packages/solid/tests/property/linkUtils.properties.ts

/**
 * Property-based tests for shared dom-utils helpers as actually imported and
 * used by the Solid adapter (via the dom-utils symlink). Mirrors the React /
 * Svelte property-test set so any divergence in adapter expectations vs shared
 * helpers fails on the Solid side too.
 *
 * Confirmed bugs covered (regression-locked):
 * - `buildActiveClassName` must NOT produce double spaces when concatenating
 *   active class to a base className with surrounding/internal whitespace.
 * - Active class must be present in the result whenever isActive=true and
 *   activeClassName is non-empty.
 *
 * Coverage parity: this file is the Solid counterpart of
 * `packages/react/tests/property/linkUtils.properties.ts`.
 */

import { fc, test } from "@fast-check/vitest";
import { describe, expect, it, vi } from "vitest";

import { arbHash, NUM_RUNS } from "./helpers";
import {
  applyLinkA11y,
  buildActiveClassName,
  buildHref,
  shouldNavigate,
} from "../../src/dom-utils";

import type { Router } from "@real-router/core";

// =============================================================================
// buildActiveClassName invariants
// =============================================================================

// Mixed whitespace padding — includes tab/newline/CR.
// parseTokens uses `/\S+/g`; a regression to `/[^ ]+/g` would silently
// fail on tab/newline-padded class strings.
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

describe("buildActiveClassName — Property Tests (Solid)", () => {
  describe("Invariant 1: result never contains double spaces (when isActive)", () => {
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
        // active-concat path always returns a defined string.
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

        // Regardless of whether activeClassName was already in base,
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

        expect(result).toBe(baseClassName);
      },
    );
  });

  describe("Invariant 6a: whitespace-immunity — padded base produces the same token set as unpadded", () => {
    // §6 audit Invariant 4 proposal: `parseTokens(value.match(/\S+/g))`
    // guarantees whitespace normalization. Padding the base with tabs /
    // newlines / extra spaces must not change the resulting token set —
    // only the order-insensitive multiset of tokens matters at the API
    // boundary (DOM treats class attribute as a token set).
    test.prop([arbActiveClassName, arbBaseClassName], {
      numRuns: NUM_RUNS.thorough,
    })(
      "padded base and unpadded base produce the same sorted token list",
      (activeClassName, baseClassName) => {
        // Re-pad the already-padded base: wrap with leading/trailing
        // tabs and inject extra spaces between every original char gap.
        const padded = `\t  ${baseClassName}\n  \t`.replaceAll(/\s+/g, "  ");

        const unpaddedResult = buildActiveClassName(
          true,
          activeClassName,
          baseClassName,
        );
        const paddedResult = buildActiveClassName(
          true,
          activeClassName,
          padded,
        );

        // Both apply paths normalize via parseTokens. Compare as sorted
        // multisets so the assertion is robust to dedup ordering quirks.
        const unpaddedTokens = (unpaddedResult ?? "")
          .split(/\s+/)
          .filter(Boolean)
          .toSorted((a, b) => a.localeCompare(b));
        const paddedTokens = (paddedResult ?? "")
          .split(/\s+/)
          .filter(Boolean)
          .toSorted((a, b) => a.localeCompare(b));

        expect(paddedTokens).toStrictEqual(unpaddedTokens);
      },
    );
  });

  describe("Invariant 6: strict idempotency — apply-twice returns the same string", () => {
    // The first apply normalizes whitespace (parseTokens collapses any `\s+`
    // padding into single-space joins). The second apply over the already-
    // normalized output must reproduce the exact same string.
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

describe("buildHref — Property Tests (Solid)", () => {
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

  describe("Invariant 2: falls back to buildPath when buildUrl is absent", () => {
    test.prop([fc.string({ minLength: 1, maxLength: 16 })], {
      numRuns: NUM_RUNS.standard,
    })("router without buildUrl uses buildPath", (path) => {
      const router = makeFakeRouter(undefined, () => path);

      expect(buildHref(router, "any", {})).toBe(path);
    });
  });

  describe("Invariant 3: prefers buildUrl when defined and returns string", () => {
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

  describe("Invariant 4: returns undefined and logs error when both throw", () => {
    test.prop([fc.string({ minLength: 1, maxLength: 12 })], {
      numRuns: NUM_RUNS.standard,
    })("throws → undefined + console.error", (name) => {
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

  describe("Invariant 5: hash encoding (RFC 3986 + defensive %23 for #)", () => {
    // buildPath fallback path: appended fragment must be encoded via encodeURI
    // with `#` defensively replaced by `%23`.
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

  describe("Invariant 6: leading `#` is stripped before encoding/passing", () => {
    // `<Link hash="#section">` and `<Link hash="section">` must produce the
    // same href — the leading `#` is a convenience, not part of the fragment.
    test.prop(
      [
        fc.string({ minLength: 1, maxLength: 12 }),
        fc.string({ minLength: 1, maxLength: 12 }),
      ],
      { numRuns: NUM_RUNS.standard },
    )("hash='#x' and hash='x' produce identical href", (rawHash, path) => {
      // rawHash must not already start with "#" so we can prepend one safely.
      fc.pre(!rawHash.startsWith("#"));

      const router = makeFakeRouter(undefined, () => path);

      const withHash = buildHref(router, "any", {}, { hash: `#${rawHash}` });
      const withoutHash = buildHref(router, "any", {}, { hash: rawHash });

      expect(withHash).toBe(withoutHash);
    });
  });

  describe("Invariant 7: empty hash falsy → no `#` suffix", () => {
    // hash === "" must not introduce a trailing `#` in the fallback path —
    // the helper returns `path` verbatim. Same for hash === "#" (only-hash).
    test.prop([fc.string({ minLength: 1, maxLength: 12 })], {
      numRuns: NUM_RUNS.standard,
    })("hash === '' returns path without `#` suffix", (path) => {
      const router = makeFakeRouter(undefined, () => path);

      expect(buildHref(router, "any", {}, { hash: "" })).toBe(path);
    });

    test.prop([fc.string({ minLength: 1, maxLength: 12 })], {
      numRuns: NUM_RUNS.standard,
    })(
      "hash === '#' (strips to '') returns path without `#` suffix",
      (path) => {
        const router = makeFakeRouter(undefined, () => path);

        expect(buildHref(router, "any", {}, { hash: "#" })).toBe(path);
      },
    );
  });

  describe("Invariant 8: buildUrl receives { hash } object, not { hash: undefined }", () => {
    // Plugins like browser-plugin distinguish `options === undefined` (no hash
    // intent) from `options = { hash: "" }` (explicit empty fragment). The
    // helper must NOT call buildUrl with `{ hash: undefined }`.
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

// =============================================================================
// shouldNavigate — synthetic events without `button`
// =============================================================================

describe("shouldNavigate — Property Tests (Solid)", () => {
  describe("Invariant: synthetic Event without `button` field returns false", () => {
    // Synthetic events from custom event factories may omit the `button`
    // field entirely — e.g. `new Event("click")` rather than `MouseEvent`.
    // The helper compares `evt.button === 0`; with `undefined`, the strict
    // equality fails and the helper returns false. This is the safe default
    // (don't navigate on a click we can't classify), but the contract is
    // worth locking so a future refactor to `!evt.button` doesn't silently
    // start treating synthetic clicks as left-button navigations.
    test.prop(
      [
        fc.record({
          metaKey: fc.boolean(),
          altKey: fc.boolean(),
          ctrlKey: fc.boolean(),
          shiftKey: fc.boolean(),
        }),
      ],
      { numRuns: NUM_RUNS.standard },
    )(
      "Event with no `button` field returns false regardless of modifiers",
      (modifiers) => {
        const evt = modifiers as unknown as MouseEvent;

        expect(shouldNavigate(evt)).toBe(false);
      },
    );

    it("plain Event (new Event('click')) returns false", () => {
      // Node env may not have `Event` constructor on globalThis without a DOM
      // setup, but property tests in this file run before any DOM is mounted.
      // Build the event-shape inline so the test is environment-agnostic.
      const evt = {
        metaKey: false,
        altKey: false,
        ctrlKey: false,
        shiftKey: false,
        // button intentionally omitted
      } as unknown as MouseEvent;

      expect(shouldNavigate(evt)).toBe(false);
    });
  });
});

// =============================================================================
// applyLinkA11y defensive guard
// =============================================================================

describe("applyLinkA11y — Property Tests (Solid)", () => {
  describe("Invariant 1: null / undefined element → no-op (no throw)", () => {
    // Defensive guard at the top of the helper. Most callers pass a live
    // DOM node, but null/undefined is a legitimate input when the directive
    // observes an element that has been removed from the DOM, or when a
    // consumer integrates the helper outside the directive context.
    //
    // The null/undefined branch is reached without touching any DOM API,
    // so this test can run in the node-only property-test environment
    // without jsdom. instanceof checks for HTMLAnchorElement/HTMLButtonElement
    // are NOT exercised here — they're covered by the functional tests
    // in `link-directive.test.tsx:139-167` under jsdom.
    it("applyLinkA11y(null) returns undefined without throwing", () => {
      expect(() => {
        applyLinkA11y(null);
      }).not.toThrow();
    });

    it("applyLinkA11y(undefined) returns undefined without throwing", () => {
      expect(() => {
        applyLinkA11y(undefined);
      }).not.toThrow();
    });
  });
});
