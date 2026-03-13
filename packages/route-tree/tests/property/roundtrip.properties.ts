// packages/route-tree/tests/property/roundtrip.properties.ts

import { test } from "@fast-check/vitest";

import {
  arbArrayFormat,
  arbArrayItems,
  arbSafeParamValue,
  arbSafeQueryValue,
  createArrayMatcher,
  createMixedMatcher,
  createParamMatcher,
  createQueryMatcher,
  NUM_RUNS,
} from "./helpers";

describe("Roundtrip Properties", () => {
  describe("buildPath→match", () => {
    const matcher = createParamMatcher();

    test.prop([arbSafeParamValue], { numRuns: NUM_RUNS.thorough })(
      "matched route name equals the name used to build the path",
      (id: string) => {
        const path = matcher.buildPath("users.profile", { id });
        const result = matcher.match(path);

        expect(result).toBeDefined();
        expect(result!.segments.at(-1)!.fullName).toBe("users.profile");
        expect(result!.params).toStrictEqual({ id });
      },
    );
  });

  describe("query-only", () => {
    const matcher = createQueryMatcher();

    test.prop([arbSafeQueryValue, arbSafeQueryValue], {
      numRuns: NUM_RUNS.thorough,
    })(
      "query params decoded after match equal original values",
      (q: string, page: string) => {
        const path = matcher.buildPath("search", { q, page });
        const result = matcher.match(path);

        expect(result).toBeDefined();
        expect(result!.params.q).toBe(q);
        expect(result!.params.page).toBe(page);
      },
    );
  });

  describe("array query params produce format-consistent output for all 4 formats", () => {
    test.prop([arbArrayFormat, arbArrayItems], { numRuns: NUM_RUNS.standard })(
      "buildPath→match produces format-expected output for each array format",
      (format: "none" | "brackets" | "index" | "comma", items: string[]) => {
        const matcher = createArrayMatcher(format);
        const path = matcher.buildPath("items", { tags: items });
        const result = matcher.match(path);

        expect(result).toBeDefined();

        const decoded = result!.params.tags as string | string[];

        if (
          format === "brackets" ||
          format === "index" ||
          (format === "none" && items.length > 1)
        ) {
          expect(Array.isArray(decoded)).toBe(true);
          expect(decoded).toStrictEqual(items);
        } else if (format === "comma") {
          // "comma" format builds "tags=a,b,c" but parses as a flat string —
          // this library's comma format encodes arrays but does not decode them
          expect(typeof decoded).toBe("string");
          expect(decoded).toBe(items.join(","));
        } else {
          // "none" single-item: scalar (no repeated key to trigger array)
          expect(decoded).toBe(items[0]);
        }
      },
    );
  });

  describe("URL params and query params are isolated in match result", () => {
    const matcher = createMixedMatcher();

    test.prop([arbSafeParamValue, arbSafeQueryValue], {
      numRuns: NUM_RUNS.standard,
    })(
      "URL param is typed url, query param is typed query in result meta",
      (category: string, q: string) => {
        const path = matcher.buildPath("results", { category, q });
        const result = matcher.match(path);

        expect(result).toBeDefined();

        const paramsMeta = result!.meta.results;

        expect(paramsMeta).toBeDefined();
        expect(paramsMeta.category).toBe("url");
        expect(paramsMeta.q).toBe("query");
        expect(result!.params.category).toBe(category);
        expect(result!.params.q).toBe(q);
      },
    );
  });
});
