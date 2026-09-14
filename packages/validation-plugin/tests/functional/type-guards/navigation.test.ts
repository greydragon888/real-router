import { describe, it, expect } from "vitest";

import { isNavigationOptions } from "../../../src/type-guards";

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

    // ⚑ RED for #2311. `revalidate` is declared `boolean | undefined` on core's
    // `NavigationOptions` and was absent from the walked list — so the guard
    // ADMITTED a non-boolean there while rejecting it on its five siblings. The
    // cell below enumerates the same five the list did, which is why it could
    // never have caught this: the pin was written FROM the list.
    it("rejects a non-boolean revalidate, like every other boolean field", () => {
      expect(isNavigationOptions({ revalidate: "true" })).toBe(false);
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

    it("validates signal field (AbortSignal)", () => {
      expect(
        isNavigationOptions({ signal: new AbortController().signal }),
      ).toBe(true);
      expect(isNavigationOptions({ signal: undefined })).toBe(true);
    });

    it("rejects non-AbortSignal signal values", () => {
      expect(isNavigationOptions({ signal: 42 } as any)).toBe(false);
      expect(isNavigationOptions({ signal: "not-a-signal" } as any)).toBe(
        false,
      );
      expect(isNavigationOptions({ signal: {} } as any)).toBe(false);
      expect(isNavigationOptions({ signal: true } as any)).toBe(false);
    });

    it("accepts object with unknown extra fields (only known fields are validated)", () => {
      expect(isNavigationOptions({ replace: true, invalidField: 123 })).toBe(
        true,
      );
      expect(
        isNavigationOptions({ reload: false, extra: "string", count: 42 }),
      ).toBe(true);
      expect(isNavigationOptions({ unknownOnly: [1, 2, 3] })).toBe(true);
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
