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

    return result;
  });

export const validOptionsArbitrary = fc
  .record({
    defaultRoute: fc.option(fc.string({ minLength: 1, maxLength: 20 }), {
      nil: undefined,
    }),
    defaultParams: fc.option(
      fc.dictionary(
        fc.string({ minLength: 1, maxLength: 10 }),
        fc.oneof(fc.string(), fc.integer(), fc.boolean()),
        { maxKeys: 3 },
      ),
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

export const plainObjectArbitrary = fc.dictionary(
  fc.string({ minLength: 1, maxLength: 10 }),
  fc.oneof(
    fc.string(),
    fc.integer(),
    fc.boolean(),
    fc.constant(null),
    fc.constant(undefined),
  ),
  { maxKeys: 5 },
);

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
