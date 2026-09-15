// packages/validation-plugin/src/validators/options.ts

import { isObjKey } from "../type-guards";

import type {
  AnyOptions,
  LimitsConfig,
  QueryParamsOptions,
} from "@real-router/core";

/**
 * Intrinsics captured at module load (#1971).
 *
 * ⚑ These DECIDE — each answers "what is on this object" for a value this module
 * did not build, so read off the live global they are the weakest point of every
 * check built on them. `guards.ts` states the doctrine and its measurement: one
 * naive `Object.hasOwn` polyfill walked straight through five sibling readers
 * while the single captured guard held.
 *
 * ⚠ Capture narrows the window from "any time after boot" to "before this module
 * loads". It does not close it — a shim evaluated ahead of core still wins
 * (#1798), which is the doctrine's own caveat and travels with it.
 */
const objectEntries = Object.entries;
const hasOwn = Object.hasOwn;
const objectKeys = Object.keys;
const getPrototypeOf = Object.getPrototypeOf;

const VALID_OPTION_VALUES = {
  trailingSlash: ["strict", "never", "always", "preserve"] as const,
  queryParamsMode: ["default", "strict", "loose"] as const,
  urlParamsEncoding: ["default", "uri", "uriComponent", "none"] as const,
} as const;

// The NAMES of the `queryParams` sub-options, and only the names: this plugin
// owns which keys exist there, core owns which values each admits.
//
// ⚑ Keyed by core's own `QueryParamsOptions` (#2307), the same shape and the same
// reason as `LIMIT_BOUNDS` below. A sub-option core adds and this table does not
// is a TS2741 here — rather than a legitimate option the loop below refuses as
// `unknown option`, which is the `plugin ⊇ core` false-reject of #1224 / #1225.
// Nothing else binds this set: the authority walk beside it is the runtime half,
// and without the annotation a core-side addition is silent until a consumer
// hits it.
//
// ⚠ A `Record`, not an array of `keyof QueryParamsOptions`. An annotated array
// binds each ELEMENT to the union and says nothing about the SET, so a missing
// key compiles — the two-level mirror #2091 found in `expectedLimitKeys`. The
// `Record` is what makes a missing key TS2741 and an extra key TS2353.
//
// ⚑ The VALUES are absent on purpose, and this is the whole of #2307. Core
// refuses an unknown format BY NAME at construction (`requireStrategy`, #1318,
// hoisted to matcher construction by #1819) and prints
// `[router.constructor] Invalid "queryParams.<key>"` — the prefix and the field
// path deliberately copied from this module, so a reader lands on the same
// option. ⚠ The TAIL is core's own (`— expected "a" | "b"` against this
// module's `. Must be one of: "a", "b"`), which is as far as the agreement
// goes. #1819 states the intent in
// `engine/search-params/strategies/index.ts`: "the hoist makes the plugin's
// message unreachable for these four fields". This plugin's only door into
// `validateOptions` is the retrospective pass at `usePlugin`, which runs AFTER
// `createRouter`, and `setOption` was removed in #63 — so a bogus format never
// arrives here, and a value list kept for one would be unreachable (#2307).
const KNOWN_QUERY_PARAMS: Record<keyof QueryParamsOptions, true> = {
  arrayFormat: true,
  booleanFormat: true,
  nullFormat: true,
  numberFormat: true,
};

// `logger` is a valid option name, but its contents are NOT validated here.
// The Router constructor consumes `options.logger` (it builds the router's own
// `RouterLogger` from it — per-router, no singleton) and strips the key before
// options are stored (#724). The retrospective pass reads the stored,
// logger-stripped options, so any logger validation in this plugin is dead on
// the live path. Logger config is therefore validated solely by core's
// `isLoggerConfig` guard at construction — the only place the input exists (#789).
//
// ⚑ Keyed by core's own `AnyOptions` (#2311) — `Options<never>`, which core
// designates for readers that hold no dependency map, exactly this plugin's
// position. An option core adds and this table does not is a TS2741 here, rather
// than a legitimate option `validateOptions` refuses as `Unknown option`, which
// is the `plugin ⊇ core` false-reject of #1224 / #1225.
//
// ⚠ A `Record`, not a `Set<string>` of literals. The `Set` carried the names and
// bound none of them; the type system cannot see inside it. The `Set` below is
// DERIVED from this table and keeps the O(1) membership test the loop wants.
export const KNOWN_OPTION_NAMES: Record<keyof AnyOptions, true> = {
  defaultRoute: true,
  defaultParams: true,
  defaultSearch: true,
  trailingSlash: true,
  caseSensitive: true,
  queryParamsMode: true,
  queryParams: true,
  urlParamsEncoding: true,
  allowNotFound: true,
  rewritePathOnMatch: true,
  logger: true,
  limits: true,
};

