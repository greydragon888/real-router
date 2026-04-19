import { fc } from "@fast-check/vitest";

const TRAILING_SLASH_VALUES = [
  "strict",
  "never",
  "always",
  "preserve",
] as const;
const QUERY_PARAMS_MODE_VALUES = ["default", "strict", "loose"] as const;
const URL_PARAMS_ENCODING_VALUES = [
  "default",
  "uri",
  "uriComponent",
  "none",
] as const;
const ARRAY_FORMAT_VALUES = ["none", "brackets", "index", "comma"] as const;
const BOOLEAN_FORMAT_VALUES = ["none", "auto", "empty-true"] as const;
const NULL_FORMAT_VALUES = ["default", "hidden"] as const;
const NUMBER_FORMAT_VALUES = ["none", "auto"] as const;
const LOGGER_LEVEL_VALUES = [
  "all",
  "warn-error",
  "error-only",
  "none",
] as const;

const KNOWN_OPTIONS = [
  "defaultRoute",
  "defaultParams",
  "trailingSlash",
  "queryParamsMode",
  "queryParams",
  "urlParamsEncoding",
  "allowNotFound",
  "rewritePathOnMatch",
  "logger",
  "limits",
] as const;

const LIMIT_BOUNDS = {
  maxDependencies: { min: 0, max: 10_000 },
  maxPlugins: { min: 0, max: 1000 },
  maxListeners: { min: 0, max: 100_000 },
  warnListeners: { min: 0, max: 100_000 },
  maxEventDepth: { min: 0, max: 100 },
  maxLifecycleHandlers: { min: 0, max: 10_000 },
} as const;

type LimitKey = keyof typeof LIMIT_BOUNDS;

/**
 * Safe dictionary key arbitrary that excludes __proto__ and constructor.
 * Used by all dictionary-based arbitraries to avoid prototype pollution.
 *
 * fc.dictionary() has built-in __proto__ generation that bypasses key filters,
 * so we use fc.array(fc.tuple(...)).map(Object.fromEntries) instead.
 */
export const safeDictKeyArbitrary = fc
  .string({ minLength: 1, maxLength: 10 })
  .filter((key) => key !== "__proto__" && key !== "constructor");

const validQueryParamsArbitrary = fc
  .record({
    arrayFormat: fc.option(fc.constantFrom(...ARRAY_FORMAT_VALUES), {
      nil: undefined,
    }),
    booleanFormat: fc.option(fc.constantFrom(...BOOLEAN_FORMAT_VALUES), {
      nil: undefined,
    }),
    nullFormat: fc.option(fc.constantFrom(...NULL_FORMAT_VALUES), {
      nil: undefined,
    }),
    numberFormat: fc.option(fc.constantFrom(...NUMBER_FORMAT_VALUES), {
      nil: undefined,
    }),
  })
  .map((qp) => {
    const result: Record<string, string> = {};

    for (const [key, value] of Object.entries(qp)) {
      if (value !== undefined) {
        result[key] = value;
      }
    }

    return result;
  });

const validLoggerArbitrary = fc
  .record({
    level: fc.option(fc.constantFrom(...LOGGER_LEVEL_VALUES), {
      nil: undefined,
    }),
    callback: fc.option(
      fc.constant(() => {}),
      { nil: undefined },
    ),
    callbackIgnoresLevel: fc.option(fc.boolean(), { nil: undefined }),
  })
  .map((logger) => {
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(logger)) {
      if (value !== undefined) {
        result[key] = value;
      }
    }

    // Cross-field invariant (#471 case 4): callbackIgnoresLevel: true has no
    // effect without callback. Drop the flag in that case so the generated
    // options don't trigger the validator's noisy logger.error on every run.
    if (result.callbackIgnoresLevel === true && result.callback === undefined) {
      delete result.callbackIgnoresLevel;
    }

    return result;
  });

const validLimitsArbitrary = fc
  .record({
    maxDependencies: fc.option(fc.integer({ min: 0, max: 10_000 }), {
      nil: undefined,
    }),
    maxPlugins: fc.option(fc.integer({ min: 0, max: 1000 }), {
      nil: undefined,
    }),
    maxListeners: fc.option(fc.integer({ min: 0, max: 100_000 }), {
      nil: undefined,
    }),
    warnListeners: fc.option(fc.integer({ min: 0, max: 100_000 }), {
      nil: undefined,
    }),
    maxEventDepth: fc.option(fc.integer({ min: 0, max: 100 }), {
      nil: undefined,
    }),
    maxLifecycleHandlers: fc.option(fc.integer({ min: 0, max: 10_000 }), {
      nil: undefined,
    }),
  })
  .map((limits) => {
    const result: Record<string, number> = {};

    for (const [key, value] of Object.entries(limits)) {
      if (value !== undefined) {
        result[key] = value;
      }
    }

    // Cross-field invariant (#471 case 1): warnListeners must not exceed
    // maxListeners when both are provided and maxListeners > 0.
    // Clamp warn to max to keep generated options semantically valid.
    if (
      typeof result.warnListeners === "number" &&
      typeof result.maxListeners === "number" &&
      result.maxListeners > 0 &&
      result.warnListeners > result.maxListeners
    ) {
      result.warnListeners = result.maxListeners;
    }

    return result;
  });

