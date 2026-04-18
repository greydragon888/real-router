import { test } from "@fast-check/vitest";
import { createRouter } from "@real-router/core";
import { vi } from "vitest";

import {
  arbDistinctRouteNamePair,
  arbDistinctIdPair,
  arbSimpleRouteName,
  createHookSpies,
  createLifecycleRouter,
  createOrderTrackingRouter,
  NUM_RUNS,
} from "./helpers";
import { lifecyclePluginFactory } from "../../src";

import type { LifecycleHookFactory } from "../../src";
import type { Route } from "@real-router/core";

// =============================================================================
// Hook Dispatch — onEnter
// =============================================================================

describe("hook dispatch: onEnter fires when a route becomes active", () => {
  test.prop([arbDistinctRouteNamePair], { numRuns: NUM_RUNS.standard })(
    "onEnter fires once for the target route on navigation",
    async ([fromRoute, toRoute]) => {
      const hooks = createHookSpies();
      const router = createLifecycleRouter(hooks);

      await router.start(`/${fromRoute === "home" ? "" : fromRoute}`);
      hooks.onEnter.calls.length = 0;

      await router.navigate(toRoute);

      const enterCalls = hooks.onEnter.calls.filter(
        (c) => c.toName === toRoute,
      );

      expect(enterCalls).toHaveLength(1);

      router.stop();
    },
  );

  test.prop([arbDistinctIdPair], { numRuns: NUM_RUNS.standard })(
    "onEnter does not fire when same route is navigated with different params",
    async ([id1, id2]) => {
      const hooks = createHookSpies();
      const router = createLifecycleRouter(hooks);

      await router.start("/");
      await router.navigate("users.view", { id: id1 });
      hooks.onEnter.calls.length = 0;

      await router.navigate("users.view", { id: id2 });

      expect(hooks.onEnter.calls).toHaveLength(0);

      router.stop();
    },
  );

  test.prop([arbDistinctRouteNamePair], { numRuns: NUM_RUNS.standard })(
    "onEnter receives correct toState and fromState",
    async ([fromRoute, toRoute]) => {
      const hooks = createHookSpies();
      const router = createLifecycleRouter(hooks);

      await router.start(`/${fromRoute === "home" ? "" : fromRoute}`);
      hooks.onEnter.calls.length = 0;

      await router.navigate(toRoute);

      const enterCall = hooks.onEnter.calls.find((c) => c.toName === toRoute);

      expect(enterCall).toBeDefined();
      expect(enterCall!.toName).toBe(toRoute);
      expect(enterCall!.fromName).toBe(fromRoute);

      router.stop();
    },
  );
});

// =============================================================================
// Hook Dispatch — onLeave
// =============================================================================

describe("hook dispatch: onLeave fires when a route becomes inactive", () => {
  test.prop([arbDistinctRouteNamePair], { numRuns: NUM_RUNS.standard })(
    "onLeave fires once for the source route on navigation",
    async ([fromRoute, toRoute]) => {
      const hooks = createHookSpies();
      const router = createLifecycleRouter(hooks);

      await router.start(`/${fromRoute === "home" ? "" : fromRoute}`);
      hooks.onLeave.calls.length = 0;

      await router.navigate(toRoute);

      const leaveCalls = hooks.onLeave.calls.filter(
        (c) => c.fromName === fromRoute,
      );

      expect(leaveCalls).toHaveLength(1);

      router.stop();
    },
  );

  test.prop([arbSimpleRouteName], { numRuns: NUM_RUNS.standard })(
    "onLeave does not fire on initial start",
    async (routeName) => {
      const hooks = createHookSpies();
      const router = createLifecycleRouter(hooks);

      await router.start(`/${routeName === "home" ? "" : routeName}`);

      expect(hooks.onLeave.calls).toHaveLength(0);

      router.stop();
    },
  );

  test.prop([arbDistinctRouteNamePair], { numRuns: NUM_RUNS.standard })(
    "onLeave receives correct fromState",
    async ([fromRoute, toRoute]) => {
      const hooks = createHookSpies();
      const router = createLifecycleRouter(hooks);

      await router.start(`/${fromRoute === "home" ? "" : fromRoute}`);
      hooks.onLeave.calls.length = 0;

      await router.navigate(toRoute);

      const leaveCall = hooks.onLeave.calls.find(
        (c) => c.fromName === fromRoute,
      );

      expect(leaveCall).toBeDefined();
      expect(leaveCall!.fromName).toBe(fromRoute);

      router.stop();
    },
  );
});