const KNOWN_OPTIONS = new Set<string>(objectKeys(KNOWN_OPTION_NAMES));

// Single source of truth (plugin-owned): core has no `LIMIT_BOUNDS` constant and
// does not enforce these bounds — this constant is the sole owner.
//
// ⚑ Keyed by core's own `LimitsConfig` (#1879). The BOUNDS are the plugin's; the
// KEY SET is core's, so a limit core adds and this table does not is a TS2741
// here — rather than a legitimate option the loop below rejects as `unknown
// limit`, which is the `plugin ⊇ core` false-reject of #1224 / #1225.
export const LIMIT_BOUNDS: Readonly<
  Record<keyof LimitsConfig, { readonly min: number; readonly max: number }>
> = {
  maxDependencies: { min: 0, max: 10_000 },
  maxPlugins: { min: 0, max: 1000 },
  maxListeners: { min: 0, max: 100_000 },
  warnListeners: { min: 0, max: 100_000 },
  maxLifecycleHandlers: { min: 0, max: 10_000 },
};

export function validateLimitValue(
  limitName: keyof LimitsConfig,
  value: unknown,
  methodName: string,
): void {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new TypeError(
      `[router.${methodName}] limit "${limitName}" must be an integer, got ${String(value)}`,
    );
  }

  const bounds = LIMIT_BOUNDS[limitName];

  if (value < bounds.min || value > bounds.max) {
    throw new RangeError(
      `[router.${methodName}] limit "${limitName}" must be between ${bounds.min} and ${bounds.max}, got ${value}`,
    );
  }
}

/**
 * Is `value` a bag the router takes — `Object.prototype` or no prototype at all?
 *
 * ⚠ The PROTOTYPE, not `value.constructor` (#2217). A constructor read walks the
 * value's own chain, so `Object.create(null)` answers `undefined` and a bag
 * carrying no chain at all — the most conformant shape `packages/core/CLAUDE.md`
 * › Supported Input Shapes admits — reads as non-plain. It also resolves through
 * the writable `Object.prototype.constructor`, and against the live `Object`
 * where every other intrinsic here is captured at module load.
 *
 * ⚠ NOT the `proto.constructor` term `core/guards.ts` uses at the dependency
 * door. That one is deliberate and its `⚠` states the constraint it exists for;
 * this door has no such constraint. `prototype-term-authority-2197` owns the
 * per-site mapping.
 */
function isPlainBag(value: object): boolean {
  const proto = getPrototypeOf(value) as object | null;

  return proto === null || proto === Object.prototype;
}

export function validateLimits(
  limits: unknown,
  methodName: string,
): asserts limits is Partial<LimitsConfig> {
  if (!limits || typeof limits !== "object" || !isPlainBag(limits)) {
    throw new TypeError(
      `[router.${methodName}] invalid limits: expected plain object, got ${typeof limits}`,
    );
  }

  for (const [key, value] of objectEntries(limits)) {
    if (!hasOwn(LIMIT_BOUNDS, key)) {
      throw new TypeError(`[router.${methodName}] unknown limit: "${key}"`);
    }

    if (value === undefined) {
      continue;
    }

    validateLimitValue(key as keyof LimitsConfig, value, methodName);
  }

  const { warnListeners, maxListeners } = limits as Partial<LimitsConfig>;

  if (
    typeof warnListeners === "number" &&
    typeof maxListeners === "number" &&
    maxListeners > 0 &&
    warnListeners > maxListeners
  ) {
    throw new RangeError(
      `[router.${methodName}] "limits.warnListeners" (${warnListeners}) must not exceed "limits.maxListeners" (${maxListeners}) — the warning channel would be unreachable`,
    );
  }
}

