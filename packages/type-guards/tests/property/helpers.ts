import { fc } from "@fast-check/vitest";

import type { NavigationOptions, Params, State } from "@real-router/types";

// ============================================================================
// Arbitraries for Route Names and Paths
// ============================================================================

/**
 * Generator for valid route names
 * Matches pattern: [A-Z_a-z][\w-]*(?:\.[A-Z_a-z][\w-]*)*
 */
export const validRouteNameArbitrary = fc.oneof(
  // Simple route name
  fc.stringMatching(/^[A-Z_a-z][\w-]{0,20}$/),
  // Hierarchical route name (2 levels)
  fc
    .tuple(
      fc.stringMatching(/^[A-Z_a-z][\w-]{0,10}$/),
      fc.stringMatching(/^[A-Z_a-z][\w-]{0,10}$/),
    )
    .map(([a, b]) => `${a}.${b}`),
  // System routes
  fc.stringMatching(/^@@[A-Z_a-z][\w-]{0,20}$/),
);

/**
 * Generator for valid route paths
 * Can be empty string, /path, ~path, ?query, or relative
 */
export const validRoutePathArbitrary = fc.oneof(
  fc.constant(""),
  fc.stringMatching(/^\/[\w-]{0,20}$/),
  fc.stringMatching(/^~[\w-]{0,20}$/),
  fc.stringMatching(/^\?[\w&=-]{0,20}$/),
  fc.stringMatching(/^[\w-]{1,20}$/),
);

// ============================================================================
// Arbitraries for Params types
// ============================================================================

/**
 * Generator for primitive values (string, number, boolean)
 */
export const primitiveValueArbitrary = fc.oneof(
  fc.string(),
  fc.integer(),
  fc.boolean(),
);

/**
 * Generator for invalid primitives (NaN, Infinity, -Infinity)
 */
export const invalidPrimitiveArbitrary = fc.constantFrom(
  Number.NaN,
  Infinity,
  -Infinity,
);

/**
 * Generator for valid Params (simple variant - 1 level of nesting)
 */
export const paramsSimpleArbitrary: fc.Arbitrary<Params> = fc.dictionary(
  fc.string({ minLength: 1, maxLength: 20 }),
  primitiveValueArbitrary,
  { maxKeys: 5 },
);

/**
 * Generator for valid Params with arrays
 */
export const paramsWithArraysArbitrary = fc.dictionary(
  fc.string({ minLength: 1, maxLength: 20 }),
  fc.oneof(
    primitiveValueArbitrary,
    fc.array(primitiveValueArbitrary, { maxLength: 5 }),
  ),
  { maxKeys: 5 },
) as fc.Arbitrary<Params>;

/**
 * Generator for nested Params (recursive, up to 3 levels)
 */
export const paramsNestedArbitrary = fc.letrec((tie) => ({
  params: fc.dictionary(
    fc.string({ minLength: 1, maxLength: 20 }),
    fc.oneof(
      primitiveValueArbitrary,
      fc.array(primitiveValueArbitrary, { maxLength: 3 }),
      tie("paramsNested") as fc.Arbitrary<Params>,
    ),
    { maxKeys: 3 },
  ),
  paramsNested: fc.dictionary(
    fc.string({ minLength: 1, maxLength: 20 }),
    primitiveValueArbitrary,
    { maxKeys: 2 },
  ),
})).params as fc.Arbitrary<Params>;

/**
 * Generator for invalid Params (containing NaN, Infinity, functions, symbols)
 */
export const invalidParamsArbitrary = fc.dictionary(
  fc.string({ minLength: 1, maxLength: 20 }),
  fc.oneof(
    invalidPrimitiveArbitrary,
    fc.func(fc.anything()), // Functions
    fc.constant(Symbol("test")), // Symbols
  ),
  { minKeys: 1, maxKeys: 3 }, // Ensure at least 1 invalid key
);

// ============================================================================
// Arbitraries for State types
// ============================================================================

/**
 * Generator for minimal valid State
 * Note: uses valid route names and paths since isState now validates via isRequiredFields
 */
export const stateMinimalArbitrary: fc.Arbitrary<State> = fc.record({
  name: validRouteNameArbitrary,
  path: validRoutePathArbitrary,
  params: paramsSimpleArbitrary,
});

/**
 * Generator for full valid State with meta (can be null/undefined)
 * Note: uses valid route names and paths since isState now validates via isRequiredFields
 */
