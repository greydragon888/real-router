import { fc, test } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import { isNavigationOptions } from "type-guards";

import {
  navigationOptionsArbitrary,
  invalidNavigationOptionsArbitrary,
  arbitraryInvalidTypes,
} from "../helpers";

import type { NavigationOptions } from "@real-router/types";

describe("Router Type Guards Properties", () => {
  describe("isNavigationOptions", () => {
    test.prop([navigationOptionsArbitrary], { numRuns: 5000 })(
      "always returns true for valid NavigationOptions",
      (options) => {
        expect(isNavigationOptions(options)).toBe(true);
      },
    );

    it("returns true for empty object", () => {
      expect(isNavigationOptions({})).toBe(true);
    });

    test.prop([invalidNavigationOptionsArbitrary], { numRuns: 5000 })(
      "returns false for invalid NavigationOptions",
      (options) => {
        expect(
          isNavigationOptions(options as unknown as NavigationOptions),
        ).toBe(false);
      },
    );

    test.prop([arbitraryInvalidTypes], { numRuns: 5000 })(
      "returns false for primitives",
      (value) => {
        expect(isNavigationOptions(value as null)).toBe(false);
      },
    );

    test.prop([navigationOptionsArbitrary], { numRuns: 2000 })(
      "deterministic result",
      (options) => {
        const result1 = isNavigationOptions(options);
        const result2 = isNavigationOptions(options);

        expect(result1).toBe(result2);
        expect(result1).toBe(true);
      },
    );

    it("handles null and undefined", () => {
      expect(isNavigationOptions(null)).toBe(false);
      expect(isNavigationOptions(undefined)).toBe(false);
    });

    it("handles all optional fields", () => {
      expect(isNavigationOptions({ replace: true })).toBe(true);
      expect(isNavigationOptions({ reload: true })).toBe(true);
      expect(isNavigationOptions({ force: true })).toBe(true);
      expect(isNavigationOptions({ forceDeactivate: true })).toBe(true);
      expect(isNavigationOptions({ redirected: true })).toBe(true);
      expect(
        isNavigationOptions({ signal: new AbortController().signal }),
      ).toBe(true);
      expect(isNavigationOptions({ state: { custom: "value" } })).toBe(true);
    });

    test.prop([fc.boolean()], { numRuns: 2000 })(
      "correctly validates replace field",
      (replace) => {
        expect(isNavigationOptions({ replace })).toBe(true);
      },
    );

    test.prop([fc.boolean()], { numRuns: 2000 })(
      "correctly validates reload field",
      (reload) => {
        expect(isNavigationOptions({ reload })).toBe(true);
      },
    );

    test.prop([fc.boolean()], { numRuns: 2000 })(
      "correctly validates force field",
      (force) => {
        expect(isNavigationOptions({ force })).toBe(true);
      },
    );

    test.prop([fc.dictionary(fc.string(), fc.anything())], { numRuns: 2000 })(
      "correctly validates state field",
      (state) => {
        expect(isNavigationOptions({ state })).toBe(true);
      },
    );

    test.prop([fc.boolean()], { numRuns: 2000 })(
      "correctly validates forceDeactivate field",
      (forceDeactivate) => {
        expect(isNavigationOptions({ forceDeactivate })).toBe(true);
      },
    );

    test.prop([fc.boolean()], { numRuns: 2000 })(
      "correctly validates redirected field",
      (redirected) => {
        expect(isNavigationOptions({ redirected })).toBe(true);
      },
    );

    test.prop([fc.constant(0).map(() => new AbortController().signal)], {
      numRuns: 2000,
    })("correctly validates signal field (AbortSignal)", (signal) => {
      expect(isNavigationOptions({ signal })).toBe(true);
    });

    test.prop(
      [fc.oneof(fc.string(), fc.integer(), fc.constant(null), fc.object())],
      { numRuns: 2000 },
    )("rejects non-AbortSignal values for signal field", (signal) => {
      expect(
        isNavigationOptions({ signal } as unknown as NavigationOptions),
      ).toBe(false);
    });
  });

  describe("Edge cases", () => {
    it("NavigationOptions with null values", () => {
      expect(isNavigationOptions({ replace: null as unknown as boolean })).toBe(
        false,
      );
      expect(isNavigationOptions({ reload: null as unknown as boolean })).toBe(
        false,
      );
      expect(
        isNavigationOptions({
          forceDeactivate: null as unknown as boolean,
        }),
      ).toBe(false);
      expect(
        isNavigationOptions({ redirected: null as unknown as boolean }),
      ).toBe(false);
      expect(
        isNavigationOptions({ signal: null as unknown as AbortSignal }),
      ).toBe(false);
      expect(
        isNavigationOptions({
          state: null as unknown as Record<string, unknown>,
        }),
      ).toBe(true); // state is not validated by the guard
    });

    it("NavigationOptions with undefined values", () => {
      expect(isNavigationOptions({ replace: undefined })).toBe(true);
      expect(isNavigationOptions({ reload: undefined })).toBe(true);
      expect(isNavigationOptions({ force: undefined })).toBe(true);
      expect(isNavigationOptions({ forceDeactivate: undefined })).toBe(true);
      expect(isNavigationOptions({ redirected: undefined })).toBe(true);
      expect(isNavigationOptions({ signal: undefined })).toBe(true);
      expect(isNavigationOptions({ state: undefined })).toBe(true);
    });

    test.prop([navigationOptionsArbitrary], { numRuns: 2000 })(
      "mutation of NavigationOptions after validation",
      (options) => {
        const result1 = isNavigationOptions(options);

        // Mutate options
        options.replace = !options.replace;

        const result2 = isNavigationOptions(options);

        // Both results should be true
        expect(result1).toBe(true);
        expect(result2).toBe(true);
      },
    );
  });
});
