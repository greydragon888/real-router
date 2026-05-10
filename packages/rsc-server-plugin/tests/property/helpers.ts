import { fc } from "@fast-check/vitest";
import { createRouter } from "@real-router/core";

import { rscServerPluginFactory } from "../../src";

import type { RscLoaderFactoryMap } from "../../src";
import type { Route, Router } from "@real-router/core";
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