// =============================================================================
// Hook Dispatch — onStay
// =============================================================================

describe("hook dispatch: onStay fires when params change on same route", () => {
  test.prop([arbDistinctIdPair], { numRuns: NUM_RUNS.standard })(
    "onStay fires once when same route navigated with different params",
    async ([id1, id2]) => {
      const hooks = createHookSpies();
      const router = createLifecycleRouter(hooks);

      await router.start("/");
      await router.navigate("users.view", { id: id1 });
      hooks.onStay.calls.length = 0;

      await router.navigate("users.view", { id: id2 });

      expect(hooks.onStay.calls).toHaveLength(1);
      expect(hooks.onStay.calls[0].toName).toBe("users.view");

      router.stop();
    },
  );

  test.prop([arbDistinctRouteNamePair], { numRuns: NUM_RUNS.standard })(
    "onStay does not fire when route changes",
    async ([fromRoute, toRoute]) => {
      const hooks = createHookSpies();
      const router = createLifecycleRouter(hooks);

      await router.start(`/${fromRoute === "home" ? "" : fromRoute}`);
      hooks.onStay.calls.length = 0;

      await router.navigate(toRoute);

      expect(hooks.onStay.calls).toHaveLength(0);

      router.stop();
    },
  );
});

// =============================================================================
// Hook Ordering: onLeave before onEnter
// =============================================================================

describe("hook ordering: onLeave fires before onEnter", () => {
  test.prop([arbDistinctRouteNamePair], { numRuns: NUM_RUNS.standard })(
    "onLeave precedes onEnter in call order",
    async ([fromRoute, toRoute]) => {
      const { router, callOrder } = createOrderTrackingRouter();

      await router.start(`/${fromRoute === "home" ? "" : fromRoute}`);
      callOrder.length = 0;

      await router.navigate(toRoute);

      const leaveIdx = callOrder.findIndex((c) =>
        c.startsWith(`onLeave:${fromRoute}`),
      );
      const enterIdx = callOrder.findIndex((c) =>
        c.startsWith(`onEnter:${toRoute}`),
      );

      expect(leaveIdx).toBeGreaterThanOrEqual(0);
      expect(enterIdx).toBeGreaterThanOrEqual(0);
      expect(leaveIdx).toBeLessThan(enterIdx);

      router.stop();
    },
  );
});

// =============================================================================
// Teardown: removes all hooks
// =============================================================================

describe("teardown: removes all hooks", () => {
  test.prop([arbDistinctRouteNamePair], { numRuns: NUM_RUNS.standard })(
    "no hooks fire after unsubscribe",
    async ([fromRoute, toRoute]) => {
      const hooks = createHookSpies();
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
      ];

      const router = createRouter(routes, { defaultRoute: "home" });
      const unsubscribe = router.usePlugin(lifecyclePluginFactory());

      await router.start(`/${fromRoute === "home" ? "" : fromRoute}`);

      unsubscribe();

      // Clear calls after unsubscribe
      hooks.onEnter.calls.length = 0;
      hooks.onLeave.calls.length = 0;
      hooks.onStay.calls.length = 0;

      await router.navigate(toRoute);

      expect(hooks.onEnter.calls).toHaveLength(0);
      expect(hooks.onLeave.calls).toHaveLength(0);
      expect(hooks.onStay.calls).toHaveLength(0);

      router.stop();
    },
  );
});

