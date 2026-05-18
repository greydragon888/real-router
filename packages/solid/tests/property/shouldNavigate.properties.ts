// packages/solid/tests/property/shouldNavigate.properties.ts

/**
 * Property-based tests for `shouldNavigate` from `shared/dom-utils/link-utils.ts`.
 *
 * `shouldNavigate` is the gating helper used by every framework adapter on
 * link clicks — it decides whether a `<a>` click should be intercepted and
 * routed through `router.navigate(...)` (true) or left to the browser
 * (false: new-tab modifiers, middle-click, right-click).
 *
 * The function fits on five boolean reads, but a refactor that swaps `&&`
 * for `||` (or flips a `!`) silently turns Ctrl-clicks into in-app
 * navigations — a UX-critical regression. These properties lock the
 * semantics so any such mistake fails CI.
 *
 * Invariants:
 *
 * - **Modifier negation:** if ANY of meta/alt/ctrl/shift is true,
 *   `shouldNavigate` returns false regardless of button.
 * - **Non-left button → false:** `button !== 0` always blocks navigation,
 *   independent of modifier state (middle-click open-in-new-tab,
 *   right-click context menu, etc.).
 * - **Left button + no modifiers → true:** the happy-path navigation case.
 */

import { fc, test } from "@fast-check/vitest";
import { describe, expect } from "vitest";

import { NUM_RUNS } from "./helpers";
import { shouldNavigate } from "../../src/dom-utils";

const arbModifiers: fc.Arbitrary<{
  metaKey: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
}> = fc.record({
  metaKey: fc.boolean(),
  altKey: fc.boolean(),
  ctrlKey: fc.boolean(),
  shiftKey: fc.boolean(),
});

describe("shouldNavigate — Property Tests (shared/dom-utils, §6.4 №8)", () => {
  describe("Invariant 1: modifier negation — any modifier → false", () => {
    // Left button, but any combination of modifiers blocks navigation.
    // Locks the AND semantics of all four `!evt.<modifier>Key` clauses.
    test.prop([arbModifiers], { numRuns: NUM_RUNS.thorough })(
      "shouldNavigate(button=0, modifiers) === !(any modifier set)",
      (mods) => {
        const evt = { button: 0, ...mods } as unknown as MouseEvent;
        const anyModule =
          mods.metaKey || mods.altKey || mods.ctrlKey || mods.shiftKey;

        expect(shouldNavigate(evt)).toBe(!anyModule);
      },
    );
  });

  describe("Invariant 2: non-left button → false regardless of modifiers", () => {
    // Middle button (=1) / right button (=2) / back-forward (=3,4) etc.
    // never navigate. Crucial for "middle-click → open in new tab" UX.
    test.prop([fc.integer({ min: 1, max: 4 }), arbModifiers], {
      numRuns: NUM_RUNS.thorough,
    })("button !== 0 always blocks navigation", (button, mods) => {
      const evt = { button, ...mods } as unknown as MouseEvent;

      expect(shouldNavigate(evt)).toBe(false);
    });
  });

  describe("Invariant 3: left button + no modifiers → true (happy path)", () => {
    // The single combination that triggers in-app navigation. If this fires
    // false, every link in every adapter becomes a no-op.
    test("shouldNavigate({button:0, no modifiers}) === true", () => {
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

  describe("Invariant 4: synthetic event without `button` field", () => {
    // Some test libraries (and some manual `dispatchEvent` patterns) leave
    // `button` undefined. `undefined !== 0` short-circuits the first guard
    // to false — locking this is a regression guard against a refactor
    // that normalizes `evt.button ?? 0` (which would silently turn synthetic
    // clicks into navigations).
    test.prop([arbModifiers], { numRuns: NUM_RUNS.standard })(
      "synthetic event with no `button` field → false",
      (mods) => {
        const evt = { ...mods } as unknown as MouseEvent;

        expect(shouldNavigate(evt)).toBe(false);
      },
    );
  });
});
