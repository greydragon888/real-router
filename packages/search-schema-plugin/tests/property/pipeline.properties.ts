import { createRouter } from "@real-router/core";
import fc from "fast-check";
import { describe, it, expect, vi } from "vitest";

import { searchSchemaPlugin } from "../../src/index";

import type { StandardSchemaV1, StandardSchemaV1Issue } from "../../src/types";
import type { Params } from "@real-router/core";

// =============================================================================
// Schema Helpers
// =============================================================================

function createPassSchema(output: Params): StandardSchemaV1 {
  return {
    "~standard": {
      version: 1,
      vendor: "test",
      validate: () => ({ value: output }),
    },
  };
}

function createSubsetSchema(knownKeys: readonly string[]): StandardSchemaV1 {
  const keySet = new Set(knownKeys);

  return {
    "~standard": {
      version: 1,
      vendor: "test",
      validate: (value: unknown) => {
        const params = value as Record<string, unknown>;
        const output: Record<string, unknown> = {};

        for (const key of Object.keys(params)) {
          if (keySet.has(key)) {
            output[key] = params[key];
          }
        }

        return { value: output };
      },
    },
  };
}

function createFailSchema(
  issues: readonly StandardSchemaV1Issue[],
): StandardSchemaV1 {
  return {
    "~standard": {
      version: 1,
      vendor: "test",
      validate: () => ({ issues }),
    },
  };
}

function createUppercaseSchema(knownKeys: readonly string[]): StandardSchemaV1 {
  const keySet = new Set(knownKeys);

  return {
    "~standard": {
      version: 1,
      vendor: "test",
      validate: (value: unknown) => {
        const params = value as Record<string, unknown>;
        const output: Record<string, unknown> = {};

        for (const key of Object.keys(params)) {
          if (keySet.has(key)) {
            const val = params[key];

            output[key] = typeof val === "string" ? val.toUpperCase() : val;
          }
        }

        return { value: output };
      },
    },
  };
}

function createAsyncSchema(): StandardSchemaV1 {
  return {
    "~standard": {
      version: 1,
      vendor: "test",
      validate: () => Promise.resolve({ value: {} }),
    },
  };
}

// =============================================================================
// Arbitraries
// =============================================================================

const VALIDATED_KEYS = ["a", "b"];
const EXTRA_KEYS = ["c", "d", "e"];
const ALL_KEYS = [...VALIDATED_KEYS, ...EXTRA_KEYS];
const ROUTE_PATH = `/test?${ALL_KEYS.join("&")}`;

const arbParamValue = fc.string({ minLength: 1, maxLength: 10 });

const arbValidatedParams = fc.dictionary(
  fc.constantFrom(...VALIDATED_KEYS),
  arbParamValue,
  { minKeys: 1, maxKeys: VALIDATED_KEYS.length },
) as fc.Arbitrary<Params>;

const arbExtraParams = fc.dictionary(
  fc.constantFrom(...EXTRA_KEYS),
  arbParamValue,
  { minKeys: 1, maxKeys: EXTRA_KEYS.length },
) as fc.Arbitrary<Params>;

const arbAllParams = fc.dictionary(
  fc.constantFrom(...ALL_KEYS),
  arbParamValue,
  { minKeys: 1, maxKeys: ALL_KEYS.length },
) as fc.Arbitrary<Params>;

// =============================================================================
// Validation Pipeline (forwardState interceptor)
// =============================================================================

