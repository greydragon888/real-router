import {
  createRouter,
  errorCodes,
  RouterError,
  UNKNOWN_ROUTE,
} from "@real-router/core";
import { getRoutesApi } from "@real-router/core/api";
import { describe, afterEach, it, expect, vi } from "vitest";

import { lifecyclePluginFactory } from "../../src";
import { captureAsyncRethrows } from "../helpers";

import type { LifecycleHook, LifecycleHookFactory } from "../../src";
import type { Route, Router, State } from "@real-router/core";

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
        expect.any(AbortSignal),
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
        expect.any(AbortSignal),
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
        expect.any(AbortSignal),
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

    it("should not fire onLeave on a same-route navigation", async () => {
      const onLeave = vi.fn();
      const onStay = vi.fn();

      router = createRouter(
        [
          { name: "home", path: "/" },
          {
            name: "users",
            path: "/users",
            children: [
              {
                name: "view",
                path: "/:id",
                onLeave: () => onLeave,
                onStay: () => onStay,
              },
            ],
          },
        ],
        { defaultRoute: "home" },
      );
      router.usePlugin(lifecyclePluginFactory());

      await router.start("/users/1");
      await router.navigate("users.view", { id: "2" });

      expect(onStay).toHaveBeenCalledTimes(1);
      expect(onLeave).not.toHaveBeenCalled();

      // Control: leaving the route does run it.
      await router.navigate("home");

      expect(onLeave).toHaveBeenCalledTimes(1);
    });

    it("should not fire onLeave when the plugin is torn down on the route", async () => {
      const onLeave = vi.fn();

      router = createRouter(
        [
          { name: "home", path: "/", onLeave: () => onLeave },
          { name: "about", path: "/about" },
        ],
        { defaultRoute: "home" },
      );
      const unsubscribe = router.usePlugin(lifecyclePluginFactory());

      await router.start("/");
      unsubscribe();

      expect(onLeave).not.toHaveBeenCalled();

      // Control: a plugin installed again runs it on the next departure.
      router.usePlugin(lifecyclePluginFactory());
      await router.navigate("about");

      expect(onLeave).toHaveBeenCalledTimes(1);
    });
  });

  describe("onStay", () => {
    it("should fire onStay when navigating to same route with different params", async () => {
      const onStay = vi.fn();

      router = createRouter(
        [
          { name: "home", path: "/" },
          {
            name: "users",
            path: "/users",
            children: [{ name: "view", path: "/:id", onStay: () => onStay }],
          },
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
        expect.any(AbortSignal),
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
        expect.any(AbortSignal),
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
        expect.any(AbortSignal),
      );
    });

    it("should fire onNavigate on same-route param change (no onStay defined)", async () => {
      const onNavigate = vi.fn();

      router = createRouter(
        [
          { name: "home", path: "/" },
          {
            name: "users",
            path: "/users",
            children: [
              {
                name: "view",
                path: "/:id",
                onNavigate: () => onNavigate,
              },
            ],
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
        expect.any(AbortSignal),
      );
    });

    it("should fire onNavigate for both enter and stay cases", async () => {
      const onNavigate = vi.fn();

      router = createRouter(
        [
          { name: "home", path: "/" },
          {
            name: "users",
            path: "/users",
            children: [
              {
                name: "view",
                path: "/:id",
                onNavigate: () => onNavigate,
              },
            ],
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
            name: "users",
            path: "/users",
            children: [
              {
                name: "view",
                path: "/:id",
                onStay: () => onStay,
                onNavigate: () => onNavigate,
              },
            ],
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
        expect.any(AbortSignal),
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

    it("runs onLeave after the commit, before the target's onEnter and onNavigate (#2691)", async () => {
      const callOrder: string[] = [];

      router = createRouter(
        [
          {
            name: "home",
            path: "/",
            onLeave: (r) => () => {
              callOrder.push(`onLeave, state ${r.getState()?.name}`);
            },
          },
          {
            name: "about",
            path: "/about",
            onEnter: () => () => {
              callOrder.push("onEnter");
            },
            onNavigate: () => () => {
              callOrder.push("onNavigate");
            },
          },
        ],
        { defaultRoute: "home" },
      );
      router.usePlugin(lifecyclePluginFactory());

      await router.start("/");
      await router.navigate("about");

      // The router already holds the target when onLeave runs.
      expect(callOrder).toStrictEqual([
        "onLeave, state about",
        "onEnter",
        "onNavigate",
      ]);
    });

    it("runs onStay before onNavigate on a same-route navigation", async () => {
      const callOrder: string[] = [];

      router = createRouter([
        { name: "home", path: "/" },
        {
          name: "users",
          path: "/users",
          children: [
            {
              name: "view",
              path: "/:id",
              onStay: () => () => {
                callOrder.push("onStay");
              },
              onNavigate: () => () => {
                callOrder.push("onNavigate");
              },
            },
          ],
        },
      ]);
      router.usePlugin(lifecyclePluginFactory());

      await router.start("/users/1");
      callOrder.length = 0;
      await router.navigate("users.view", { id: "2" });

      expect(callOrder).toStrictEqual(["onStay", "onNavigate"]);
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
    // BaseSource / createActiveNameSelector in @real-router/sources). Observe it
    // at the SCHEDULE, not at the process-level `uncaughtException` event — the
    // event count is the host's, not ours, and it is not stable across Node
    // patch releases. See the doc-block on `captureAsyncRethrows`.
    async function withUncaughtCapture(
      run: () => Promise<void>,
    ): Promise<unknown[]> {
      const capture = captureAsyncRethrows();

      try {
        await run();
        await capture.flush();
      } finally {
        capture.restore();
      }

      return capture.errors;
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
            name: "users",
            path: "/users",
            children: [
              {
                name: "view",
                path: "/:id",
                onStay: () => throwingStay,
                onNavigate: () => onNavigate,
              },
            ],
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
    // onLeave shares the success handler with onEnter / onNavigate (#2691).
    it.each<{ shape: string; onLeave: LifecycleHookFactory }>([
      {
        shape: "onLeave throws",
        onLeave: () => () => {
          throw new Error("boomL");
        },
      },
      {
        shape: "the onLeave FACTORY throws",
        onLeave: () => {
          throw new Error("boomL");
        },
      },
    ])(
      "still fires onEnter and onNavigate when $shape",
      async ({ onLeave }) => {
        const onEnter = vi.fn();
        const onNavigate = vi.fn();

        router = createRouter(
          [
            { name: "home", path: "/", onLeave },
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

        const rethrown = await withUncaughtCapture(async () => {
          await router.navigate("about");
        });

        expect(onEnter).toHaveBeenCalledTimes(1);
        expect(onNavigate).toHaveBeenCalledTimes(1);
        expect(rethrown).toStrictEqual([new Error("boomL")]);
      },
    );

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
            name: "users",
            path: "/users",
            children: [
              {
                name: "view",
                path: "/:id",
                onStay: throwingFactory,
                onNavigate: () => onNavigate,
              },
            ],
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

  describe("onLeave runs only for a navigation that commits (#2691)", () => {
    // A navigation that does not commit leaves the user on the route, so the
    // route's cleanup must not have run. `pending`'s canActivate answers only
    // through `pendingGuard.release`; until then the way out is a cancellation.
    // It runs after leave-approve, so `entered` proves a navigation got there.
    const pendingGuard: {
      release: (allowed: boolean) => void;
      entered: number;
    } = { release: () => {}, entered: 0 };

    // Every target carries `targetHook` as its onEnter and onNavigate.
    function editorRoutes(
      onLeave: LifecycleHook,
      targetHook: LifecycleHook,
    ): Route[] {
      const hooks = { onEnter: () => targetHook, onNavigate: () => targetHook };

      pendingGuard.entered = 0;

      return [
        { name: "editor", path: "/editor", onLeave: () => onLeave },
        { name: "about", path: "/about", ...hooks },
        {
          name: "refused",
          path: "/refused",
          canActivate: () => () => false,
          ...hooks,
        },
        {
          name: "throwing",
          path: "/throwing",
          canActivate: () => () => {
            throw new Error("guard boom");
          },
          ...hooks,
        },
        {
          name: "pending",
          path: "/pending",
          canActivate: () => () => {
            pendingGuard.entered += 1;

            return new Promise<boolean>((resolve) => {
              pendingGuard.release = resolve;
            });
          },
          ...hooks,
        },
      ];
    }

    function createEditorRouter(
      onLeave: LifecycleHook,
      targetHook: LifecycleHook = () => {},
    ): Router {
      return createRouter(editorRoutes(onLeave, targetHook), {
        defaultRoute: "editor",
      });
    }

    // What a navigation ended in: the committed route, or the rejection code
    // (the message for an error that is not a RouterError).
    async function settle(navigation: Promise<State>): Promise<string> {
      try {
        const state = await navigation;

        return `committed ${state.name}`;
      } catch (error) {
        return error instanceof RouterError
          ? error.code
          : (error as Error).message;
      }
    }

    it.each<{
      cause: string;
      act: (router: Router) => Promise<string[]>;
      outcomes: string[];
      pendingEntered: number;
    }>([
      {
        cause: "the target's canActivate returns false",
        act: async (r) => [await settle(r.navigate("refused"))],
        outcomes: [errorCodes.CANNOT_ACTIVATE],
        pendingEntered: 0,
      },
      {
        cause: "the target's canActivate throws",
        act: async (r) => [await settle(r.navigate("throwing"))],
        outcomes: [errorCodes.CANNOT_ACTIVATE],
        pendingEntered: 0,
      },
      {
        cause: "its signal aborts while the target's canActivate is pending",
        act: async (r) => {
          const controller = new AbortController();
          const navigation = settle(
            r.navigate("pending", {}, {}, { signal: controller.signal }),
          );

          controller.abort();

          return [await navigation];
        },
        outcomes: [errorCodes.TRANSITION_CANCELLED],
        pendingEntered: 1,
      },
      {
        cause: "a newer navigation, refused in its turn, supersedes it",
        act: (r) =>
          Promise.all([
            settle(r.navigate("pending")),
            settle(r.navigate("refused")),
          ]),
        outcomes: [errorCodes.TRANSITION_CANCELLED, errorCodes.CANNOT_ACTIVATE],
        pendingEntered: 1,
      },
      {
        cause:
          "router.stop() cancels it while the target's canActivate is pending",
        act: async (r) => {
          const navigation = settle(r.navigate("pending"));

          r.stop();
          const outcome = await navigation;

          // Started again for the control departure below.
          await r.start("/editor");

          return [outcome];
        },
        outcomes: [errorCodes.TRANSITION_CANCELLED],
        pendingEntered: 1,
      },
      {
        cause: "the target route is removed while its canActivate is pending",
        act: async (r) => {
          const navigation = settle(r.navigate("pending"));

          getRoutesApi(r).remove("pending");
          pendingGuard.release(true);

          return [await navigation];
        },
        outcomes: [errorCodes.ROUTE_NOT_FOUND],
        pendingEntered: 1,
      },
      {
        cause: "a subscribeLeave listener throws",
        act: async (r) => {
          let refuse = true;

          r.subscribeLeave(() => {
            if (refuse) {
              refuse = false;

              throw new Error("leave refused");
            }
          });

          return [await settle(r.navigate("about"))];
        },
        outcomes: ["leave refused"],
        pendingEntered: 0,
      },
    ])(
      "does not fire onLeave when $cause",
      async ({ act, outcomes, pendingEntered }) => {
        const onLeave = vi.fn();
        const targetHook = vi.fn();

        const routes = editorRoutes(onLeave, targetHook);

        // Every target carries the hooks watched below.
        expect(
          routes
            .filter((route) => typeof route.onEnter === "function")
            .map((route) => route.name),
        ).toStrictEqual(["about", "refused", "throwing", "pending"]);

        router = createRouter(routes, { defaultRoute: "editor" });
        router.usePlugin(lifecyclePluginFactory());
        await router.start("/editor");

        await expect(act(router)).resolves.toStrictEqual(outcomes);
        expect(pendingGuard.entered).toBe(pendingEntered);
        expect(onLeave).not.toHaveBeenCalled();
        expect(targetHook).not.toHaveBeenCalled();

        // Control: the hooks are wired, and the next departure that commits
        // runs them — editor's onLeave, then about's onEnter and onNavigate.
        await router.navigate("about");

        expect(onLeave).toHaveBeenCalledExactlyOnceWith(
          expect.objectContaining({ name: "about" }),
          expect.objectContaining({ name: "editor" }),
          expect.any(AbortSignal),
        );
        expect(targetHook).toHaveBeenCalledTimes(2);
      },
    );

    it("fires onLeave once, for the navigation that commits, when it supersedes a pending one", async () => {
      const onLeave = vi.fn();

      router = createEditorRouter(onLeave);
      router.usePlugin(lifecyclePluginFactory());
      await router.start("/editor");

      const superseded = settle(router.navigate("pending"));

      await router.navigate("about");

      await expect(superseded).resolves.toBe(errorCodes.TRANSITION_CANCELLED);
      expect(onLeave).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ name: "about" }),
        expect.objectContaining({ name: "editor" }),
        expect.any(AbortSignal),
      );
    });

    it("fires onLeave when navigateToNotFound() leaves the route", async () => {
      const onLeave = vi.fn();

      router = createEditorRouter(onLeave);
      router.usePlugin(lifecyclePluginFactory());
      await router.start("/editor");

      router.navigateToNotFound("/missing");

      expect(onLeave).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ name: UNKNOWN_ROUTE }),
        expect.objectContaining({ name: "editor" }),
        expect.any(AbortSignal),
      );
    });

    // `replace()` revalidation commits whatever the active path matches now.
    // onLeave is read from the route's definition at that commit.
    it("fires onLeave when replace() moves the active route and another one takes its path", async () => {
      const onLeave = vi.fn();

      router = createRouter([
        { name: "home", path: "/" },
        { name: "editor", path: "/editor", onLeave: () => onLeave },
      ]);
      router.usePlugin(lifecyclePluginFactory());
      await router.start("/editor");

      getRoutesApi(router).replace([
        { name: "home", path: "/" },
        { name: "editor", path: "/edit", onLeave: () => onLeave },
        { name: "legacy", path: "/editor" },
      ]);

      expect(router.getState()?.name).toBe("legacy");
      expect(onLeave).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ name: "legacy" }),
        expect.objectContaining({ name: "editor" }),
        expect.any(AbortSignal),
      );
    });

    it("does not fire onLeave when replace() drops the active route, even for the route that takes its path", async () => {
      const onLeave = vi.fn();

      router = createRouter([
        { name: "home", path: "/" },
        { name: "editor", path: "/editor", onLeave: () => onLeave },
      ]);
      router.usePlugin(lifecyclePluginFactory());
      await router.start("/editor");

      getRoutesApi(router).replace([
        { name: "home", path: "/" },
        { name: "legacy", path: "/editor" },
      ]);

      expect(router.getState()?.name).toBe("legacy");
      expect(onLeave).not.toHaveBeenCalled();
    });

    // TRANSITION_SUCCESS listeners run in registration order, so a listener
    // ahead of the plugin can take the definition away before onLeave is read.
    it.each<{
      order: string;
      register: (router: Router, listener: () => void) => void;
      calls: number;
    }>([
      {
        order: "before",
        register: (r, listener) => {
          r.subscribe(listener);
          r.usePlugin(lifecyclePluginFactory());
        },
        calls: 0,
      },
      {
        order: "after",
        register: (r, listener) => {
          r.usePlugin(lifecyclePluginFactory());
          r.subscribe(listener);
        },
        calls: 1,
      },
    ])(
      "calls onLeave $calls time(s) when a commit listener registered $order the plugin removes the route just left",
      async ({ register, calls }) => {
        const onLeave = vi.fn();

        router = createRouter([
          { name: "home", path: "/" },
          { name: "wizard", path: "/wizard", onLeave: () => onLeave },
        ]);
        await router.start("/wizard");
        register(router, () => {
          getRoutesApi(router).remove("wizard");
        });

        await router.navigate("home");

        expect(getRoutesApi(router).has("wizard")).toBe(false);
        expect(onLeave).toHaveBeenCalledTimes(calls);
      },
    );
  });

  describe("hooks receive an AbortSignal (#2692)", () => {
    // `pending`'s canActivate answers only through `pendingGuard.release`, so
    // a navigation to it ends in a cancellation; `entered` proves it got there.
    const pendingGuard: {
      release: (allowed: boolean) => void;
      entered: number;
    } = { release: () => {}, entered: 0 };

    interface Handed {
      readonly key: string;
      readonly signal: AbortSignal;
    }

    // Every hook of `list` and `other` records the signal it is handed under
    // `<hook>:<route>`. `list` declares `?q`, so a search change commits on
    // the same route.
    function createSignalRouter(): {
      routes: Route[];
      signalOf: (key: string, nth?: number) => AbortSignal;
      unsubscribe: () => void;
    } {
      const handed: Handed[] = [];
      const record =
        (key: string): LifecycleHookFactory =>
        () =>
        (_toState, _fromState, signal) => {
          handed.push({ key, signal });
        };
      const hooksOf = (
        name: string,
      ): Pick<Route, "onEnter" | "onStay" | "onLeave" | "onNavigate"> => ({
        onEnter: record(`onEnter:${name}`),
        onStay: record(`onStay:${name}`),
        onLeave: record(`onLeave:${name}`),
        onNavigate: record(`onNavigate:${name}`),
      });
      const routes: Route[] = [
        { name: "list", path: "/list?q", ...hooksOf("list") },
        { name: "other", path: "/other", ...hooksOf("other") },
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
          canActivate: () => () => {
            pendingGuard.entered += 1;

            return new Promise<boolean>((resolve) => {
              pendingGuard.release = resolve;
            });
          },
        },
      ];

      pendingGuard.entered = 0;
      router = createRouter(routes, { defaultRoute: "list" });

      return {
        routes,
        signalOf: (key, nth = 0) => {
          const found = handed.filter((entry) => entry.key === key).at(nth);

          if (found === undefined) {
            throw new Error(`no signal handed to ${key} #${nth}`);
          }

          return found.signal;
        },
        unsubscribe: router.usePlugin(lifecyclePluginFactory()),
      };
    }

    it("onNavigate's and onStay's signals abort when the next navigation commits on the same route", async () => {
      const { signalOf } = createSignalRouter();

      await router.start("/list?q=a");
      const entry = signalOf("onNavigate:list");

      expect(entry).toBeInstanceOf(AbortSignal);
      expect(entry.aborted).toBe(false);

      await router.navigate("list", {}, { q: "b" });

      expect(entry.aborted).toBe(true);
      expect(signalOf("onStay:list").aborted).toBe(false);
      expect(signalOf("onNavigate:list", 1).aborted).toBe(false);

      await router.navigate("list", {}, { q: "c" });

      expect(signalOf("onStay:list").aborted).toBe(true);
      expect(signalOf("onNavigate:list", 1).aborted).toBe(true);
    });

    it("onEnter's signal outlives a search change, a reload and a revalidation, and aborts when the route is left", async () => {
      const { routes, signalOf } = createSignalRouter();

      await router.start("/list?q=a");
      const entered = signalOf("onEnter:list");

      expect(entered).toBeInstanceOf(AbortSignal);

      await router.navigate("list", {}, { q: "b" });
      await router.navigate("list", {}, { q: "b" }, { reload: true });
      getRoutesApi(router).replace(routes);

      // Four commits on `list`, the last one the revalidation's.
      expect(signalOf("onNavigate:list", 2).aborted).toBe(true);
      expect(signalOf("onNavigate:list", 3).aborted).toBe(false);
      expect(entered.aborted).toBe(false);

      await router.navigate("other");

      expect(entered.aborted).toBe(true);
      expect(signalOf("onEnter:other").aborted).toBe(false);
    });

    it("onLeave's signal aborts when the next navigation commits", async () => {
      const { signalOf } = createSignalRouter();

      await router.start("/list?q=a");
      await router.navigate("other");
      const leaving = signalOf("onLeave:list");

      expect(leaving).toBeInstanceOf(AbortSignal);
      expect(leaving.aborted).toBe(false);

      await router.navigate("list", {}, { q: "c" });

      expect(leaving.aborted).toBe(true);
    });

    it("a commit aborts the previous signals before any of its hooks runs", async () => {
      let entered: AbortSignal | undefined;
      let navigated: AbortSignal | undefined;
      // [entered.aborted, navigated.aborted] as each hook found them.
      const seen: Record<string, (boolean | undefined)[]> = {};
      const observe =
        (key: string): LifecycleHookFactory =>
        () =>
        () => {
          seen[key] = [entered?.aborted, navigated?.aborted];
        };

      router = createRouter(
        [
          {
            name: "list",
            path: "/list?q",
            onEnter: () => (_toState, _fromState, signal) => {
              entered = signal;
            },
            onStay: observe("onStay:list"),
            onLeave: observe("onLeave:list"),
            onNavigate: () => (_toState, _fromState, signal) => {
              navigated = signal;
            },
          },
          {
            name: "other",
            path: "/other",
            onEnter: observe("onEnter:other"),
            onNavigate: observe("onNavigate:other"),
          },
        ],
        { defaultRoute: "list" },
      );
      router.usePlugin(lifecyclePluginFactory());

      await router.start("/list?q=a");
      await router.navigate("list", {}, { q: "b" });
      await router.navigate("other");

      expect(seen).toStrictEqual({
        "onStay:list": [false, true],
        "onLeave:list": [true, true],
        "onEnter:other": [true, true],
        "onNavigate:other": [true, true],
      });
    });

    it.each<{
      cause: string;
      act: (router: Router) => Promise<unknown>;
      pendingEntered: number;
    }>([
      {
        cause: "the target's canActivate returns false",
        act: (r) => r.navigate("refused").catch(() => {}),
        pendingEntered: 0,
      },
      {
        cause: "the target's canActivate throws",
        act: (r) => r.navigate("throwing").catch(() => {}),
        pendingEntered: 0,
      },
      {
        cause:
          "its own signal aborts while the target's canActivate is pending",
        act: async (r) => {
          const controller = new AbortController();
          const navigation = r
            .navigate("pending", {}, {}, { signal: controller.signal })
            .catch(() => {});

          controller.abort();
          await navigation;
        },
        pendingEntered: 1,
      },
      {
        cause: "a newer navigation, refused in its turn, supersedes it",
        act: (r) =>
          Promise.all([
            r.navigate("pending").catch(() => {}),
            r.navigate("refused").catch(() => {}),
          ]),
        pendingEntered: 1,
      },
      {
        cause: "it targets the current state",
        act: (r) => r.navigate("list", {}, { q: "a" }).catch(() => {}),
        pendingEntered: 0,
      },
    ])(
      "a navigation that does not commit aborts no signal: $cause",
      async ({ act, pendingEntered }) => {
        const { signalOf } = createSignalRouter();

        await router.start("/list?q=a");
        const live = [signalOf("onEnter:list"), signalOf("onNavigate:list")];

        await act(router);

        expect(pendingGuard.entered).toBe(pendingEntered);
        expect(router.getState()?.search).toStrictEqual({ q: "a" });
        expect(live.map((signal) => signal.aborted)).toStrictEqual([
          false,
          false,
        ]);

        // The control: the signals were live, and a navigation that commits
        // ends them.
        await router.navigate("other");

        expect(live.map((signal) => signal.aborted)).toStrictEqual([
          true,
          true,
        ]);
      },
    );

    it.each<{
      how: string;
      end: (router: Router, unsubscribe: () => void) => void;
    }>([
      {
        how: "router.stop()",
        end: (r) => {
          r.stop();
        },
      },
      {
        how: "router.dispose()",
        end: (r) => {
          r.dispose();
          // dispose() is terminal; the shared afterEach stops a fresh router.
          router = createRouter([{ name: "home", path: "/" }]);
        },
      },
      {
        how: "removing the plugin",
        end: (_r, unsubscribe) => {
          unsubscribe();
        },
      },
    ])("$how aborts every live signal", async ({ end }) => {
      const { signalOf, unsubscribe } = createSignalRouter();

      await router.start("/list?q=a");
      await router.navigate("other");
      const live = [
        signalOf("onLeave:list"),
        signalOf("onEnter:other"),
        signalOf("onNavigate:other"),
      ];

      expect(live.map((signal) => signal.aborted)).toStrictEqual([
        false,
        false,
        false,
      ]);

      end(router, unsubscribe);

      expect(live.map((signal) => signal.aborted)).toStrictEqual([
        true,
        true,
        true,
      ]);
    });

    it("a start() after stop() hands out live signals again", async () => {
      const { signalOf } = createSignalRouter();

      await router.start("/list?q=a");
      router.stop();
      await router.start("/list?q=b");

      expect(signalOf("onEnter:list").aborted).toBe(true);
      expect(signalOf("onEnter:list", 1).aborted).toBe(false);
      expect(signalOf("onNavigate:list", 1).aborted).toBe(false);
    });

    it("a replace() that drops the active route aborts its signals, though its onLeave does not run", async () => {
      const { routes, signalOf } = createSignalRouter();

      await router.start("/list?q=a");
      const live = [signalOf("onEnter:list"), signalOf("onNavigate:list")];

      getRoutesApi(router).replace(
        routes.filter((route) => route.name !== "list"),
      );

      expect(router.getState()?.name).toBe(UNKNOWN_ROUTE);
      expect(() => signalOf("onLeave:list")).toThrow(
        "no signal handed to onLeave:list #0",
      );
      expect(live.map((signal) => signal.aborted)).toStrictEqual([true, true]);
    });

    it("navigateToNotFound() leaves the route, so it aborts the route's signals", async () => {
      const { signalOf } = createSignalRouter();

      await router.start("/list?q=a");
      const live = [signalOf("onEnter:list"), signalOf("onNavigate:list")];

      router.navigateToNotFound("/missing");

      expect(router.getState()?.name).toBe(UNKNOWN_ROUTE);
      expect(signalOf("onLeave:list").aborted).toBe(false);
      expect(live.map((signal) => signal.aborted)).toStrictEqual([true, true]);
    });

    it("a hook that stops the router hands the hooks after it an aborted signal", async () => {
      const handed: AbortSignal[] = [];
      const recordSignal: LifecycleHookFactory =
        () => (_toState, _fromState, signal) => {
          handed.push(signal);
        };

      router = createRouter(
        [
          { name: "home", path: "/", onNavigate: recordSignal },
          {
            name: "stopper",
            path: "/stopper",
            onEnter: (r) => () => {
              r.stop();
            },
            onNavigate: recordSignal,
          },
        ],
        { defaultRoute: "home" },
      );
      router.usePlugin(lifecyclePluginFactory());

      await router.start("/");
      await router.navigate("stopper");

      expect(router.isActive()).toBe(false);
      expect(handed.map((signal) => signal.aborted)).toStrictEqual([
        true,
        true,
      ]);

      // A new run hands out live signals again.
      await router.start("/");

      expect(handed.map((signal) => signal.aborted)).toStrictEqual([
        true,
        true,
        false,
      ]);
    });

    it("an abort listener that stops the router hands the rest of that commit's hooks an aborted signal", async () => {
      const handed: AbortSignal[] = [];

      router = createRouter(
        [
          {
            name: "list",
            path: "/list?q",
            onNavigate: (r) => (_toState, _fromState, signal) => {
              handed.push(signal);
              signal.addEventListener("abort", () => {
                r.stop();
              });
            },
          },
        ],
        { defaultRoute: "list" },
      );
      router.usePlugin(lifecyclePluginFactory());

      await router.start("/list?q=a");
      // The commit aborts the first signal, and its listener stops the router
      // before this commit's own onNavigate runs.
      await router.navigate("list", {}, { q: "b" });

      expect(router.isActive()).toBe(false);
      expect(handed.map((signal) => signal.aborted)).toStrictEqual([
        true,
        true,
      ]);
    });

    it("a hook that removes the plugin hands the hooks after it an aborted signal", async () => {
      const handed: AbortSignal[] = [];
      let unsubscribe = (): void => {};

      router = createRouter(
        [
          { name: "home", path: "/" },
          {
            name: "remover",
            path: "/remover",
            onEnter: () => () => {
              unsubscribe();
            },
            onNavigate: () => (_toState, _fromState, signal) => {
              handed.push(signal);
            },
          },
        ],
        { defaultRoute: "home" },
      );
      unsubscribe = router.usePlugin(lifecyclePluginFactory());

      await router.start("/");
      await router.navigate("remover");

      expect(handed).toHaveLength(1);
      expect(handed[0].aborted).toBe(true);
    });

    it("every abort carries a fresh AbortError", async () => {
      const { signalOf } = createSignalRouter();

      await router.start("/list?q=a");
      await router.navigate("list", {}, { q: "b" });
      await router.navigate("list", {}, { q: "c" });

      const first: unknown = signalOf("onNavigate:list", 0).reason;
      const second: unknown = signalOf("onNavigate:list", 1).reason;

      expect(first).toBeInstanceOf(DOMException);
      expect((first as DOMException).name).toBe("AbortError");
      expect(second).toBeInstanceOf(DOMException);
      expect(second).not.toBe(first);
    });

    it("a commit that runs no hook opens no AbortController", async () => {
      const Native = AbortController;
      let opened = 0;

      vi.stubGlobal(
        "AbortController",
        class extends Native {
          constructor() {
            super();
            opened += 1;
          }
        },
      );

      try {
        router = createRouter(
          [
            { name: "home", path: "/" },
            { name: "about", path: "/about" },
            { name: "list", path: "/list?q", onNavigate: () => () => {} },
          ],
          { defaultRoute: "home" },
        );
        router.usePlugin(lifecyclePluginFactory());

        await router.start("/");
        await router.navigate("about");
        await router.navigate("home");

        expect(opened).toBe(0);

        // The control: a route with a hook opens one per commit.
        await router.navigate("list");
        await router.navigate("list", {}, { q: "x" });

        expect(opened).toBe(2);
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it("an earlier, slower load aborted by the signal cannot land after a later one", async () => {
      const shown: string[] = [];
      const wait = (ms: number, signal: AbortSignal): Promise<void> =>
        new Promise((resolve, reject) => {
          const timer = setTimeout(resolve, ms);

          signal.addEventListener(
            "abort",
            () => {
              clearTimeout(timer);
              reject(signal.reason as Error);
            },
            { once: true },
          );
        });

      router = createRouter(
        [
          {
            name: "list",
            path: "/list?q",
            onNavigate: () => (toState, _fromState, signal) => {
              const query = String(toState.search.q);

              wait(query === "slow" ? 30 : 1, signal).then(
                () => {
                  shown.push(query);
                },
                () => {},
              );
            },
          },
        ],
        { defaultRoute: "list" },
      );
      router.usePlugin(lifecyclePluginFactory());

      await router.start("/list?q=slow");
      await router.navigate("list", {}, { q: "fast" });
      await new Promise((resolve) => {
        setTimeout(resolve, 50);
      });

      expect(shown).toStrictEqual(["fast"]);
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
          {
            name: "users",
            path: "/users",
            children: [{ name: "view", path: "/:id" }],
          },
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
            name: "users",
            path: "/users",
            children: [
              {
                name: "view",
                path: "/:id",
                onStay: factorySpy as LifecycleHookFactory,
              },
            ],
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

      // clear: empties the whole compiled-hook map. #1612 — clear() is a
      // teardown primitive, so the router is stopped first.
      router.stop();
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
