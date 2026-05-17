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

import { arbHash, arbLongString, NUM_RUNS } from "./helpers";
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

  describe("Invariant 7: long-string length stress (§2.3 audit)", () => {
    // Real consumers may load class lists from `clsx(...arbitraryArgs)` or
    // CSS-Module bag-of-classes — easily 256+ chars. The token parser
    // (parseTokens, `/\S+/g`) is linear in length; lock the behaviour
    // (no truncation, no thrash) at ≥256 chars.
    test.prop([arbActiveClassName, arbLongString], {
      numRuns: NUM_RUNS.standard,
    })(
      "active class still present exactly once after ≥256-char base",
      (activeClassName, longBase) => {
        const result = buildActiveClassName(true, activeClassName, longBase);

        expect(result).toBeDefined();

        const occurrences = result!
          .split(/\s+/)
          .filter((t) => t === activeClassName).length;

        expect(occurrences).toBe(1);
      },
    );
  });

  describe("Invariant 8: base=undefined edge cases (§5.6 audit)", () => {
    // arbBaseClassName always produces a string, so the `undefined` base
    // path is reachable only via raw helper invocation (e.g. `<Link>` with
    // no `class` prop). Lock the answers explicitly so a regression that
    // changes the `??` operator inside buildActiveClassName surfaces here.
    test("base=undefined + isActive=true + active='x' → just 'x'", () => {
      // No base to concatenate — result is the active token alone.
      const result = buildActiveClassName(true, "x", undefined);

      expect(result).toBe("x");
    });

    test("base=undefined + isActive=false + active='x' → undefined (preserved via ??)", () => {
      // Inactive + undefined base → nothing to return. The helper uses
      // `??` (not `||`) so this path returns `undefined`, not `""`.
      // Locked behaviour — a switch to `||` would coerce to "" silently.
      const result = buildActiveClassName(false, "x", undefined);

      expect(result).toBeUndefined();
    });

    test("base=undefined + isActive=true + active='' (empty) → undefined", () => {
      // parseTokens on "" yields zero tokens → active-concat branch is
      // skipped → fall through to `baseClassName ?? undefined`.
      const result = buildActiveClassName(true, "", undefined);

      expect(result).toBeUndefined();
    });

    test("base=undefined + isActive=true + active='a b c' (multi-token) → 'a b c' verbatim", () => {
      // No base means no dedup work — multi-token active is preserved
      // exactly as parseTokens normalizes it (single-space join).
      const result = buildActiveClassName(true, "a b c", undefined);

      expect(result).toBe("a b c");
    });
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

  describe("Invariant 9: buildHref hash idempotency — calling twice on same input returns same href", () => {
    // buildHref is a pure read over (router, name, params, hashOpts). Two
    // back-to-back invocations with identical args must produce identical
    // strings — verifies the fallback chain (buildUrl → buildPath → inline
    // encode) is deterministic with no hidden state mutation.
    test.prop(
      [
        arbHash,
        fc.string({ minLength: 1, maxLength: 12 }),
        fc.constantFrom("route", "users", "users.profile"),
      ],
      { numRuns: NUM_RUNS.thorough },
    )(
      "buildHref(...) === buildHref(...) on identical inputs",
      (rawHash, path, name) => {
        const router = makeFakeRouter(undefined, () => path);

        const first = buildHref(router, name, {}, { hash: rawHash });
        const second = buildHref(router, name, {}, { hash: rawHash });

        expect(first).toBe(second);
      },
    );

    // Stronger property — encoding stability: re-feeding the OUTPUT's
    // fragment back through buildHref as the hash input still produces an
    // encoded output where `#` → `%23` is reapplied (encoding step is
    // idempotent for the stripped/encoded portion).
    test.prop([fc.string({ minLength: 1, maxLength: 12 })], {
      numRuns: NUM_RUNS.standard,
    })(
      "buildHref output stripped → fed back yields identical fragment encoding",
      (path) => {
        const router = makeFakeRouter(undefined, () => path);

        // Use a hash with a `#` to exercise the defensive %23 replacement on
        // both rounds (the dangerous case for a non-idempotent encoder).
        const rawHash = "tab#section";
        const href1 = buildHref(router, "any", {}, { hash: rawHash });

        // Extract fragment from first call, feed it back.
        const fragment1 = href1!.slice(`${path}#`.length);
        const decoded = decodeURI(fragment1.replaceAll("%23", "#"));
        const href2 = buildHref(router, "any", {}, { hash: decoded });

        expect(href2).toBe(href1);
      },
    );
  });

  describe("Invariant 10: path with query string + hash combo (§5.3 edge-case)", () => {
    // Production routers regularly emit paths like `/users?q=1&sort=asc`.
    // The buildPath fallback concatenates `?<query>` BEFORE `#<hash>` —
    // never the other way around — so the final href shape is always
    // `<path><?query><#hash>` per WHATWG URL. Locking this prevents a
    // future refactor that swaps the concat order from producing
    // `users#tab?q=1` (which most browsers would parse as path "users",
    // fragment "tab?q=1", losing the query entirely).
    test.prop(
      [
        fc.stringMatching(/^[a-z]{1,8}$/),
        fc.stringMatching(/^[a-z]{1,8}$/),
        fc.stringMatching(/^[a-z]{1,8}$/),
      ],
      { numRuns: NUM_RUNS.standard },
    )(
      "path-with-query + hash yields `<path>?<query>#<hash>` (query before hash)",
      (pathSegment, queryValue, hash) => {
        const pathWithQuery = `/${pathSegment}?q=${queryValue}`;
        const router = makeFakeRouter(undefined, () => pathWithQuery);
        const href = buildHref(router, "any", {}, { hash });

        // Hash MUST appear after the query, not inside it.
        expect(href).toBe(`${pathWithQuery}#${encodeURI(hash)}`);
        // Sanity: query string survives intact (no `#` injected before `?`).
        expect(href).toContain(`?q=${queryValue}#`);
      },
    );
  });

  describe("Invariant 11: path without leading slash (§5.3 edge-case — relative URLs)", () => {
    // Some custom plugins (memory-plugin without URL plugin, history-less
    // adapters, route-as-key approaches) emit relative paths like
    // `users/list`. WHATWG URL accepts these — buildHref must not add a
    // leading `/` or reject. Locking this preserves the relative-path
    // contract so a refactor that prepends `/` doesn't silently break
    // memory-plugin-only setups.
    test.prop(
      [
        fc.stringMatching(/^[a-z]{1,8}\/[a-z]{1,8}$/),
        fc.stringMatching(/^[a-z]{1,8}$/),
      ],
      { numRuns: NUM_RUNS.standard },
    )(
      "relative path (no leading `/`) + hash yields `<path>#<hash>` verbatim",
      (relativePath, hash) => {
        const router = makeFakeRouter(undefined, () => relativePath);
        const href = buildHref(router, "any", {}, { hash });

        // Path stays relative — no leading `/` injected.
        expect(href).toBe(`${relativePath}#${encodeURI(hash)}`);
        expect(href!.startsWith("/")).toBe(false);
      },
    );

    test.prop([fc.stringMatching(/^[a-z]{1,8}\/[a-z]{1,8}$/)], {
      numRuns: NUM_RUNS.standard,
    })(
      "relative path without hash stays as-is (no trailing `#`)",
      (relativePath) => {
        const router = makeFakeRouter(undefined, () => relativePath);
        const href = buildHref(router, "any", {});

        expect(href).toBe(relativePath);
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
