// @vitest-environment jsdom

import { fc, test } from "@fast-check/vitest";
import { describe, expect, vi } from "vitest";

import {
  NUM_RUNS,
  arbMouseEventProps,
  arbClassName,
  arbOptionalClassName,
  arbGenericTagName,
  arbRepeatCount,
} from "./helpers";
import {
  shouldNavigate,
  targetsAnotherContext,
  buildHref,
  buildActiveClassName,
  applyLinkA11y,
} from "../../../src/dom-utils";

import type { Router } from "@real-router/core";

describe("Link Utils — Property Tests", () => {
  describe("Invariant 4: shouldNavigate is pure", () => {
    test.prop([arbMouseEventProps], { numRuns: NUM_RUNS.standard })(
      "same MouseEvent properties always yield the same result",
      (props) => {
        const evt1 = new MouseEvent("click", props);
        const evt2 = new MouseEvent("click", props);

        expect(shouldNavigate(evt1)).toBe(shouldNavigate(evt2));
      },
    );
  });

  describe("Invariant 4b: targetsAnotherContext splits the browsing contexts (#1834)", () => {
    // The whole predicate, as a truth table: exactly three values name THIS
    // context, and the router may only intercept those three.
    test.prop(
      [
        fc.oneof(
          fc.constantFrom(
            undefined,
            null,
            "",
            "_self",
            "_blank",
            "_BLANK",
            "_Self",
            "_parent",
            "_top",
            "_unfencedTop",
            "myframe",
          ),
          fc.string(),
        ),
      ],
      { numRuns: NUM_RUNS.standard },
    )(
      "defers for every value but absent / empty / _self",
      (target: string | null | undefined) => {
        expect(targetsAnotherContext(target)).toBe(
          target !== undefined &&
            target !== null &&
            target !== "" &&
            target !== "_self",
        );
      },
    );

    // A named context is never THIS one, however it is spelled. The arbitrary
    // above does reach `_self` (it is a member of the `constantFrom` list), so
    // this second pass is not there to supply the value — it is there to run
    // the whole non-`_self` string space against a control that must stay
    // `false` on every single run.
    test.prop([fc.string({ minLength: 1 }).filter((s) => s !== "_self")], {
      numRuns: NUM_RUNS.standard,
    })("any non-empty name other than _self defers", (target) => {
      expect(targetsAnotherContext(target)).toBe(true);
      expect(targetsAnotherContext("_self")).toBe(false);
    });
  });

  describe("Invariant 5: buildActiveClassName returns undefined only when no class names exist", () => {
    test.prop([arbClassName, arbOptionalClassName], {
      numRuns: NUM_RUNS.standard,
    })(
      "returns a non-empty string when isActive=true and activeClassName is non-empty",
      (activeClassName, baseClassName) => {
        const result = buildActiveClassName(
          true,
          activeClassName,
          baseClassName,
        );

        expect(result).toBeDefined();
        expect(result).not.toBe("");
      },
    );

    test.prop([arbOptionalClassName], { numRuns: NUM_RUNS.standard })(
      "returns undefined when isActive=false and baseClassName is undefined",
      (activeClassName) => {
        const result = buildActiveClassName(false, activeClassName, undefined);

        expect(result).toBeUndefined();
      },
    );
  });

  describe("Invariant 6: applyLinkA11y is idempotent", () => {
    test.prop([arbGenericTagName, arbRepeatCount], {
      numRuns: NUM_RUNS.standard,
    })(
      "calling applyLinkA11y N times produces the same result as calling it once",
      (tagName, n) => {
        const element = document.createElement(tagName);

        applyLinkA11y(element);
        const expectedRole = element.getAttribute("role");
        const expectedTabindex = element.getAttribute("tabindex");

        for (let i = 1; i < n; i++) {
          applyLinkA11y(element);
        }

        expect(element.getAttribute("role")).toBe(expectedRole);
        expect(element.getAttribute("tabindex")).toBe(expectedTabindex);
      },
    );
  });

  describe("Invariant 7: applyLinkA11y preserves existing attributes", () => {
    test.prop(
      [
        arbGenericTagName,
        fc.option(arbClassName, { nil: undefined }),
        fc.option(fc.integer({ min: -1, max: 10 }).map(String), {
          nil: undefined,
        }),
      ],
      { numRuns: NUM_RUNS.standard },
    )(
      "pre-existing role and tabindex are never overwritten",
      (tagName, existingRole, existingTabindex) => {
        const element = document.createElement(tagName);

        if (existingRole !== undefined) {
          element.setAttribute("role", existingRole);
        }
        if (existingTabindex !== undefined) {
          element.setAttribute("tabindex", existingTabindex);
        }

        applyLinkA11y(element);

        if (existingRole !== undefined) {
          expect(element.getAttribute("role")).toBe(existingRole);
        }
        if (existingTabindex !== undefined) {
          expect(element.getAttribute("tabindex")).toBe(existingTabindex);
        }
      },
    );
  });

  describe("Invariant 8: buildHref never throws", () => {
    test.prop([fc.string(), fc.dictionary(fc.string(), fc.string())], {
      numRuns: NUM_RUNS.standard,
    })(
      "returns string or undefined for any routeName, never throws",
      (routeName, params) => {
        const consoleError = vi
          .spyOn(console, "error")
          .mockImplementation(() => {});
        const router = {
          buildPath: vi.fn().mockImplementation(() => {
            throw new Error("boom");
          }),
        } as unknown as Router;

        expect(() => buildHref(router, routeName, params)).not.toThrow();

        consoleError.mockRestore();
      },
    );
  });
});