function validateStringEnum(
  value: unknown,
  optionName: string,
  validValues: readonly string[],
  methodName: string,
): void {
  if (value === undefined) {
    return;
  }

  if (typeof value !== "string" || !validValues.includes(value)) {
    const validList = validValues.map((val) => `"${val}"`).join(", ");
    const display = typeof value === "string" ? value : `(${typeof value})`;

    throw new TypeError(
      `[router.${methodName}] Invalid "${optionName}": "${display}". Must be one of: ${validList}`,
    );
  }
}

function validateDefaultRoute(defaultRoute: unknown, methodName: string): void {
  if (defaultRoute === undefined) {
    return;
  }

  if (typeof defaultRoute !== "string" && typeof defaultRoute !== "function") {
    throw new TypeError(
      `[router.${methodName}] Invalid "defaultRoute": expected string or function, got ${typeof defaultRoute}`,
    );
  }
}

/**
 * Shared by `defaultParams` and its query-channel twin `defaultSearch` — one
 * rule, two channels (RFC-4 M2 / #1548). Parameterised by the option name
 * rather than copied, so the two can never drift into accepting different
 * shapes for the same kind of value.
 */
function validateDefaultBag(
  value: unknown,
  optionName: string,
  methodName: string,
): void {
  if (value === undefined) {
    return;
  }

  if (typeof value === "function") {
    return;
  }

  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    !isPlainBag(value)
  ) {
    throw new TypeError(
      `[router.${methodName}] Invalid "${optionName}": expected plain object or function, got ${typeof value}`,
    );
  }
}

function validateQueryParamsOptions(
  queryParams: unknown,
  methodName: string,
): void {
  if (queryParams === undefined) {
    return;
  }

  if (
    !queryParams ||
    typeof queryParams !== "object" ||
    Array.isArray(queryParams)
  ) {
    throw new TypeError(
      `[router.${methodName}] Invalid "queryParams": expected plain object`,
    );
  }

  const qp = queryParams as Record<string, unknown>;

  // Keys only. The value of a known key is core's to judge, and it already did —
  // see `KNOWN_QUERY_PARAMS`.
  for (const key of objectKeys(qp)) {
    if (!isObjKey(key, KNOWN_QUERY_PARAMS)) {
      throw new TypeError(
        `[router.${methodName}] Invalid "queryParams.${key}": unknown option`,
      );
    }
  }
}

export function validateOptions(options: unknown, methodName: string): void {
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    throw new TypeError(
      `[router.${methodName}] Invalid options: expected plain object`,
    );
  }

  const opts = options as Record<string, unknown>;

  for (const key of objectKeys(opts)) {
    if (!KNOWN_OPTIONS.has(key)) {
      throw new TypeError(`[router.${methodName}] Unknown option: "${key}"`);
    }
  }

  validateDefaultRoute(opts.defaultRoute, methodName);
  validateDefaultBag(opts.defaultParams, "defaultParams", methodName);
  validateDefaultBag(opts.defaultSearch, "defaultSearch", methodName);
  validateStringEnum(
    opts.trailingSlash,
    "trailingSlash",
    VALID_OPTION_VALUES.trailingSlash,
    methodName,
  );
  validateStringEnum(
    opts.queryParamsMode,
    "queryParamsMode",
    VALID_OPTION_VALUES.queryParamsMode,
    methodName,
  );
  validateStringEnum(
    opts.urlParamsEncoding,
    "urlParamsEncoding",
    VALID_OPTION_VALUES.urlParamsEncoding,
    methodName,
  );

  if (
    opts.allowNotFound !== undefined &&
    typeof opts.allowNotFound !== "boolean"
  ) {
    throw new TypeError(
      `[router.${methodName}] Invalid "allowNotFound": expected boolean, got ${typeof opts.allowNotFound}`,
    );
  }

  if (
    opts.rewritePathOnMatch !== undefined &&
    typeof opts.rewritePathOnMatch !== "boolean"
  ) {
    throw new TypeError(
      `[router.${methodName}] Invalid "rewritePathOnMatch": expected boolean, got ${typeof opts.rewritePathOnMatch}`,
    );
  }

  if (
    opts.caseSensitive !== undefined &&
    typeof opts.caseSensitive !== "boolean"
  ) {
    throw new TypeError(
      `[router.${methodName}] Invalid "caseSensitive": expected boolean, got ${typeof opts.caseSensitive}`,
    );
  }

  validateQueryParamsOptions(opts.queryParams, methodName);

  if (opts.limits !== undefined) {
    validateLimits(opts.limits, methodName);
  }
}
