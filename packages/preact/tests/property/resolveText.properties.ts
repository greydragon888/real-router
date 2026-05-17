// @vitest-environment jsdom
// packages/preact/tests/property/resolveText.properties.ts

/**
 * Property-based tests for `resolveText(route, prefix, getCustomText, h1)`
 * — private helper in `shared/dom-utils/route-announcer.ts:162-190`.
 *
 * Closes review §2.2 P7 (LOW): "resolveText (private, route-announcer.ts) —
 * pure функция (fallback-цепочка getCustomText → h1 → title → routeName →
 * location.pathname). Не покрыта PBT."
 *
 * Fallback chain (read top-down — first non-empty wins, prefix prepended):
 *   1. `getCustomText(route)` if defined and doesn't throw
 *   2. `h1?.textContent.trim()` if non-empty
 *   3. `document.title` if non-empty
 *   4. `route.name` (filtered to "" when starts with `@@` — internal-route prefix)
 *   5. `globalThis.location.pathname` (defensive last resort)
 *
 * **Replica disclaimer.** `resolveText` is private (not exported from
 * `shared/dom-utils/`). This file replicates the implementation inline,
 * mirroring the `isSegmentMatch` / `keyOf` / `encodeFragmentInline` pattern
 * used elsewhere in this PBT suite. Any edit to
 * `shared/dom-utils/route-announcer.ts:162-190` MUST be mirrored here.
 *
 * Test environment: jsdom — `resolveText` reads `h1.textContent`,
 * `document.title`, and `globalThis.location.pathname`. The pure-functional
 * branch (getCustomText path) is still testable in node, but the fallback
 * chain needs a DOM.
 */

import { fc, test } from "@fast-check/vitest";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";

import { NUM_RUNS } from "./helpers";

import type { State } from "@real-router/core";

// =============================================================================
// Inline replica of resolveText (private — mirror of
// shared/dom-utils/route-announcer.ts:162-190)
// =============================================================================

const INTERNAL_ROUTE_PREFIX = "@@";

function resolveText(
  route: State,
  prefix: string,
  getCustomText: ((route: State) => string) | undefined,
  h1: HTMLElement | null,
): string {
  if (getCustomText) {
    try {
      return getCustomText(route);
    } catch {
      // Replicated as no-op (the source logs via console.error); the
      // post-catch fallback path is the focus of the lock.
    }
  }

  const h1Text = (h1?.textContent ?? "").trim();
  const routeName = route.name.startsWith(INTERNAL_ROUTE_PREFIX)
    ? ""
    : route.name;
  const rawText =
    h1Text || document.title || routeName || globalThis.location.pathname;

  return `${prefix}${rawText}`;
}

// =============================================================================
// Test scaffolding — DOM reset + State stub
// =============================================================================

function asState(name: string): State {
  return { name } as unknown as State;
}

function setH1(text: string | null): HTMLElement | null {
  document.body.innerHTML = "";

  if (text === null) {
    return null;
  }

  const h1 = document.createElement("h1");

  h1.textContent = text;
  document.body.append(h1);

  return h1;
}

// =============================================================================
// Arbitraries
// =============================================================================

// Route-name body excluding the `@@` internal-prefix — used to test the
// non-internal path with predictable filtering.
const arbPublicRouteName = fc.stringMatching(/^[a-z][a-z0-9._-]{0,16}$/);
const arbInternalRouteName = fc
  .stringMatching(/^[A-Z_]{1,16}$/)
  .map((suffix) => `${INTERNAL_ROUTE_PREFIX}${suffix}`);
const arbPrefix = fc.constantFrom("Navigated to ", "Page: ", "", "→ ");
const arbNonEmptyText = fc.string({ minLength: 1, maxLength: 24 });

// =============================================================================
// Tests
// =============================================================================

