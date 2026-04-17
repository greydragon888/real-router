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
 */

import { fc, test } from "@fast-check/vitest";
import { describe, expect } from "vitest";

import { NUM_RUNS, arbSegmentName, arbDottedName } from "./helpers";
import { isRouteActive } from "../../src/RouterProvider";

// =============================================================================
// Tests
// =============================================================================

describe("isRouteActive — Property Tests (Solid RouterProvider)", () => {
  describe("Invariant 1: Exact match", () => {
    test.prop([arbDottedName], { numRuns: NUM_RUNS.standard })(
      'isRouteActive("X", "X") === true',
      (name) => {
        expect(isRouteActive(name, name)).toBe(true);
      },
    );
  });

  describe("Invariant 2: Ancestor match — parent is active for child route", () => {
    test.prop([arbSegmentName, arbSegmentName], { numRuns: NUM_RUNS.standard })(
      'isRouteActive("parent", "parent.child") === true',
      (parent, child) => {
        const currentRoute = `${parent}.${child}`;

        expect(isRouteActive(parent, currentRoute)).toBe(true);
      },
    );
  });

  describe("Invariant 3: Non-ancestor prefix — no dot boundary means no match", () => {
    test.prop([arbSegmentName, fc.stringMatching(/^[a-z0-9]{1,5}$/)], {
      numRuns: NUM_RUNS.standard,
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
    test.prop([arbSegmentName, arbSegmentName], { numRuns: NUM_RUNS.standard })(
      'isRouteActive("parent.child", "parent") === false',
      (parent, child) => {
        const linkRoute = `${parent}.${child}`;

        expect(isRouteActive(linkRoute, parent)).toBe(false);
      },
    );
  });

  describe("Invariant 5: Self-match — any name matches itself", () => {
    test.prop([arbDottedName], { numRuns: NUM_RUNS.standard })(
      "isRouteActive(name, name) === true for any dotted name",
      (name) => {
        expect(isRouteActive(name, name)).toBe(true);
      },
    );
  });
});
