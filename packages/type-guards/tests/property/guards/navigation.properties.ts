import { fc, test } from "@fast-check/vitest";
import { describe } from "vitest";

import { isNavigationOptions } from "type-guards";

import {
  navigationOptionsArbitrary,
  invalidNavigationOptionsArbitrary,
  arbitraryInvalidTypes,
} from "../helpers";

import type { NavigationOptions } from "router6-types";

describe("Router Type Guards Properties", () => {
  describe("isNavigationOptions", () => {
    test.prop([navigationOptionsArbitrary], { numRuns: 5000 })(
      "always returns true for valid NavigationOptions",
      (options) => {
        expect(isNavigationOptions(options)).toBe(true);

        return true;
      },
    );

    test("returns true for empty object", () => {
      expect(isNavigationOptions({})).toBe(true);

      return true;
    });

    test.prop([invalidNavigationOptionsArbitrary], { numRuns: 5000 })(
      "returns false for invalid NavigationOptions",
      (options) => {
        expect(
          isNavigationOptions(options as unknown as NavigationOptions),
        ).toBe(false);

        return true;
      },
    );

    test.prop([arbitraryInvalidTypes], { numRuns: 5000 })(
      "returns false for primitives",
      (value) => {
        expect(isNavigationOptions(value as null)).toBe(false);

        return true;
      },
    );

    test.prop([navigationOptionsArbitrary], { numRuns: 2000 })(
      "deterministic result",
      (options) => {
        const result1 = isNavigationOptions(options);
        const result2 = isNavigationOptions(options);

        expect(result1).toBe(result2);
        expect(result1).toBe(true);

        return true;
      },
    );

    test("handles null and undefined", () => {
      expect(isNavigationOptions(null)).toBe(false);
      expect(isNavigationOptions(undefined)).toBe(false);

      return true;
    });

    test("handles all optional fields", () => {
      expect(isNavigationOptions({ replace: true })).toBe(true);
      expect(isNavigationOptions({ reload: true })).toBe(true);
      expect(isNavigationOptions({ skipTransition: true })).toBe(true);
      expect(isNavigationOptions({ force: true })).toBe(true);
      expect(isNavigationOptions({ state: { custom: "value" } })).toBe(true);

      return true;
    });

    test.prop([fc.boolean()], { numRuns: 2000 })(
      "correctly validates replace field",
      (replace) => {
        expect(isNavigationOptions({ replace })).toBe(true);

        return true;
      },
    );

    test.prop([fc.boolean()], { numRuns: 2000 })(
      "correctly validates reload field",
      (reload) => {
        expect(isNavigationOptions({ reload })).toBe(true);

        return true;
      },
    );

    test.prop([fc.boolean()], { numRuns: 2000 })(
      "correctly validates skipTransition field",
      (skipTransition) => {
        expect(isNavigationOptions({ skipTransition })).toBe(true);

        return true;
      },
    );

    test.prop([fc.boolean()], { numRuns: 2000 })(
      "correctly validates force field",
      (force) => {
        expect(isNavigationOptions({ force })).toBe(true);

        return true;
      },
    );

    test.prop([fc.dictionary(fc.string(), fc.anything())], { numRuns: 2000 })(
      "correctly validates state field",
      (state) => {
        expect(isNavigationOptions({ state })).toBe(true);

        return true;
      },
    );
  });

  describe("Edge cases", () => {
    test("NavigationOptions with null values", () => {
      expect(isNavigationOptions({ replace: null as unknown as boolean })).toBe(
        false,
      );
      expect(isNavigationOptions({ reload: null as unknown as boolean })).toBe(
        false,
      );
      expect(
        isNavigationOptions({
          state: null as unknown as Record<string, unknown>,
        }),
      ).toBe(true); // state can be null

      return true;
    });

    test("NavigationOptions with undefined values", () => {
      expect(isNavigationOptions({ replace: undefined })).toBe(true);
      expect(isNavigationOptions({ reload: undefined })).toBe(true);
      expect(isNavigationOptions({ state: undefined })).toBe(true);

      return true;
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

        return true;
      },
    );
  });
});
