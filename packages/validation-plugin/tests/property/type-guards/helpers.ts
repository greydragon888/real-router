import { fc } from "@fast-check/vitest";

import type { NavigationOptions, Params, State } from "@real-router/core";

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

const STUB_TRANSITION = Object.freeze({
  phase: "activating",
  reason: "success",
  segments: Object.freeze({
    deactivated: Object.freeze([]),
    activated: Object.freeze([]),
    intersection: "",
  }),
}) as unknown as State["transition"];

/**
 * Generator for minimal valid State
 * Note: uses valid route names and paths since isState now validates via isRequiredFields
 */
export const stateMinimalArbitrary: fc.Arbitrary<State> = fc.record({
  name: validRouteNameArbitrary,
  path: validRoutePathArbitrary,
  params: paramsSimpleArbitrary,
  search: fc.constant({}),
  transition: fc.constant(STUB_TRANSITION),
  context: fc.constant({}),
});

/**
 * Generator for full valid State with extra properties (backward compat testing)
 * Note: uses valid route names and paths since isState now validates via isRequiredFields
 */
export const stateFullArbitrary = fc.record({
  name: validRouteNameArbitrary,
  path: validRoutePathArbitrary,
  params: paramsWithArraysArbitrary,
  search: fc.constant({}),
  transition: fc.constant(STUB_TRANSITION),
  context: fc.constant({}),
  extra: fc.option(fc.string(), { nil: undefined }),
}) as fc.Arbitrary<State>;

/**
 * Generator for valid State with extra properties (simulating old history.state with meta).
 */
export const historyStateArbitrary = fc
  .record({
    name: validRouteNameArbitrary,
    path: validRoutePathArbitrary,
    params: paramsWithArraysArbitrary,
  })
  .map((data) => ({
    name: data.name,
    path: data.path,
    params: data.params,
  })) as unknown as fc.Arbitrary<State>;

/**
 * Generator for invalid State (missing required fields or wrong types).
 * The "invalid params" variant uses non-object primitives; top-level array
 * params are not enumerated here.
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
  // Note: "invalid path format" (e.g. double slashes) is NOT included here
  // because isState only checks typeof path === "string", not path format.
  // Path format validation happens at the route tree level, not in type guards.
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
    forceDeactivate: fc.option(fc.boolean(), { nil: undefined }),
    redirected: fc.option(fc.boolean(), { nil: undefined }),
    signal: fc.option(
      fc.constant(0).map(() => new AbortController().signal),
      { nil: undefined },
    ),
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
  // Wrong types for forceDeactivate
  fc.record({
    forceDeactivate: fc.oneof(fc.string(), fc.integer(), fc.constant(null)),
  }) as fc.Arbitrary<Record<string, unknown>>,
  // Wrong types for redirected
  fc.record({
    redirected: fc.oneof(fc.string(), fc.integer(), fc.constant(null)),
  }) as fc.Arbitrary<Record<string, unknown>>,
  // Wrong types for signal (must be AbortSignal or undefined)
  fc.record({
    signal: fc.oneof(fc.string(), fc.integer(), fc.constant(null), fc.object()),
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
export const invalidRouteNameArbitrary = fc.constantFrom(
  "",
  " ".repeat(3),
  "\n",
  "\t",
);

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
 * Generator for arbitrary invalid types (primitives and non-objects).
 * Top-level arrays are rejected by isParams too, but are
 * exercised elsewhere; this generator stays focused on non-array invalids.
 */