export const stateFullArbitrary = fc.record({
  name: validRouteNameArbitrary,
  path: validRoutePathArbitrary,
  params: paramsWithArraysArbitrary,
  meta: fc.option(
    fc.record({
      id: fc.option(fc.integer({ min: 0 }), { nil: undefined }),
      params: fc.option(paramsSimpleArbitrary, { nil: undefined }),
      options: fc.option(
        fc.record({
          replace: fc.option(fc.boolean(), { nil: undefined }),
          reload: fc.option(fc.boolean(), { nil: undefined }),
          force: fc.option(fc.boolean(), { nil: undefined }),
          state: fc.option(fc.dictionary(fc.string(), fc.anything()), {
            nil: undefined,
          }),
        }),
        { nil: undefined },
      ),
      redirected: fc.option(fc.boolean(), { nil: undefined }),
    }),
    { nil: undefined },
  ),
}) as fc.Arbitrary<State>;

/**
 * Generator for valid HistoryState (requires non-null meta)
 * Note: Optional fields must not be present (not undefined) to pass isHistoryState validation
 */
export const historyStateArbitrary = fc
  .record({
    name: validRouteNameArbitrary,
    path: validRoutePathArbitrary,
    params: paramsWithArraysArbitrary,
    hasId: fc.boolean(),
    id: fc.integer({ min: 0 }),
    hasParams: fc.boolean(),
    metaParams: paramsSimpleArbitrary,
    hasOptions: fc.boolean(),
    hasReplace: fc.boolean(),
    replace: fc.boolean(),
    hasReload: fc.boolean(),
    reload: fc.boolean(),
    hasForce: fc.boolean(),
    force: fc.boolean(),
    hasState: fc.boolean(),
    state: fc.dictionary(fc.string(), fc.anything()),
    hasRedirected: fc.boolean(),
    redirected: fc.boolean(),
  })
  .map((data) => {
    const meta: Record<string, unknown> = {};

    if (data.hasId) {
      meta.id = data.id;
    }

    if (data.hasParams) {
      meta.params = data.metaParams;
    }

    if (data.hasOptions) {
      const options: Record<string, unknown> = {};

      if (data.hasReplace) {
        options.replace = data.replace;
      }

      if (data.hasReload) {
        options.reload = data.reload;
      }

      if (data.hasForce) {
        options.force = data.force;
      }

      if (data.hasState) {
        options.state = data.state;
      }

      meta.options = options;
    }

    if (data.hasRedirected) {
      meta.redirected = data.redirected;
    }

    return {
      name: data.name,
      path: data.path,
      params: data.params,
      meta,
    };
  }) as unknown as fc.Arbitrary<State>;

/**
 * Generator for invalid State (missing required fields or wrong types)
 * Note: Arrays with primitives are VALID for isParamsStrict, so we exclude them!
 */
export const invalidStateArbitrary = fc.oneof(
  // Missing name
  fc.record({
    path: validRoutePathArbitrary,
    params: paramsSimpleArbitrary,
  }) as fc.Arbitrary<Record<string, unknown>>,
  // Missing path
  fc.record({
    name: validRouteNameArbitrary,
    params: paramsSimpleArbitrary,
  }) as fc.Arbitrary<Record<string, unknown>>,
  // Missing params
  fc.record({
    name: validRouteNameArbitrary,
    path: validRoutePathArbitrary,
  }) as fc.Arbitrary<Record<string, unknown>>,
  // Invalid params (non-object types - strings, numbers, null, etc.)
  fc.record({
    name: validRouteNameArbitrary,
    path: validRoutePathArbitrary,
    params: fc.oneof(
      fc.string(),
      fc.integer(),
      fc.boolean(),
      fc.constant(null),
      fc.constant(undefined),
    ),
  }) as fc.Arbitrary<Record<string, unknown>>,
  // Invalid name type
  fc.record({
    name: fc.integer(),
    path: validRoutePathArbitrary,
    params: paramsSimpleArbitrary,
  }) as fc.Arbitrary<Record<string, unknown>>,
  // Invalid path type
  fc.record({
    name: validRouteNameArbitrary,
    path: fc.integer(),
    params: paramsSimpleArbitrary,
  }) as fc.Arbitrary<Record<string, unknown>>,
  // Invalid route name (whitespace, starting with digit, consecutive dots, etc.)
  // Note: empty string ("") is VALID as it represents root node
  fc.record({
    name: fc.constantFrom(" ", "  ", "123", ".test", "test.", "test..name"),
    path: validRoutePathArbitrary,
    params: paramsSimpleArbitrary,
  }) as fc.Arbitrary<Record<string, unknown>>,
  // Invalid route path (double slashes)
  fc.record({
    name: validRouteNameArbitrary,
    path: fc.constantFrom("//", "/test//path", "test//path"),
    params: paramsSimpleArbitrary,
  }) as fc.Arbitrary<Record<string, unknown>>,
);

