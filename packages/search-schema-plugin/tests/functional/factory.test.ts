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
});
