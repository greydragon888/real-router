// @vitest-environment jsdom
// packages/svelte/tests/property/applyLinkA11y.properties.ts

/**
 * Property-based tests for `applyLinkA11y` from `shared/dom-utils/link-utils.ts`.
 *
 * The function defensively adds `role="link"` + `tabindex="0"` to non-anchor /
 * non-button elements that participate in the `use:link` action. Behaviour:
 *
 * - **null/undefined no-op:** early-return guard — must not throw, must not
 *   touch the document. `<a use:link>` may run before the element is mounted
 *   (Svelte 5 action lifecycle).
 * - **Anchor / button skip:** native `<a>` and `<button>` already convey link
 *   semantics — adding role="link" would actually fight against the native
 *   role on some screen readers. The function returns early for them.
 * - **Pre-existing attribute preserved:** if the consumer already set
 *   `role="presentation"` (intentional override) or `tabindex="-1"` (skip in
 *   tab order), the function must NOT overwrite. It uses `hasAttribute`
 *   (not `getAttribute`) for this check — an empty-string attribute counts
 *   as "set".
 * - **Idempotent:** applying twice must produce the same DOM state. The
 *   action's `update()` callback may run on every reactive change, so this
 *   contract is exercised every keystroke in `<a use:link={…dynamicProps}>`.
 *
 * This file uses `// @vitest-environment jsdom` because applyLinkA11y depends
 * on real DOM classes (`HTMLAnchorElement`/`HTMLButtonElement` for instanceof
 * checks). The rest of the property suite runs under `node` — see
 * `vitest.config.properties.mts`.
 *
 * Closes review §2.2 LOW gap for `applyLinkA11y` — no property coverage of the
 * core defensive logic.
 */

import { fc, test } from "@fast-check/vitest";
import { describe, expect, beforeEach } from "vitest";

import { NUM_RUNS } from "./helpers";
import { applyLinkA11y } from "../../src/dom-utils";

// Tags where applyLinkA11y must inject role+tabindex. `<div>` and `<span>` are
// the most common — Svelte consumers wrap arbitrary content with `<div use:link>`.
const arbInjectableTag = fc.constantFrom("div", "span", "section", "li", "p");

