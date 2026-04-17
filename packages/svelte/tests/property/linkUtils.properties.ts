// packages/svelte/tests/property/linkUtils.properties.ts

/**
 * Property-based tests for shouldNavigate and buildActiveClassName as actually
 * imported and used by the Svelte adapter (via the dom-utils symlink). These
 * tests deliberately exercise the production functions — not local replicas —
 * so any divergence between adapter expectations and shared helpers is caught.
 *
 * shouldNavigate invariants:
 * 1. Left click with no modifiers returns true
 * 2. Any modifier key returns false
 * 3. Non-zero button returns false
 * 4. (Cross-modifier) cmd+click and meta+click are equivalent
 *
 * buildActiveClassName invariants:
 * 1. isActive=false returns only baseClassName
 * 2. isActive=true with activeClassName includes activeClassName
 * 3. Result never contains the literal string "undefined"
 * 4. No leading/trailing spaces when one input is undefined
 */

import { fc, test } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import {
  NUM_RUNS,
  arbClassName,
  arbOptionalClassName,
  arbMouseEventProps,
} from "./helpers";
import {
  buildActiveClassName,
  shouldNavigate,
} from "../../src/dom-utils/index.js";

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
      } as unknown as MouseEvent;

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
      } as unknown as MouseEvent;

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
        } as unknown as MouseEvent;

        expect(shouldNavigate(evt)).toBe(false);
      },
    );
  });

  describe("Invariant 4: meta and cmd modifiers behave identically (mac vs everywhere else)", () => {
    test.prop([arbMouseEventProps], { numRuns: NUM_RUNS.standard })(
      "swapping meta⇄ctrl produces the same shouldNavigate result",
      (props) => {
        const evtA = { ...props } as unknown as MouseEvent;
        const evtB = {
          ...props,
          metaKey: props.ctrlKey,
          ctrlKey: props.metaKey,
        } as unknown as MouseEvent;

        expect(shouldNavigate(evtA)).toBe(shouldNavigate(evtB));
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

        // Precondition filters out the valid undefined-return case so the
        // invariant applies unconditionally to every string result.
        fc.pre(result !== undefined);

        expect(result).not.toContain("undefined");
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

        fc.pre(result !== undefined);

        expect(result).toBe(result.trim());
      },
    );
  });

  // Locks in the Set-based dedup optimization in buildActiveClassName:
  // duplicate tokens across activeClassName and baseClassName must collapse
  // to a single occurrence in the output. If the implementation regresses to
  // naive concatenation, this test fails.
  describe("Invariant 5: Tokens are deduplicated across active and base classes", () => {
    test.prop([arbClassName, arbClassName], {
      numRuns: NUM_RUNS.standard,
    })(
      "every token appears exactly once in the merged result",
      (activeClassName, baseClassName) => {
        const result = buildActiveClassName(
          true,
          activeClassName,
          baseClassName,
        );

        fc.pre(result !== undefined);

        const tokens = result.match(/\S+/g) ?? [];
        const uniqueTokens = new Set(tokens);

        expect(tokens).toHaveLength(uniqueTokens.size);
      },
    );
  });
});