// =============================================================================
// Mutual Exclusion: onEnter XOR onStay
// =============================================================================

describe("mutual exclusion: exactly one of onEnter/onStay fires per transition", () => {
  test.prop([arbDistinctRouteNamePair], { numRuns: NUM_RUNS.standard })(
    "onEnter fires and onStay does not on route change",
    async ([fromRoute, toRoute]) => {
      const hooks = createHookSpies();
      const router = createLifecycleRouter(hooks);

      await router.start(`/${fromRoute === "home" ? "" : fromRoute}`);
      hooks.onEnter.calls.length = 0;
      hooks.onStay.calls.length = 0;

      await router.navigate(toRoute);

      const enterCalls = hooks.onEnter.calls.filter(
        (c) => c.toName === toRoute,
      );
      const stayCalls = hooks.onStay.calls;

      // Exactly one onEnter, zero onStay
      expect(enterCalls).toHaveLength(1);
      expect(stayCalls).toHaveLength(0);

      router.stop();
    },
  );

  test.prop([arbDistinctIdPair], { numRuns: NUM_RUNS.standard })(
    "onStay fires and onEnter does not on same-route param change",
    async ([id1, id2]) => {
      const hooks = createHookSpies();
      const router = createLifecycleRouter(hooks);

      await router.start("/");
      await router.navigate("users.view", { id: id1 });
      hooks.onEnter.calls.length = 0;
      hooks.onStay.calls.length = 0;

      await router.navigate("users.view", { id: id2 });

      const enterCalls = hooks.onEnter.calls;
      const stayCalls = hooks.onStay.calls;

      // Exactly one onStay, zero onEnter
      expect(stayCalls).toHaveLength(1);
      expect(enterCalls).toHaveLength(0);

      router.stop();
    },
  );
});

// =============================================================================
// Mutual Exclusion: onLeave does not fire with onStay
// =============================================================================

describe("mutual exclusion: onLeave does not fire on same-route navigation", () => {
  test.prop([arbDistinctIdPair], { numRuns: NUM_RUNS.standard })(
    "onLeave does not fire when onStay fires",
    async ([id1, id2]) => {
      const hooks = createHookSpies();
      const router = createLifecycleRouter(hooks);

      await router.start("/");
      await router.navigate("users.view", { id: id1 });
      hooks.onLeave.calls.length = 0;
      hooks.onStay.calls.length = 0;

      await router.navigate("users.view", { id: id2 });

      expect(hooks.onStay.calls).toHaveLength(1);
      expect(hooks.onLeave.calls).toHaveLength(0);

      router.stop();
    },
  );
});

// =============================================================================
// Hook Dispatch — onNavigate
// =============================================================================

describe("hook dispatch: onNavigate fires on every successful navigation", () => {
  test.prop([arbDistinctRouteNamePair], { numRuns: NUM_RUNS.standard })(
    "onNavigate fires exactly once for the target route on entry",
    async ([fromRoute, toRoute]) => {
      const onNavigate = vi.fn();
      const routes: Route[] = [
        { name: "home", path: "/", onNavigate: () => onNavigate },
        { name: "about", path: "/about", onNavigate: () => onNavigate },
        { name: "contact", path: "/contact", onNavigate: () => onNavigate },
      ];
      const router = createRouter(routes, { defaultRoute: "home" });

      router.usePlugin(lifecyclePluginFactory());

      await router.start(`/${fromRoute === "home" ? "" : fromRoute}`);
      onNavigate.mockClear();

      await router.navigate(toRoute);

      const callsForTarget = onNavigate.mock.calls.filter(
        ([toState]) => toState.name === toRoute,
      );

      expect(callsForTarget).toHaveLength(1);

      router.stop();
    },
  );

  test.prop([arbDistinctIdPair], { numRuns: NUM_RUNS.standard })(
    "onNavigate fires on same-route param change when onStay is absent",
    async ([id1, id2]) => {
      const onNavigate = vi.fn();
      const routes: Route[] = [
        { name: "home", path: "/" },
        {
          name: "users.view",
          path: "/users/:id",
          onNavigate: () => onNavigate,
        },
      ];
      const router = createRouter(routes, { defaultRoute: "home" });

      router.usePlugin(lifecyclePluginFactory());

      await router.start("/");
      await router.navigate("users.view", { id: id1 });
      onNavigate.mockClear();

      await router.navigate("users.view", { id: id2 });

      expect(onNavigate).toHaveBeenCalledTimes(1);

      router.stop();
    },
  );
});