// ============================================================================
// Arbitraries for NavigationOptions
// ============================================================================

/**
 * Generator for valid NavigationOptions
 * Note: Optional fields use undefined (not null) as nil value
 */
export const navigationOptionsArbitrary: fc.Arbitrary<NavigationOptions> =
  fc.record({
    replace: fc.option(fc.boolean(), { nil: undefined }),
    reload: fc.option(fc.boolean(), { nil: undefined }),
    force: fc.option(fc.boolean(), { nil: undefined }),
    state: fc.option(fc.dictionary(fc.string(), fc.anything()), {
      nil: undefined,
    }),
  });

/**
 * Generator for invalid NavigationOptions (containing wrong types for known fields)
 */
export const invalidNavigationOptionsArbitrary = fc.oneof(
  // Wrong types for replace
  fc.record({
    replace: fc.oneof(fc.string(), fc.integer(), fc.constant(null)),
  }) as fc.Arbitrary<Record<string, unknown>>,
  // Wrong types for reload
  fc.record({
    reload: fc.oneof(fc.string(), fc.integer(), fc.constant(null)),
  }) as fc.Arbitrary<Record<string, unknown>>,
  // Wrong types for force
  fc.record({
    force: fc.oneof(fc.string(), fc.integer(), fc.constant(null)),
  }) as fc.Arbitrary<Record<string, unknown>>,
);

// ============================================================================
// Arbitraries for route names and paths
// ============================================================================

/**
 * Generator for valid route names
 */
export const routeNameArbitrary = fc.string({ minLength: 1, maxLength: 50 });

/**
 * Generator for valid route paths (starting with /)
 */
export const routePathArbitrary = fc
  .string({ minLength: 1, maxLength: 100 })
  .map((s) => `/${s}`);

/**
 * Generator for invalid route names (empty strings)
 */
export const invalidRouteNameArbitrary = fc.constantFrom("", "   ", "\n", "\t");

/**
 * Generator for invalid route paths (not starting with /)
 */
export const invalidRoutePathArbitrary = fc
  .string({ minLength: 1, maxLength: 50 })
  .filter((s) => !s.startsWith("/"));

// ============================================================================
// Helper utilities
// ============================================================================

/**
 * Generator for arbitrary invalid types (primitives, arrays, and non-objects)
 * Note: Arrays (even empty) pass isParamsStrict due to implementation - excluded from tests
 */
export const arbitraryInvalidTypes = fc.oneof(
  fc.constant(null),
  fc.constant(undefined),
  fc.integer(),
  fc.boolean(),
  fc.string(),
  fc.func(fc.anything()),
  fc.constant(Symbol("test")),
  // Arrays are technically objects and pass some object checks, so excluded
);

// ============================================================================
// Arbitraries for RouteDefinition (validateRoute)
// ============================================================================

/**
 * Generator for valid RouteDefinition
 */
export const routeDefinitionArbitrary = fc.record({
  name: validRouteNameArbitrary,
  path: validRoutePathArbitrary,
});

/**
 * Generator for RouteDefinition with children
 */
export const routeDefinitionWithChildrenArbitrary = fc.record({
  name: validRouteNameArbitrary,
  path: validRoutePathArbitrary,
  children: fc.array(routeDefinitionArbitrary, { maxLength: 3 }),
});

/**
 * Generator for unique RouteDefinitions (unique names and paths)
 */
export const uniqueRoutesArbitrary = fc
  .tuple(
    fc.uniqueArray(validRouteNameArbitrary, { minLength: 1, maxLength: 5 }),
    fc.uniqueArray(validRoutePathArbitrary, { minLength: 1, maxLength: 5 }),
  )
  .map(([names, paths]) =>
    names.map((name, i) => ({
      name,
      path: paths[i % paths.length],
    })),
  );
