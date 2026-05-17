// packages/vue/tests/property/shouldNavigate.properties.ts

/**
 * Property-based tests for `shouldNavigate(evt)` — the gate that every
 * `<Link>` click handler and `v-link` directive consults before invoking
 * `router.navigate`. The function is a 5-axis predicate:
 *
 *   button === 0 && !metaKey && !altKey && !ctrlKey && !shiftKey
 *
 * Total cartesian surface: 3 button states × 2^4 modifier combinations = 48
 * cases. PBT here exhaustively explores the truth table so a regression that
 * flips any axis (e.g. accepting middle-clicks, or dropping the metaKey
 * guard) is caught immediately. Closes review §5.1 / §6 — `shouldNavigate`
 * gap noted as "MISSING — нужен PBT" in the audit-2026-05-16 edge-case map.
 *
 * Closes review-2026-05-16 §5/§6 — `shouldNavigate` gap: the cartesian
 * surface was previously only sampled by three hand-written cases in
 * `tests/functional/dom-utils-link.test.ts` (altKey, shiftKey, bare click);
 * metaKey, ctrlKey, and middle/right-button paths had no coverage at all.
 */

import { test, fc } from "@fast-check/vitest";
import { describe, expect } from "vitest";

import { NUM_RUNS } from "./helpers";
import { shouldNavigate } from "../../src/dom-utils";

// =============================================================================
// Generators
// =============================================================================

/** Left (0), middle (1), right (2) — the only MouseEvent.button values browsers emit on a primary click. */
const arbMouseButton: fc.Arbitrary<number> = fc.constantFrom(0, 1, 2);

/** All four modifier keys MDN documents on MouseEvent. */
const arbMouseModifiers = fc.record({
  metaKey: fc.boolean(),
  altKey: fc.boolean(),
  ctrlKey: fc.boolean(),
  shiftKey: fc.boolean(),
});

/**
 * `shouldNavigate` reads only the five primitive event fields — no methods,
 * no inheritance chain. Property tests run under `environment: "node"`
 * (vitest.config.properties.mts), where `MouseEvent` is undefined. Building
 * a plain object that satisfies the duck-typed shape keeps the test
 * portable; the runtime call is structurally identical to a real browser
 * event from `shouldNavigate`'s perspective.
 */
interface MouseLike {
  button: number;
  metaKey: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
}

function makeMouseLike(
  button: number,
  mods: {
    metaKey: boolean;
    altKey: boolean;
    ctrlKey: boolean;
    shiftKey: boolean;
  },
): MouseLike {
  return { button, ...mods };
}

// =============================================================================
// Tests
// =============================================================================

describe("shouldNavigate — Property Tests", () => {
  describe("Invariant 1: truth table — exhaustive 5-axis equivalence", () => {
    // The function must agree with the boolean expression
    //   button === 0 && !metaKey && !altKey && !ctrlKey && !shiftKey
    // for ALL 48 combinations. Any divergence is a regression.
    test.prop([arbMouseButton, arbMouseModifiers], {
      numRuns: NUM_RUNS.standard,
    })(
      "shouldNavigate(evt) === (button===0 && no modifier held)",
      (button, mods) => {
        const evt = makeMouseLike(button, mods);
        const expected =
          button === 0 &&
          !mods.metaKey &&
          !mods.altKey &&
          !mods.ctrlKey &&
          !mods.shiftKey;

        expect(shouldNavigate(evt as unknown as MouseEvent)).toBe(expected);
      },
    );
  });

  describe("Invariant 2: non-left button never navigates regardless of modifiers", () => {
    // Middle / right clicks must short-circuit on the button check — adding
    // modifier guards on top cannot rescue them. Locks the contract that
    // browsers' built-in middle-click ("open in new tab") and right-click
    // ("context menu") behaviour is never preempted by `<Link>` navigation.
    test.prop([fc.constantFrom(1, 2), arbMouseModifiers], {
      numRuns: NUM_RUNS.standard,
    })("shouldNavigate(non-left click) === false", (button, mods) => {
      const evt = makeMouseLike(button, mods);

      expect(shouldNavigate(evt as unknown as MouseEvent)).toBe(false);
    });
  });

  describe("Invariant 3: any held modifier on a left click suppresses navigation", () => {
    // Each modifier maps to a documented browser shortcut:
    //   meta  → macOS "open in new tab" / Windows pin-to-taskbar
    //   ctrl  → Linux/Windows "open in new tab"
    //   alt   → Chrome/Firefox "download link"
    //   shift → "open in new window"
    // The helper must defer to all four — losing any would silently break
    // hardware-keyboard accessibility patterns.
    test.prop(
      [
        arbMouseModifiers.filter(
          (m) => m.metaKey || m.altKey || m.ctrlKey || m.shiftKey,
        ),
      ],
      { numRuns: NUM_RUNS.standard },
    )("shouldNavigate(left click + ≥1 modifier) === false", (mods) => {
      const evt = makeMouseLike(0, mods);

      expect(shouldNavigate(evt as unknown as MouseEvent)).toBe(false);
    });
  });

  describe("Invariant 4: bare left click (no modifiers) always navigates", () => {
    // Sanity check / completeness — the only happy path. With all four
    // modifier flags false and button=0, the helper must return true.
    test("shouldNavigate({button:0, no modifiers}) === true", () => {
      const evt = makeMouseLike(0, {
        metaKey: false,
        altKey: false,
        ctrlKey: false,
        shiftKey: false,
      });

      expect(shouldNavigate(evt as unknown as MouseEvent)).toBe(true);
    });
  });
});
