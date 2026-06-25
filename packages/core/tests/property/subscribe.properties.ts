import { fc, test } from "@fast-check/vitest";
import { describe, expect, it, vi } from "vitest";

import { errorCodes } from "@real-router/core";
import { getLifecycleApi } from "@real-router/core/api";

import {
  createFixtureRouter,
  createStartedRouter,
  arbNavigableRoute,
  NUM_RUNS,
} from "./helpers";

import type { State } from "@real-router/core";

interface SubscribePayload {
  route: State;
  previousRoute: State | undefined;
}

function getParamsForRoute(name: string): Record<string, string> {
  if (name === "users.view" || name === "users.edit") {
    return { id: "abc" };
  }

  if (name === "search") {
    return { q: "test", page: "1" };
  }

  return {};
}

describe("subscribe() Event Delivery Properties", () => {
  test.prop([arbNavigableRoute], { numRuns: NUM_RUNS.standard })(
    "route === getState() after navigation",
    async (targetRoute) => {
      fc.pre(targetRoute !== "home");

      const router = await createStartedRouter("/");
      const listener = vi.fn();

      router.subscribe(listener);

      await router.navigate(targetRoute, getParamsForRoute(targetRoute));

      expect(listener).toHaveBeenCalled();

      const { route } = listener.mock.calls[0][0] as SubscribePayload;

      expect(route).toBe(router.getState());

      router.stop();
    },
  );

  test.prop([arbNavigableRoute], { numRuns: NUM_RUNS.standard })(
    "previousRoute === getPreviousState() after navigation",
    async (targetRoute) => {
      fc.pre(targetRoute !== "home");

      const router = await createStartedRouter("/");
      const listener = vi.fn();

      router.subscribe(listener);

      await router.navigate(targetRoute, getParamsForRoute(targetRoute));

      const { previousRoute } = listener.mock.calls[0][0] as SubscribePayload;

      expect(previousRoute).toBe(router.getPreviousState());

      router.stop();
    },
  );

  // FIRE_ON_SUCCESS_ONLY — a subscriber registered before navigation is invoked
  // exactly once for an arbitrary successful navigate (not zero, not duplicated).
  test.prop([arbNavigableRoute], { numRuns: NUM_RUNS.standard })(
    "subscriber called exactly once per successful navigation",
    async (targetRoute) => {
      fc.pre(targetRoute !== "home");

      const router = await createStartedRouter("/");
      const listener = vi.fn();

      router.subscribe(listener);

      await router.navigate(targetRoute, getParamsForRoute(targetRoute));

      expect(listener).toHaveBeenCalledTimes(1);

      router.stop();
    },
  );

  // TYPEOF_GUARD — subscribe() is an always-on invariant guard (no plugin
  // required): any non-function listener throws TypeError synchronously, before
  // it can be stored in the EventEmitter and crash on a later navigation.
  // `fc.anything()` covers the full corruption surface (objects, arrays, null,
  // numbers, symbols, …); `typeof x !== "function"` keeps only the rejected set.
  test.prop([fc.anything().filter((x) => typeof x !== "function")], {
    numRuns: NUM_RUNS.standard,
  })("non-function listener throws TypeError", async (notAFunction) => {
    const router = await createStartedRouter("/");

    expect(() => {
      router.subscribe(notAFunction as never);
    }).toThrow(TypeError);

    router.stop();
  });

  // PAYLOAD_FROZEN — the State delivered to a subscriber is a deeply-frozen
  // immutable snapshot. Empirically (see probe in this PR): `payload.route` and
  // `payload.previousRoute` are frozen, but the enclosing `{route, previousRoute}`
  // envelope is NOT frozen — core freezes the States, not the per-emit wrapper.
  // We pin BOTH facts so a regression in either direction is caught.
  test.prop([arbNavigableRoute], { numRuns: NUM_RUNS.standard })(
    "delivered route is frozen; payload envelope is not",
    async (targetRoute) => {
      fc.pre(targetRoute !== "home");

      const router = await createStartedRouter("/");
      const listener = vi.fn();

      router.subscribe(listener);

      await router.navigate(targetRoute, getParamsForRoute(targetRoute));

      const payload = listener.mock.calls[0][0] as SubscribePayload;

      // route is a frozen State (immutability contract).
      expect(Object.isFrozen(payload.route)).toBe(true);
      // ...deeply: nested params + transition are frozen too.
      expect(Object.isFrozen(payload.route.params)).toBe(true);
      expect(Object.isFrozen(payload.route.transition)).toBe(true);
      // previousRoute (the prior committed State) is likewise frozen.
      expect(payload.previousRoute).toBeDefined();
      expect(Object.isFrozen(payload.previousRoute)).toBe(true);
      // The per-emit envelope object itself is NOT frozen — documented fact,
      // pinned so an accidental freeze (or its loss) is flagged.
      expect(Object.isFrozen(payload)).toBe(false);

      router.stop();
    },
  );

  // NO_FIRE_ON_REJECT (SAME_STATES) — navigating to the route the router is
  // already on rejects with SAME_STATES and emits NO TRANSITION_SUCCESS, so a
  // subscriber registered after the first commit must not fire.
  test.prop([arbNavigableRoute], { numRuns: NUM_RUNS.standard })(
    "no fire on SAME_STATES rejection",
    async (targetRoute) => {
      fc.pre(targetRoute !== "home");

      const router = await createStartedRouter("/");

      // Commit the target first so the second navigate is a same-state no-op.
      await router.navigate(targetRoute, getParamsForRoute(targetRoute));

      const listener = vi.fn();

      router.subscribe(listener);

      await expect(
        router.navigate(targetRoute, getParamsForRoute(targetRoute)),
      ).rejects.toMatchObject({ code: errorCodes.SAME_STATES });

      expect(listener).not.toHaveBeenCalled();

      router.stop();
    },
  );

  // NO_FIRE_ON_REJECT (CANNOT_ACTIVATE) — an activation guard returning false
  // blocks the transition; state never changes, no TRANSITION_SUCCESS is emitted,
  // so the subscriber must not fire. Guard attached per generated target (mirrors
  // guards.properties.ts), generalizing the fixed `admin-protected` route.
  test.prop([arbNavigableRoute], { numRuns: NUM_RUNS.standard })(
    "no fire on CANNOT_ACTIVATE rejection",
    async (targetRoute) => {
      fc.pre(targetRoute !== "home");

      const router = createFixtureRouter();
      const lifecycle = getLifecycleApi(router);

      lifecycle.addActivateGuard(targetRoute, () => () => false);

      await router.start("/");

      const listener = vi.fn();

      router.subscribe(listener);

      await expect(
        router.navigate(targetRoute, getParamsForRoute(targetRoute)),
      ).rejects.toMatchObject({ code: errorCodes.CANNOT_ACTIVATE });

      expect(listener).not.toHaveBeenCalled();

      router.stop();
    },
  );

  // INVOCATION_ORDER — N subscribers fire in registration order on a successful
  // navigation. `mock.invocationCallOrder` is a strictly increasing global
  // sequence; asserting it is monotonically increasing across the listeners in
  // registration order proves FIFO delivery (and that every listener fired once).
  test.prop([fc.integer({ min: 2, max: 5 }), arbNavigableRoute], {
    numRuns: NUM_RUNS.standard,
  })(
    "subscribers fire in registration order",
    async (listenerCount, targetRoute) => {
      fc.pre(targetRoute !== "home");

      const router = await createStartedRouter("/");

      const listeners = Array.from({ length: listenerCount }, () => vi.fn());

      for (const listener of listeners) {
        router.subscribe(listener);
      }

      await router.navigate(targetRoute, getParamsForRoute(targetRoute));

      const orders = listeners.map((listener) => {
        expect(listener).toHaveBeenCalledTimes(1);

        return listener.mock.invocationCallOrder[0];
      });

      // Registration order ⇒ strictly increasing invocation order.
      for (let i = 1; i < orders.length; i++) {
        expect(orders[i]).toBeGreaterThan(orders[i - 1]);
      }

      router.stop();
    },
  );

  // PROMISE_NOT_AWAITED — subscribe is fire-and-forget: a returned Promise from
  // an async listener is NOT awaited, so `await navigate()` resolves BEFORE the
  // listener's deferred body runs. We gate the body behind a manually-controlled
  // Promise (resolved only after navigate settles) — deterministic, no timers,
  // no flake. If core ever awaited the listener, navigate() would deadlock
  // (the body's release is downstream of navigate resolving), failing the test.
  test.prop([arbNavigableRoute], { numRuns: NUM_RUNS.standard })(
    "async listener body runs after navigate() resolves (not awaited)",
    async (targetRoute) => {
      fc.pre(targetRoute !== "home");

      const router = await createStartedRouter("/");

      let bodyRan = false;
      let releaseBody!: () => void;
      const gate = new Promise<void>((resolve) => {
        releaseBody = resolve;
      });

      // Deliberately a Promise-returning listener in a `void` slot — the whole
      // point is to prove core does NOT await it (SubscribeFn returns void).
      // eslint-disable-next-line @typescript-eslint/no-misused-promises -- fire-and-forget async listener under test
      router.subscribe(async () => {
        await gate;
        bodyRan = true;
      });

      await router.navigate(targetRoute, getParamsForRoute(targetRoute));

      // navigate() resolved though the listener's body is still parked on `gate`.
      expect(bodyRan).toBe(false);

      // Release and flush the listener's continuation; body completes only now.
      releaseBody();
      await gate;
      await Promise.resolve();

      expect(bodyRan).toBe(true);

      router.stop();
    },
  );

  it("unsubscribe prevents future calls", async () => {
    const router = await createStartedRouter("/");

    const listener = vi.fn();
    const unsubscribe = router.subscribe(listener);

    unsubscribe();

    await router.navigate("admin.settings");

    expect(listener).not.toHaveBeenCalled();

    router.stop();
  });
});
