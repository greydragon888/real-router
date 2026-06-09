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
        "https://www.w3.org/2000/svg",
        "svg",
      ) as unknown as HTMLElement;

      applyLinkA11y(svg);

      expect(svg.getAttribute("role")).toBe("link");
      expect(svg.getAttribute("tabindex")).toBe("0");
    });

    it("<svg> with pre-existing role attribute → preserved", () => {
      const svg = document.createElementNS(
        "https://www.w3.org/2000/svg",
        "svg",
      ) as unknown as HTMLElement;

      svg.setAttribute("role", "img");
      applyLinkA11y(svg);

      expect(svg.getAttribute("role")).toBe("img");
    });
  });

  // ===========================================================================
  // Audit 2026-05-16 §6.2 #7 (MED) — skip-or-fully-apply
  // For every freshly-created element (no pre-existing role/tabindex), the
  // function must either skip entirely (interactive native tag — anchor /
  // button) or stamp BOTH `role` and `tabindex`. There is no partial state.
  // The wider tag matrix here covers <details>/<summary>/<input>/<form>/<svg>,
  // which are the realistic regression targets.
  // ===========================================================================
  describe("Invariant 7: skip-or-fully-apply — never partial (audit §6.2 #7)", () => {
    const arbAnyTag = fc.constantFrom(
      "a",
      "button",
      "div",
      "span",
      "section",
      "li",
      "p",
      "article",
      "aside",
      "nav",
      "header",
      "footer",
      "main",
      "input",
      "textarea",
      "select",
      "label",
      "form",
      "details",
      "summary",
    );

    test.prop([arbAnyTag], { numRuns: NUM_RUNS.thorough })(
      "fresh element: role-attribute presence === tabindex-attribute presence",
      (tag) => {
        const element = document.createElement(tag);

        applyLinkA11y(element);

        const hasRole = element.hasAttribute("role");
        const hasTab = element.hasAttribute("tabindex");

        // Either both are present (stamped path) or neither is (skip path).
        // A partial state — say, only `role` without `tabindex` — would
        // produce inaccessible UI (announced as a link but not keyboard
        // reachable).
        expect(hasRole).toBe(hasTab);
      },
    );

    test.prop([arbAnyTag], { numRuns: NUM_RUNS.standard })(
      "fresh element: when stamped, role==='link' and tabindex==='0'",
      (tag) => {
        const element = document.createElement(tag);

        applyLinkA11y(element);

        if (element.hasAttribute("role")) {
          expect(element.getAttribute("role")).toBe("link");
          expect(element.getAttribute("tabindex")).toBe("0");
        }
      },
    );
  });

  // ===========================================================================
  // Audit 2026-05-16 §6.1 — Composition: classification is deterministic and
  // disjoint. Each tag falls strictly into ONE of two bins: skip-list (no
  // attributes stamped) or injectable (role="link" + tabindex="0" stamped).
  // The two bins must not overlap, and the bin assignment must be stable
  // across repeated invocations on fresh elements with the same tag.
  // ===========================================================================
  describe("Invariant 9: skip-list ∩ injectable = ∅ — classification is deterministic and disjoint (audit §6.1)", () => {
    const arbAnyTag = fc.constantFrom(
      "a",
      "button",
      "div",
      "span",
      "section",
      "li",
      "p",
      "article",
      "aside",
      "nav",
      "header",
      "footer",
      "main",
      "input",
      "textarea",
      "select",
      "label",
      "form",
      "details",
      "summary",
    );

    test.prop([arbAnyTag], { numRuns: NUM_RUNS.thorough })(
      "classification is deterministic — five fresh elements of the same tag land in the same bin",
      (tag) => {
        const verdicts: boolean[] = [];

        for (let i = 0; i < 5; i++) {
          const element = document.createElement(tag);

          applyLinkA11y(element);
          verdicts.push(element.hasAttribute("role"));
        }

        // All five must agree — either all stamped or all skipped.
        const unique = new Set(verdicts);

        expect(unique.size).toBe(1);
      },
    );

    test.prop([arbAnyTag], { numRuns: NUM_RUNS.standard })(
      "classification is disjoint — every tag is in exactly one bin (skip-list XOR injectable)",
      (tag) => {
        const element = document.createElement(tag);

        applyLinkA11y(element);

        const isInjectable = element.hasAttribute("role");
        // Skip-list = NOT injectable. Disjoint by definition because each tag
        // produces a single boolean verdict — but pin it so a future refactor
        // that introduced a third "partial" state (e.g. role without tabindex)
        // would surface here.
        const isSkipped = !element.hasAttribute("role");

        // Boolean negation — exactly one of the two flags is true.
        expect(isInjectable).not.toBe(isSkipped);

        // And the stamped pattern is fully canonical when injectable.
        if (isInjectable) {
          expect(element.getAttribute("role")).toBe("link");
          expect(element.getAttribute("tabindex")).toBe("0");
        } else {
          expect(element.hasAttribute("tabindex")).toBe(false);
        }
      },
    );

    // Audit 2026-05-16 §5.2 Bug 4 — documented known limitation:
    // `applyLinkA11y` skip-list contains ONLY <a> and <button>; native
    // interactive elements like <details>/<summary>/<input>/<textarea>/<form>
    // still receive role="link" + tabindex="0" if used as a directive host
    // (e.g. `<details realLink>`). This is an accessibility regression risk
    // — screen readers see "link" instead of the element's native role
    // (disclosure widget / form control). The fix (extending skip-list)
    // requires a major release cycle since `shared/dom-utils/link-utils.ts`
    // declares `applyLinkA11y` as frozen API consumed by 6 adapters
    // (Preact, React, Solid, Vue, Svelte, Angular). The pin below documents
    // the current behavior so any future regression that silently changes
    // the classification surfaces here; the major-release fix should
    // simultaneously update this expectation.
    it("the documented skip-list contains <a> and <button>; everything else in the matrix is injectable (Bug 4: known a11y limitation)", () => {
      const skipTags = ["a", "button"];
      // Native interactive elements that SHOULD be in the skip-list but
      // currently are not. Treated as injectable today (= role/tabindex
      // stamped). When the major-release fix lands, move these into
      // `skipTags` and re-run the test.
      const nativeInteractiveCurrentlyInjectable = [
        "input",
        "textarea",
        "select",
        "label",
        "form",
        "details",
        "summary",
      ];
      const injectableTags = [
        "div",
        "span",
        "section",
        "li",
        "p",
        "article",
        "aside",
        "nav",
        "header",
        "footer",
        "main",
        ...nativeInteractiveCurrentlyInjectable,
      ];

      for (const tag of skipTags) {
        const element = document.createElement(tag);

        applyLinkA11y(element);

        expect(element.hasAttribute("role")).toBe(false);
        expect(element.hasAttribute("tabindex")).toBe(false);
      }

      for (const tag of injectableTags) {
        const element = document.createElement(tag);

        applyLinkA11y(element);

        expect(element.getAttribute("role")).toBe("link");
        expect(element.getAttribute("tabindex")).toBe("0");
      }

      // Pin: the two sets are disjoint by construction.
      const intersection = skipTags.filter((t) => injectableTags.includes(t));

      expect(intersection).toStrictEqual([]);
    });
  });
});
