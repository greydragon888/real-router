import { fc } from "@fast-check/vitest";
import { createRouter } from "@real-router/core";

import { rscServerPluginFactory } from "../../src";

import type { RscActionResult, RscLoaderFactoryMap } from "../../src";
import type { Route, Router, State } from "@real-router/core";
import type { ReactNode } from "react";

// =============================================================================
// Route Fixture
// =============================================================================

export const ROUTES: Route[] = [
  { name: "home", path: "/" },
  { name: "about", path: "/about" },
  {
    name: "users",
    path: "/users",
    children: [
      { name: "list", path: "/" },
      { name: "profile", path: "/:id" },
    ],
  },
];

// =============================================================================
// numRuns Constants
// =============================================================================

export const NUM_RUNS = {
  standard: 50,
  thorough: 100,
  // `exhaustive` is reserved for arbitraries whose branching factor is so
  // wide that `thorough` (100) statistically under-samples some branches.
  // `arbForeignMode` (10 fc.oneof branches) is the canonical example —
  // the audit's `1.numRuns анализ` argues that 100 runs gives each branch
  // only ~10 hits on average, which is too few to reliably catch a
  // regression that fails on one specific branch shape.
  exhaustive: 200,
} as const;

// =============================================================================
// Arbitraries
// =============================================================================

export const arbSimpleRouteName = fc.constantFrom(
  "home",
  "about",
  "users.list",
);

/**
 * Param values: extended from `[a-z0-9]{1,8}` to also include uppercase,
 * underscores, dashes, and dots — the URL-safe punctuation we routinely
 * see in real route params. Length stays bounded (1-16) so generated paths
 * stay readable in shrunk failure reports.
 *
 * NOT extended: percent-encoding, `?`, `#`, `:`, `/`, Unicode. Those would
 * change route-matching semantics — they're core's responsibility, and
 * exercising them here would test path-matcher rather than this plugin.
 */
export const arbParamValue = fc.stringMatching(/^[\w.-]{1,16}$/);

/** Plain "ReactNode-like" object — we test plumbing, not React itself. */
export const node = (
  kind: string,
  props: Record<string, unknown> = {},
): ReactNode =>
  ({
    type: kind,
    props,
    key: null,
    $$typeof: Symbol.for("react.element"),
  }) as unknown as ReactNode;

/**
 * Arbitrary ReactNode-like values returned by loaders. Plumbing-only —
 * the plugin treats the value as opaque and writes it to
 * `state.context.rsc` via `claim.write`, so the generator covers the
 * runtime-shape variety the value-pipe must survive: null, primitives,
 * single element, fragment-like array, and a 2-level nested element with
 * children — without bloating into actual React rendering, which is not
 * this plugin's contract.
 */
export const arbReactNode = fc.oneof(
  fc.constant(null),
  fc.string().map((s) => s as ReactNode),
  fc.integer().map((n) => n as unknown as ReactNode),
  fc.constant(node("Component")),
  fc
    .record({ kind: fc.string({ minLength: 1, maxLength: 8 }) })
    .map((r) => node(r.kind)),
  // Fragment-like array of ReactNode-shaped elements (multiple sizes).
  fc
    .array(
      fc.oneof(
        fc.constant(node("Item")),
        fc.string().map((s) => s as ReactNode),
      ),
      { minLength: 0, maxLength: 5 },
    )
    .map((items) => items as unknown as ReactNode),
  // Two-level element with children prop — exercises the "props-with-nodes"
  // shape that real Server Components produce.
  fc
    .record({
      kind: fc.string({ minLength: 1, maxLength: 8 }),
      childKind: fc.string({ minLength: 1, maxLength: 8 }),
    })
    .map((r) =>
      node(r.kind, { children: [node(r.childKind), node(r.childKind)] }),
    ),
);

/**
 * RscActionResult arbitrary. Both fields independently optional — matches
 * the public type which declares both as optional. `returnValue.ok` and
 * `returnValue.data` are kept open (boolean × anything) because the
 * plugin treats the payload structurally and does NOT enforce semantics
 * inside `data`. `formState` is `fc.anything()` for the same reason —
 * we test the value-pipe, not React-DOM's form state shape.
 */
export const arbRscAction = fc.record(
  {
    returnValue: fc.record(
      {
        ok: fc.boolean(),
        data: fc.anything(),
      },
      { requiredKeys: ["ok", "data"] },
    ),
    formState: fc.anything(),
  },
  { requiredKeys: [] },
) as fc.Arbitrary<RscActionResult>;

/**
 * Build a minimal `State` with arbitrary `context`. The `buildRscPayload`
 * and `getSsrRscMode` property tests don't need a router — they read
 * `state.context` directly. Centralising the factory here avoids re-
 * declaring the boilerplate State shape in every test block.
 */
export function stateWith(
  context: Record<string, unknown>,
  overrides: Partial<State> = {},
): State {
  return {
    name: "users.profile",
    params: { id: "42" },
    search: {},
    path: "/users/42",
    transition: {
      phase: "activating",
      reason: "success",
      segments: { deactivated: [], activated: [], intersection: "" },
    },
    ...overrides,
    context,
  };
}

// =============================================================================
// Router Factory Helpers
// =============================================================================

export function createRscRouter(loaders: RscLoaderFactoryMap): {
  router: Router;
  unsubscribe: () => void;
} {
  const router = createRouter(ROUTES, { defaultRoute: "home" });
  const unsubscribe = router.usePlugin(rscServerPluginFactory(loaders));

  return { router, unsubscribe };
}
