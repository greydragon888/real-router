// packages/solid/tests/property/helpers.ts

import { fc } from "@fast-check/vitest";
import { vi } from "vitest";

import type { RouterSource } from "@real-router/sources";

// =============================================================================
// numRuns Constants
// =============================================================================

export const NUM_RUNS = {
  standard: 50,
  // §2.2 audit follow-up: 100+ for invariants over wide arbitrary domains
  // where shrinkage matters (anti-symmetry, transitivity, NaN/±0 edges).
  // 50 leaves too narrow a margin for low-frequency corner cases.
  elevated: 100,
  thorough: 200,
} as const;

// =============================================================================
// Arbitraries — route names
// =============================================================================

/**
 * Realistic route segment name. Covers the practical character set: lowercase
 * & uppercase Latin, digits, hyphen, underscore. Length 1-10.
 *
 * Intentionally excludes `.` — the dot is the route-name separator, so an
 * arbitrary that emits dots inside a segment would break `parent.child`
 * construction patterns used by `isRouteActive` / `isSegmentMatch` tests.
 */
export const arbSegmentName: fc.Arbitrary<string> = fc.stringMatching(
  /^[A-Za-z0-9_-]{1,10}$/,
);

/**
 * Subset arbitrary for legacy invariants that depend on alpha-only segments
 * (e.g. constructing `parent.child` where `child` must not collide with a
 * dotted prefix). Length 1-10, lowercase Latin only.
 */
export const arbAlphaSegmentName: fc.Arbitrary<string> =
  fc.stringMatching(/^[a-z]{1,10}$/);

/**
 * Dotted route name — 1 to 4 segments joined with ".".
 */
export const arbDottedName: fc.Arbitrary<string> = fc
  .array(arbSegmentName, { minLength: 1, maxLength: 4 })
  .map((segments) => segments.join("."));

/**
 * §2.3 audit follow-up — invalid / hostile route names.
 *
 * `arbDottedName` only emits well-formed names. Real implementations of
 * `isRouteActive` / `isSegmentMatch` must not crash on malformed input —
 * leading/trailing dots, doubled dots, empty strings, dot-only — even
 * though such names never reach production (validation rejects them).
 * This covers the negative domain so a refactor that adds `.split(".")`
 * indexing or similar fragile parsing is caught.
 */
export const arbInvalidDottedName: fc.Arbitrary<string> = fc.constantFrom(
  "",
  ".",
  "..",
  ".leading",
  "trailing.",
  "a..b",
  "..a..",
  ".a.b.",
  "a...b...c",
);

/**
 * Known route names for testing with realistic values.
 */
export const arbRouteName: fc.Arbitrary<string> = fc.constantFrom(
  "home",
  "users",
  "users.list",
  "users.view",
  "admin",
  "admin.settings",
);

// =============================================================================
// Arbitraries — primitive values & params
// =============================================================================

export type Primitive = string | number | boolean;

/**
 * Primitive value — string, number, or boolean. Realistic route-params shape.
 * Use `arbExtendedPrimitive` when exercising equality semantics over the JS
 * value space (NaN, ±0, BigInt, etc.).
 */
export const arbPrimitive: fc.Arbitrary<Primitive> = fc.oneof(
  fc.string({ minLength: 0, maxLength: 20 }),
  fc.integer({ min: -1000, max: 1000 }),
  fc.boolean(),
);

/**
 * Dictionary of primitive values for route params / route options.
 */
export const arbParams: fc.Arbitrary<
  Record<string, string | number | boolean>
> = fc.dictionary(fc.stringMatching(/^[a-z]{1,8}$/), arbPrimitive, {
  minKeys: 0,
  maxKeys: 5,
});

/**
 * Hostile keys for prototype-pollution / dotted / empty / Unicode coverage.
 * Pure helpers (`shallowEqual`, `canonicalJson`-style serializers) must treat
 * these as ordinary string keys without special-casing.
 */
export const arbHostileParamKey: fc.Arbitrary<string> = fc.oneof(
  fc.constantFrom(
    "__proto__",
    "constructor",
    "prototype",
    "toString",
    "hasOwnProperty",
    "a.b",
    "with.dot",
    "with space",
    "",
    "0",
    "üñîçødé",
    "中文",
  ),
  fc.stringMatching(/^[A-Za-z0-9_-]{1,8}$/),
);

/**
 * Params dict that may contain hostile keys. Use to exercise that helpers do
 * NOT confuse `__proto__` / dotted keys with real prototype lookups.
 */
export const arbHostileParams: fc.Arbitrary<Record<string, Primitive>> =
  fc.dictionary(arbHostileParamKey, arbPrimitive, {
    minKeys: 0,
    maxKeys: 5,
  });

/**
 * Hash fragment generator covering:
 * - ASCII strings (sub-delims preserved by encodeURI)
 * - Unicode (must be percent-encoded by encodeURI)
 * - Strings starting with "#" (must be stripped by buildHref)
 * - Strings containing "#" (must be defensively replaced with "%23")
 * - Empty string (falsy — buildHref returns path without `#…`)
 */