describe("Validation Pipeline (forwardState interceptor)", () => {
  it("Valid params pass-through", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      await fc.assert(
        fc.asyncProperty(
          arbValidatedParams,
          arbExtraParams,
          async (validParams, extraParams) => {
            const navigateParams: Params = { ...validParams, ...extraParams };

            const router = createRouter(
              [
                { name: "home", path: "/" },
                {
                  name: "test",
                  path: ROUTE_PATH,
                  searchSchema: createSubsetSchema(VALIDATED_KEYS),
                },
              ],
              { defaultRoute: "home" },
            );

            router.usePlugin(
              searchSchemaPlugin({ mode: "production", strict: false }),
            );
            await router.start("/");
            await router.navigate("test", navigateParams);

            const state = router.getState();

            for (const [key, value] of Object.entries(validParams)) {
              expect(state?.params[key]).toBe(value);
            }

            for (const [key, value] of Object.entries(extraParams)) {
              expect(state?.params[key]).toBe(value);
            }

            router.stop();
          },
        ),
      );
    } finally {
      consoleSpy.mockRestore();
    }
  });

  it("Invalid key stripping", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      await fc.assert(
        fc.asyncProperty(
          arbValidatedParams,
          fc.subarray(EXTRA_KEYS, { minLength: 1 }),
          async (validParams, invalidKeys) => {
            const allParams: Params = { ...validParams };

            for (const key of invalidKeys) {
              allParams[key] = "bad-value";
            }

            const issues: StandardSchemaV1Issue[] = invalidKeys.map((key) => ({
              message: `${key} is invalid`,
              path: [key],
            }));

            const router = createRouter(
              [
                { name: "home", path: "/" },
                {
                  name: "test",
                  path: ROUTE_PATH,
                  searchSchema: createFailSchema(issues),
                },
              ],
              { defaultRoute: "home" },
            );

            router.usePlugin(searchSchemaPlugin({ mode: "production" }));
            await router.start("/");
            await router.navigate("test", allParams);

            const state = router.getState();

            for (const key of invalidKeys) {
              expect(state?.params).not.toHaveProperty(key);
            }

            for (const [key, value] of Object.entries(validParams)) {
              expect(state?.params[key]).toBe(value);
            }

            router.stop();
          },
        ),
      );
    } finally {
      consoleSpy.mockRestore();
    }
  });

  it("DefaultParams recovery", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      await fc.assert(
        fc.asyncProperty(
          arbValidatedParams,
          fc.subarray(EXTRA_KEYS, { minLength: 1 }),
          fc.dictionary(fc.constantFrom(...EXTRA_KEYS), arbParamValue, {
            minKeys: EXTRA_KEYS.length,
            maxKeys: EXTRA_KEYS.length,
          }),
          async (validParams, invalidKeys, defaults) => {
            const allParams: Params = { ...validParams };

            for (const key of invalidKeys) {
              allParams[key] = "bad-value";
            }

            const issues: StandardSchemaV1Issue[] = invalidKeys.map((key) => ({
              message: `${key} is invalid`,
              path: [key],
            }));

            const router = createRouter(
              [
                { name: "home", path: "/" },
                {
                  name: "test",
                  path: ROUTE_PATH,
                  defaultParams: defaults as Params,
                  searchSchema: createFailSchema(issues),
                },
              ],
              { defaultRoute: "home" },
            );

            router.usePlugin(searchSchemaPlugin({ mode: "production" }));
            await router.start("/");
            await router.navigate("test", allParams);

            const state = router.getState();

            for (const key of invalidKeys) {
              expect(state?.params[key]).toBe(defaults[key]);
            }

            for (const [key, value] of Object.entries(validParams)) {
              expect(state?.params[key]).toBe(value);
            }

            router.stop();
          },
        ),
      );
    } finally {
      consoleSpy.mockRestore();
    }
  });

  it("Strict mode output isolation", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      await fc.assert(
        fc.asyncProperty(
          arbValidatedParams,
          arbExtraParams,
          async (schemaOutput, extraParams) => {
            const navigateParams: Params = { ...schemaOutput, ...extraParams };

            const router = createRouter(
              [
                { name: "home", path: "/" },
                {
                  name: "test",
                  path: ROUTE_PATH,
                  searchSchema: createPassSchema(schemaOutput),
                },
              ],
              { defaultRoute: "home" },
            );

            router.usePlugin(
              searchSchemaPlugin({ mode: "production", strict: true }),
            );
            await router.start("/");
            await router.navigate("test", navigateParams);

            const state = router.getState();

            for (const [key, value] of Object.entries(schemaOutput)) {
              expect(state?.params[key]).toBe(value);
            }

            for (const key of Object.keys(extraParams)) {
              expect(state?.params).not.toHaveProperty(key);
            }

            router.stop();
          },
        ),
      );
    } finally {
      consoleSpy.mockRestore();
      warnSpy.mockRestore();
    }
  });

  it("Non-strict mode: schema output overrides original, extras preserved", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      await fc.assert(
        fc.asyncProperty(
          arbValidatedParams,
          arbExtraParams,
          async (validParams, extraParams) => {
            const navigateParams: Params = { ...validParams, ...extraParams };

            const router = createRouter(
              [
                { name: "home", path: "/" },
                {
                  name: "test",
                  path: ROUTE_PATH,
                  searchSchema: createUppercaseSchema(VALIDATED_KEYS),
                },
              ],
              { defaultRoute: "home" },
            );

            router.usePlugin(
              searchSchemaPlugin({ mode: "production", strict: false }),
            );
            await router.start("/");
            await router.navigate("test", navigateParams);

            const state = router.getState();

            for (const [key, value] of Object.entries(validParams)) {
              const expected =
                typeof value === "string" ? value.toUpperCase() : value;

              expect(state?.params[key]).toBe(expected);
            }

            for (const [key, value] of Object.entries(extraParams)) {
              expect(state?.params[key]).toBe(value);
            }

            router.stop();
          },
        ),
      );
    } finally {
      consoleSpy.mockRestore();
      warnSpy.mockRestore();
    }
  });

  it("Async rejection", async () => {
    await fc.assert(
      fc.asyncProperty(arbAllParams, async (params) => {
        const router = createRouter(
          [
            { name: "home", path: "/" },
            {
              name: "test",
              path: ROUTE_PATH,
              searchSchema: createAsyncSchema(),
            },
          ],
          { defaultRoute: "home" },
        );

        router.usePlugin(searchSchemaPlugin({ mode: "production" }));
        await router.start("/");

        await expect(router.navigate("test", params)).rejects.toThrow(
          TypeError,
        );

        router.stop();
      }),
    );
  });
});
