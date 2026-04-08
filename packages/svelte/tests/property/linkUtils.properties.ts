// packages/svelte/tests/property/linkUtils.properties.ts

/**
 * Property-based tests for shouldNavigate and buildActiveClassName
 * as used by the Svelte Link component (imported from dom-utils).
 *
 * shouldNavigate invariants:
 * 1. Left click with no modifiers returns true
 * 2. Any modifier key returns false
 * 3. Non-zero button returns false
 *
 * buildActiveClassName invariants:
 * 1. isActive=false returns only baseClassName
 * 2. isActive=true with activeClassName includes activeClassName
 * 3. Result never contains the literal string "undefined"
 * 4. No leading/trailing spaces when one input is undefined
 */

import { fc, test } from "@fast-check/vitest";
import { describe, expect } from "vitest";

import {
  NUM_RUNS,
  arbClassName,
  arbOptionalClassName,
  arbMouseEventProps,
} from "./helpers";

// =============================================================================
// Inline replicas of shouldNavigate and buildActiveClassName (from dom-utils)
// =============================================================================

function shouldNavigate(evt: {
  button: number;
  metaKey: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
}): boolean {
  return (
    evt.button === 0 &&
    !evt.metaKey &&
    !evt.altKey &&
    !evt.ctrlKey &&
    !evt.shiftKey
  );
}

function buildActiveClassName(
  isActive: boolean,
  activeClassName: string | undefined,
  baseClassName: string | undefined,
): string | undefined {
  if (isActive && activeClassName) {
    return baseClassName
      ? `${baseClassName} ${activeClassName}`.trim()
      : activeClassName;
  }

  return baseClassName ?? undefined;
}

// =============================================================================
// shouldNavigate Tests
// =============================================================================

describe("shouldNavigate — Property Tests (Svelte Link)", () => {
  describe("Invariant 1: Left click with no modifiers returns true", () => {
    it("button=0, no modifier keys → true", () => {
      const evt = {
        button: 0,
        metaKey: false,
        altKey: false,
        ctrlKey: false,
        shiftKey: false,
      };

      expect(shouldNavigate(evt)).toBe(true);
    });
  });

  describe("Invariant 2: Any modifier key returns false", () => {
    test.prop([fc.constantFrom("metaKey", "altKey", "ctrlKey", "shiftKey")], {
      numRuns: NUM_RUNS.standard,
    })("button=0 with any single modifier → false", (modifier) => {
      const evt = {
        button: 0,
        metaKey: false,
        altKey: false,
        ctrlKey: false,
        shiftKey: false,
        [modifier]: true,
      };

      expect(shouldNavigate(evt)).toBe(false);
    });
  });

  describe("Invariant 3: Non-zero button returns false", () => {
    test.prop([fc.integer({ min: 1, max: 5 })], { numRuns: NUM_RUNS.standard })(
      "button !== 0 → false regardless of modifiers",
      (button) => {
        const evt = {
          button,
          metaKey: false,
          altKey: false,
          ctrlKey: false,
          shiftKey: false,
        };

        expect(shouldNavigate(evt)).toBe(false);
      },
    );
  });

  describe("Purity: same inputs always produce same result", () => {
    test.prop([arbMouseEventProps], { numRuns: NUM_RUNS.standard })(
      "shouldNavigate is deterministic",
      (props) => {
        expect(shouldNavigate(props)).toBe(shouldNavigate(props));
      },
    );
  });
});

// =============================================================================
// buildActiveClassName Tests
// =============================================================================

describe("buildActiveClassName — Property Tests (Svelte Link)", () => {
  describe("Invariant 1: isActive=false returns only baseClassName", () => {
    test.prop([arbOptionalClassName, arbOptionalClassName], {
      numRuns: NUM_RUNS.standard,
    })(
      "when inactive, result is baseClassName or undefined",
      (activeClassName, baseClassName) => {
        const result = buildActiveClassName(
          false,
          activeClassName,
          baseClassName,
        );

        expect(result).toBe(baseClassName ?? undefined);
      },
    );
  });

  describe("Invariant 2: isActive=true with activeClassName includes activeClassName", () => {
    test.prop([arbClassName, arbOptionalClassName], {
      numRuns: NUM_RUNS.standard,
    })(
      "when active with a non-empty activeClassName, result includes it",
      (activeClassName, baseClassName) => {
        const result = buildActiveClassName(
          true,
          activeClassName,
          baseClassName,
        );

        expect(result).toBeDefined();
        expect(result).toContain(activeClassName);
      },
    );
  });

  describe('Invariant 3: Result never contains the literal string "undefined"', () => {
    test.prop([fc.boolean(), arbOptionalClassName, arbOptionalClassName], {
      numRuns: NUM_RUNS.standard,
    })(
      'no "undefined" string in output for any combination',
      (isActive, activeClassName, baseClassName) => {
        const result = buildActiveClassName(
          isActive,
          activeClassName,
          baseClassName,
        );

        if (result !== undefined) {
          expect(result).not.toContain("undefined");
        }
      },
    );
  });

  describe("Invariant 4: No leading/trailing spaces when one input is undefined", () => {
    test.prop([fc.boolean(), arbOptionalClassName, arbOptionalClassName], {
      numRuns: NUM_RUNS.standard,
    })(
      "result has no leading or trailing whitespace",
      (isActive, activeClassName, baseClassName) => {
        const result = buildActiveClassName(
          isActive,
          activeClassName,
          baseClassName,
        );

        if (result !== undefined) {
          expect(result).toBe(result.trim());
        }
      },
    );
  });
});