describe("applyLinkA11y — Property Tests", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  describe("Invariant 1: null / undefined no-op (defensive guard)", () => {
    test("applyLinkA11y(null) does not throw", () => {
      expect(() => {
        applyLinkA11y(null);
      }).not.toThrow();
    });

    test("applyLinkA11y(undefined) does not throw", () => {
      expect(() => {
        applyLinkA11y(undefined);
      }).not.toThrow();
    });
  });

  describe("Invariant 2: <a> and <button> are skipped (native semantics)", () => {
    test.prop([fc.constantFrom("a", "button")], { numRuns: NUM_RUNS.standard })(
      "native interactive tags do not receive role/tabindex",
      (tag) => {
        const element = document.createElement(tag);

        applyLinkA11y(element);

        // Native role is implicit on these tags — the function must not stamp
        // a redundant role attribute or alter the tab order.
        expect(element.hasAttribute("role")).toBe(false);
        expect(element.hasAttribute("tabindex")).toBe(false);
      },
    );
  });

  describe("Invariant 3: Injectable tags receive role='link' + tabindex='0'", () => {
    test.prop([arbInjectableTag], { numRuns: NUM_RUNS.standard })(
      "div/span/section/li/p without prior attributes → role=link + tabindex=0",
      (tag) => {
        const element = document.createElement(tag);

        applyLinkA11y(element);

        expect(element.getAttribute("role")).toBe("link");
        expect(element.getAttribute("tabindex")).toBe("0");
      },
    );
  });

  describe("Invariant 4: Pre-existing role attribute preserved", () => {
    // hasAttribute (not getAttribute) is used so an empty-string role still
    // counts as "set" — a regression to `getAttribute(...) !== null` would
    // also preserve, but a regression to `getAttribute(...)` (truthy check)
    // would overwrite empty-string roles. This invariant catches both.
    test.prop(
      [arbInjectableTag, fc.constantFrom("button", "presentation", "none", "")],
      { numRuns: NUM_RUNS.standard },
    )("consumer-set role is not overwritten", (tag, existingRole) => {
      const element = document.createElement(tag);

      element.setAttribute("role", existingRole);
      applyLinkA11y(element);

      expect(element.getAttribute("role")).toBe(existingRole);
    });
  });

  describe("Invariant 5: Pre-existing tabindex attribute preserved", () => {
    test.prop([arbInjectableTag, fc.integer({ min: -1, max: 5 })], {
      numRuns: NUM_RUNS.standard,
    })("consumer-set tabindex is not overwritten", (tag, tabindex) => {
      const element = document.createElement(tag);

      element.setAttribute("tabindex", String(tabindex));
      applyLinkA11y(element);

      expect(element.getAttribute("tabindex")).toBe(String(tabindex));
    });
  });

  describe("Invariant 6: Idempotent — applying twice yields the same DOM state", () => {
    // Svelte 5 `use:` actions may call update() repeatedly on reactive prop
    // changes. The action implementation calls applyLinkA11y(node) once at
    // mount, but a future refactor that wires it into update() must remain
    // idempotent — second apply must observe the role/tabindex it just set
    // and skip.
    test.prop([arbInjectableTag], { numRuns: NUM_RUNS.standard })(
      "apply twice → same final attributes as apply once",
      (tag) => {
        const elementOnce = document.createElement(tag);
        const elementTwice = document.createElement(tag);

        applyLinkA11y(elementOnce);
        applyLinkA11y(elementTwice);
        applyLinkA11y(elementTwice);

        expect(elementTwice.getAttribute("role")).toBe(
          elementOnce.getAttribute("role"),
        );
        expect(elementTwice.getAttribute("tabindex")).toBe(
          elementOnce.getAttribute("tabindex"),
        );
      },
    );
  });

  // Closes review §5.6 rows 8-9: form elements and SVG cases. The function's
  // skip list is hard-coded to `<a>` / `<button>`. Any other tag — including
  // form elements like `<input>` / `<textarea>` and `<svg>` — passes the
  // `instanceof` checks and gets role+tabindex stamped. Lock the current
  // contract so a future refactor can't accidentally extend or restrict the
  // skip list without surfacing here.
  describe("Invariant 7: Form elements (<input>/<textarea>) receive role+tabindex (not in skip list)", () => {
    // Consumers should not use `use:link` on form elements (semantically odd —
    // a textarea isn't a navigation target). But the function is content-
    // agnostic at runtime: anything non-anchor/non-button gets stamped.
    // This is a pin-test against accidental scope changes.
    it("<input> receives role='link' + tabindex='0'", () => {
      const element = document.createElement("input");

      applyLinkA11y(element);

      expect(element.getAttribute("role")).toBe("link");
      expect(element.getAttribute("tabindex")).toBe("0");
    });

    it("<textarea> receives role='link' + tabindex='0'", () => {
      const element = document.createElement("textarea");

      applyLinkA11y(element);

      expect(element.getAttribute("role")).toBe("link");
      expect(element.getAttribute("tabindex")).toBe("0");
    });

    it("<select> receives role='link' + tabindex='0' (form element, not in skip list)", () => {
      const element = document.createElement("select");

      applyLinkA11y(element);

      expect(element.getAttribute("role")).toBe("link");
      expect(element.getAttribute("tabindex")).toBe("0");
    });
  });

  describe("Invariant 8: SVG elements (non-HTMLElement) — function operates via duck typing", () => {
    // SVGElement is NOT a subclass of HTMLElement, but it has the same
    // `hasAttribute` / `setAttribute` API and the `instanceof HTMLAnchorElement`
    // check returns false. Runtime: SVG elements get role+tabindex stamped.
    // TypeScript would block this at the boundary (`HTMLElement | null | undefined`
    // param type), but consumers using `as` casts or rest-prop-spreading via
    // Svelte action could still reach here. Lock current runtime behavior.
    it("<svg> element receives role+tabindex via duck-typed attribute API", () => {
      // Use createElementNS to construct a real SVGSVGElement (vs createElement
      // which would yield an unknown HTMLUnknownElement).
      const svg = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "svg",
      ) as unknown as HTMLElement;

      applyLinkA11y(svg);

      expect(svg.getAttribute("role")).toBe("link");
      expect(svg.getAttribute("tabindex")).toBe("0");
    });

    it("<svg> with pre-existing role attribute → preserved", () => {
      const svg = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "svg",
      ) as unknown as HTMLElement;

      svg.setAttribute("role", "img");
      applyLinkA11y(svg);

      // hasAttribute('role') was true → setAttribute skipped → preserve.
      expect(svg.getAttribute("role")).toBe("img");
    });
  });
});
