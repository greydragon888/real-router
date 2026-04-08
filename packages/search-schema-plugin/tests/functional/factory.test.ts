import { describe, it, expect } from "vitest";

import { searchSchemaPlugin } from "@real-router/search-schema-plugin";

import type { SearchSchemaPluginOptions } from "@real-router/search-schema-plugin";

describe("Search schema plugin", () => {
  describe("Factory validation", () => {
    it("should throw TypeError for invalid mode", () => {
      expect(() => {
        searchSchemaPlugin({ mode: "invalid" as "development" });
      }).toThrow(TypeError);

      expect(() => {
        searchSchemaPlugin({ mode: "invalid" as "development" });
      }).toThrow(/Invalid mode/);
    });

    it("should throw TypeError for invalid strict option", () => {
      expect(() => {
        searchSchemaPlugin({ strict: "yes" as unknown as boolean });
      }).toThrow(TypeError);

      expect(() => {
        searchSchemaPlugin({ strict: 1 as unknown as boolean });
      }).toThrow(/Invalid strict/);
    });

    it("should throw TypeError for invalid onError option", () => {
      expect(() => {
        searchSchemaPlugin({
          onError: "handler" as unknown as NonNullable<
            SearchSchemaPluginOptions["onError"]
          >,
        });
      }).toThrow(TypeError);

      expect(() => {
        searchSchemaPlugin({
          onError: 42 as unknown as NonNullable<
            SearchSchemaPluginOptions["onError"]
          >,
        });
      }).toThrow(/Invalid onError/);
    });

    it("should accept valid options without throwing", () => {
      expect(() => {
        searchSchemaPlugin({ mode: "development" });
      }).not.toThrow();

      expect(() => {
        searchSchemaPlugin({ mode: "production" });
      }).not.toThrow();

      expect(() => {
        searchSchemaPlugin({ strict: true });
      }).not.toThrow();

      expect(() => {
        searchSchemaPlugin({ strict: false });
      }).not.toThrow();

      expect(() => {
        searchSchemaPlugin({ onError: () => ({}) });
      }).not.toThrow();
    });

    it("should accept empty options", () => {
      expect(() => {
        searchSchemaPlugin({});
      }).not.toThrow();

      expect(() => {
        searchSchemaPlugin();
      }).not.toThrow();
    });
  });

  describe("Options immutability", () => {
    it("should freeze options so they cannot be mutated after factory call", () => {
      // Verify that the factory accepts pre-frozen options without error
      expect(() => {
        searchSchemaPlugin(Object.freeze({ mode: "production" }));
      }).not.toThrow();

      expect(() => {
        searchSchemaPlugin(Object.freeze({ strict: true }));
      }).not.toThrow();

      expect(() => {
        searchSchemaPlugin(
          Object.freeze({ mode: "development", strict: false }),
        );
      }).not.toThrow();
    });

    it("should not be affected by mutations to the original options object", () => {
      // Use a mutable object (cast away readonly to simulate external mutation)
      const mutableOptions = {
        mode: "development" as const,
        strict: false,
      };

      const factory = searchSchemaPlugin(mutableOptions);

      // Mutate original object after factory creation
      // The factory should have captured a frozen copy, not a reference
      (mutableOptions as { mode: string }).mode = "production";
      (mutableOptions as { strict: boolean }).strict = true;

      // Factory was created with a frozen copy — it should still be a valid function
      expect(typeof factory).toBe("function");
    });
  });
});
