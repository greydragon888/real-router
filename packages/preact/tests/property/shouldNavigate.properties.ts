// packages/preact/tests/property/shouldNavigate.properties.ts

/**
 * Property-based tests for `shouldNavigate` from `shared/dom-utils/link-utils.ts`.
 *
 * `shouldNavigate(evt)` decides whether a `<Link>` click should call
 * `event.preventDefault()` and route programmatically, vs. let the browser
 * follow the href natively (new tab, modifier-click, middle-click, etc.).
 *
 * Closes review §2.2 P1 (HIGH) — single exported boolean function in
 * `shared/dom-utils/` without PBT, used by all 6 framework adapters.
 *
 * Decision matrix: `evt.button === 0 && !metaKey && !altKey && !ctrlKey && !shiftKey`.
 * That is 3 button values × 16 modifier combinations = 48 distinct inputs;
 * a property-based generator covers the full combinatorial surface plus the
 * `button` integers (0, 1, 2) that real MouseEvent emits for primary/middle/
 * secondary clicks.
 */

import { fc, test } from "@fast-check/vitest";
import { describe, expect } from "vitest";

import { NUM_RUNS } from "./helpers";
import { shouldNavigate } from "../../src/dom-utils";

interface ModifierFlags {
  metaKey: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
}

const arbModifierFlags: fc.Arbitrary<ModifierFlags> = fc.record({
  metaKey: fc.boolean(),
  altKey: fc.boolean(),
  ctrlKey: fc.boolean(),
  shiftKey: fc.boolean(),
});

const arbButton: fc.Arbitrary<number> = fc.constantFrom(0, 1, 2);

function evt(button: number, modifiers: ModifierFlags): MouseEvent {
  return { button, ...modifiers } as unknown as MouseEvent;
}

function anyModifier(m: ModifierFlags): boolean {
  return m.metaKey || m.altKey || m.ctrlKey || m.shiftKey;
}

describe("shouldNavigate — Property Tests", () => {
  describe("Invariant 1: button !== 0 always returns false (irrespective of modifiers)", () => {
    // Middle-click (button=1) and right-click (button=2) must never route
    // programmatically — middle-click opens a new tab, right-click shows the
    // context menu. A regression that returned true here would hijack both.
    test.prop([arbModifierFlags], { numRuns: NUM_RUNS.standard })(
      "button=1 → false for any modifier combination",
      (modifiers) => {
        expect(shouldNavigate(evt(1, modifiers))).toBe(false);
      },
    );

    test.prop([arbModifierFlags], { numRuns: NUM_RUNS.standard })(
      "button=2 → false for any modifier combination",
      (modifiers) => {
        expect(shouldNavigate(evt(2, modifiers))).toBe(false);
      },
    );
  });

  describe("Invariant 2: any modifier set on button=0 returns false", () => {
    // meta/ctrl-click opens in new tab, shift-click opens new window,
    // alt-click downloads in some browsers. None of those should route
    // programmatically — the browser handles them natively.
    test.prop([arbButton, arbModifierFlags], { numRuns: NUM_RUNS.thorough })(
      "result === (button === 0 && no modifiers set)",
      (button, modifiers) => {
        const expected = button === 0 && !anyModifier(modifiers);

        expect(shouldNavigate(evt(button, modifiers))).toBe(expected);
      },
    );
  });

  describe("Invariant 3: plain primary click (button=0, no modifiers) → true", () => {
    // The default-navigate case must always succeed — otherwise no Link in
    // the entire app would respond to a plain click.
    test("button=0 with all modifiers false → true", () => {
      expect(
        shouldNavigate(
          evt(0, {
            metaKey: false,
            altKey: false,
            ctrlKey: false,
            shiftKey: false,
          }),
        ),
      ).toBe(true);
    });
  });

  describe("Invariant 4: totality — never throws on any (button, modifiers) input", () => {
    // The helper is called inside React/Preact/Solid/Vue/Svelte click handlers
    // — a runtime throw here would surface as an unhandled error in the
    // user's app. The function uses only `&&` and `!` over boolean/number
    // fields, so totality should hold; the property locks the surface.
    test.prop([arbButton, arbModifierFlags], { numRuns: NUM_RUNS.thorough })(
      "shouldNavigate is total over button × modifier combinations",
      (button, modifiers) => {
        expect(() => shouldNavigate(evt(button, modifiers))).not.toThrow();
      },
    );
  });

  describe("Invariant 5: purity — same input yields same output across calls", () => {
    // No hidden state: shouldNavigate is a pure function over its argument.
    // A regression that introduced caching keyed on event identity (e.g.
    // WeakMap memoization) could surface as flakey navigation on re-fired
    // synthetic events. The property locks pure semantics.
    test.prop([arbButton, arbModifierFlags], { numRuns: NUM_RUNS.standard })(
      "shouldNavigate(event) === shouldNavigate(event) for the same input",
      (button, modifiers) => {
        const event = evt(button, modifiers);

        expect(shouldNavigate(event)).toBe(shouldNavigate(event));
      },
    );
  });
});
