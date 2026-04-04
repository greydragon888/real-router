import { createRouter } from "@real-router/core";
import { describe, afterEach, it, expect, vi } from "vitest";

import { lifecyclePluginFactory } from "../../src";

import type { LifecycleHook } from "../../src";
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
          { name: "home", path: "/", onEnter },
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
          { name: "about", path: "/about", onEnter },
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
          { name: "home", path: "/", onEnter },
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
          { name: "home", path: "/", onLeave },
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
          { name: "about", path: "/about", onLeave },
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

      router = createRouter([{ name: "home", path: "/", onLeave }], {
        defaultRoute: "home",
      });
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
          { name: "users.view", path: "/users/:id", onStay },
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
          { name: "home", path: "/", onStay },
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

      router = createRouter([{ name: "home", path: "/", onStay }], {
        defaultRoute: "home",
      });
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
          { name: "home", path: "/", onLeave },
          { name: "about", path: "/about", onEnter },
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
            onEnter: parentEnter,
            children: [{ name: "view", path: "/:id", onEnter: childEnter }],
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
            onLeave: parentLeave,
            children: [{ name: "view", path: "/:id", onLeave: childLeave }],
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
          { name: "about", path: "/about", onEnter: throwingEnter },
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

  describe("edge cases", () => {
    it("should handle routes without lifecycle hooks", async () => {
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
    });

    it("should handle same-route navigation without onStay hook", async () => {
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
    });

    it("should ignore non-function values in hook fields", async () => {
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
    });
  });
});
