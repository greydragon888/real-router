// packages/solid/tests/property/routerProvider.properties.ts

/**
 * Property-based tests for isRouteActive from Solid RouterProvider.
 *
 * Tests the production function directly via internal export.
 *
 * Invariants:
 * 1. Exact match: isRouteActive("users", "users") === true
 * 2. Ancestor match: isRouteActive("users", "users.list") === true
 * 3. Non-ancestor prefix: isRouteActive("users", "users2") === false (no dot boundary)
 * 4. Reverse NOT true: isRouteActive("users.list", "users") === false (child does not match parent)
 * 5. Self-match: isRouteActive(name, name) === true for any name
 * 6. Transitivity (§6.4 №1): chain `a → a.b → a.b.c` ⇒ a active for a.b.c
 * 7. Empty link / empty current (§6.4 №3): both edges with explicit answers
 * 8. Sharper anti-symmetry (§6.4 №2): if a≠b and isRouteActive(a, b) → false reverse
 */

import { fc, test } from "@fast-check/vitest";
import { describe, expect } from "vitest";

import {
  NUM_RUNS,
  arbDottedName,
  arbInvalidDottedName,
  arbLongString,
  arbSegmentName,
} from "./helpers";
import { isRouteActive } from "../../src/RouterProvider";

// =============================================================================
// Tests
// =============================================================================

