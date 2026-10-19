// packages/lifecycle-plugin/tests/property/helpers.ts

import { fc } from "@fast-check/vitest";
import { createRouter } from "@real-router/core";

import { lifecyclePluginFactory } from "../../src";

import type { LifecycleHook, LifecycleHookFactory } from "../../src";
import type { Route, Router, State } from "@real-router/core";

// =============================================================================
// Route Fixture
// =============================================================================

export const ROUTES: Route[] = [
  { name: "home", path: "/" },
  { name: "about", path: "/about" },
  { name: "contact", path: "/contact" },
  {
    name: "users",
    path: "/users",
    children: [{ name: "view", path: "/:id" }],
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

/** Routes without params (for simple navigation) */
export const arbSimpleRouteName = fc.constantFrom("home", "about", "contact");

/** Pair of distinct simple route names (guarantees route change) */
export const arbDistinctRouteNamePair: fc.Arbitrary<[string, string]> = fc
  .tuple(arbSimpleRouteName, arbSimpleRouteName)
  .filter(([a, b]) => a !== b);

/**
 * One navigation attempt (#2691). Only `go` can commit: `refused` and
 * `throwing` fail in their canActivate, and `pending` waits in an async
 * canActivate that never answers, so a later navigation cancels it.
 */
export type NavigationAttempt =
  | { readonly kind: "go"; readonly to: string }
  | { readonly kind: "refused" | "throwing" | "pending" };

export const arbNavigationAttempts: fc.Arbitrary<NavigationAttempt[]> =
  fc.array(
    fc.oneof(
      arbSimpleRouteName.map((to): NavigationAttempt => ({ kind: "go", to })),
      fc.constantFrom<NavigationAttempt>(
        { kind: "refused" },
        { kind: "throwing" },
        { kind: "pending" },
      ),
    ),
    { minLength: 1, maxLength: 8 },
  );

/**
 * One navigation attempt for the signal properties (#2692): `stay` sets `?q`
 * on the current route, `reload` commits the current state again; the other
 * kinds are the {@link NavigationAttempt} ones.
 */
export type SignalAttempt =
  | NavigationAttempt
  | { readonly kind: "stay"; readonly q: string }
  | { readonly kind: "reload" };

export const arbSignalAttempts: fc.Arbitrary<SignalAttempt[]> = fc.array(
  fc.oneof(
    arbSimpleRouteName.map((to): SignalAttempt => ({ kind: "go", to })),
    fc
      .stringMatching(/^[a-z]{1,2}$/)
      .map((q): SignalAttempt => ({ kind: "stay", q })),
    fc.constantFrom<SignalAttempt>(
      { kind: "reload" },
      { kind: "refused" },
      { kind: "throwing" },
      { kind: "pending" },
    ),
  ),
  { minLength: 1, maxLength: 10 },
);

/** Pair of distinct param values for same-route navigation */
export const arbDistinctIdPair: fc.Arbitrary<[string, string]> = fc
  .tuple(
    fc.stringMatching(/^[a-z0-9]{1,5}$/),
    fc.stringMatching(/^[a-z0-9]{1,5}$/),
  )
  .filter(([a, b]) => a !== b);

// =============================================================================
// Router Factory Helpers
// =============================================================================

export interface HookSpies {
  onEnter: LifecycleHook & {
    calls: { toName: string; fromName: string | undefined }[];
  };
  onLeave: LifecycleHook & {
    calls: { toName: string; fromName: string | undefined }[];
  };
  onStay: LifecycleHook & {
    calls: { toName: string; fromName: string | undefined }[];
  };
}

function createHookSpy(): LifecycleHook & {
  calls: { toName: string; fromName: string | undefined }[];
} {
  const calls: { toName: string; fromName: string | undefined }[] = [];
  const fn: LifecycleHook = (toState, fromState) => {
    calls.push({ toName: toState.name, fromName: fromState?.name });
  };

  return Object.assign(fn, { calls });
}

export function createHookSpies(): HookSpies {
  return {
    onEnter: createHookSpy(),
    onLeave: createHookSpy(),
    onStay: createHookSpy(),
  };
}

/**
 * Creates a router with lifecycle hooks attached to all routes.
 * Returns the router and hook spy records keyed by hook name.
 */
export function createLifecycleRouter(hooks: HookSpies): Router {
  const routes: Route[] = [
    {
      name: "home",
      path: "/",
      onEnter: () => hooks.onEnter,
      onLeave: () => hooks.onLeave,
      onStay: () => hooks.onStay,
    },
    {
      name: "about",
      path: "/about",
      onEnter: () => hooks.onEnter,
      onLeave: () => hooks.onLeave,
      onStay: () => hooks.onStay,
    },
    {
      name: "contact",
      path: "/contact",
      onEnter: () => hooks.onEnter,
      onLeave: () => hooks.onLeave,
      onStay: () => hooks.onStay,
    },
    {
      name: "users",
      path: "/users",
      children: [
        {
          name: "view",
          path: "/:id",
          onEnter: () => hooks.onEnter,
          onLeave: () => hooks.onLeave,
          onStay: () => hooks.onStay,
        },
      ],
    },
  ];

  const router = createRouter(routes, { defaultRoute: "home" });

  router.usePlugin(lifecyclePluginFactory());

  return router;
}

/**
 * Creates a router whose simple routes carry the hook spies, plus the three
 * guarded targets a {@link NavigationAttempt} can name besides `go` (#2691).
 */
export function createAttemptRouter(hooks: HookSpies): Router {
  const routes: Route[] = [
    ...["home", "about", "contact"].map((name) => ({
      name,
      path: name === "home" ? "/" : `/${name}`,
      onEnter: () => hooks.onEnter,
      onLeave: () => hooks.onLeave,
      onStay: () => hooks.onStay,
    })),
    { name: "refused", path: "/refused", canActivate: () => () => false },
    {
      name: "throwing",
      path: "/throwing",
      canActivate: () => () => {
        throw new Error("guard boom");
      },
    },
    {
      name: "pending",
      path: "/pending",
      canActivate: () => () => new Promise<boolean>(() => {}),
    },
  ];

  const router = createRouter(routes, { defaultRoute: "home" });

  router.usePlugin(lifecyclePluginFactory());

  return router;
}

export interface HandedSignal {
  readonly hook: "onEnter" | "onStay" | "onLeave" | "onNavigate";
  /** The route whose definition carries the hook. */
  readonly route: string;
  /** Index of the commit the hook ran for, in `commits`. */
  readonly commit: number;
  readonly signal: AbortSignal;
}

/**
 * The {@link createAttemptRouter} routes, with `?q` declared on the simple
 * ones and all four hooks on each recording the signal they are handed
 * (#2692). `commits` is core's commit stream: subscribed before the plugin is
 * installed, it records a commit before that commit's hooks run.
 */
export function createSignalRouter(): {
  router: Router;
  handed: HandedSignal[];
  commits: string[];
} {
  const handed: HandedSignal[] = [];
  const commits: string[] = [];
  const record =
    (hook: HandedSignal["hook"], route: string): LifecycleHookFactory =>
    () =>
    (_toState, _fromState, signal) => {
      handed.push({ hook, route, commit: commits.length - 1, signal });
    };
  const routes: Route[] = [
    ...["home", "about", "contact"].map((name) => ({
      name,
      path: name === "home" ? "/?q" : `/${name}?q`,
      onEnter: record("onEnter", name),
      onStay: record("onStay", name),
      onLeave: record("onLeave", name),
      onNavigate: record("onNavigate", name),
    })),
    { name: "refused", path: "/refused", canActivate: () => () => false },
    {
      name: "throwing",
      path: "/throwing",
      canActivate: () => () => {
        throw new Error("guard boom");
      },
    },
    {
      name: "pending",
      path: "/pending",
      canActivate: () => () => new Promise<boolean>(() => {}),
    },
  ];

  const router = createRouter(routes, { defaultRoute: "home" });

  router.subscribe(({ route }) => {
    commits.push(route.name);
  });
  router.usePlugin(lifecyclePluginFactory());

  return { router, handed, commits };
}

/** Starts the navigation a {@link SignalAttempt} names. */
export function navigateBy(
  router: Router,
  attempt: SignalAttempt,
): Promise<State> {
  const current = router.getState();

  if (current === undefined) {
    throw new Error("navigateBy needs a started router");
  }

  switch (attempt.kind) {
    case "go": {
      return router.navigate(attempt.to);
    }
    case "stay": {
      return router.navigate(current.name, {}, { q: attempt.q });
    }
    case "reload": {
      return router.navigate(current.name, current.params, current.search, {
        reload: true,
      });
    }
    default: {
      return router.navigate(attempt.kind);
    }
  }
}

/**
 * Creates a router with lifecycle hooks that record call order.
 * Returns the router and the shared call order array.
 */
export function createOrderTrackingRouter(): {
  router: Router;
  callOrder: string[];
} {
  const callOrder: string[] = [];

  const routes: Route[] = [
    {
      name: "home",
      path: "/",
      onEnter: () => () => {
        callOrder.push("onEnter:home");
      },
      onLeave: () => () => {
        callOrder.push("onLeave:home");
      },
    },
    {
      name: "about",
      path: "/about",
      onEnter: () => () => {
        callOrder.push("onEnter:about");
      },
      onLeave: () => () => {
        callOrder.push("onLeave:about");
      },
    },
    {
      name: "contact",
      path: "/contact",
      onEnter: () => () => {
        callOrder.push("onEnter:contact");
      },
      onLeave: () => () => {
        callOrder.push("onLeave:contact");
      },
    },
  ];

  const router = createRouter(routes, { defaultRoute: "home" });

  router.usePlugin(lifecyclePluginFactory());

  return { router, callOrder };
}
