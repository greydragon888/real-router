import { fc } from "@fast-check/vitest";

import { KNOWN_OPTION_NAMES, LIMIT_BOUNDS } from "../../src/validators/options";

import type {
  AnyOptions,
  LoggerConfig,
  QueryParamsOptions,
} from "@real-router/core";

/**
 * ⚑ The three lists below feed BOTH generators of one property (#2311): the
 * valid one, through `fc.constantFrom`, and the INVALID one, through the filter
 * that rejects legitimate values. The second is why they are bound rather than
 * merely accurate — a member missing here lets `invalidEnumValueArbitrary` draw a
 * value core accepts and assert a throw that never comes, which is exactly the
 * defect the option-name list carried.
 *
 * ⚠ Bound by TYPE, not derived from core's runtime sets. `TRAILING_SLASH_MODES`
 * and `QUERY_PARAMS_MODES` exist in core (#1831) and are not exported — the
 * subject of #2322. `AnyOptions` is the reader-facing instantiation this package
 * already uses for the option names, so one owner answers for all three.
 */
const membersOf = <T extends string>(table: Record<T, true>): readonly T[] =>
  Object.keys(table) as T[];

const TRAILING_SLASH_VALUES = membersOf<AnyOptions["trailingSlash"]>({
  strict: true,
  never: true,
  always: true,
  preserve: true,
});
const QUERY_PARAMS_MODE_VALUES = membersOf<AnyOptions["queryParamsMode"]>({
  default: true,
  strict: true,
  loose: true,
});
const URL_PARAMS_ENCODING_VALUES = membersOf<AnyOptions["urlParamsEncoding"]>({
  default: true,
  uri: true,
  uriComponent: true,
  none: true,
});
/**
 * ⚠ The five below are bound for a NARROWER reason, and the difference is worth
 * keeping (#2324). Each has exactly one consumer — a `fc.constantFrom` in a
 * generator of VALID options — so a member missing here costs COVERAGE, not
 * correctness: the mode is simply never drawn, no assertion turns false, and
 * nothing reds. The three above also feed the filter that decides which strings
 * count as INVALID, where the same drift produces a demand for a throw that never
 * comes.
 *
 * ⚑ Owned through the CONTAINER type, not the alias. `ArrayFormat` and its three
 * siblings are not on core's public types index; `QueryParamsOptions` is, and
 * indexing it reaches them. `LoggerConfig["level"]` is the same move for the
 * logger.
 */
const ARRAY_FORMAT_VALUES = membersOf<
  NonNullable<QueryParamsOptions["arrayFormat"]>
>({ none: true, brackets: true, index: true, comma: true });
const BOOLEAN_FORMAT_VALUES = membersOf<
  NonNullable<QueryParamsOptions["booleanFormat"]>
>({ none: true, auto: true, "empty-true": true });
const NULL_FORMAT_VALUES = membersOf<
  NonNullable<QueryParamsOptions["nullFormat"]>
>({ default: true, hidden: true });
const NUMBER_FORMAT_VALUES = membersOf<
  NonNullable<QueryParamsOptions["numberFormat"]>
>({ none: true, auto: true });
const LOGGER_LEVEL_VALUES = membersOf<LoggerConfig["level"]>({
  all: true,
  "warn-error": true,
  "error-only": true,
  none: true,
});

/**
 * ⚑ IMPORTED, not re-listed (#2311). This file used to carry its own copy of the
 * option names, and it had drifted: `caseSensitive` and `defaultSearch` were
 * missing, so `unknownKeyArbitrary` below could draw a LEGITIMATE option as an
 * "unknown key" and assert a throw that never comes. Nothing held the two lists
 * together, and the MIRROR-binding walk could not have: `core-union-mirror-authority-2091`
 * is rooted at `src` on both sides, so a copy living under `tests/` is invisible
 * to it. ⚠ Not to every scan — historiography, test names and the seam census all
 * read `tests/`; it is the binding of cross-package copies that stops at `src`.
 * Importing removes the copy instead of arguing about which walk should grow.
 */
const KNOWN_OPTIONS = Object.keys(KNOWN_OPTION_NAMES);

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

    // `logger` content is not validated by validateOptions — core's
    // isLoggerConfig owns logger validation at construction (#789). Any
    // well-typed logger object is accepted here, so no cross-field shaping.
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
  .filter((key) => !KNOWN_OPTIONS.includes(key));

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
