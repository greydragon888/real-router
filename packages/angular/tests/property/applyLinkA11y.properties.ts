// @vitest-environment jsdom
// packages/angular/tests/property/applyLinkA11y.properties.ts

/**
 * Property-based tests for `applyLinkA11y` from
 * `packages/angular/src/dom-utils/link-utils.ts` (git-tracked copy of the
 * shared source).
 *
 * Angular's `RealLink` directive calls `applyLinkA11y(this.host.nativeElement)`
 * in `ngOnInit` so a `<div realLink>` host receives `role="link"` +
 * `tabindex="0"` automatically. The function is defensive:
 *
 * - **null/undefined no-op:** must not throw, must not touch the DOM
 * - **Anchor/button skip:** native `<a>` / `<button>` keep their implicit role
 * - **Pre-existing role/tabindex preserved:** `hasAttribute` (not
 *   `getAttribute`) — empty-string role still counts as "set"
 * - **Idempotent:** Angular CD may run the lifecycle path repeatedly; apply-
 *   twice must yield the same DOM state
 *
 * Uses `// @vitest-environment jsdom` because the function relies on real DOM
 * classes (`HTMLAnchorElement`/`HTMLButtonElement` for the `instanceof` skip
 * check). The rest of the property suite runs under `node` — see
 * `vitest.config.properties.mts`.
 *
 * Closes the review-2026-05-10 LOW gap for `applyLinkA11y`. There is also a
 * directive-level test (`directives.test.ts:886-893`) that pinned the
 * `<input>` "stamped" behaviour; this file generalises it.
 */

import { fc, test } from "@fast-check/vitest";
import { beforeEach, describe, expect, it } from "vitest";

import { NUM_RUNS } from "./helpers";
import { applyLinkA11y } from "../../src/dom-utils";

const arbInjectableTag = fc.constantFrom("div", "span", "section", "li", "p");

describe("applyLinkA11y — Property Tests", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  describe("Invariant 1: null / undefined no-op (defensive guard)", () => {
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

  describe("Invariant 2: <a> and <button> are skipped (native semantics)", () => {
    test.prop([fc.constantFrom("a", "button")], { numRuns: NUM_RUNS.standard })(
      "native interactive tags do not receive role/tabindex",
      (tag) => {
        const element = document.createElement(tag);

        applyLinkA11y(element);

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
    // hasAttribute (not getAttribute) — empty-string role still counts as
    // "set". A regression to `getAttribute(...)` truthy-check would overwrite
    // empty-string roles and break consumers using `role=""` as an explicit
    // "no role" signal.
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

  // Pin-tests against accidental scope changes — the skip list is exactly
  // `<a>` / `<button>` and nothing else, matching `directives.test.ts:886-893`
  // which already pins the `<input>` case.
  describe("Invariant 7: Form elements (<input>/<textarea>) receive role+tabindex (not in skip list)", () => {
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
    it("<svg> element receives role+tabindex via duck-typed attribute API", () => {
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

      expect(svg.getAttribute("role")).toBe("img");
    });
  });
});
