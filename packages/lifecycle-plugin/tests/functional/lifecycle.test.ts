import { createRouter } from "@real-router/core";
import { getRoutesApi } from "@real-router/core/api";
import { describe, afterEach, it, expect, vi } from "vitest";

import { lifecyclePluginFactory } from "../../src";

import type { LifecycleHook, LifecycleHookFactory } from "../../src";
import type { Router } from "@real-router/core";

describe("@real-router/lifecycle-plugin", () => {
  let router: Router;

  afterEach(() => {
    router.stop();
    vi.restoreAllMocks();
  });

  describe("onEnter", () => {
    it("should fire onEnter on initial router.start()", async () => {
      const onEnter = vi.fn();

      router = createRouter(
        [
          { name: "home", path: "/", onEnter: () => onEnter },
          { name: "about", path: "/about" },
        ],
        { defaultRoute: "home" },
      );
      router.usePlugin(lifecyclePluginFactory());

      await router.start("/");

      expect(onEnter).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ name: "home" }),
        undefined,
      );
    });

    it("should fire onEnter when navigating to a route", async () => {
      const onEnter = vi.fn();

      router = createRouter(
        [
          { name: "home", path: "/" },
          { name: "about", path: "/about", onEnter: () => onEnter },
        ],
        { defaultRoute: "home" },
      );
      router.usePlugin(lifecyclePluginFactory());

      await router.start("/");
      await router.navigate("about");

      expect(onEnter).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ name: "about" }),
        expect.objectContaining({ name: "home" }),
      );
    });

    it("should not fire onEnter on the route being left", async () => {
      const onEnter = vi.fn();

      router = createRouter(
        [
          { name: "home", path: "/", onEnter: () => onEnter },
          { name: "about", path: "/about" },
        ],
        { defaultRoute: "home" },
      );
      router.usePlugin(lifecyclePluginFactory());

      await router.start("/");
      onEnter.mockClear();

      await router.navigate("about");

      expect(onEnter).not.toHaveBeenCalled();
    });
  });

  describe("onLeave", () => {
    it("should fire onLeave when navigating away from a route", async () => {
      const onLeave = vi.fn();

      router = createRouter(
        [
          { name: "home", path: "/", onLeave: () => onLeave },
          { name: "about", path: "/about" },
        ],
        { defaultRoute: "home" },
      );
      router.usePlugin(lifecyclePluginFactory());

      await router.start("/");
      await router.navigate("about");

      expect(onLeave).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ name: "about" }),
        expect.objectContaining({ name: "home" }),
      );
    });

    it("should not fire onLeave on the route being entered", async () => {
      const onLeave = vi.fn();

      router = createRouter(
        [
          { name: "home", path: "/" },
          { name: "about", path: "/about", onLeave: () => onLeave },
        ],
        { defaultRoute: "home" },
      );
      router.usePlugin(lifecyclePluginFactory());

      await router.start("/");
      await router.navigate("about");

      expect(onLeave).not.toHaveBeenCalled();
    });

    it("should not fire onLeave on initial router.start()", async () => {
      const onLeave = vi.fn();

      router = createRouter(
        [{ name: "home", path: "/", onLeave: () => onLeave }],
        {
          defaultRoute: "home",
        },
      );
      router.usePlugin(lifecyclePluginFactory());

      await router.start("/");

      expect(onLeave).not.toHaveBeenCalled();
    });
  });

  describe("onStay", () => {
    it("should fire onStay when navigating to same route with different params", async () => {
      const onStay = vi.fn();

      router = createRouter(
        [
          { name: "home", path: "/" },
          { name: "users.view", path: "/users/:id", onStay: () => onStay },
        ],
        { defaultRoute: "home" },
      );
      router.usePlugin(lifecyclePluginFactory());

      await router.start("/");
      await router.navigate("users.view", { id: "1" });
      onStay.mockClear();

      await router.navigate("users.view", { id: "2" });

      expect(onStay).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ name: "users.view", params: { id: "2" } }),
        expect.objectContaining({ name: "users.view", params: { id: "1" } }),
      );
    });

    it("should not fire onStay when navigating to a different route", async () => {
      const onStay = vi.fn();

      router = createRouter(
        [
          { name: "home", path: "/", onStay: () => onStay },
          { name: "about", path: "/about" },
        ],
        { defaultRoute: "home" },
      );
      router.usePlugin(lifecyclePluginFactory());

      await router.start("/");
      await router.navigate("about");

      expect(onStay).not.toHaveBeenCalled();
    });

    it("should not fire onStay on initial router.start()", async () => {
      const onStay = vi.fn();

      router = createRouter(
        [{ name: "home", path: "/", onStay: () => onStay }],
        {
          defaultRoute: "home",
        },
      );
      router.usePlugin(lifecyclePluginFactory());

      await router.start("/");

      expect(onStay).not.toHaveBeenCalled();
    });
  });

  describe("onNavigate", () => {
    it("should fire onNavigate on initial router.start()", async () => {
      const onNavigate = vi.fn();

      router = createRouter(
        [
          { name: "home", path: "/", onNavigate: () => onNavigate },
          { name: "about", path: "/about" },
        ],
        { defaultRoute: "home" },
      );
      router.usePlugin(lifecyclePluginFactory());

      await router.start("/");

      expect(onNavigate).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ name: "home" }),
        undefined,
      );
    });

    it("should fire onNavigate when entering a route (no onEnter defined)", async () => {
      const onNavigate = vi.fn();

      router = createRouter(
        [
          { name: "home", path: "/" },
          { name: "about", path: "/about", onNavigate: () => onNavigate },
        ],
        { defaultRoute: "home" },
      );
      router.usePlugin(lifecyclePluginFactory());

      await router.start("/");
      await router.navigate("about");

      expect(onNavigate).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ name: "about" }),
        expect.objectContaining({ name: "home" }),
      );
    });

    it("should fire onNavigate on same-route param change (no onStay defined)", async () => {
      const onNavigate = vi.fn();

      router = createRouter(
        [
          { name: "home", path: "/" },
          {
            name: "users.view",
            path: "/users/:id",
            onNavigate: () => onNavigate,
          },
        ],
        { defaultRoute: "home" },
      );
      router.usePlugin(lifecyclePluginFactory());

      await router.start("/");
      await router.navigate("users.view", { id: "1" });
      onNavigate.mockClear();

      await router.navigate("users.view", { id: "2" });

      expect(onNavigate).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ name: "users.view", params: { id: "2" } }),
        expect.objectContaining({ name: "users.view", params: { id: "1" } }),
      );
    });

    it("should fire onNavigate for both enter and stay cases", async () => {
      const onNavigate = vi.fn();

      router = createRouter(
        [
          { name: "home", path: "/" },
          {
            name: "users.view",
            path: "/users/:id",
            onNavigate: () => onNavigate,
          },
        ],
        { defaultRoute: "home" },
      );
      router.usePlugin(lifecyclePluginFactory());

      await router.start("/");
      await router.navigate("users.view", { id: "1" });
      await router.navigate("users.view", { id: "2" });
      await router.navigate("home");
      await router.navigate("users.view", { id: "3" });

      expect(onNavigate).toHaveBeenCalledTimes(3);
    });

    it("should not fire onNavigate on the route being left", async () => {
      const onNavigate = vi.fn();

      router = createRouter(
        [
          { name: "home", path: "/", onNavigate: () => onNavigate },
          { name: "about", path: "/about" },
        ],
        { defaultRoute: "home" },
      );
      router.usePlugin(lifecyclePluginFactory());

      await router.start("/");
      onNavigate.mockClear();

      await router.navigate("about");

      expect(onNavigate).not.toHaveBeenCalled();
    });

    it("should fire onEnter and onNavigate together on entry when both are defined", async () => {
      const onEnter = vi.fn();
      const onNavigate = vi.fn();

      router = createRouter(
        [
          { name: "home", path: "/" },
          {
            name: "about",
            path: "/about",
            onEnter: () => onEnter,
            onNavigate: () => onNavigate,
          },
        ],
        { defaultRoute: "home" },
      );
      router.usePlugin(lifecyclePluginFactory());

      await router.start("/");
      await router.navigate("about");

      expect(onEnter).toHaveBeenCalledTimes(1);
      expect(onNavigate).toHaveBeenCalledTimes(1);
    });

    it("should fire onStay and onNavigate together on same-route param change when both are defined", async () => {
      const onStay = vi.fn();
      const onNavigate = vi.fn();

      router = createRouter(
        [
          { name: "home", path: "/" },
          {
            name: "users.view",
            path: "/users/:id",
            onStay: () => onStay,
            onNavigate: () => onNavigate,
          },
        ],
        { defaultRoute: "home" },
      );
      router.usePlugin(lifecyclePluginFactory());

      await router.start("/");
      await router.navigate("users.view", { id: "1" });
      onStay.mockClear();
      onNavigate.mockClear();

      await router.navigate("users.view", { id: "2" });

      expect(onStay).toHaveBeenCalledTimes(1);
      expect(onNavigate).toHaveBeenCalledTimes(1);
    });

    it("should dispatch onEnter/onStay and onNavigate orthogonally (hybrid)", async () => {
      const onEnter = vi.fn();
      const onNavigate = vi.fn();

      router = createRouter(
        [
          { name: "home", path: "/" },
          {
            name: "chat",
            path: "/chat/:roomId",
            onEnter: () => onEnter,
            onNavigate: () => onNavigate,
          },
        ],
        { defaultRoute: "home" },
      );
      router.usePlugin(lifecyclePluginFactory());

      await router.start("/");

      // Entry: both fire (onEnter for setup, onNavigate for shared logic)
      await router.navigate("chat", { roomId: "a" });

      expect(onEnter).toHaveBeenCalledTimes(1);
      expect(onNavigate).toHaveBeenCalledTimes(1);

      // Param change: no onStay defined, only onNavigate fires
      await router.navigate("chat", { roomId: "b" });

      expect(onEnter).toHaveBeenCalledTimes(1);
      expect(onNavigate).toHaveBeenCalledTimes(2);
      expect(onNavigate).toHaveBeenLastCalledWith(
        expect.objectContaining({ name: "chat", params: { roomId: "b" } }),
        expect.objectContaining({ name: "chat", params: { roomId: "a" } }),
      );
    });
  });

  describe("ordering", () => {
    it("should fire onLeave before onEnter", async () => {
      const callOrder: string[] = [];
      const onLeave: LifecycleHook = () => {
        callOrder.push("onLeave");
      };
      const onEnter: LifecycleHook = () => {
        callOrder.push("onEnter");
      };

      router = createRouter(
        [
          { name: "home", path: "/", onLeave: () => onLeave },
          { name: "about", path: "/about", onEnter: () => onEnter },
        ],
        { defaultRoute: "home" },
      );
      router.usePlugin(lifecyclePluginFactory());

      await router.start("/");
      await router.navigate("about");

      expect(callOrder).toStrictEqual(["onLeave", "onEnter"]);
    });
  });

  describe("nested routes", () => {
    it("should fire onEnter only for leaf route, not parent", async () => {
      const parentEnter = vi.fn();
      const childEnter = vi.fn();

      router = createRouter(
        [
          { name: "home", path: "/" },
          {
            name: "users",
            path: "/users",
            onEnter: () => parentEnter,
            children: [
              { name: "view", path: "/:id", onEnter: () => childEnter },
            ],
          },
        ],
        { defaultRoute: "home" },
      );
      router.usePlugin(lifecyclePluginFactory());

      await router.start("/");
      await router.navigate("users.view", { id: "1" });

      expect(parentEnter).not.toHaveBeenCalled();
      expect(childEnter).toHaveBeenCalledTimes(1);
    });

    it("should fire onLeave only for leaf route, not parent", async () => {
      const parentLeave = vi.fn();
      const childLeave = vi.fn();

      router = createRouter(
        [
          { name: "home", path: "/" },
          {
            name: "users",
            path: "/users",
            onLeave: () => parentLeave,
            children: [
              { name: "view", path: "/:id", onLeave: () => childLeave },
            ],
          },
        ],
        { defaultRoute: "home" },
      );
      router.usePlugin(lifecyclePluginFactory());

      await router.start("/");
      await router.navigate("users.view", { id: "1" });
      await router.navigate("home");

      expect(parentLeave).not.toHaveBeenCalled();
      expect(childLeave).toHaveBeenCalledTimes(1);
    });
  });

  describe("intra-plugin hook isolation (#798)", () => {
    // A throwing hook is re-thrown asynchronously via queueMicrotask (mirrors
    // BaseSource / createActiveNameSelector in @real-router/sources). Capture the
    // async re-throw before vitest's default uncaughtException handler fails the
    // test, then restore the previous listeners.
    async function withUncaughtCapture(
      run: () => Promise<void>,
    ): Promise<unknown[]> {
      const rethrown: unknown[] = [];
      const previousListeners = [...process.listeners("uncaughtException")];

      process.removeAllListeners("uncaughtException");
      const captureHandler = (error: unknown): void => {
        rethrown.push(error);
      };

      process.on("uncaughtException", captureHandler);

      try {
        await run();
        // Drain the microtask queue so the queueMicrotask(throw) lands.
        await Promise.resolve();
        await Promise.resolve();
      } finally {
        process.removeListener("uncaughtException", captureHandler);
        for (const listener of previousListeners) {
          process.on("uncaughtException", listener);
        }
      }

      return rethrown;
    }

    it("still fires onNavigate when onEnter throws (orthogonality preserved)", async () => {
      const boom = new Error("boomE");
      const throwingEnter: LifecycleHook = () => {
        throw boom;
      };
      const onNavigate = vi.fn();

      router = createRouter(
        [
          { name: "home", path: "/" },
          {
            name: "about",
            path: "/about",
            onEnter: () => throwingEnter,
            onNavigate: () => onNavigate,
          },
        ],
        { defaultRoute: "home" },
      );
      router.usePlugin(lifecyclePluginFactory());

      await router.start("/");

      const rethrown = await withUncaughtCapture(async () => {
        await router.navigate("about");
      });

      // onNavigate is NOT swallowed by the throwing onEnter (the #798 bug).
      expect(onNavigate).toHaveBeenCalledTimes(1);
      // The developer signal still surfaces — re-thrown asynchronously.
      expect(rethrown).toStrictEqual([boom]);
    });

    it("still fires onNavigate when onStay throws (orthogonality preserved)", async () => {
      const boom = new Error("boomS");
      const throwingStay: LifecycleHook = () => {
        throw boom;
      };
      const onNavigate = vi.fn();

      router = createRouter(
        [
          { name: "home", path: "/" },
          {
            name: "users.view",
            path: "/users/:id",
            onStay: () => throwingStay,
            onNavigate: () => onNavigate,
          },
        ],
        { defaultRoute: "home" },
      );
      router.usePlugin(lifecyclePluginFactory());

      await router.start("/");
      await router.navigate("users.view", { id: "1" });
      onNavigate.mockClear();

      const rethrown = await withUncaughtCapture(async () => {
        await router.navigate("users.view", { id: "2" });
      });

      expect(onNavigate).toHaveBeenCalledTimes(1);
      expect(rethrown).toStrictEqual([boom]);
    });

    it("isolates a throwing onNavigate without aborting the transition", async () => {
      const boom = new Error("boomN");
      const throwingNavigate: LifecycleHook = () => {
        throw boom;
      };

      router = createRouter(
        [
          { name: "home", path: "/" },
          {
            name: "about",
            path: "/about",
            onNavigate: () => throwingNavigate,
          },
        ],
        { defaultRoute: "home" },
      );
      router.usePlugin(lifecyclePluginFactory());

      await router.start("/");

      const rethrown = await withUncaughtCapture(async () => {
        await router.navigate("about");
      });

      // Transition still commits; the error surfaces asynchronously.
      expect(router.getState()?.name).toBe("about");
      expect(rethrown).toStrictEqual([boom]);
    });

    it("re-throws hook errors asynchronously instead of through the event emitter", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const boom = new Error("hook error");
      const throwingEnter: LifecycleHook = () => {
        throw boom;
      };

      router = createRouter(
        [
          { name: "home", path: "/" },
          { name: "about", path: "/about", onEnter: () => throwingEnter },
        ],
        { defaultRoute: "home" },
      );
      router.usePlugin(lifecyclePluginFactory());

      await router.start("/");

      const rethrown = await withUncaughtCapture(async () => {
        await router.navigate("about");
      });

      // Isolation does not cancel the navigation.
      expect(router.getState()?.name).toBe("about");
      // The error surfaces via async re-throw, NOT the core "Error in listener"
      // sink — the plugin now catches the throw before it reaches EventEmitter.
      expect(rethrown).toStrictEqual([boom]);
      expect(errorSpy).not.toHaveBeenCalledWith(
        expect.stringContaining("Error in listener"),
        expect.any(Error),
      );

      errorSpy.mockRestore();
    });

    // #1222 — the compile (factory) throw is one seam earlier than the #798
    // hook-body throw. It must be isolated the same way, else a throwing FACTORY
    // (the common DI-init shape) swallows a sibling onNavigate and re-throws on
    // every navigation (failed compile is not cached).
    it("still fires onNavigate when the onEnter FACTORY throws (#1222)", async () => {
      const boom = new Error("factory boomE");
      const throwingFactory: LifecycleHookFactory = () => {
        throw boom;
      };
      const onNavigate = vi.fn();

      router = createRouter(
        [
          { name: "home", path: "/" },
          {
            name: "about",
            path: "/about",
            onEnter: throwingFactory,
            onNavigate: () => onNavigate,
          },
        ],
        { defaultRoute: "home" },
      );
      router.usePlugin(lifecyclePluginFactory());

      await router.start("/");

      const rethrown = await withUncaughtCapture(async () => {
        await router.navigate("about");
      });

      // Navigation still commits.
      expect(router.getState()?.name).toBe("about");
      // onNavigate is NOT swallowed by the throwing factory.
      expect(onNavigate).toHaveBeenCalledTimes(1);
      // The factory error surfaces via the SAME async channel as a body throw
      // (#798), not the sync "Error in listener" sink — channel unified.
      expect(rethrown).toStrictEqual([boom]);
    });

    it("still fires onNavigate when the onStay FACTORY throws (#1222)", async () => {
      const boom = new Error("factory boomS");
      const throwingFactory: LifecycleHookFactory = () => {
        throw boom;
      };
      const onNavigate = vi.fn();

      router = createRouter(
        [
          { name: "home", path: "/" },
          {
            name: "users.view",
            path: "/users/:id",
            onStay: throwingFactory,
            onNavigate: () => onNavigate,
          },
        ],
        { defaultRoute: "home" },
      );
      router.usePlugin(lifecyclePluginFactory());

      await router.start("/");
      await router.navigate("users.view", { id: "1" });
      onNavigate.mockClear();

      const rethrown = await withUncaughtCapture(async () => {
        await router.navigate("users.view", { id: "2" });
      });

      expect(onNavigate).toHaveBeenCalledTimes(1);
      expect(rethrown).toStrictEqual([boom]);
    });
  });

  describe("onLeave with failing activation guard", () => {
    it("should fire onLeave even when activation guard rejects", async () => {
      const onLeave = vi.fn();
      const onEnter = vi.fn();

      router = createRouter(
        [
          { name: "home", path: "/", onLeave: () => onLeave },
          {
            name: "guarded",
            path: "/guarded",
            onEnter: () => onEnter,
            canActivate: () => () => false,
          },
        ],
        { defaultRoute: "home" },
      );
      router.usePlugin(lifecyclePluginFactory());

      await router.start("/");

      try {
        await router.navigate("guarded");
      } catch {
        // activation guard blocks — CANNOT_ACTIVATE
      }

      expect(onLeave).toHaveBeenCalledTimes(1);
      expect(onEnter).not.toHaveBeenCalled();
      expect(router.getState()?.name).toBe("home");
    });
  });

  describe("edge cases", () => {
    it("should handle routes without lifecycle hooks", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      router = createRouter(
        [
          { name: "home", path: "/" },
          { name: "about", path: "/about" },
        ],
        { defaultRoute: "home" },
      );
      router.usePlugin(lifecyclePluginFactory());

      await router.start("/");
      await router.navigate("about");

      expect(router.getState()?.name).toBe("about");
      expect(errorSpy).not.toHaveBeenCalled();

      errorSpy.mockRestore();
    });

    it("should handle same-route navigation without onStay hook", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      router = createRouter(
        [
          { name: "home", path: "/" },
          { name: "users.view", path: "/users/:id" },
        ],
        { defaultRoute: "home" },
      );
      router.usePlugin(lifecyclePluginFactory());

      await router.start("/");
      await router.navigate("users.view", { id: "1" });
      await router.navigate("users.view", { id: "2" });

      expect(router.getState()?.params).toStrictEqual({ id: "2" });
      expect(errorSpy).not.toHaveBeenCalled();

      errorSpy.mockRestore();
    });

    it("should ignore non-function values in hook fields", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      router = createRouter(
        [
          { name: "home", path: "/" },
          { name: "about", path: "/about", onEnter: "not a function" as never },
        ],
        { defaultRoute: "home" },
      );
      router.usePlugin(lifecyclePluginFactory());

      await router.start("/");
      await router.navigate("about");

      expect(router.getState()?.name).toBe("about");
      expect(errorSpy).not.toHaveBeenCalled();

      errorSpy.mockRestore();
    });
  });

  describe("factory pattern", () => {
    it("should pass router and getDependency to hook factory", async () => {
      const factorySpy = vi.fn(
        (_router: unknown, _getDep: unknown) =>
          (_toState: unknown, _fromState: unknown) => {},
      );

      const depRouter = createRouter(
        [
          {
            name: "home",
            path: "/",
            onEnter: factorySpy,
          },
          { name: "about", path: "/about" },
        ],
        { defaultRoute: "home" },
        { foo: "bar" },
      );

      router = depRouter as Router;
      depRouter.usePlugin(lifecyclePluginFactory());

      await depRouter.start("/");

      expect(factorySpy).toHaveBeenCalledExactlyOnceWith(
        depRouter,
        expect.any(Function),
      );

      const getDep = factorySpy.mock.calls[0][1] as (key: string) => unknown;

      expect(getDep("foo")).toBe("bar");
    });

    it("should cache compiled hook and call factory only once per route+hook", async () => {
      const factorySpy = vi.fn(() => vi.fn());

      router = createRouter(
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
      await router.navigate("users.view", { id: "1" });
      await router.navigate("users.view", { id: "2" });
      await router.navigate("users.view", { id: "3" });

      // Factory called once, compiled hook reused for subsequent navigations
      expect(factorySpy).toHaveBeenCalledTimes(1);
      expect(factorySpy.mock.results[0].value).toHaveBeenCalledTimes(2);
    });
  });

  describe("cache invalidation on replaceRoutes", () => {
    it("should use new onEnter hook after replaceRoutes()", async () => {
      const onEnterV1 = vi.fn();
      const onEnterV2 = vi.fn();

      router = createRouter(
        [
          { name: "home", path: "/", onEnter: () => onEnterV1 },
          { name: "about", path: "/about" },
        ],
        { defaultRoute: "home" },
      );
      router.usePlugin(lifecyclePluginFactory());
      await router.start("/about");

      // Navigate to home: V1 onEnter fires
      await router.navigate("home");

      expect(onEnterV1).toHaveBeenCalledTimes(1);
      expect(onEnterV2).not.toHaveBeenCalled();

      // Replace routes with new onEnter factory
      const routesApi = getRoutesApi(router);

      routesApi.replace([
        { name: "home", path: "/", onEnter: () => onEnterV2 },
        { name: "about", path: "/about" },
      ]);

      // Navigate again: V2 onEnter should fire (cache invalidated)
      await router.navigate("about");
      await router.navigate("home");

      expect(onEnterV1).toHaveBeenCalledTimes(1);
      expect(onEnterV2).toHaveBeenCalledTimes(1);
    });

    it("should use new onLeave hook after replaceRoutes()", async () => {
      const onLeaveV1 = vi.fn();
      const onLeaveV2 = vi.fn();

      router = createRouter(
        [
          { name: "home", path: "/", onLeave: () => onLeaveV1 },
          { name: "about", path: "/about" },
        ],
        { defaultRoute: "home" },
      );
      router.usePlugin(lifecyclePluginFactory());
      await router.start("/");

      // Navigate away from home: V1 onLeave fires
      await router.navigate("about");

      expect(onLeaveV1).toHaveBeenCalledTimes(1);
      expect(onLeaveV2).not.toHaveBeenCalled();

      // Replace routes with new onLeave factory
      const routesApi = getRoutesApi(router);

      routesApi.replace([
        { name: "home", path: "/", onLeave: () => onLeaveV2 },
        { name: "about", path: "/about" },
      ]);

      // Navigate home then away again: V2 onLeave should fire
      await router.navigate("home");
      await router.navigate("about");

      expect(onLeaveV1).toHaveBeenCalledTimes(1);
      expect(onLeaveV2).toHaveBeenCalledTimes(1);
    });
  });

  describe("tree mutation cleanup (TREE_CHANGED)", () => {
    it("cleans compiled hooks on remove/replace/clear without breaking dispatch", async () => {
      const onEnter = vi.fn();

      router = createRouter(
        [
          { name: "home", path: "/" },
          { name: "about", path: "/about", onEnter: () => onEnter },
          { name: "temp", path: "/temp", onEnter: () => vi.fn() },
        ],
        { defaultRoute: "home" },
      );

      const unsubscribe = router.usePlugin(lifecyclePluginFactory());
      const routesApi = getRoutesApi(router);

      await router.start("/");

      // add / update: the no-op fall-through branches of the handler.
      routesApi.add({ name: "added", path: "/added" });
      routesApi.update("home", { defaultParams: { a: "1" } });

      // remove: drops temp's compiled-hook entries (removedSubtree loop).
      routesApi.remove("temp");

      // hooks still dispatch correctly after the churn (regression guard).
      await router.navigate("about");

      expect(onEnter).toHaveBeenCalledTimes(1);

      // replace removing "about"/"added": exercises the replace removal loop.
      routesApi.replace([{ name: "home", path: "/" }]);

      // clear: empties the whole compiled-hook map.
      routesApi.clear();

      // teardown: removes the TREE_CHANGED subscription.
      expect(() => {
        unsubscribe();
      }).not.toThrow();
    });
  });

  describe("hot-swap hooks via routes.update (#797)", () => {
    it("recompiles and fires the new onNavigate factory after update()", async () => {
      const hook1 = vi.fn();
      const hook2 = vi.fn();
      const factory1: LifecycleHookFactory = () => hook1;
      const factory2: LifecycleHookFactory = () => hook2;

      router = createRouter(
        [
          { name: "home", path: "/" },
          { name: "target", path: "/target", onNavigate: factory1 },
        ],
        { defaultRoute: "home" },
      );
      router.usePlugin(lifecyclePluginFactory());
      const routesApi = getRoutesApi(router);

      await router.start("/");
      await router.navigate("target");

      expect(hook1).toHaveBeenCalledTimes(1);
      expect(hook2).not.toHaveBeenCalled();

      // Hot-swap the hook factory — typed precisely via the RouteConfigUpdate
      // augmentation. Before #797 this was silently dropped (factory2 calls: 0).
      routesApi.update("target", { onNavigate: factory2 });

      await router.navigate("home");
      await router.navigate("target");

      // New factory fires; old one is not re-invoked.
      expect(hook2).toHaveBeenCalledTimes(1);
      expect(hook1).toHaveBeenCalledTimes(1);
    });

    it("removes the hook when update sets the factory to null", async () => {
      const hook = vi.fn();
      const factory: LifecycleHookFactory = () => hook;

      router = createRouter(
        [
          { name: "home", path: "/" },
          { name: "target", path: "/target", onNavigate: factory },
        ],
        { defaultRoute: "home" },
      );
      router.usePlugin(lifecyclePluginFactory());
      const routesApi = getRoutesApi(router);

      await router.start("/");
      await router.navigate("target");

      expect(hook).toHaveBeenCalledTimes(1);

      routesApi.update("target", { onNavigate: null });

      await router.navigate("home");
      await router.navigate("target");

      // Hook removed — no further calls.
      expect(hook).toHaveBeenCalledTimes(1);
    });
  });
});