export const validOptionsArbitrary = fc
  .record({
    defaultRoute: fc.option(fc.string({ minLength: 1, maxLength: 20 }), {
      nil: undefined,
    }),
    defaultParams: fc.option(
      fc
        .array(
          fc.tuple(
            safeDictKeyArbitrary,
            fc.oneof(fc.string(), fc.integer(), fc.boolean()),
          ),
          { maxLength: 3 },
        )
        .map((entries) => Object.fromEntries(entries)),
      { nil: undefined },
    ),
    trailingSlash: fc.option(fc.constantFrom(...TRAILING_SLASH_VALUES), {
      nil: undefined,
    }),
    queryParamsMode: fc.option(fc.constantFrom(...QUERY_PARAMS_MODE_VALUES), {
      nil: undefined,
    }),
    urlParamsEncoding: fc.option(
      fc.constantFrom(...URL_PARAMS_ENCODING_VALUES),
      { nil: undefined },
    ),
    allowNotFound: fc.option(fc.boolean(), { nil: undefined }),
    rewritePathOnMatch: fc.option(fc.boolean(), { nil: undefined }),
    queryParams: fc.option(validQueryParamsArbitrary, { nil: undefined }),
    logger: fc.option(validLoggerArbitrary, { nil: undefined }),
    limits: fc.option(validLimitsArbitrary, { nil: undefined }),
  })
  .map((opts) => {
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(opts)) {
      if (value !== undefined) {
        result[key] = value;
      }
    }

    return result;
  });

export const nonObjectArbitrary = fc.oneof(
  fc.constant(null),
  fc.constant(undefined),
  fc.string(),
  fc.integer(),
  fc.boolean(),
  fc.constant([1, 2]),
);

export const unknownKeyArbitrary = fc
  .string({ minLength: 1, maxLength: 20 })
  .filter((key) => !(KNOWN_OPTIONS as readonly string[]).includes(key));

export const invalidEnumFieldArbitrary = fc.constantFrom(
  "trailingSlash",
  "queryParamsMode",
  "urlParamsEncoding",
);

export const invalidEnumValueArbitrary = fc
  .string({ minLength: 1, maxLength: 20 })
  .filter(
    (value) =>
      ![
        ...TRAILING_SLASH_VALUES,
        ...QUERY_PARAMS_MODE_VALUES,
        ...URL_PARAMS_ENCODING_VALUES,
      ].includes(value as never),
  );

export const limitKeyArbitrary = fc.constantFrom(
  ...Object.keys(LIMIT_BOUNDS),
) as fc.Arbitrary<LimitKey>;

export const outOfBoundsLimitArbitrary = (
  key: LimitKey,
): fc.Arbitrary<number> => {
  const bounds = LIMIT_BOUNDS[key];

  return fc.oneof(
    fc.integer({ max: bounds.min - 1 }),
    fc.integer({ min: bounds.max + 1 }),
  );
};

export const plainObjectArbitrary = fc
  .array(
    fc.tuple(
      safeDictKeyArbitrary,
      fc.oneof(
        fc.string(),
        fc.integer(),
        fc.boolean(),
        fc.constant(null),
        fc.constant(undefined),
      ),
    ),
    { maxLength: 5 },
  )
  .map((entries) => Object.fromEntries(entries));

export const nonObjectNonUndefinedArbitrary = fc.oneof(
  fc.constant(null),
  fc.string(),
  fc.integer(),
  fc.boolean(),
  fc.constant([1, 2]),
  fc.func(fc.anything()),
);

export const nonPlainObjectArbitrary = fc.constantFrom(
  new Map(),
  new Set(),
  new Date(),
  /regex/,
);

// =============================================================================
// Navigation namespace arbitraries
// =============================================================================

/**
 * Generates valid route name strings (non-empty, dot-separated segments).
 */
export const validRouteNameArbitrary = fc
  .array(fc.stringMatching(/^[A-Za-z]\w{0,9}$/), {
    minLength: 1,
    maxLength: 3,
  })
  .map((segments) => segments.join("."));

/**
 * Generates values that are NOT strings (for name validation tests).
 */
export const nonStringArbitrary = fc.oneof(
  fc.constant(null),
  fc.constant(undefined),
  fc.integer(),
  fc.boolean(),
  fc.constant([1, 2]),
  fc.constant({}),
  fc.constant(Symbol("test")),
);

/**
 * Generates valid params objects (plain objects with string/number/boolean values).
 */