// =============================================================================
// onNavigate Orthogonality — fires alongside onEnter/onStay
// =============================================================================

describe("onNavigate orthogonality: fires alongside specific hooks", () => {
  test.prop([arbDistinctRouteNamePair], { numRuns: NUM_RUNS.standard })(
    "onEnter and onNavigate both fire on entry when both are defined",
    async ([fromRoute, toRoute]) => {
      const onEnter = vi.fn();
      const onNavigate = vi.fn();
      const routes: Route[] = [
        {
          name: "home",
          path: "/",
          onEnter: () => onEnter,
          onNavigate: () => onNavigate,
        },
        {
          name: "about",
          path: "/about",
          onEnter: () => onEnter,
          onNavigate: () => onNavigate,
        },
        {
          name: "contact",
          path: "/contact",
          onEnter: () => onEnter,
          onNavigate: () => onNavigate,
        },
      ];
      const router = createRouter(routes, { defaultRoute: "home" });

      router.usePlugin(lifecyclePluginFactory());

      await router.start(`/${fromRoute === "home" ? "" : fromRoute}`);
      onEnter.mockClear();
      onNavigate.mockClear();

      await router.navigate(toRoute);

      expect(onEnter).toHaveBeenCalledTimes(1);
      expect(onNavigate).toHaveBeenCalledTimes(1);

      router.stop();
    },
  );

  test.prop([arbDistinctIdPair], { numRuns: NUM_RUNS.standard })(
    "onStay and onNavigate both fire on same-route param change when both are defined",
    async ([id1, id2]) => {
      const onStay = vi.fn();
      const onNavigate = vi.fn();
      const routes: Route[] = [
        { name: "home", path: "/" },
        {
          name: "users.view",
          path: "/users/:id",
          onStay: () => onStay,
          onNavigate: () => onNavigate,
        },
      ];
      const router = createRouter(routes, { defaultRoute: "home" });

      router.usePlugin(lifecyclePluginFactory());

      await router.start("/");
      await router.navigate("users.view", { id: id1 });
      onStay.mockClear();
      onNavigate.mockClear();

      await router.navigate("users.view", { id: id2 });

      expect(onStay).toHaveBeenCalledTimes(1);
      expect(onNavigate).toHaveBeenCalledTimes(1);

      router.stop();
    },
  );
});

// =============================================================================
// Compilation Referential Stability
// =============================================================================

describe("compilation: factory called once, hook reused", () => {
  test.prop([arbDistinctIdPair], { numRuns: NUM_RUNS.standard })(
    "hook factory is invoked once; compiled hook is reused across navigations",
    async ([id1, id2]) => {
      const compiledHook = vi.fn();
      const factorySpy = vi.fn(() => compiledHook);

      const router = createRouter(
        [
          { name: "home", path: "/" },
          {
            name: "users.view",
            path: "/users/:id",
            onStay: factorySpy as LifecycleHookFactory,
          },
        ],
        { defaultRoute: "home" },
      );

      router.usePlugin(lifecyclePluginFactory());

      await router.start("/");
      await router.navigate("users.view", { id: id1 });
      await router.navigate("users.view", { id: id2 });

      // Factory called exactly once (on first onStay trigger)
      expect(factorySpy).toHaveBeenCalledTimes(1);
      // Compiled hook called once (id1 → id2 triggers onStay)
      expect(compiledHook).toHaveBeenCalledTimes(1);

      router.stop();
    },
  );
});
