// @vitest-environment jsdom
// packages/preact/tests/property/applyLinkA11y.properties.ts

/**
 * Property-based tests for `applyLinkA11y` from `shared/dom-utils/link-utils.ts`.
 *
 * `applyLinkA11y(el)` adds `role="link"` + `tabindex="0"` to non-anchor /
 * non-button elements that act as Links (e.g. `<div>`, `<span>`). It must:
 *
 * - **be idempotent** — calling twice yields the same attribute state, so
 *   re-mounts and parent re-renders never duplicate or thrash attributes.
 * - **respect pre-existing attributes** — if the consumer already set `role`
 *   or `tabindex` (e.g. `role="menuitem"`, `tabindex="-1"`), the helper must
 *   not overwrite them. Uses `hasAttribute`, not `getAttribute`, so any
 *   present value (including empty string) is treated as "consumer-owned."
 * - **be a no-op for anchor / button** — those elements are natively
 *   focusable links/buttons; adding `role="link"` to `<a>` is a known a11y
 *   anti-pattern (double-announcement by screen readers).
 * - **handle null / undefined defensively** — frameworks sometimes pass a
 *   ref before mount; the helper must not throw.
 *
 * Closes review §2.2 P2 (MEDIUM) — exported DOM helper without PBT.
 */

import { fc, test } from "@fast-check/vitest";
import { afterEach, describe, expect } from "vitest";

import { NUM_RUNS } from "./helpers";
import { applyLinkA11y } from "../../src/dom-utils";

// Tags where applyLinkA11y MUST add role+tabindex.
const arbActiveTag = fc.constantFrom(
  "div",
  "span",
  "li",
  "section",
  "article",
  "p",
);

// Tags where applyLinkA11y MUST no-op (anchor + button are natively focusable
// links/buttons; double role would confuse screen readers).
const arbPassiveTag = fc.constantFrom("a", "button");

describe("applyLinkA11y — Property Tests", () => {
  afterEach(() => {
    // jsdom retains DOM state across property iterations; reset to avoid
    // attribute leakage between runs.
    document.body.innerHTML = "";
  });

  describe("Invariant 1: idempotency — applying twice yields the same attributes", () => {
    // A regression that overwrote attributes on every call (e.g. dropped the
    // `!element.hasAttribute(...)` guard) would surface as attribute thrash
    // on every Preact effect re-run. The property locks fixed-point semantics
    // over the second apply.
    test.prop([arbActiveTag], { numRuns: NUM_RUNS.standard })(
      "double-apply on an active tag preserves first-call attributes",
      (tag) => {
        const element = document.createElement(tag);

        applyLinkA11y(element);

        const roleAfterFirst = element.getAttribute("role");
        const tabindexAfterFirst = element.getAttribute("tabindex");

        applyLinkA11y(element);

        expect(element.getAttribute("role")).toBe(roleAfterFirst);
        expect(element.getAttribute("tabindex")).toBe(tabindexAfterFirst);
      },
    );

    test.prop([arbPassiveTag], { numRuns: NUM_RUNS.standard })(
      "double-apply on passive tag (anchor/button) stays a no-op",
      (tag) => {
        const element = document.createElement(tag);

        applyLinkA11y(element);
        applyLinkA11y(element);

        // Anchor/button must never gain role or tabindex.
        expect(element.hasAttribute("role")).toBe(false);
        expect(element.hasAttribute("tabindex")).toBe(false);
      },
    );
  });

  describe("Invariant 2: pre-existing role / tabindex is preserved (not overwritten)", () => {
    // Consumers may declare `role="menuitem"` or `tabindex="-1"` on the
    // wrapper element. The helper uses `hasAttribute` (not `getAttribute`),
    // so any value — including empty string — counts as "consumer-owned" and
    // must not be replaced.
    test.prop(
      [arbActiveTag, fc.constantFrom("menuitem", "button", "presentation", "")],
      { numRuns: NUM_RUNS.standard },
    )("pre-existing role attribute is preserved", (tag, customRole) => {
      const element = document.createElement(tag);

      element.setAttribute("role", customRole);
      applyLinkA11y(element);

      expect(element.getAttribute("role")).toBe(customRole);
    });

    test.prop([arbActiveTag, fc.constantFrom("-1", "0", "1", "")], {
      numRuns: NUM_RUNS.standard,
    })(
      "pre-existing tabindex attribute is preserved",
      (tag, customTabindex) => {
        const element = document.createElement(tag);

        element.setAttribute("tabindex", customTabindex);
        applyLinkA11y(element);

        expect(element.getAttribute("tabindex")).toBe(customTabindex);
      },
    );
  });

  describe("Invariant 3: anchor and button are no-op (no role / no tabindex added)", () => {
    // `<a>` is natively focusable and announces itself as a link; adding
    // `role="link"` causes screen readers to double-announce. `<button>` is
    // similarly self-describing. The helper must skip both via
    // `instanceof HTMLAnchorElement` / `HTMLButtonElement`.
    test.prop([arbPassiveTag], { numRuns: NUM_RUNS.thorough })(
      "applyLinkA11y on a/button never adds role or tabindex",
      (tag) => {
        const element = document.createElement(tag);

        applyLinkA11y(element);

        expect(element.hasAttribute("role")).toBe(false);
        expect(element.hasAttribute("tabindex")).toBe(false);
      },
    );
  });

  describe("Invariant 4: null / undefined element is a defensive no-op (no throw)", () => {
    // Framework refs can be `null` or `undefined` before mount. The helper
    // must short-circuit before touching `element.hasAttribute(...)` —
    // otherwise the first user with a ref-callback would crash on mount.
    test("applyLinkA11y(null) → no throw", () => {
      expect(() => {
        applyLinkA11y(null);
      }).not.toThrow();
    });

    test("applyLinkA11y(undefined) → no throw", () => {
      expect(() => {
        applyLinkA11y(undefined);
      }).not.toThrow();
    });
  });

  describe("Invariant 5: generic element without existing role/tabindex gains both", () => {
    // The positive contract: a bare `<div>`/`<span>` becomes a focusable
    // link surface. role="link" + tabindex="0" is the canonical WAI-ARIA
    // recipe for non-anchor link elements.
    test.prop([arbActiveTag], { numRuns: NUM_RUNS.thorough })(
      "result has role='link' and tabindex='0'",
      (tag) => {
        const element = document.createElement(tag);

        applyLinkA11y(element);

        expect(element.getAttribute("role")).toBe("link");
        expect(element.getAttribute("tabindex")).toBe("0");
      },
    );
  });
});
