/* eslint-disable id-length -- `q` is a short but standard query param name in tests */
import type {
  StandardSchemaV1,
  StandardSchemaV1Issue,
} from "@real-router/search-schema-plugin";

export function createMockSchema(config: {
  validate: (
    value: unknown,
  ) =>
    | { value: unknown }
    | { issues: readonly StandardSchemaV1Issue[] }
    | Promise<{ value: unknown }>;
}): StandardSchemaV1 {
  return {
    "~standard": {
      version: 1,
      vendor: "test",
      validate: config.validate,
    },
  };
}

/** Schema that always passes, returning input as-is. */
export function passThroughSchema(): StandardSchemaV1 {
  return createMockSchema({
    validate: (value) => ({ value }),
  });
}

/** Schema that always fails with given issues. */
export function failingSchema(
  issues: readonly StandardSchemaV1Issue[],
): StandardSchemaV1 {
  return createMockSchema({
    validate: () => ({ issues }),
  });
}

/**
 * Schema that validates `q` (string), `page` (number), `sort` (string).
 * Returns issues for keys that are present but have the wrong type.
 * Strict: returns only known keys in `value`.
 */
export function searchSchema(): StandardSchemaV1 {
  return createMockSchema({
    validate: (value) => {
      const params = value as Record<string, unknown>;
      const issues: StandardSchemaV1Issue[] = [];

      if ("q" in params && typeof params.q !== "string") {
        issues.push({ message: "q must be a string", path: ["q"] });
      }

      if ("page" in params && typeof params.page !== "number") {
        issues.push({ message: "page must be a number", path: ["page"] });
      }

      if ("sort" in params && typeof params.sort !== "string") {
        issues.push({ message: "sort must be a string", path: ["sort"] });
      }

      if (issues.length > 0) {
        return { issues };
      }

      // Only return known keys (strict behavior)
      return {
        value: {
          ...(params.q === undefined ? {} : { q: params.q }),
          ...(params.page === undefined ? {} : { page: params.page }),
          ...(params.sort === undefined ? {} : { sort: params.sort }),
        },
      };
    },
  });
}

/**
 * Schema that fills defaults for absent keys.
 * Simulates `.default()` behavior — undefined fields get defaults.
 */
export function schemaWithDefaults(): StandardSchemaV1 {
  return createMockSchema({
    validate: (value) => {
      const params = value as Record<string, unknown>;

      return {
        value: {
          q: params.q ?? "",
          page: params.page ?? 1,
          sort: params.sort ?? "relevance",
        },
      };
    },
  });
}

/** Schema that transforms existing values (trim + lowercase). */
export function transformingSchema(): StandardSchemaV1 {
  return createMockSchema({
    validate: (value) => {
      const params = value as Record<string, unknown>;
      const result: Record<string, unknown> = {};

      for (const [key, val] of Object.entries(params)) {
        result[key] = typeof val === "string" ? val.trim().toLowerCase() : val;
      }

      return { value: result };
    },
  });
}

/** Schema that returns a Promise (async — should be rejected). */
export function asyncSchema(): StandardSchemaV1 {
  return createMockSchema({
    validate: () => Promise.resolve({ value: {} }),
  });
}

export {
  type StandardSchemaV1,
  type StandardSchemaV1Issue,
} from "@real-router/search-schema-plugin";
