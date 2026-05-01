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

export const arbParamValue = fc.stringMatching(/^[a-z0-9]{1,8}$/);

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

/** Arbitrary ReactNode-like values returned by loaders */
export const arbReactNode = fc.oneof(
  fc.constant(null),
  fc.string().map((s) => s as ReactNode),
  fc.integer().map((n) => n as unknown as ReactNode),
  fc.constant(node("Component")),
  fc
    .record({ kind: fc.string({ minLength: 1, maxLength: 8 }) })
    .map((r) => node(r.kind)),
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