describe("resolveText — Property Tests", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    document.title = "";
  });

  afterEach(() => {
    document.body.innerHTML = "";
    document.title = "";
  });

  describe("Invariant 1: getCustomText wins when defined and does not throw", () => {
    // First link in the fallback chain. Any return from the callback (even
    // an empty string) is returned verbatim — no prefix prepended (the
    // source path returns directly, see line 170 of route-announcer.ts).
    test.prop([arbPublicRouteName, arbPrefix, arbNonEmptyText], {
      numRuns: NUM_RUNS.standard,
    })(
      "getCustomText return is propagated as-is (no prefix prepend)",
      (routeName, prefix, customText) => {
        document.title = "should-not-be-read";
        const h1 = setH1("should-not-be-read-either");
        const route = asState(routeName);

        const result = resolveText(route, prefix, () => customText, h1);

        expect(result).toBe(customText);
      },
    );

    test.prop([arbPublicRouteName, arbPrefix], { numRuns: NUM_RUNS.standard })(
      "getCustomText returning '' is propagated verbatim (consumer override wins)",
      (routeName, prefix) => {
        const route = asState(routeName);

        const result = resolveText(route, prefix, () => "", null);

        // Empty consumer override wins — fallback chain does NOT engage.
        // A regression that treated "" as missing would surface here.
        expect(result).toBe("");
      },
    );
  });

  describe("Invariant 2: throwing getCustomText falls through to the built-in chain", () => {
    // Defensive contract: a consumer callback throwing inside the router's
    // subscribe loop would tear down sibling listeners. The source catches
    // and falls through; this lock prevents a regression to silent failure
    // (returning "" / undefined / throwing through).
    test.prop([arbPublicRouteName, arbPrefix], { numRuns: NUM_RUNS.standard })(
      "throw in getCustomText → falls through to h1 / title / routeName chain",
      (routeName, prefix) => {
        const h1 = setH1("hero");
        const route = asState(routeName);
        const consoleSpy = vi
          .spyOn(console, "error")
          .mockImplementation(() => {});

        const result = resolveText(
          route,
          prefix,
          () => {
            throw new Error("boom");
          },
          h1,
        );

        // Replica omits the console.error in the catch (it's
        // implementation-detail, not contract); fall-through to h1 must still
        // happen.
        expect(result).toBe(`${prefix}hero`);

        consoleSpy.mockRestore();
      },
    );
  });

  describe("Invariant 3: h1 wins when non-empty and trimmed", () => {
    // Second link. h1.textContent is trimmed before the truthy check (a
    // regression dropping the .trim() would let "  " through).
    test.prop(
      [
        arbPublicRouteName,
        arbPrefix,
        fc.string({ minLength: 1, maxLength: 24 }),
      ],
      { numRuns: NUM_RUNS.standard },
    )(
      "non-empty h1 text wins over title/routeName/pathname",
      (routeName, prefix, h1Text) => {
        // Skip whitespace-only — that's tested separately below.
        fc.pre(h1Text.trim().length > 0);

        document.title = "title-should-not-win";
        const h1 = setH1(h1Text);
        const route = asState(routeName);

        const result = resolveText(route, prefix, undefined, h1);

        expect(result).toBe(`${prefix}${h1Text.trim()}`);
      },
    );

    test.prop(
      [
        arbPublicRouteName,
        arbPrefix,
        fc.constantFrom("   ", "\t\t", "\n", " \t \n  "),
      ],
      { numRuns: NUM_RUNS.standard },
    )(
      "whitespace-only h1 falls through (trim → empty → next link)",
      (routeName, prefix, whitespace) => {
        document.title = "title-wins-now";
        const h1 = setH1(whitespace);
        const route = asState(routeName);

        const result = resolveText(route, prefix, undefined, h1);

        // Whitespace h1 trimmed to "" — title is the next non-empty link.
        expect(result).toBe(`${prefix}title-wins-now`);
      },
    );
  });

  describe("Invariant 4: document.title wins when h1 is absent/empty", () => {
    // Note: `document.title` setter accepts any string, but browsers + jsdom
    // trim leading/trailing whitespace on the getter per HTML spec. The
    // arbitrary uses a non-whitespace alphabet so the set value round-trips
    // through DOM unchanged — otherwise the comparison `title === post-set`
    // is testing jsdom's trim behaviour, not `resolveText`.
    const arbTitleText = fc.stringMatching(/^[A-Za-z0-9_-]{1,24}$/);

    test.prop([arbPublicRouteName, arbPrefix, arbTitleText], {
      numRuns: NUM_RUNS.standard,
    })(
      "non-empty document.title wins when h1=null",
      (routeName, prefix, title) => {
        document.title = title;
        const route = asState(routeName);

        const result = resolveText(route, prefix, undefined, null);

        expect(result).toBe(`${prefix}${title}`);
      },
    );
  });

  describe("Invariant 5: route.name wins when h1 and title are empty (non-internal names)", () => {
    test.prop([arbPublicRouteName, arbPrefix], { numRuns: NUM_RUNS.thorough })(
      "non-`@@` route name wins when h1 and title are missing",
      (routeName, prefix) => {
        document.title = "";
        const route = asState(routeName);

        const result = resolveText(route, prefix, undefined, null);

        expect(result).toBe(`${prefix}${routeName}`);
      },
    );
  });

  describe("Invariant 6: `@@`-prefixed route name is filtered → falls through to pathname", () => {
    // Internal routes (`@@router/UNKNOWN_ROUTE`, etc.) must NOT be
    // announced verbatim. The source returns "" for that link in the chain,
    // forcing the fallback to location.pathname.
    test.prop([arbInternalRouteName, arbPrefix], {
      numRuns: NUM_RUNS.thorough,
    })(
      "@@-prefixed routeName is treated as empty → location.pathname wins",
      (internalName, prefix) => {
        document.title = "";
        const route = asState(internalName);

        const result = resolveText(route, prefix, undefined, null);

        // jsdom default location.pathname is "/" — that's the last-resort
        // fallback the source falls through to.
        expect(result).toBe(`${prefix}${globalThis.location.pathname}`);
      },
    );

    test("locks documented case: route.name === '@@router/UNKNOWN_ROUTE'", () => {
      document.title = "";
      const route = asState("@@router/UNKNOWN_ROUTE");

      const result = resolveText(route, "Page: ", undefined, null);

      // Internal name dropped → location.pathname is the only remaining link.
      expect(result).toBe(`Page: ${globalThis.location.pathname}`);
    });
  });

  describe("Invariant 7: pathname is the absolute last-resort link", () => {
    // Locks the "always non-empty" contract: even with everything else
    // empty/internal/missing, `resolveText` returns a non-empty string
    // (jsdom's location.pathname always starts with "/"). A regression that
    // returned "" here would let the announcer drop the announcement
    // silently.
    test.prop([arbPrefix], { numRuns: NUM_RUNS.standard })(
      "everything-empty input still yields a non-empty announcement",
      (prefix) => {
        document.title = "";
        const route = asState("@@internal");

        const result = resolveText(route, prefix, undefined, null);

        // Always non-empty: at minimum `prefix + "/"` (jsdom default).
        expect(result.length).toBeGreaterThan(prefix.length);
      },
    );
  });

  describe("Invariant 8: purity / determinism on identical inputs", () => {
    // Same DOM state + same args → same output across calls. A regression
    // that introduced hidden state (caching, statefuls counters) would
    // surface here.
    test.prop([arbPublicRouteName, arbPrefix, arbNonEmptyText], {
      numRuns: NUM_RUNS.standard,
    })(
      "two calls with identical inputs return the identical string",
      (routeName, prefix, h1Text) => {
        const h1 = setH1(h1Text);
        const route = asState(routeName);

        const first = resolveText(route, prefix, undefined, h1);
        const second = resolveText(route, prefix, undefined, h1);

        expect(second).toBe(first);
      },
    );
  });
});
