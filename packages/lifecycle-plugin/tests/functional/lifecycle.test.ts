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

  describe("error handling", () => {
    it("should let errors from hooks propagate to the event emitter", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const throwingEnter: LifecycleHook = () => {
        throw new Error("hook error");
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
      await router.navigate("about");

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining("Error in listener"),
        expect.any(Error),
      );

      errorSpy.mockRestore();
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
            onEnter: factorySpy as LifecycleHookFactory,
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
});
