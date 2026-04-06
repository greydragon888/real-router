import { fc } from "@fast-check/vitest";
import { createRouter } from "@real-router/core";

import { memoryPluginFactory } from "@real-router/memory-plugin";

import type { Router, Route } from "@real-router/core";

export const NUM_RUNS = {
  standard: 100,
  lifecycle: 50,
  async: 30,
} as const;

const ROUTES: Route[] = [
  { name: "home", path: "/" },
  { name: "users", path: "/users" },
  { name: "user", path: "/users/:id" },
  { name: "settings", path: "/settings" },
];

const ROUTE_NAMES = ROUTES.map((r) => r.name);

export const arbRouteName: fc.Arbitrary<string> = fc.constantFrom(
  ...ROUTE_NAMES,
);

export const arbRouteWithParams: fc.Arbitrary<{
  name: string;
  params: Record<string, string>;
}> = arbRouteName.map((name) => ({
  name,
  params:
    name === "user"
      ? { id: String(fc.sample(fc.integer({ min: 1, max: 100 }), 1)[0]) }
      : {},
}));

export type Action =
  | { type: "navigate"; name: string; params: Record<string, string> }
  | { type: "navigate_replace"; name: string; params: Record<string, string> }
  | { type: "back" }
  | { type: "forward" }
  | { type: "go"; delta: number };

export const arbAction: fc.Arbitrary<Action> = fc.oneof(
  arbRouteWithParams.map(({ name, params }) => ({
    type: "navigate" as const,
    name,
    params,
  })),
  arbRouteWithParams.map(({ name, params }) => ({
    type: "navigate_replace" as const,
    name,
    params,
  })),
  fc.constant({ type: "back" as const }),
  fc.constant({ type: "forward" as const }),
  fc.integer({ min: -3, max: 3 }).map((delta) => ({
    type: "go" as const,
    delta,
  })),
);

export const arbActionSequence: fc.Arbitrary<Action[]> = fc.array(arbAction, {
  minLength: 1,
  maxLength: 15,
});

export const arbMaxHistory: fc.Arbitrary<number> = fc.oneof(
  fc.constant(0),
  fc.integer({ min: 2, max: 10 }),
);

export async function createTestRouter(
  maxHistoryLength: number,
): Promise<Router> {
  const router = createRouter(ROUTES, { defaultRoute: "home" });

  router.usePlugin(memoryPluginFactory({ maxHistoryLength }));
  await router.start("/");

  return router;
}

function settle(): Promise<void> {
  return new Promise<void>((r) => setTimeout(r, 0));
}

export async function executeAction(
  router: Router,
  action: Action,
): Promise<boolean> {
  try {
    switch (action.type) {
      case "navigate": {
        await router.navigate(action.name, action.params);

        return true;
      }
      case "navigate_replace": {
        await router.navigate(action.name, action.params, { replace: true });

        return true;
      }
      case "back": {
        router.back();
        await settle();

        return true;
      }
      case "forward": {
        router.forward();
        await settle();

        return true;
      }
      case "go": {
        router.go(action.delta);
        await settle();

        return true;
      }
    }
  } catch {
    return false;
  }
}
