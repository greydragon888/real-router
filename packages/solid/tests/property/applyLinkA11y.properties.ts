// @vitest-environment jsdom

// packages/solid/tests/property/applyLinkA11y.properties.ts

/**
 * Property-based tests for `applyLinkA11y` from `shared/dom-utils/link-utils.ts`.
 *
 * `applyLinkA11y` is invoked by every framework adapter on link mount to
 * inject `role="link"` / `tabindex="0"` on non-focusable elements (i.e.
 * everything except `<a>` and `<button>`). The defensive `hasAttribute`
 * guard ensures consumer-supplied role/tabindex survive.
 *
 * jsdom is loaded per-file via the magic comment above — properties run
 * in node env by default; `instanceof HTMLAnchorElement` / `HTMLElement`
 * require a real DOM globals scope, which jsdom provides.
 *
 * Invariants (§S2 audit action — companion to functional tests in
 * `tests/functional/link-directive.test.tsx:89-167`):
 *
 * - **Null/undefined → no-op** (already in linkUtils.properties.ts; mirrored
 *   here for completeness alongside DOM-dependent invariants).
 * - **Idempotency**: applying twice yields the same attribute state as once.
 * - **Anchor / Button skip**: existing accessibility semantics preserved.
 * - **Existing role/tabindex preserved**: defensive guard via `hasAttribute`.
 */

import { fc, test } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import { NUM_RUNS } from "./helpers";
import { applyLinkA11y } from "../../src/dom-utils";

describe("applyLinkA11y — Property Tests (Solid, §S2 audit)", () => {
  describe("Invariant 1: null/undefined input → no-op (no throw)", () => {
    it("applyLinkA11y(null) does not throw", () => {
      expect(() => {
        applyLinkA11y(null);
      }).not.toThrow();
    });

    it("applyLinkA11y(undefined) does not throw", () => {
      expect(() => {
        applyLinkA11y(undefined);
      }).not.toThrow();
    });
  });

  describe("Invariant 2: idempotency — apply twice ≡ apply once", () => {
    // The `hasAttribute` guard ensures the second application reads the
    // attributes set by the first and short-circuits — final state matches
    // a single application. Property guard against a regression that
    // unconditionally re-sets values.
    test.prop(
      [fc.constantFrom("div", "span", "li", "section", "article", "p")],
      { numRuns: NUM_RUNS.standard },
    )("apply ∘ apply = apply on any non-focusable element", (tagName) => {
      const elementA = document.createElement(tagName);

      applyLinkA11y(elementA);
      const roleAfterFirst = elementA.getAttribute("role");
      const tabindexAfterFirst = elementA.getAttribute("tabindex");

      applyLinkA11y(elementA);
      const roleAfterSecond = elementA.getAttribute("role");
      const tabindexAfterSecond = elementA.getAttribute("tabindex");

      expect(roleAfterFirst).toBe("link");
      expect(tabindexAfterFirst).toBe("0");
      expect(roleAfterSecond).toBe(roleAfterFirst);
      expect(tabindexAfterSecond).toBe(tabindexAfterFirst);
    });
  });

  describe("Invariant 3: HTMLAnchorElement / HTMLButtonElement — skip (preserve native a11y)", () => {
    it("<a> element gets neither role nor tabindex injected", () => {
      const anchor = document.createElement("a");

      applyLinkA11y(anchor);

      expect(anchor.hasAttribute("role")).toBe(false);
      expect(anchor.hasAttribute("tabindex")).toBe(false);
    });

    it("<button> element gets neither role nor tabindex injected", () => {
      const button = document.createElement("button");

      applyLinkA11y(button);

      expect(button.hasAttribute("role")).toBe(false);
      expect(button.hasAttribute("tabindex")).toBe(false);
    });

    test.prop(
      [
        fc.constantFrom(
          "div",
          "span",
          "li",
          "section",
          "article",
          "p",
          "header",
          "nav",
        ),
      ],
      { numRuns: NUM_RUNS.standard },
    )(
      "any other non-anchor/non-button tag DOES get role+tabindex injected",
      (tagName) => {
        const element = document.createElement(tagName);

        applyLinkA11y(element);

        expect(element.getAttribute("role")).toBe("link");
        expect(element.getAttribute("tabindex")).toBe("0");
      },
    );
  });

  describe("Invariant 4: existing role / tabindex are preserved", () => {
    // Consumer-supplied accessibility attributes must survive injection —
    // the defensive `hasAttribute` guard short-circuits the setter.
    test.prop(
      [
        fc.constantFrom("button", "menuitem", "tab", "switch", "checkbox"),
        fc.constantFrom("div", "span", "li"),
      ],
      { numRuns: NUM_RUNS.standard },
    )("existing role survives applyLinkA11y", (preset, tagName) => {
      const element = document.createElement(tagName);

      element.setAttribute("role", preset);

      applyLinkA11y(element);

      expect(element.getAttribute("role")).toBe(preset);
      // tabindex was not pre-set → applyLinkA11y added the default.
      expect(element.getAttribute("tabindex")).toBe("0");
    });

    test.prop(
      [
        fc.constantFrom("-1", "0", "1", "5"),
        fc.constantFrom("div", "span", "li"),
      ],
      { numRuns: NUM_RUNS.standard },
    )("existing tabindex survives applyLinkA11y", (preset, tagName) => {
      const element = document.createElement(tagName);

      element.setAttribute("tabindex", preset);

      applyLinkA11y(element);

      expect(element.getAttribute("tabindex")).toBe(preset);
      // role was not pre-set → applyLinkA11y added the default.
      expect(element.getAttribute("role")).toBe("link");
    });

    test.prop(
      [
        fc.constantFrom("button", "tab"),
        fc.constantFrom("-1", "0", "1"),
        fc.constantFrom("div", "span", "li"),
      ],
      { numRuns: NUM_RUNS.standard },
    )(
      "both pre-set: applyLinkA11y leaves them entirely unchanged",
      (rolePreset, tabPreset, tagName) => {
        const element = document.createElement(tagName);

        element.setAttribute("role", rolePreset);
        element.setAttribute("tabindex", tabPreset);

        applyLinkA11y(element);

        expect(element.getAttribute("role")).toBe(rolePreset);
        expect(element.getAttribute("tabindex")).toBe(tabPreset);
      },
    );
  });
});
