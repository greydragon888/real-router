import { createRouter } from "@real-router/core";
import * as fc from "fast-check";
import { describe, it, expect, vi } from "vitest";

import { searchSchemaPlugin } from "../../src/index";

import type {
  StandardSchemaV1,
  StandardSchemaV1Issue,
  StandardSchemaV1Result,
} from "../../src/types";
import type { Params, SearchParams } from "@real-router/core";

// =============================================================================
// Schema Helpers
// =============================================================================

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

/**
 * Uppercases every string and rejects every non-string — so it rejects a query
 * carrying {@link INVALID}, and accepts the same query once the marked keys are
 * dropped or carry a string default (#2824).
 */
function createRejectingUppercaseSchema(): StandardSchemaV1 {
  return {
    "~standard": {
      version: 1,
      vendor: "test",
      validate: (value: unknown) => {
        const params = value as Record<string, unknown>;
        const output: Record<string, unknown> = {};
        const issues: StandardSchemaV1Issue[] = [];

        for (const key of Object.keys(params)) {
          const val = params[key];

          if (typeof val === "string") {
            output[key] = val.toUpperCase();
          } else {
            issues.push({ message: `${key} is invalid`, path: [key] });
          }
        }

        return issues.length > 0 ? { issues } : { value: output };
      },
    },
  };
}

