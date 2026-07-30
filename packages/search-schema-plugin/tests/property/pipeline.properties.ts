import { createRouter } from "@real-router/core";
import * as fc from "fast-check";
import { describe, it, expect, vi } from "vitest";

import { searchSchemaPlugin } from "../../src/index";

import type { StandardSchemaV1, StandardSchemaV1Issue } from "../../src/types";
import type { Params, SearchParams } from "@real-router/core";

// =============================================================================
// Schema Helpers
// =============================================================================

function createPassSchema(output: SearchParams): StandardSchemaV1 {
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

const VALIDATED_KEYS = ["a", "b", "c", "d", "e"];
const EXTRA_KEYS = ["f", "g", "h"];
const ALL_KEYS = [...VALIDATED_KEYS, ...EXTRA_KEYS];
const ROUTE_PATH = `/test?${ALL_KEYS.join("&")}`;

const arbParamValue = fc.string({ minLength: 1, maxLength: 10 });

const arbValidatedParams = fc.dictionary(
  fc.constantFrom(...VALIDATED_KEYS),
  arbParamValue,
  { minKeys: 1, maxKeys: VALIDATED_KEYS.length },
) as fc.Arbitrary<SearchParams>;

const arbExtraParams = fc.dictionary(
  fc.constantFrom(...EXTRA_KEYS),
  arbParamValue,
  { minKeys: 1, maxKeys: EXTRA_KEYS.length },
) as fc.Arbitrary<SearchParams>;

const arbAllParams = fc.dictionary(
  fc.constantFrom(...ALL_KEYS),
  arbParamValue,
  { minKeys: 1, maxKeys: ALL_KEYS.length },
) as fc.Arbitrary<SearchParams>;

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
            const navigateParams: SearchParams = {
              ...validParams,
              ...extraParams,
            };

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
            await router.navigate("test", {}, navigateParams);

            const state = router.getState();

            for (const [key, value] of Object.entries(validParams)) {
              expect(state?.search[key]).toBe(value);
            }

            for (const [key, value] of Object.entries(extraParams)) {
              expect(state?.search[key]).toBe(value);
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
            const allParams: SearchParams = { ...validParams };

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
            await router.navigate("test", {}, allParams);

            const state = router.getState();

            for (const key of invalidKeys) {
              expect(state?.search).not.toHaveProperty(key);
            }

            for (const [key, value] of Object.entries(validParams)) {
              expect(state?.search[key]).toBe(value);
            }

            router.stop();
          },
        ),
      );
    } finally {
      consoleSpy.mockRestore();
    }
  });

  it("defaultSearch recovery", async () => {
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
            const allParams: SearchParams = { ...validParams };

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
                  // `defaultSearch`, not `defaultParams`: every key here is
                  // `?`-declared on ROUTE_PATH, and the slot IS the channel
                  // (#1548) — a query-declared name written in `defaultParams`
                  // is refused at registration. This is also the only slot the
                  // plugin's recovery reads now, for the same reason.
                  defaultSearch: defaults,
                  searchSchema: createFailSchema(issues),
                },
              ],
              { defaultRoute: "home" },
            );

            router.usePlugin(searchSchemaPlugin({ mode: "production" }));
            await router.start("/");
            await router.navigate("test", {}, allParams);

            const state = router.getState();

            for (const key of invalidKeys) {
              expect(state?.search[key]).toBe(defaults[key]);
            }

            for (const [key, value] of Object.entries(validParams)) {
              expect(state?.search[key]).toBe(value);
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
            const navigateParams: SearchParams = {
              ...schemaOutput,
              ...extraParams,
            };

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
            await router.navigate("test", {}, navigateParams);

            const state = router.getState();

            for (const [key, value] of Object.entries(schemaOutput)) {
              expect(state?.search[key]).toBe(value);
            }

            for (const key of Object.keys(extraParams)) {
              expect(state?.search).not.toHaveProperty(key);
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
            const navigateParams: SearchParams = {
              ...validParams,
              ...extraParams,
            };

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
            await router.navigate("test", {}, navigateParams);

            const state = router.getState();

            for (const [key, value] of Object.entries(validParams)) {
              const expected =
                typeof value === "string" ? value.toUpperCase() : value;

              expect(state?.search[key]).toBe(expected);
            }

            for (const [key, value] of Object.entries(extraParams)) {
              expect(state?.search[key]).toBe(value);
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

        await expect(router.navigate("test", {}, params)).rejects.toThrow(
          TypeError,
        );

        router.stop();
      }),
    );
  });
});

