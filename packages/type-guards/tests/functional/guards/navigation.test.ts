import { describe, it, expect } from "vitest";

import { isNavigationOptions } from "type-guards";

describe("Router Type Guards", () => {
  describe("isNavigationOptions", () => {
    it("validates empty object", () => {
      expect(isNavigationOptions({})).toBe(true);
    });

    it("validates object with boolean options", () => {
      expect(
        isNavigationOptions({
          replace: true,
          reload: false,
        }),
      ).toBe(true);
    });

    it("rejects null", () => {
      expect(isNavigationOptions(null)).toBe(false);
    });

    it("rejects undefined", () => {
      expect(isNavigationOptions(undefined)).toBe(false);
    });

    it("rejects arrays", () => {
      expect(isNavigationOptions([])).toBe(false);
      expect(isNavigationOptions([{ replace: true }])).toBe(false);
    });

    it("validates partial options", () => {
      expect(isNavigationOptions({ replace: true })).toBe(true);
      expect(isNavigationOptions({ reload: false })).toBe(true);
    });

    it("rejects object with non-boolean field values", () => {
      expect(isNavigationOptions({ replace: "true" } as any)).toBe(false);
      expect(isNavigationOptions({ reload: 1 } as any)).toBe(false);
      expect(isNavigationOptions({ force: {} } as any)).toBe(false);
      expect(isNavigationOptions({ forceDeactivate: [] } as any)).toBe(false);
      expect(isNavigationOptions({ redirected: Symbol("test") } as any)).toBe(
        false,
      );
    });

    it("rejects object with mixed valid and invalid fields", () => {
      // One valid, one invalid - should reject the entire object
      expect(
        isNavigationOptions({
          replace: true, // valid
          reload: "false", // invalid
        } as any),
      ).toBe(false);

      expect(
        isNavigationOptions({
          reload: false, // valid
          force: 123, // invalid
        } as any),
      ).toBe(false);
    });

    it("validates all fields are optional", () => {
      // All fields undefined (absent)
      expect(isNavigationOptions({})).toBe(true);

      // Only one field present
      expect(isNavigationOptions({ replace: true })).toBe(true);

      // All fields present
      expect(
        isNavigationOptions({
          replace: true,
          reload: false,
          force: false,
          forceDeactivate: true,
          redirected: false,
        }),
      ).toBe(true);
    });
  });
});