export const validParamsArbitrary = fc
  .array(
    fc.tuple(
      safeDictKeyArbitrary,
      fc.oneof(fc.string(), fc.integer(), fc.boolean()),
    ),
    { maxLength: 5 },
  )
  .map((entries) => Object.fromEntries(entries));

/**
 * Generates values that are NOT valid params (not plain objects).
 */
export const invalidParamsArbitrary = fc.oneof(
  fc.constant(null),
  fc.string(),
  fc.integer(),
  fc.boolean(),
  fc.constant([1, 2]),
);

/**
 * Generates valid start paths (starting with "/").
 */
export const validStartPathArbitrary = fc
  .stringMatching(/^\/[a-z/]{0,20}$/)
  .filter((s) => s.length > 0);

/**
 * Generates invalid start paths (non-"/" prefix strings).
 */
export const invalidStartPathArbitrary = fc
  .string({ minLength: 1, maxLength: 20 })
  .filter((s) => !s.startsWith("/") && s !== "");

// =============================================================================
// EventBus namespace arbitraries
// =============================================================================

export const VALID_EVENT_NAMES = [
  "$start",
  "$stop",
  "$$start",
  "$$leaveApprove",
  "$$cancel",
  "$$success",
  "$$error",
] as const;

export const validEventNameArbitrary = fc.constantFrom(...VALID_EVENT_NAMES);

export const invalidEventNameArbitrary = fc
  .string({ minLength: 1, maxLength: 20 })
  .filter((s) => !(VALID_EVENT_NAMES as readonly string[]).includes(s));

// =============================================================================
// Plugins namespace arbitraries
// =============================================================================

export const VALID_PLUGIN_KEYS = [
  "onStart",
  "onStop",
  "onTransitionStart",
  "onTransitionLeaveApprove",
  "onTransitionSuccess",
  "onTransitionError",
  "onTransitionCancel",
  "teardown",
] as const;

export const validPluginArbitrary = fc
  .subarray([...VALID_PLUGIN_KEYS] as string[], { minLength: 1 })
  .map((keys) => {
    const plugin: Record<string, () => void> = {};

    for (const key of keys) {
      plugin[key] = () => {};
    }

    return plugin;
  });

export const unknownPluginKeyArbitrary = fc
  .string({ minLength: 1, maxLength: 20 })
  .filter(
    (key) =>
      !(VALID_PLUGIN_KEYS as readonly string[]).includes(key) &&
      key !== "__proto__" &&
      key !== "constructor",
  );

export const VALID_INTERCEPTOR_METHODS = [
  "start",
  "buildPath",
  "forwardState",
] as const;

export const validInterceptorMethodArbitrary = fc.constantFrom(
  ...VALID_INTERCEPTOR_METHODS,
);

export const invalidInterceptorMethodArbitrary = fc
  .string({ minLength: 1, maxLength: 20 })
  .filter((s) => !(VALID_INTERCEPTOR_METHODS as readonly string[]).includes(s));

// =============================================================================
// Lifecycle namespace arbitraries
// =============================================================================

/**
 * Generates valid handler values (boolean or function).
 */
export const validHandlerArbitrary = fc.oneof(
  fc.boolean(),
  fc.constant(() => true),
  fc.constant(() => false),
);

/**
 * Generates invalid handler values (not boolean and not function).
 */
export const invalidHandlerArbitrary = fc.oneof(
  fc.constant(null),
  fc.constant(undefined),
  fc.string(),
  fc.integer(),
  fc.constant([1, 2]),
  fc.constant({}),
);

// =============================================================================
// State namespace arbitraries
// =============================================================================

/**
 * Generates valid State-like objects for areStatesEqual.
 */
export const validStateArbitrary = fc
  .record({
    name: fc.string({ minLength: 1, maxLength: 20 }),
    params: fc.dictionary(
      fc.string({ minLength: 1, maxLength: 10 }),
      fc.oneof(fc.string(), fc.integer(), fc.boolean()),
      { maxKeys: 3 },
    ),
    path: fc
      .string({ minLength: 1, maxLength: 30 })
      .map((s) => `/${s.replace(/^\//, "")}`),
    meta: fc.record({
      id: fc.integer({ min: 1, max: 1000 }),
      params: fc.dictionary(
        fc.string({ minLength: 1, maxLength: 10 }),
        fc.oneof(fc.string(), fc.integer(), fc.boolean()),
        { maxKeys: 3 },
      ),
      options: fc.constant({}),
      redirected: fc.boolean(),
      source: fc.constant(undefined),
    }),
  })
  .map((s) => ({
    ...s,
    meta: {
      ...s.meta,
      navigation: s.name,
    },
  }));

// =============================================================================
// Dependencies namespace arbitraries
// =============================================================================

/**
 * Generates valid dependency name strings.
 */
export const validDependencyNameArbitrary = fc.string({
  minLength: 1,
  maxLength: 20,
});

// =============================================================================
// NUM_RUNS constants
// =============================================================================

export const NUM_RUNS = {
  standard: 50,
  thorough: 100,
} as const;