export const arbitraryInvalidTypes = fc.oneof(
  fc.constant(null),
  fc.constant(undefined),
  fc.integer(),
  fc.boolean(),
  fc.string(),
  fc.func(fc.anything()),
  fc.constant(Symbol("test")),
  // Arrays (typeof "object") are rejected by the guards too, but kept out here
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

// ============================================================================
// Structural arbitraries + differential oracle for isParams (DAGs, cycles)
// ============================================================================
//
// fast-check's tree generators never emit shared references or cycles and stay
// shallow, so the structural behaviour of `isParams` (the on-path cycle / done-set
// walk added for #786, and the unbounded-depth contract from #901) is invisible to
// the dictionary/letrec arbitraries above. The helpers below close that blind spot:
// a custom value generator, valid-only / rich-invalid variants, and an INDEPENDENT
// recursive reference oracle to diff against the production iterative guard.

/** Object keys that are safe to assign as own enumerable properties. */
const safeKeyArbitrary = fc
  .string({ minLength: 1, maxLength: 8 })
  .filter((k) => k !== "__proto__");

/** Leaves that may be valid (string/finite number/boolean/null/undefined) or not. */
const anyLeafArbitrary = fc.oneof(
  fc.string(),
  fc.integer(),
  fc.double(), // includes NaN / ±Infinity
  fc.boolean(),
  fc.constant(null),
  fc.constant(undefined),
  fc.constant(Number.NaN),
  fc.constant(Infinity),
  fc.func(fc.anything()),
  fc.constant(Symbol("leaf")),
  fc.bigInt(),
  fc.constant(0).map(() => new Date()),
  fc.constant(0).map(() => new Map()),
);

/** Arbitrary nested data value: leaves, arrays, and plain objects, mixed validity. */
export const arbitraryDataValue: fc.Arbitrary<unknown> = fc.letrec((tie) => ({
  node: fc.oneof(
    { weight: 4, arbitrary: anyLeafArbitrary },
    { weight: 1, arbitrary: fc.array(tie("node"), { maxLength: 4 }) },
    {
      weight: 1,
      arbitrary: fc.dictionary(safeKeyArbitrary, tie("node"), { maxKeys: 4 }),
    },
  ),
})).node;

/**
 * Collects every distinct container (array / plain object) reachable from `root`,
 * in DFS order. Used to wire shared references and cycles into a generated tree.
 */
const collectContainers = (root: unknown): object[] => {
  const out: object[] = [];
  const seen = new WeakSet<object>();

  const walk = (v: unknown): void => {
    if (typeof v !== "object" || v === null || seen.has(v)) {
      return;
    }

    seen.add(v);
    out.push(v);

    const children = Array.isArray(v) ? v : Object.values(v);

    for (const child of children) {
      walk(child);
    }
  };

  walk(root);

  return out;
};

/**
 * A plain-object tree with extra edges wired between its containers: each edge
 * points one container at another reachable container. An edge to a descendant or
 * self forms a cycle (rejected); an edge elsewhere forms a shared reference /
 * diamond (accepted). The differential oracle decides the expected result, so the
 * generator need not classify the edges — this turns the tree generator into a DAG
 * / cyclic-graph generator and closes the structural blind spot in the oracle.
 */
const arbitraryObjectGraph: fc.Arbitrary<unknown> = fc
  .tuple(
    fc.dictionary(safeKeyArbitrary, arbitraryDataValue, { maxKeys: 5 }),
    fc.array(fc.tuple(fc.nat(), fc.nat()), { maxLength: 4 }),
  )
  .map(([root, edges]) => {
    const containers = collectContainers(root);

    if (containers.length > 0) {
      edges.forEach(([from, to], k) => {
        const source = containers[from % containers.length];
        const destination = containers[to % containers.length];

        if (Array.isArray(source)) {
          source.push(destination);
        } else {
          (source as Record<string, unknown>)[`ref${k}`] = destination;
        }
      });
    }

    return root;
  });

/**
 * Top-level candidate for `isParams`: usually an object graph (a tree plus wired
 * shared references / cycles), sometimes a non-object / array / class instance (to
 * exercise the top-level reject). Mixes accepted and rejected inputs across the
 * FULL structural space for the differential oracle.
 */
export const arbitraryParamsCandidate: fc.Arbitrary<unknown> = fc.oneof(
  { weight: 6, arbitrary: arbitraryObjectGraph },
  { weight: 1, arbitrary: anyLeafArbitrary },
  { weight: 1, arbitrary: fc.array(arbitraryDataValue, { maxLength: 4 }) },
  { weight: 1, arbitrary: fc.constant(0).map(() => new Date()) },
);

/** Leaves that are always valid param values. */
const validLeafArbitrary = fc.oneof(
  fc.string(),
  fc.integer(),
  fc.boolean(),
  fc.constant(null),
  fc.constant(undefined),
);

/** Arbitrary nested data value with ONLY valid leaves (no invalid leaf anywhere). */
export const validDataValue: fc.Arbitrary<unknown> = fc.letrec((tie) => ({
  node: fc.oneof(
    { weight: 3, arbitrary: validLeafArbitrary },
    { weight: 1, arbitrary: fc.array(tie("node"), { maxLength: 4 }) },
    {
      weight: 1,
      arbitrary: fc.dictionary(safeKeyArbitrary, tie("node"), { maxKeys: 4 }),
    },
  ),
})).node;

/** A valid, non-empty container subtree (object or array) — used for sharing. */
export const validContainerSubtree: fc.Arbitrary<object> = fc.oneof(
  fc.dictionary(safeKeyArbitrary, validDataValue, { minKeys: 1, maxKeys: 4 }),
  fc.array(validDataValue, { minLength: 1, maxLength: 4 }),
);

/** Structures that `isParams` must reject, spanning the full invalid space. */
export const richInvalidParamsArbitrary: fc.Arbitrary<unknown> = fc.oneof(
  // Self-referencing cycle
  fc.constant(0).map(() => {
    const o: Record<string, unknown> = { a: 1 };

    o.self = o;

    return o;
  }),
  // Cycle through an array
  fc.constant(0).map(() => {
    const arr: unknown[] = [1];
    const o: Record<string, unknown> = { arr };

    arr.push(o);

    return o;
  }),
  // Class instance nested as a value
  fc.oneof(
    fc.constant(0).map(() => ({ d: new Date() })),
    fc.constant(0).map(() => ({ m: new Map() })),
    fc.constant(0).map(() => ({ r: /re/ })),
  ),
  // Non-finite number nested as a value
  fc.constantFrom(
    { n: Number.NaN },
    { n: Infinity },
    { n: -Infinity },
  ) as fc.Arbitrary<Record<string, unknown>>,
  // Function / symbol nested as a value
  fc.dictionary(
    safeKeyArbitrary,
    fc.oneof(fc.func(fc.anything()), fc.constant(Symbol("x"))),
    { minKeys: 1, maxKeys: 3 },
  ),
  // Top-level array
  fc.array(fc.integer(), { maxLength: 4 }),
);

/** Params VALUES exercising the structural paths through `isState`/`isStateStrict`. */
export const structuralParamsArbitrary: fc.Arbitrary<unknown> = fc.oneof(
  // Valid nested params
  fc.dictionary(safeKeyArbitrary, validDataValue, { maxKeys: 4 }),
  // Diamond (shared reference, not a cycle) → valid
  validContainerSubtree.map((sub) => ({ a: sub, b: sub })),
  // Self-referencing cycle → invalid
  fc.constant(0).map(() => {
    const o: Record<string, unknown> = {};

    o.self = o;

    return o;
  }),
  // Class instance nested → invalid
  fc.constant(0).map(() => ({ d: new Date() })),
);

/**
 * Independent reference predicate for the `isParams` contract — a deliberately
 * RECURSIVE implementation (the production guard is iterative), used as a
 * differential oracle. A value is plain-serializable iff it is a plain object
 * whose entire tree contains only primitives (finite numbers, strings, booleans),
 * `null`/`undefined`, arrays, and plain objects — no functions, symbols, bigints,
 * `NaN`/`Infinity`, or class instances, and no cycle on the current DFS path.
 * Shared references off the path (diamonds) are accepted. Used only in tests, on
 * bounded-depth generated input, so the recursion is safe.
 */
export function isPlainSerializable(value: unknown): boolean {
  const isPlainObjectValue = (v: unknown): v is object => {
    if (typeof v !== "object" || v === null || Array.isArray(v)) {
      return false;
    }

    const proto = Object.getPrototypeOf(v) as object | null;

    return proto === null || proto === Object.prototype;
  };

  // Top-level must be a plain object (not array, null, primitive, or instance).
  if (!isPlainObjectValue(value)) {
    return false;
  }

  const onPath = new Set<object>();

  const check = (v: unknown): boolean => {
    if (v === null || v === undefined) {
      return true;
    }

    const type = typeof v;

    if (type === "string" || type === "boolean") {
      return true;
    }

    if (type === "number") {
      return Number.isFinite(v);
    }

    if (type !== "object") {
      return false; // function, symbol, bigint
    }

    const obj = v;

    if (onPath.has(obj)) {
      return false; // back-edge to a container on the current path → cycle
    }

    if (!(Array.isArray(obj) || isPlainObjectValue(obj))) {
      return false; // class instance / custom prototype
    }

    onPath.add(obj);

    const children = Array.isArray(obj) ? obj : Object.values(obj);
    const ok = children.every((child) => check(child));

    onPath.delete(obj); // on-path semantics: leaving this subtree

    return ok;
  };

  return check(value);
}