/** Answers `output` for a query without {@link INVALID}, and rejects the marked keys otherwise. */
function createRejectingPassSchema(output: SearchParams): StandardSchemaV1 {
  return {
    "~standard": {
      version: 1,
      vendor: "test",
      validate: (value: unknown) => {
        const issues: StandardSchemaV1Issue[] = Object.entries(
          value as Record<string, unknown>,
        )
          .filter(([, val]) => val === INVALID)
          .map(([key]) => ({ message: `${key} is invalid`, path: [key] }));

        return issues.length > 0 ? { issues } : { value: output };
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

/**
 * The value a rejected key carries: `null`, what the router decodes a key
 * without a value to. The plugin never tries it as text, so every schema here
 * rejects it for good — a number would be tried as its text and kept by a
 * schema that accepts text (#2725). Every arbitrary in this section produces
 * strings, so no generated value — a kept one or a default — can be mistaken
 * for it.
 */
const INVALID = null;

/**
 * Whether the repaired query passes the schema (#2824): the schema rejects only
 * the {@link INVALID} keys and transforms the rest, or it rejects every query,
 * so the repair is written back as decoded.
 */
const arbRepairOutcome = fc.constantFrom("passes", "fails");

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
          arbRepairOutcome,
          async (validParams, invalidKeys, outcome) => {
            const allParams: SearchParams = { ...validParams };

            for (const key of invalidKeys) {
              allParams[key] = INVALID;
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
                  searchSchema:
                    outcome === "passes"
                      ? createRejectingUppercaseSchema()
                      : createFailSchema(issues),
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

            // A kept key carries the schema's output for the repaired query —
            // or, when that query fails too, its value as decoded.
            for (const [key, value] of Object.entries(validParams)) {
              expect(state?.search[key]).toBe(
                outcome === "passes" ? String(value).toUpperCase() : value,
              );
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
          arbRepairOutcome,
          async (validParams, invalidKeys, defaults, outcome) => {
            const allParams: SearchParams = { ...validParams };

            for (const key of invalidKeys) {
              allParams[key] = INVALID;
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
                  searchSchema:
                    outcome === "passes"
                      ? createRejectingUppercaseSchema()
                      : createFailSchema(issues),
                },
              ],
              { defaultRoute: "home" },
            );

            router.usePlugin(searchSchemaPlugin({ mode: "production" }));
            await router.start("/");
            await router.navigate("test", {}, allParams);

            const state = router.getState();
            const asOutput = (value: unknown): unknown =>
              outcome === "passes" ? String(value).toUpperCase() : value;

            // The repaired query carries the rejected key's default, so the
            // schema's output for it is what lands.
            for (const key of invalidKeys) {
              expect(state?.search[key]).toBe(asOutput(defaults[key]));
            }

            for (const [key, value] of Object.entries(validParams)) {
              expect(state?.search[key]).toBe(asOutput(value));
            }

            // A default for a key that was not rejected is not part of the
            // repaired query: it merges as configured, as on a valid URL.
            for (const key of EXTRA_KEYS) {
              if (!invalidKeys.includes(key)) {
                expect(state?.search[key]).toBe(defaults[key]);
              }
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
          fc.boolean(),
          async (schemaOutput, extraParams, repaired) => {
            const navigateParams: SearchParams = {
              ...schemaOutput,
              ...extraParams,
            };

            // A repaired query is held to `strict` as a valid one is (#2824).
            if (repaired) {
              navigateParams[Object.keys(extraParams)[0]] = INVALID;
            }

            const router = createRouter(
              [
                { name: "home", path: "/" },
                {
                  name: "test",
                  path: ROUTE_PATH,
                  searchSchema: createRejectingPassSchema(schemaOutput),
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

// =============================================================================
// Decoded text (#2725)
// =============================================================================

const TEXT_KEYS = ["a", "b", "c", "d"] as const;

/**
 * A query value as the URL spells it. Under the default formats the router
 * decodes a canonical number or `true` / `false`; the rest stays text.
 */
const arbUrlText = fc.oneof(
  fc.integer({ min: -999, max: 999 }).map(String),
  fc
    .double({ min: -99, max: 99, noNaN: true, noDefaultInfinity: true })
    .map(String),
  fc.constantFrom("true", "false"),
  fc.constantFrom("007", "1e3", "-0", "2.0"),
  fc.stringMatching(/^[a-z][\da-z]{0,5}$/),
);

/** One key of the query: a value, a key without one, or a `brackets` array. */
type Spelling =
  | { readonly kind: "value"; readonly text: string }
  | { readonly kind: "flag" }
  | { readonly kind: "array"; readonly texts: readonly string[] };

const arbSpelling: fc.Arbitrary<Spelling> = fc.oneof(
  arbUrlText.map((text) => ({ kind: "value" as const, text })),
  fc.constant({ kind: "flag" as const }),
  fc
    .array(arbUrlText, { minLength: 1, maxLength: 3 })
    .map((texts) => ({ kind: "array" as const, texts })),
);

const arbTextQuery = fc.dictionary(fc.constantFrom(...TEXT_KEYS), arbSpelling, {
  minKeys: 1,
  maxKeys: TEXT_KEYS.length,
});

function toUrl(query: Readonly<Record<string, Spelling>>): string {
  const parts = Object.entries(query).flatMap(([key, spelling]) => {
    switch (spelling.kind) {
      case "value": {
        return [`${key}=${spelling.text}`];
      }
      case "flag": {
        return [key];
      }
      case "array": {
        return spelling.texts.map((text) => `${key}[]=${text}`);
      }
    }
  });

  return `/text?${parts.join("&")}`;
}

/** A decoded value the schema was handed: its type, and whether it was a key's value or an array element. */
interface Decoded {
  readonly type: "number" | "boolean";
  readonly where: "value" | "element";
  readonly key: string;
}

/** Hands `onDecoded` each number or boolean in `params`. */
function reportDecoded(
  params: Params,
  onDecoded: (decoded: Decoded) => void,
): void {
  for (const [key, val] of Object.entries(params)) {
    const where = Array.isArray(val) ? "element" : "value";

    for (const element of Array.isArray(val) ? val : [val]) {
      if (typeof element === "number") {
        onDecoded({ type: "number", where, key });
      } else if (typeof element === "boolean") {
        onDecoded({ type: "boolean", where, key });
      }
    }
  }
}

/**
 * Accepts text only: a string or an array of strings, each of which `accept`
 * must pass. Anything else — a number, a boolean, `null` — is an issue.
 * `onDecoded` hears of each number or boolean it is handed.
 */
function createTextSchema(
  accept: (text: string) => boolean,
  onDecoded: (decoded: Decoded) => void,
): StandardSchemaV1 {
  return {
    "~standard": {
      version: 1,
      vendor: "test",
      validate: (value: unknown) => {
        const issues: StandardSchemaV1Issue[] = [];

        reportDecoded(value as Params, onDecoded);

        for (const [key, val] of Object.entries(value as Params)) {
          if (Array.isArray(val)) {
            val.forEach((element: unknown, index) => {
              if (typeof element !== "string" || !accept(element)) {
                issues.push({ message: "rejected", path: [key, index] });
              }
            });
          } else if (typeof val !== "string" || !accept(val)) {
            issues.push({ message: "rejected", path: [key] });
          }
        }

        return issues.length > 0 ? { issues } : { value };
      },
    },
  };
}

/**
 * {@link createTextSchema}, and a rule that judges the query as a whole:
 * `refine` may name a key, or at `""` the query itself. `handed` gets a copy
 * of each query the schema is handed.
 */
function createRefinedSchema(
  accept: (text: string) => boolean,
  refine: (query: string) => string | undefined,
  handed: Params[],
): StandardSchemaV1 {
  const text = createTextSchema(accept, () => undefined)["~standard"];

  return {
    "~standard": {
      version: 1,
      vendor: "test",
      validate: (value: unknown) => {
        handed.push(structuredClone(value as Params));

        const result = text.validate(value) as StandardSchemaV1Result;
        const issues = "issues" in result ? [...result.issues] : [];
        const named = refine(JSON.stringify(value));

        if (named !== undefined) {
          issues.push(
            named === ""
              ? { message: "refined" }
              : { message: "refined", path: [named] },
          );
        }

        return issues.length > 0 ? { issues } : { value };
      },
    },
  };
}

/**
 * Whether `after` holds something other than a string where `before` holds
 * one — a key's own value or an element: a value back as decoded.
 */
function holdsDecodedAgain(before: Params, after: Params): boolean {
  return Object.entries(after).some(([key, val]) => {
    const was: unknown[] = [before[key]].flat();

    return [val]
      .flat()
      .some(
        (element: unknown, index) =>
          typeof was[index] === "string" && typeof element !== "string",
      );
  });
}

/**
 * Which of the queries the schema was handed `params` is: the only one; the
 * decoded one, after text runs; the last text run's; a run of its own, with
 * a value back as decoded; or none of them.
 */
type Handed = "only" | "decoded" | "text" | "settled" | "none";

function whichHanded(params: Params, handed: readonly Params[]): Handed {
  if (fc.stringify(params) === fc.stringify(handed[0])) {
    return handed.length === 1 ? "only" : "decoded";
  }

  if (fc.stringify(params) !== fc.stringify(handed[handed.length - 1])) {
    return "none";
  }

  return holdsDecodedAgain(handed[handed.length - 2], params)
    ? "settled"
    : "text";
}

async function settleText(
  schema: StandardSchemaV1,
  url: string,
  formats: "default" | "none",
): Promise<{ search: SearchParams; path: string }> {
  const router = createRouter(
    [
      { name: "home", path: "/" },
      {
        name: "text",
        path: `/text?${TEXT_KEYS.join("&")}`,
        searchSchema: schema,
      },
    ],
    {
      defaultRoute: "home",
      queryParams: {
        arrayFormat: "brackets",
        ...(formats === "none" && {
          numberFormat: "none",
          booleanFormat: "none",
        }),
      },
    },
  );

  router.usePlugin(searchSchemaPlugin({ mode: "production" }));

  const { search, path } = await router.start(url);

  router.stop();

  return { search, path };
}

describe("Decoded text (#2725)", () => {
  it('the two formats decode apart: a number by default, its text under "none" (control)', async () => {
    const schema = createSubsetSchema(TEXT_KEYS);

    await expect(
      settleText(schema, "/text?a=17", "default"),
    ).resolves.toStrictEqual({ search: { a: 17 }, path: "/text?a=17" });
    await expect(
      settleText(schema, "/text?a=17", "none"),
    ).resolves.toStrictEqual({ search: { a: "17" }, path: "/text?a=17" });
  });

  it('a schema that accepts only text settles a URL as under numberFormat / booleanFormat "none"', async () => {
    // Runs where a decoded value was handed to the schema and its key kept:
    // the case the text decides, as without it the key is stripped. Without
    // each kind, the two formats agree for want of anything to differ on.
    const fixed = { number: 0, boolean: 0, value: 0, element: 0 };

    await fc.assert(
      fc.asyncProperty(
        arbTextQuery,
        fc.func(fc.boolean()),
        async (query, accept) => {
          const decoded: Decoded[] = [];
          const schema = createTextSchema(accept, (value) => {
            decoded.push(value);
          });
          const url = toUrl(query);
          const asText = await settleText(schema, url, "none");

          await expect(
            settleText(schema, url, "default"),
          ).resolves.toStrictEqual(asText);

          const kept = decoded.filter(({ key }) =>
            Object.hasOwn(asText.search, key),
          );

          for (const kind of ["number", "boolean"] as const) {
            fixed[kind] += kept.some(({ type }) => type === kind) ? 1 : 0;
          }

          for (const where of ["value", "element"] as const) {
            fixed[where] += kept.some((value) => value.where === where) ? 1 : 0;
          }
        },
      ),
    );

    // Measured over 300 seeds of 100 runs: each at least 5.
    expect(fixed.number).toBeGreaterThan(0);
    expect(fixed.boolean).toBeGreaterThan(0);
    expect(fixed.value).toBeGreaterThan(0);
    expect(fixed.element).toBeGreaterThan(0);
  });

  it("onError is handed a query and the schema's own issues on it", async () => {
    // Which query onError got, and how often, after text runs, its issues
    // hold one the rule about the whole query raised.
    const reached: Record<Handed | "refined", number> = {
      only: 0,
      decoded: 0,
      text: 0,
      settled: 0,
      none: 0,
      refined: 0,
    };

    await fc.assert(
      fc.asyncProperty(
        arbTextQuery,
        fc.func(fc.boolean()),
        fc.func(
          fc.oneof(
            { arbitrary: fc.constant(undefined), weight: 1 },
            { arbitrary: fc.constantFrom("", ...TEXT_KEYS), weight: 2 },
          ),
        ),
        async (query, accept, refine) => {
          const handed: Params[] = [];
          const schema = createRefinedSchema(accept, refine, handed);
          const calls: {
            readonly params: Params;
            readonly issues: readonly StandardSchemaV1Issue[];
            readonly which: Handed;
          }[] = [];
          const router = createRouter(
            [
              { name: "home", path: "/" },
              {
                name: "text",
                path: `/text?${TEXT_KEYS.join("&")}`,
                searchSchema: schema,
              },
            ],
            { defaultRoute: "home", queryParams: { arrayFormat: "brackets" } },
          );

          router.usePlugin(
            searchSchemaPlugin({
              mode: "production",
              onError: (_route, params, issues) => {
                calls.push({
                  params,
                  issues,
                  which: whichHanded(params, handed),
                });

                return {};
              },
            }),
          );

          await router.start(toUrl(query));
          router.stop();

          for (const { params, issues, which } of calls) {
            expect(which).not.toBe("none");

            reached[which]++;

            if (
              which !== "only" &&
              issues.some(({ message }) => message === "refined")
            ) {
              reached.refined++;
            }

            expect(schema["~standard"].validate(params)).toStrictEqual({
              issues,
            });
          }
        },
      ),
      { numRuns: 300 },
    );

    // Measured over 40 seeds of 300 runs: each at least 12.
    expect(reached.only).toBeGreaterThan(0);
    expect(reached.decoded).toBeGreaterThan(0);
    expect(reached.text).toBeGreaterThan(0);
    expect(reached.settled).toBeGreaterThan(0);
    expect(reached.refined).toBeGreaterThan(0);
  });
});
