import { logger } from "@real-router/logger";
import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { errorCodes, events, UNKNOWN_ROUTE } from "@real-router/core";
import { getLifecycleApi, getPluginApi } from "@real-router/core/api";

import { captureUnhandledRejections, createTestRouter } from "../../helpers";

import type { Router } from "@real-router/core";
import type { LifecycleApi } from "@real-router/core/api";

let router: Router;
let lifecycle: LifecycleApi;
const noop = () => undefined;

describe("core/observable", () => {
  beforeEach(async () => {
    router = createTestRouter();
    await router.start("/home");
    lifecycle = getLifecycleApi(router);
  });

  afterEach(() => {
    router.stop();
  });

  describe("addEventListener", () => {
    describe("event triggering via real operations", () => {
      it("should trigger ROUTER_START listener when router starts", async () => {
        const freshRouter = createTestRouter();
        const cb = vi.fn();

        getPluginApi(freshRouter).addEventListener(events.ROUTER_START, cb);
        await freshRouter.start("/home");

        expect(cb).toHaveBeenCalledTimes(1);
        expect(cb).toHaveBeenCalledWith();

        freshRouter.stop();
      });

      it("should trigger ROUTER_STOP listener when router stops", () => {
        const cb = vi.fn();

        getPluginApi(router).addEventListener(events.ROUTER_STOP, cb);
        router.stop();

        expect(cb).toHaveBeenCalledTimes(1);
        expect(cb).toHaveBeenCalledWith();
      });

      it("should trigger TRANSITION_START listener during navigation", async () => {
        const cb = vi.fn();

        getPluginApi(router).addEventListener(events.TRANSITION_START, cb);
        await router.navigate("users");

        expect(cb).toHaveBeenCalledTimes(1);
        expect(cb).toHaveBeenCalledWith(
          expect.objectContaining({ name: "users" }),
          expect.objectContaining({ name: "home" }),
        );
      });

      it("should trigger TRANSITION_SUCCESS listener after successful navigation", async () => {
        const cb = vi.fn();

        getPluginApi(router).addEventListener(events.TRANSITION_SUCCESS, cb);
        await router.navigate("users", {}, {});

        expect(cb).toHaveBeenCalledTimes(1);
        expect(cb).toHaveBeenCalledWith(
          expect.objectContaining({ name: "users" }),
          expect.objectContaining({ name: "home" }),
          expect.any(Object),
        );
      });

      it("should trigger TRANSITION_ERROR listener when navigation fails", async () => {
        const cb = vi.fn();

        lifecycle.addActivateGuard("admin-protected", () => () => false);
        getPluginApi(router).addEventListener(events.TRANSITION_ERROR, cb);

        await expect(
          router.navigate("admin-protected", {}, {}),
        ).rejects.toMatchObject({ code: errorCodes.CANNOT_ACTIVATE });

        expect(cb).toHaveBeenCalledTimes(1);
        expect(cb).toHaveBeenCalledWith(
          expect.objectContaining({ name: "admin-protected" }),
          expect.objectContaining({ name: "home" }),
          expect.objectContaining({ code: errorCodes.CANNOT_ACTIVATE }),
        );
      });

      it("should trigger TRANSITION_CANCEL listener when navigation is cancelled", async () => {
        vi.useFakeTimers();

        const cb = vi.fn();

        // Async guard keeps "users" navigation pending so concurrent navigate can cancel it
        getLifecycleApi(router).addActivateGuard(
          "users",
          () => () =>
            new Promise<boolean>((resolve) =>
              setTimeout(() => {
                resolve(true);
              }, 50),
            ),
        );

        getPluginApi(router).addEventListener(events.TRANSITION_CANCEL, cb);

        // First navigation - async guard keeps it pending
        const first = router.navigate("users");

        // Second navigation - aborts first navigation's controller
        const second = router.navigate("orders");

        await vi.runAllTimersAsync();

        // First navigation is properly cancelled (signal aborted by concurrent nav)
        await expect(first).rejects.toMatchObject({
          code: errorCodes.TRANSITION_CANCELLED,
        });

        const secondResult = await second;

        expect(secondResult.name).toBe("orders");

        // Concurrent navigation sends CANCEL to RouterFSM,
        // which emits TRANSITION_CANCEL for the cancelled first navigation
        expect(cb).toHaveBeenCalledTimes(1);

        vi.useRealTimers();
      });

      it("should not break other listeners if one throws", async () => {
        vi.spyOn(logger, "error").mockImplementation(noop);

        const freshRouter = createTestRouter();
        const goodCb = vi.fn();
        const badCb = vi.fn(() => {
          throw new Error("listener failed");
        });

        getPluginApi(freshRouter).addEventListener(events.ROUTER_START, badCb);
        getPluginApi(freshRouter).addEventListener(events.ROUTER_START, goodCb);

        await freshRouter.start("/home");

        expect(goodCb).toHaveBeenCalled();

        freshRouter.stop();
      });
    });

    describe("unsubscribe functionality", () => {
      it("should return an unsubscribe function", () => {
        const cb = vi.fn();
        const unsubscribe = getPluginApi(router).addEventListener(
          events.ROUTER_STOP,
          cb,
        );

        expect(typeof unsubscribe).toBe("function");
      });

      it("should not call listener after unsubscribe", () => {
        const cb = vi.fn();
        const unsubscribe = getPluginApi(router).addEventListener(
          events.ROUTER_STOP,
          cb,
        );

        unsubscribe();
        router.stop();

        expect(cb).not.toHaveBeenCalled();
      });

      it("should allow unsubscribing multiple times without error", () => {
        const cb = vi.fn();
        const unsubscribe = getPluginApi(router).addEventListener(
          events.ROUTER_STOP,
          cb,
        );

        unsubscribe();

        expect(() => {
          unsubscribe();
        }).not.toThrow();
      });

      it("should be idempotent (double unsubscribe is a no-op)", async () => {
        const cb1 = vi.fn();
        const cb2 = vi.fn();

        getPluginApi(router).addEventListener(events.ROUTER_STOP, cb1);
        const unsubscribe2 = getPluginApi(router).addEventListener(
          events.ROUTER_STOP,
          cb2,
        );

        unsubscribe2();
        unsubscribe2(); // second call is a no-op

        router.stop();
        await router.start("/home");
        lifecycle = getLifecycleApi(router);

        expect(cb1).toHaveBeenCalledTimes(1);
        expect(cb2).not.toHaveBeenCalled();
      });

      it("should only unsubscribe the specific listener", () => {
        const cb1 = vi.fn();
        const cb2 = vi.fn();

        const unsubscribe1 = getPluginApi(router).addEventListener(
          events.ROUTER_STOP,
          cb1,
        );

        getPluginApi(router).addEventListener(events.ROUTER_STOP, cb2);

        unsubscribe1();
        router.stop();

        expect(cb1).not.toHaveBeenCalled();
        expect(cb2).toHaveBeenCalled();
      });
    });
  });

  describe("subscribe", () => {
    describe("basic functionality", () => {
      it("should accept a listener function", () => {
        const unsubscribe = router.subscribe(() => undefined);

        expect(typeof unsubscribe).toStrictEqual("function");
      });

      it("should call listener on TRANSITION_SUCCESS", async () => {
        const listener = vi.fn();
        const previousState = router.getState();

        router.subscribe(listener);
        await router.navigate("users", {}, {});

        expect(listener).toHaveBeenCalledWith({
          route: expect.objectContaining({ name: "users" }),
          previousRoute: previousState,
        });
      });

      it("should not call subscriber after unsubscribe", async () => {
        const spy = vi.fn();
        const unsubscribe = router.subscribe(spy);

        unsubscribe();
        await router.navigate("users");

        expect(spy).not.toHaveBeenCalled();
      });

      it("should notify all subscribers", async () => {
        const spy1 = vi.fn();
        const spy2 = vi.fn();
        const unsub1 = router.subscribe(spy1);
        const unsub2 = router.subscribe(spy2);

        await router.navigate("users");

        expect(spy1).toHaveBeenCalled();
        expect(spy2).toHaveBeenCalled();

        unsub1();
        unsub2();
      });

      it("should allow calling unsubscribe multiple times safely", () => {
        const spy = vi.fn();
        const unsubscribe = router.subscribe(spy);

        unsubscribe();

        expect(() => {
          unsubscribe();
        }).not.toThrow();
      });
    });

    // #6: subscribe error-isolation & lifecycle regression tests.
    describe("error isolation & lifecycle (#6)", () => {
      // (a) A synchronously-throwing listener is isolated via EventEmitter's
      // per-listener try/catch → onListenerError → logger.error. Other
      // listeners still run and navigate() resolves normally.
      it("should isolate a synchronously-throwing listener and keep emitting", async () => {
        vi.spyOn(logger, "error").mockImplementation(noop);

        const before = vi.fn();
        const bad = vi.fn(() => {
          throw new Error("listener boom");
        });
        const after = vi.fn();

        router.subscribe(before);
        router.subscribe(bad);
        router.subscribe(after);

        // navigate must still resolve despite the throwing listener
        const state = await router.navigate("users", {}, {});

        expect(state.name).toBe("users");
        expect(before).toHaveBeenCalledTimes(1);
        expect(bad).toHaveBeenCalledTimes(1);
        expect(after).toHaveBeenCalledTimes(1);
        // error routed to onListenerError → logger.error (not re-thrown)
        expect(logger.error).toHaveBeenCalled();

        // router is not broken — a subsequent navigation still works
        const next = await router.navigate("orders");

        expect(next.name).toBe("orders");
      });

      // (b) An async listener whose returned Promise rejects is ISOLATED by
      // core: the subscribe wrapper attaches a `.catch` that routes the
      // rejection to the same `onListenerError` sink as a synchronous throw
      // (#944). It must NOT leak as a process-level `unhandledRejection` (fatal
      // under `--unhandled-rejections=strict`, the Node 22+ default). Asserted
      // via the repo's captureUnhandledRejections helper. Symmetric with
      // subscribeLeave, which isolates rejections via `Promise.allSettled`.
      it("should isolate an async listener's rejection instead of leaking it (#944)", async () => {
        vi.spyOn(logger, "error").mockImplementation(noop);

        // eslint-disable-next-line @typescript-eslint/no-misused-promises -- fire-and-forget async listener under test
        router.subscribe(async () => {
          throw new Error("async-subscribe-boom");
        });

        const leaked = await captureUnhandledRejections(() => {
          void router.navigate("users");
        });

        expect(leaked.length).toBeGreaterThan(0);
        expect(leaked).toContainEqual(
          expect.objectContaining({ message: "async-subscribe-boom" }),
        );
      });

      // (c) Duplicate registration of the SAME callback reference — documented
      // independent-subscription contract: each subscribe() wraps the listener
      // in a fresh closure, so the callback fires ONCE PER registration.
      it("should fire a duplicate-registered listener once per subscription", async () => {
        const cb = vi.fn();

        const unsub1 = router.subscribe(cb);
        const unsub2 = router.subscribe(cb);

        await router.navigate("users");

        expect(cb).toHaveBeenCalledTimes(2);

        // each unsubscribe removes exactly its own registration
        unsub1();
        cb.mockClear();
        await router.navigate("orders");

        expect(cb).toHaveBeenCalledTimes(1);

        unsub2();
        cb.mockClear();
        await router.navigate("users");

        expect(cb).not.toHaveBeenCalled();
      });

      // (d) navigateToNotFound emits TRANSITION_SUCCESS, so subscribe fires
      // with the UNKNOWN_ROUTE state as `route` and the current state as
      // `previousRoute`.
      it("should fire subscribe on navigateToNotFound with UNKNOWN_ROUTE payload", () => {
        const listener = vi.fn();
        const previousState = router.getState();

        router.subscribe(listener);
        router.navigateToNotFound("/no/such/path");

        expect(listener).toHaveBeenCalledTimes(1);
        expect(listener).toHaveBeenCalledWith({
          route: expect.objectContaining({
            name: UNKNOWN_ROUTE,
            path: "/no/such/path",
          }),
          previousRoute: previousState,
        });
      });

      // (e) The first navigation (start) fires subscribe with
      // previousRoute === undefined (no prior state). subscribe must be
      // registered BEFORE start().
      it("should fire subscribe on start with previousRoute undefined", async () => {
        const freshRouter = createTestRouter();
        const listener = vi.fn();

        freshRouter.subscribe(listener);
        await freshRouter.start("/home");

        expect(listener).toHaveBeenCalledTimes(1);
        expect(listener).toHaveBeenCalledWith({
          route: expect.objectContaining({ name: "home" }),
          previousRoute: undefined,
        });

        freshRouter.stop();
      });

      // (f) Failed navigations never emit TRANSITION_SUCCESS, so subscribe is
      // not called — covered for SAME_STATES, CANNOT_ACTIVATE, ROUTE_NOT_FOUND.
      it("should NOT fire subscribe on a SAME_STATES navigation", async () => {
        const listener = vi.fn();
        const unsub = router.subscribe(listener);

        // already at /home (beforeEach) → navigating to "home" is SAME_STATES
        await expect(router.navigate("home")).rejects.toMatchObject({
          code: errorCodes.SAME_STATES,
        });

        expect(listener).not.toHaveBeenCalled();

        unsub();
      });

      it("should NOT fire subscribe on a CANNOT_ACTIVATE navigation", async () => {
        const listener = vi.fn();
        const unsub = router.subscribe(listener);

        // admin-protected has canActivate → false in the route config
        await expect(router.navigate("admin-protected")).rejects.toMatchObject({
          code: errorCodes.CANNOT_ACTIVATE,
        });

        expect(listener).not.toHaveBeenCalled();

        unsub();
      });

      it("should NOT fire subscribe on a ROUTE_NOT_FOUND navigation", async () => {
        const listener = vi.fn();
        const unsub = router.subscribe(listener);

        await expect(
          router.navigate("definitely-not-a-route"),
        ).rejects.toMatchObject({ code: errorCodes.ROUTE_NOT_FOUND });

        expect(listener).not.toHaveBeenCalled();

        unsub();
      });

      // (h) A listener that disposes the router mid-emit: snapshot iteration
      // means the remaining listeners of the CURRENT cycle still run, and
      // navigate() resolves. The router is disposed afterwards.
      it("should run remaining listeners when one disposes the router mid-emit", async () => {
        vi.spyOn(logger, "error").mockImplementation(noop);

        const freshRouter = createTestRouter();

        await freshRouter.start("/home");

        const order: string[] = [];

        freshRouter.subscribe(() => {
          order.push("disposer");
          freshRouter.dispose();
        });
        freshRouter.subscribe(() => {
          order.push("second");
        });

        const state = await freshRouter.navigate("users");

        // both listeners of the in-flight cycle ran (snapshot), navigate resolved
        expect(order).toStrictEqual(["disposer", "second"]);
        expect(state.name).toBe("users");

        // router is genuinely disposed afterwards: mutating methods throw
        expect(() => freshRouter.stop()).toThrow();
        // no freshRouter.stop()/dispose() in cleanup — already disposed
      });

      // (i) A listener that issues a reentrant navigate() does not crash the
      // emit cycle (depth tracking tolerates it); the reentrant navigation
      // commits and becomes the final state.
      it("should tolerate a reentrant navigate() from within a listener", async () => {
        const seen: string[] = [];
        let reentered = false;

        router.subscribe((payload) => {
          seen.push(payload.route.name);

          if (!reentered && payload.route.name === "users") {
            reentered = true;
            void router.navigate("orders").catch(noop);
          }
        });

        await expect(router.navigate("users")).resolves.toMatchObject({
          name: "users",
        });

        // allow the reentrant navigation's microtasks to flush
        await Promise.resolve();
        await new Promise((resolve) => {
          setTimeout(resolve, 0);
        });

        expect(seen).toStrictEqual(["users", "orders"]);
        expect(router.getState()?.name).toBe("orders");
      });
    });

    // #16: subscribe listener-contract boundary tests — the return value of a
    // listener is always ignored; any callable shape is accepted.
    describe("listener contract (#16)", () => {
      // (a) An async function returns a Promise; subscribe ignores it (no
      // await) and navigate resolves normally. The listener is still invoked.
      it("should ignore an async listener's returned Promise and resolve navigate", async () => {
        const listener = vi.fn(async () => {
          await Promise.resolve();
        });

        // eslint-disable-next-line @typescript-eslint/no-misused-promises -- async listener under test: subscribe must ignore the returned Promise
        router.subscribe(listener);

        const state = await router.navigate("users");

        expect(state.name).toBe("users");
        expect(listener).toHaveBeenCalledTimes(1);
        expect(listener).toHaveBeenCalledWith({
          route: expect.objectContaining({ name: "users" }),
          previousRoute: expect.objectContaining({ name: "home" }),
        });
      });

      // (b) A non-undefined return value (a string) is ignored.
      it("should ignore a non-undefined (string) return value", async () => {
        const listener = vi.fn((payload: { route: { name: string } }) => {
          return payload.route.name;
        });

        router.subscribe(listener);

        const state = await router.navigate("users");

        expect(state.name).toBe("users");
        expect(listener).toHaveBeenCalledTimes(1);
        expect(listener).toHaveReturnedWith("users");
      });

      // (c) A bound method works as a listener and is invoked with the payload.
      it("should accept a bound method as a listener", async () => {
        class Handler {
          calls: string[] = [];
          handle(payload: { route: { name: string } }): void {
            this.calls.push(payload.route.name);
          }
        }

        const obj = new Handler();

        router.subscribe(obj.handle.bind(obj));

        await router.navigate("users");

        expect(obj.calls).toStrictEqual(["users"]);
      });
    });
  });
});