export const arbHash: fc.Arbitrary<string> = fc.oneof(
  fc.string({ minLength: 0, maxLength: 24 }),
  fc.constantFrom("section", "tab=1&q=x", "用户", "über", "a#b#c", "#leading"),
);

/**
 * §2.3 audit follow-up — long-string stress. Most arbitraries cap at
 * `maxLength: 24` which keeps shrinkage manageable but never exercises
 * the "user pastes a 1KB query string into a hash" case. Use for
 * `buildHref` / `buildActiveClassName` / route-name length-stress.
 *
 * Min 256 to guarantee non-trivial length; max 1024 to keep test runtime
 * reasonable across hundreds of fc runs.
 */
export const arbLongString: fc.Arbitrary<string> = fc.string({
  minLength: 256,
  maxLength: 1024,
});

/**
 * Extended primitive that also includes Object.is / `===` edge-cases:
 * NaN, ±0, ±Infinity, BigInt, null, undefined.
 *
 * Symbols are intentionally excluded — they are unique per construction so
 * they would NEVER compare equal across two independent draws, distorting
 * the equality invariants we want to verify.
 */
export const arbExtendedPrimitive: fc.Arbitrary<unknown> = fc.oneof(
  fc.string({ minLength: 0, maxLength: 12 }),
  fc.integer({ min: -1000, max: 1000 }),
  fc.boolean(),
  fc.constantFrom(
    Number.NaN,
    Infinity,
    -Infinity,
    0,
    -0,
    null,
    undefined,
    1n,
    -1n,
    0n,
  ),
);

/**
 * Object with a fixed set of keys and arbitrary primitive values, used to
 * exercise `shallowEqual` semantics over Object.is value space.
 */
export const arbExtendedRecord: fc.Arbitrary<Record<string, unknown>> =
  fc.dictionary(fc.stringMatching(/^[a-z]{1,4}$/), arbExtendedPrimitive, {
    minKeys: 0,
    maxKeys: 4,
  });

// =============================================================================
// Solid-specific generators — signal/store reactivity
// =============================================================================

export interface MockSource<T> {
  source: RouterSource<T>;
  emit: (value: T) => void;
  setSnapshot: (value: T) => void;
  listeners: () => number;
  destroySpy: ReturnType<typeof vi.fn>;
}

/**
 * Build a controllable `RouterSource<T>` for property tests of the Solid
 * signal/store bridges. Exposes `emit` (notify all listeners with a new
 * snapshot), `setSnapshot` (update the snapshot WITHOUT notifying — simulate
 * lazy reconcile), and `listeners()` (count active subscribers, for cleanup
 * invariants).
 *
 * Solid-specific: paired with `createRoot(...)` ownership in the test body,
 * this is the property-test counterpart of `@solidjs/testing-library`
 * `renderHook` used in functional tests.
 */
export function createMockSource<T>(initial: T): MockSource<T> {
  let current = initial;
  const callbacks = new Set<() => void>();
  const destroySpy = vi.fn();

  const source: RouterSource<T> = {
    subscribe: (cb) => {
      callbacks.add(cb);

      return () => {
        callbacks.delete(cb);
      };
    },
    getSnapshot: () => current,
    destroy: destroySpy,
  };

  return {
    source,
    emit: (value: T) => {
      current = value;
      for (const cb of callbacks) {
        cb();
      }
    },
    setSnapshot: (value: T) => {
      current = value;
    },
    listeners: () => callbacks.size,
    destroySpy,
  };
}

/**
 * Realistic Solid `RouteSnapshot`-shaped record for `createStoreFromSource`
 * property tests. Both `route` and `previousRoute` may be `undefined` — that
 * is a legitimate router state (no current route, no prior history).
 */
export interface RouteSnapshotLike {
  route: { name: string; params: Record<string, string> } | undefined;
  previousRoute: { name: string } | undefined;
}

export const arbSnapshot: fc.Arbitrary<RouteSnapshotLike> = fc.record({
  route: fc.option(
    fc.record({
      name: fc.constantFrom("home", "users", "users.view", "admin"),
      // §2.3 audit follow-up — mix in hostile keys so reconcile/sources are
      // exercised against `__proto__` / dotted / unicode params, not only
      // the safe `[a-z]{1,4}` alphabet that production plugins generate.
      params: fc.dictionary(
        fc.oneof(arbHostileParamKey, fc.stringMatching(/^[a-z]{1,4}$/)),
        fc.string({ minLength: 0, maxLength: 8 }),
        { minKeys: 0, maxKeys: 3 },
      ),
    }),
    { nil: undefined },
  ),
  previousRoute: fc.option(
    fc.record({
      name: fc.constantFrom("home", "users", "users.view", "admin"),
    }),
    { nil: undefined },
  ),
});
