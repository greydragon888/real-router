import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import {
  createRouter,
  constants,
  events,
  errorCodes,
  getLifecycleApi,
  getPluginApi,
  UNKNOWN_ROUTE,
} from "@real-router/core";

import { createTestRouter } from "../../helpers";

import type { Router } from "@real-router/core";

let router: Router;

describe("router.navigateToNotFound()", () => {
  afterEach(() => {
    router.dispose();
  });

  describe("basic behavior", () => {
    beforeEach(async () => {
      router = createTestRouter({ allowNotFound: true });
      await router.start("/home");
    });

    it("should return a State with UNKNOWN_ROUTE name", () => {
      const state = router.navigateToNotFound();

      expect(state.name).toBe(constants.UNKNOWN_ROUTE);
    });

    it("should set params to empty object", () => {
      const state = router.navigateToNotFound();

      expect(state.params).toStrictEqual({});
    });

    it("should default path from current state", () => {
      const state = router.navigateToNotFound();

      expect(state.path).toBe("/home");
    });

    it("should accept explicit path", () => {
      const state = router.navigateToNotFound("/some/unknown/url");

      expect(state.path).toBe("/some/unknown/url");
    });

    it("should update router state", () => {
      router.navigateToNotFound("/test");

      const current = router.getState();

      expect(current?.name).toBe(constants.UNKNOWN_ROUTE);
      expect(current?.path).toBe("/test");
    });

    it("should be synchronous (returns State, not Promise)", () => {
      const result = router.navigateToNotFound();

      expect(result).not.toBeInstanceOf(Promise);
      expect(result.name).toBe(constants.UNKNOWN_ROUTE);
    });
  });

  describe("transition metadata", () => {
    beforeEach(async () => {
      router = createRouter(
        [
          { name: "home", path: "/" },
          {
            name: "users",
            path: "/users",
            children: [{ name: "profile", path: "/:id" }],
          },
        ],
        { allowNotFound: true },
      );
      await router.start("/");
    });

    it("should include transition.from with previous route name", async () => {
      await router.navigate("users.profile", { id: "123" });

      const state = router.navigateToNotFound();

      expect(state.transition?.from).toBe("users.profile");
    });

    it("should include deactivated segments from previous route", async () => {
      await router.navigate("users.profile", { id: "123" });

      const state = router.navigateToNotFound();

      expect(state.transition?.segments.deactivated).toStrictEqual([
        "users.profile",
        "users",
      ]);
    });

    it("should include activated segments with UNKNOWN_ROUTE", () => {
      const state = router.navigateToNotFound();

      expect(state.transition?.segments.activated).toStrictEqual([
        constants.UNKNOWN_ROUTE,
      ]);
    });

    it("should set intersection to empty string", () => {
      const state = router.navigateToNotFound();

      expect(state.transition?.segments.intersection).toBe("");
    });

    it("should set reason to success", () => {
      const state = router.navigateToNotFound();

      expect(state.transition?.reason).toBe("success");
    });

    it("should set phase to activating", () => {
      const state = router.navigateToNotFound();

      expect(state.transition?.phase).toBe("activating");
    });

    it("should omit from when there is no previous state", async () => {
      const freshRouter = createRouter([{ name: "home", path: "/" }], {
        allowNotFound: true,
      });

      await freshRouter.start("/unknown");

      const state = freshRouter.getState();

      expect(state?.transition).toBeDefined();
      expect(state?.transition?.from).toBeUndefined();

      freshRouter.dispose();
    });

    it("should have deactivated as empty array when no previous state", async () => {
      const freshRouter = createRouter([{ name: "home", path: "/" }], {
        allowNotFound: true,
      });

      await freshRouter.start("/unknown");

      const state = freshRouter.getState();

      expect(state?.transition?.segments.deactivated).toStrictEqual([]);

      freshRouter.dispose();
    });

    it("should deeply freeze transition metadata", () => {
      const state = router.navigateToNotFound();

      expect(Object.isFrozen(state)).toBe(true);
      expect(Object.isFrozen(state.transition)).toBe(true);
      expect(Object.isFrozen(state.transition?.segments)).toBe(true);
      expect(Object.isFrozen(state.transition?.segments.deactivated)).toBe(
        true,
      );
      expect(Object.isFrozen(state.transition?.segments.activated)).toBe(true);
    });
  });

  describe("events", () => {
    beforeEach(async () => {
      router = createTestRouter({ allowNotFound: true });
      await router.start("/home");
    });

    it("should emit TRANSITION_SUCCESS", () => {
      const listener = vi.fn();

      getPluginApi(router).addEventListener(
        events.TRANSITION_SUCCESS,
        listener,
      );

      router.navigateToNotFound();

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it("should pass correct arguments to TRANSITION_SUCCESS listener", () => {
      const listener = vi.fn();

      getPluginApi(router).addEventListener(
        events.TRANSITION_SUCCESS,
        listener,
      );

      const fromState = router.getState();
      const state = router.navigateToNotFound("/test");

      expect(listener).toHaveBeenCalledWith(state, fromState, {
        replace: true,
      });
    });

    it("should notify subscribe listeners", () => {
      const listener = vi.fn();

      router.subscribe(listener);

      const fromState = router.getState();

      router.navigateToNotFound();

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          route: expect.objectContaining({ name: constants.UNKNOWN_ROUTE }),
          previousRoute: fromState,
        }),
      );
    });

    it("should call plugin onTransitionSuccess", () => {
      const onTransitionSuccess = vi.fn();

      router.usePlugin(() => ({ onTransitionSuccess }));

      router.navigateToNotFound();

      expect(onTransitionSuccess).toHaveBeenCalledTimes(1);
    });
  });

  describe("error handling", () => {
    it("should throw ROUTER_NOT_STARTED when router is not active", () => {
      router = createTestRouter();

      expect(() => router.navigateToNotFound()).toThrowError();

      try {
        router.navigateToNotFound();
      } catch (error: unknown) {
        expect((error as { code: string }).code).toBe(
          errorCodes.ROUTER_NOT_STARTED,
        );
      }
    });

    it("should throw ROUTER_DISPOSED after dispose", async () => {
      router = createTestRouter({ allowNotFound: true });
      await router.start("/home");

      router.dispose();

      expect(() => router.navigateToNotFound()).toThrowError();
    });
  });

  describe("concurrent transition cancellation", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it("should cancel in-flight navigation when called during transition", async () => {
      vi.useFakeTimers();

      router = createRouter(
        [
          { name: "home", path: "/" },
          { name: "users", path: "/users" },
        ],
        { allowNotFound: true },
      );
      await router.start("/");

      const lifecycle = getLifecycleApi(router);

      lifecycle.addActivateGuard(
        "users",
        () => () =>
          new Promise<boolean>((resolve) => {
            setTimeout(() => {
              resolve(true);
            }, 100);
          }),
      );

      const navigatePromise = router.navigate("users");

      router.navigateToNotFound("/unknown");

      await vi.runAllTimersAsync();

      await expect(navigatePromise).rejects.toMatchObject({
        code: errorCodes.TRANSITION_CANCELLED,
      });
    });

    it("should set state to UNKNOWN_ROUTE after cancelling transition", async () => {
      vi.useFakeTimers();

      router = createRouter(
        [
          { name: "home", path: "/" },
          { name: "users", path: "/users" },
        ],
        { allowNotFound: true },
      );
      await router.start("/");

      const lifecycle = getLifecycleApi(router);

      lifecycle.addActivateGuard(
        "users",
        () => () =>
          new Promise<boolean>((resolve) => {
            setTimeout(() => {
              resolve(true);
            }, 100);
          }),
      );

      void router.navigate("users");

      const state = router.navigateToNotFound("/unknown");

      await vi.runAllTimersAsync();

      expect(state.name).toBe(constants.UNKNOWN_ROUTE);
      expect(state.path).toBe("/unknown");
      expect(router.getState()?.name).toBe(constants.UNKNOWN_ROUTE);
    });

    it("should emit TRANSITION_CANCEL for the aborted navigation", async () => {
      vi.useFakeTimers();

      router = createRouter(
        [
          { name: "home", path: "/" },
          { name: "users", path: "/users" },
        ],
        { allowNotFound: true },
      );
      await router.start("/");

      const onCancel = vi.fn();

      getPluginApi(router).addEventListener(events.TRANSITION_CANCEL, onCancel);

      const lifecycle = getLifecycleApi(router);

      lifecycle.addActivateGuard(
        "users",
        () => () =>
          new Promise<boolean>((resolve) => {
            setTimeout(() => {
              resolve(true);
            }, 100);
          }),
      );

      void router.navigate("users");

      router.navigateToNotFound("/unknown");

      await vi.runAllTimersAsync();

      expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it("should emit TRANSITION_SUCCESS for navigateToNotFound after cancel", async () => {
      vi.useFakeTimers();

      router = createRouter(
        [
          { name: "home", path: "/" },
          { name: "users", path: "/users" },
        ],
        { allowNotFound: true },
      );
      await router.start("/");

      const onSuccess = vi.fn();

      getPluginApi(router).addEventListener(
        events.TRANSITION_SUCCESS,
        onSuccess,
      );

      const lifecycle = getLifecycleApi(router);

      lifecycle.addActivateGuard(
        "users",
        () => () =>
          new Promise<boolean>((resolve) => {
            setTimeout(() => {
              resolve(true);
            }, 100);
          }),
      );

      void router.navigate("users");

      router.navigateToNotFound("/unknown");

      await vi.runAllTimersAsync();

      expect(onSuccess).toHaveBeenCalledTimes(1);
      expect(onSuccess).toHaveBeenCalledWith(
        expect.objectContaining({ name: constants.UNKNOWN_ROUTE }),
        expect.anything(),
        { replace: true },
      );
    });

    it("should work when no transition is in progress", async () => {
      router = createTestRouter({ allowNotFound: true });
      await router.start("/home");

      const state = router.navigateToNotFound("/test");

      expect(state.name).toBe(constants.UNKNOWN_ROUTE);
    });
  });

  describe("UNKNOWN_ROUTE export", () => {
    it("should export UNKNOWN_ROUTE constant", () => {
      expect(UNKNOWN_ROUTE).toBe("@@router/UNKNOWN_ROUTE");
      expect(UNKNOWN_ROUTE).toBe(constants.UNKNOWN_ROUTE);
    });
  });

  describe("start() integration", () => {
    it("should use navigateToNotFound for unknown paths during start", async () => {
      router = createRouter([{ name: "home", path: "/" }], {
        allowNotFound: true,
      });

      const state = await router.start("/unknown/path");

      expect(state.name).toBe(constants.UNKNOWN_ROUTE);
      expect(state.path).toBe("/unknown/path");
      expect(state.params).toStrictEqual({});
      expect(state.transition).toBeDefined();
      expect(state.transition?.reason).toBe("success");
    });

    it("should include transition metadata from start", async () => {
      router = createRouter([{ name: "home", path: "/" }], {
        allowNotFound: true,
      });

      const state = await router.start("/unknown");

      expect(state.transition?.segments.activated).toStrictEqual([
        constants.UNKNOWN_ROUTE,
      ]);
      expect(state.transition?.segments.deactivated).toStrictEqual([]);
      expect(state.transition?.segments.intersection).toBe("");
    });
  });

  describe("path defaulting", () => {
    it("should default to / when no state exists and no path given", async () => {
      router = createRouter([], { allowNotFound: true });
      await router.start("/unknown");

      const firstState = router.getState();

      expect(firstState?.path).toBe("/unknown");

      const state = router.navigateToNotFound();

      expect(state.path).toBe("/unknown");
    });
  });
});