// =============================================================================
// Channel isolation (#1564)
// =============================================================================

/** Route with TWO path slots and a query declaration. */
const CHANNEL_ROUTE_PATH = "/items/:kind/:id?q&tag";
const PATH_KEYS = ["kind", "id"] as const;
/** The `?`-declared names — the ones the channel guard refuses in `params`. */
const DECLARED_QUERY_KEYS = ["q", "tag"] as const;

const arbPathValues = fc.dictionary(
  fc.constantFrom(...PATH_KEYS),
  fc.stringMatching(/^[a-z]{1,6}$/),
  { minKeys: PATH_KEYS.length, maxKeys: PATH_KEYS.length },
);

const arbQueryValues = fc.dictionary(
  fc.constantFrom("q", "tag", "extra"),
  fc.stringMatching(/^[a-z]{1,6}$/),
  { minKeys: 0, maxKeys: 3 },
);

describe("Channel isolation (#1564)", () => {
  it("the schema never sees a path slot, whichever channel the caller used", async () => {
    await fc.assert(
      fc.asyncProperty(
        arbPathValues,
        arbQueryValues,
        fc.boolean(),
        fc.boolean(),
        async (pathValues, queryValues, viaSearch, strict) => {
          const seen: Params[] = [];
          const router = createRouter(
            [
              { name: "home", path: "/" },
              {
                name: "item",
                path: CHANNEL_ROUTE_PATH,
                searchSchema: {
                  "~standard": {
                    version: 1,
                    vendor: "test",
                    validate: (value: unknown) => {
                      seen.push({ ...(value as Params) });

                      return { value };
                    },
                  },
                },
              },
            ],
            { defaultRoute: "home" },
          );

          router.usePlugin(searchSchemaPlugin({ mode: "production", strict }));
          await router.start("/");

          // The v1 single-bag spelling is RETIRED at the producer (#1572 P1):
          // a route-declared query name handed in the `params` bag is refused
          // on the caller's raw argument, synchronously, before any interceptor
          // runs. So the schema is not merely kept away from the path slots —
          // it is never consulted at all, which is channel isolation in its
          // strongest form. (An UNdeclared key is not a mis-channel: it stays
          // in the path bag as app-level data by core's own rule, #1553.)
          const ridesDeclaredQueryInParams =
            !viaSearch &&
            DECLARED_QUERY_KEYS.some((key) => Object.hasOwn(queryValues, key));

          if (ridesDeclaredQueryInParams) {
            expect(() =>
              router.navigate("item", { ...pathValues, ...queryValues }),
            ).toThrow(TypeError);
            expect(seen).toHaveLength(0);

            router.stop();

            return;
          }

          await (viaSearch
            ? router.navigate("item", pathValues, queryValues)
            : router.navigate("item", { ...pathValues, ...queryValues }));

          const handed = seen.at(-1) ?? {};

          // (1) No path slot is ever handed to a query schema.
          for (const key of PATH_KEYS) {
            expect(handed).not.toHaveProperty(key);
          }

          // (2) Every query value the caller supplied THROUGH THE QUERY CHANNEL
          //     is. Scoped to that channel since the single-bag alternative was
          //     retired above: what survives of it here is a bag of path slots
          //     plus, possibly, an undeclared key — and an undeclared key
          //     legitimately never reaches a query schema.
          if (viaSearch) {
            for (const [key, value] of Object.entries(queryValues)) {
              expect(handed[key]).toBe(value);
            }
          }

          // (3) Every path slot commits the caller's value verbatim, so the URL
          //     still builds — a schema that rewrote or (under `strict`)
          //     filtered the path bag would corrupt or drop a required slot.
          //     `state.params` may hold MORE than the slots: an UNdeclared key
          //     stays in the path bag by core's own rule (#1553), untouched by
          //     this fix.
          const state = router.getState();

          for (const key of PATH_KEYS) {
            expect(state?.params[key]).toBe(pathValues[key]);
          }

          expect(state?.path).toContain(
            `/items/${pathValues.kind}/${pathValues.id}`,
          );

          router.stop();
        },
      ),
    );
  });
});