describe("isRouteActive — Property Tests (Solid RouterProvider)", () => {
  describe("Invariant 1: Exact match", () => {
    test.prop([arbDottedName], { numRuns: NUM_RUNS.elevated })(
      'isRouteActive("X", "X") === true',
      (name) => {
        expect(isRouteActive(name, name)).toBe(true);
      },
    );
  });

  describe("Invariant 2: Ancestor match — parent is active for child route", () => {
    test.prop([arbSegmentName, arbSegmentName], { numRuns: NUM_RUNS.elevated })(
      'isRouteActive("parent", "parent.child") === true',
      (parent, child) => {
        const currentRoute = `${parent}.${child}`;

        expect(isRouteActive(parent, currentRoute)).toBe(true);
      },
    );
  });

  describe("Invariant 3: Non-ancestor prefix — no dot boundary means no match", () => {
    test.prop([arbSegmentName, fc.stringMatching(/^[a-z0-9]{1,5}$/)], {
      numRuns: NUM_RUNS.elevated,
    })(
      'isRouteActive("users", "users<suffix>") === false when suffix has no dot',
      (base, suffix) => {
        // "users" + "2" = "users2" — NOT a child, should be false
        const currentRoute = `${base}${suffix}`;

        // Only test when currentRoute !== base (not an exact match)
        fc.pre(currentRoute !== base);

        expect(isRouteActive(base, currentRoute)).toBe(false);
      },
    );
  });

  describe("Invariant 4: Reverse NOT true — child does not match parent", () => {
    test.prop([arbSegmentName, arbSegmentName], { numRuns: NUM_RUNS.elevated })(
      'isRouteActive("parent.child", "parent") === false',
      (parent, child) => {
        const linkRoute = `${parent}.${child}`;

        expect(isRouteActive(linkRoute, parent)).toBe(false);
      },
    );
  });

  describe("Invariant 5: Self-match — any name matches itself", () => {
    test.prop([arbDottedName], { numRuns: NUM_RUNS.elevated })(
      "isRouteActive(name, name) === true for any dotted name",
      (name) => {
        expect(isRouteActive(name, name)).toBe(true);
      },
    );
  });

  describe("Invariant 6: Transitivity — chain ancestor relation (§6.4 №1)", () => {
    // The ancestor relation is the backbone of breadcrumb/navigation
    // highlighting. If `<Link routeName="users">` is active on
    // `users.list.item`, it MUST also be active on `users.list` and on
    // `users.list.item.detail` — the chain must hold. A regression that
    // breaks transitivity (e.g. an over-eager memoization) silently breaks
    // multi-level UIs. Direct PBT for the 3-link chain.
    test.prop([arbSegmentName, arbSegmentName, arbSegmentName], {
      numRuns: NUM_RUNS.elevated,
    })("isRouteActive(a, a.b.c) === true for any a, b, c", (a, b, c) => {
      const grandchild = `${a}.${b}.${c}`;

      // The relation is direct (a is a prefix with dot boundary in a.b.c)
      // and via the chain (a → a.b → a.b.c). Both must agree.
      expect(isRouteActive(a, grandchild)).toBe(true);
      expect(isRouteActive(`${a}.${b}`, grandchild)).toBe(true);
      expect(isRouteActive(a, `${a}.${b}`)).toBe(true);
    });
  });

  describe("Invariant 7: Empty link / empty current — sentinel coverage (§6.4 №3)", () => {
    // RouterProvider.tsx:73 uses `?? ""` as the unstarted-router sentinel.
    // The semantic claim: no real route name should ever match an empty
    // linkRouteName as an ancestor (only as exact `===`), and no link
    // should be active when the current route name is empty.
    test.prop([arbDottedName], { numRuns: NUM_RUNS.elevated })(
      'isRouteActive("", currentRoute) === false for non-empty current',
      (currentRoute) => {
        // currentRoute is non-empty (arbDottedName produces ≥1 segment).
        // The implementation returns `currentRoute === "" || currentRoute.startsWith(".")`
        // — neither holds for any realistic route name, so this asserts the
        // sentinel contract.
        fc.pre(currentRoute.length > 0);
        fc.pre(!currentRoute.startsWith("."));

        expect(isRouteActive("", currentRoute)).toBe(false);
      },
    );

    test.prop([arbDottedName], { numRuns: NUM_RUNS.elevated })(
      'isRouteActive(linkRoute, "") === false — unstarted router activates no Link',
      (linkRoute) => {
        // Mirror of the sentinel: when the router has no current route
        // (RouterProvider.tsx coerces undefined → ""), no Link should
        // appear active. Implementation: "" === linkRoute is false for any
        // non-empty linkRoute; "".startsWith(`${linkRoute}.`) is false.
        fc.pre(linkRoute.length > 0);

        expect(isRouteActive(linkRoute, "")).toBe(false);
      },
    );

    test('exact-empty edge: isRouteActive("", "") === true', () => {
      // Documented quirk: empty === empty in the first branch of the OR.
      // Not a bug — the sentinel never reaches the helper with both args
      // empty in production (only `routeSelector(linkRouteName)` is called,
      // and Link must declare a non-empty routeName). Locked as a pinned
      // baseline so a future strict-equality refactor stays consistent.
      expect(isRouteActive("", "")).toBe(true);
    });
  });

  describe("Invariant 8a: Long-string length stress (§2.3 audit)", () => {
    // Most fc arbitraries cap at maxLength=24; real-world consumers can pass
    // arbitrarily long route names (e.g. namespaced 4-level segments from
    // generated SaaS apps). The helper must not OOM, not have quadratic
    // perf in length, and must give the right answer.
    test.prop([arbLongString], { numRuns: NUM_RUNS.standard })(
      "self-match holds even for ≥256-char strings",
      (longName) => {
        // Long random strings may contain dots, control chars, etc. — the
        // helper still must satisfy reflexivity.
        expect(isRouteActive(longName, longName)).toBe(true);
      },
    );

    test.prop([arbLongString, arbLongString], { numRuns: NUM_RUNS.standard })(
      "anti-symmetry holds at ≥256-char scale",
      (a, b) => {
        fc.pre(a !== b);

        if (isRouteActive(a, b)) {
          expect(isRouteActive(b, a)).toBe(false);
        }
      },
    );
  });

  describe("Invariant 8b: Negative-domain — invalid route names do not throw (§2.3 audit)", () => {
    // Validation rejects malformed route names at register time, so the
    // helper never sees them in production. But: a refactor that adds
    // `.split(".")` indexing or regex with capture groups could crash on
    // doubled dots. Lock the no-throw contract.
    test.prop([arbInvalidDottedName, arbInvalidDottedName], {
      numRuns: NUM_RUNS.standard,
    })(
      "isRouteActive(invalid, invalid) does not throw — returns a boolean",
      (a, b) => {
        let result: boolean | undefined;

        expect(() => {
          result = isRouteActive(a, b);
        }).not.toThrow();

        expect(typeof result).toBe("boolean");
      },
    );

    test.prop([arbInvalidDottedName, arbDottedName], {
      numRuns: NUM_RUNS.standard,
    })(
      "isRouteActive(invalid, valid) does not throw — returns a boolean",
      (invalid, valid) => {
        let result: boolean | undefined;

        expect(() => {
          result = isRouteActive(invalid, valid);
        }).not.toThrow();

        expect(typeof result).toBe("boolean");
      },
    );
  });

  describe("Invariant 8: Sharper anti-symmetry — directed ancestor relation (§6.4 №2)", () => {
    // Existing Invariant 4 verifies only the constructed `parent.child` case.
    // The sharper claim: for ANY pair a ≠ b, if isRouteActive(a, b) is true
    // then isRouteActive(b, a) must be false — anti-symmetric (no two
    // distinct names can be each other's ancestor).
    test.prop([arbDottedName, arbDottedName], { numRuns: NUM_RUNS.elevated })(
      "a ≠ b ∧ isRouteActive(a, b) ⇒ ¬isRouteActive(b, a)",
      (a, b) => {
        fc.pre(a !== b);

        if (isRouteActive(a, b)) {
          expect(isRouteActive(b, a)).toBe(false);
        }
      },
    );
  });

  // §5.1 edge-case pin-tests — every "weird" input documented in the audit
  // is locked to the OBSERVED runtime answer (collected via `node -e`). The
  // contract is: helper never throws, always returns boolean, returns the
  // exact value the audit captured. A refactor that changes any of these
  // answers — even for inputs that production validation would reject —
  // surfaces here BEFORE production hits the changed branch via an unusual
  // codepath (a custom plugin, a malformed cookie state, etc.).
  describe("§5.1 edge-case pin-tests — exact behaviour on weird inputs", () => {
    test('isRouteActive("", "") === true (Object.is fast-path branch)', () => {
      // Two empty strings hit the equality branch; sentinel in
      // RouterProvider.tsx:73 (`?? ""`) prevents this combo from leaking
      // to a real Link, but the helper itself answers true. Lock it.
      expect(isRouteActive("", "")).toBe(true);
    });

    test('isRouteActive("", "home") === false (empty link cannot match any non-empty current)', () => {
      // Sentinel relies on this: when the router has no current route, the
      // selector compares "" against actual link routeNames — must always
      // be false. (Note: it would be `true` ONLY if currentRoute started
      // with ".", which arbDottedName never produces — see Inv 7 PBT.)
      expect(isRouteActive("", "home")).toBe(false);
    });

    test('isRouteActive("", ".") === true (documented quirk — dot-only currentRoute)', () => {
      // Quirky: `"".startsWith("." + ".")` is `false`, but `".".startsWith(".")`
      // is `true` — so the OR resolves to true via the second branch
      // (`currentRouteName.startsWith(`${linkRouteName}.`)` → `".".startsWith(".")`).
      // Never reached in production (route names never start with `.`),
      // pinned for completeness so a refactor that "fixes" this answer
      // explains its reasoning in the test diff.
      expect(isRouteActive("", ".")).toBe(true);
    });

    test('isRouteActive("users", "users.") === true (trailing dot — validation-rejected)', () => {
      // `"users.".startsWith("users.")` → true. Route names with trailing
      // dots are validation-rejected, so this is a defensive answer for
      // misuse via raw helper invocation.
      expect(isRouteActive("users", "users.")).toBe(true);
    });

    test('isRouteActive("users.", "users.x") === false (trailing dot in linkRoute → doubled-dot prefix)', () => {
      // `"users.x".startsWith("users..")` → false. Reverse of the previous
      // case: trailing dot on linkRouteName fails the dot-boundary check.
      expect(isRouteActive("users.", "users.x")).toBe(false);
    });
  });
});
