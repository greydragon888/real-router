import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { constants, errorCodes, events } from "@real-router/core";
import { getLifecycleApi, getPluginApi } from "@real-router/core/api";

import { createTestRouter, pickRouteIdentity } from "../../../helpers";

import type { Router } from "@real-router/core";
import type { LifecycleApi } from "@real-router/core/api";

let router: Router;
let lifecycle: LifecycleApi;

describe("router.start() - path string scenarios", () => {
  beforeEach(() => {
    router = createTestRouter();
    lifecycle = getLifecycleApi(router);
  });

  afterEach(() => {
    router.stop();
  });

  describe("successful path matching", () => {
    it("should match path and transition to found state", async () => {
      const startListener = vi.fn();
      const transitionSuccessListener = vi.fn();

      getPluginApi(router).addEventListener(events.ROUTER_START, startListener);
      getPluginApi(router).addEventListener(
        events.TRANSITION_SUCCESS,
        transitionSuccessListener,
      );

      const state = await router.start("/users/list");

      expect(router.isActive()).toBe(true);
      expect(startListener).toHaveBeenCalledTimes(1);
      expect(transitionSuccessListener).toHaveBeenCalledTimes(1);
      expect(state).toBeDefined();
      expect(state?.name).toBe("users.list");
      expect(state?.path).toBe("/users/list");

      const currentState = router.getState();

      expect(pickRouteIdentity(currentState)).toStrictEqual(
        pickRouteIdentity(state),
      );
    });

    it("should handle path with query parameters", async () => {
      const transitionSuccessListener = vi.fn();

      getPluginApi(router).addEventListener(
        events.TRANSITION_SUCCESS,
        transitionSuccessListener,
      );

      const state = await router.start("/users/list?page=2&sort=name");

      expect(router.isActive()).toBe(true);
      expect(transitionSuccessListener).toHaveBeenCalledTimes(1);
      expect(state).toBeDefined();
      expect(state?.name).toBe("users.list");

      const currentState = router.getState();

      expect(currentState?.name).toBe("users.list");
    });

    it("should preserve path parameters in matched state", async () => {
      const state = await router.start("/users/view/456");

      expect(state?.params).toStrictEqual({ id: "456" });

      const currentState = router.getState();

      expect(currentState?.params).toStrictEqual({ id: "456" });
    });
  });

  describe("unsuccessful path matching with defaultRoute", () => {
    it("should return error when path matching fails even with defaultRoute", async () => {
      router = createTestRouter({ allowNotFound: false });
      const startListener = vi.fn();
      const transitionErrorListener = vi.fn();

      getPluginApi(router).addEventListener(events.ROUTER_START, startListener);
      getPluginApi(router).addEventListener(
        events.TRANSITION_ERROR,
        transitionErrorListener,
      );

      try {
        await router.start("/invalid/path");

        expect.fail("Should have thrown");
      } catch (error: any) {
        expect(router.isActive()).toBe(false);
        expect(startListener).not.toHaveBeenCalled();
        expect(transitionErrorListener).toHaveBeenCalledTimes(1);
        expect(error).toBeDefined();
        expect(error.code).toBe(errorCodes.ROUTE_NOT_FOUND);
      }
    });

    it("should return error for nonexistent route even with defaultRoute", async () => {
      router = createTestRouter({ allowNotFound: false });
      const startListener = vi.fn();
      const transitionErrorListener = vi.fn();

      getPluginApi(router).addEventListener(events.ROUTER_START, startListener);
      getPluginApi(router).addEventListener(
        events.TRANSITION_ERROR,
        transitionErrorListener,
      );

      try {
        await router.start("/nonexistent/route");

        expect.fail("Should have thrown");
      } catch (error: any) {
        expect(router.isActive()).toBe(false);
        expect(startListener).not.toHaveBeenCalled();
        expect(transitionErrorListener).toHaveBeenCalledTimes(1);
        expect(error).toBeDefined();
        expect(error.code).toBe(errorCodes.ROUTE_NOT_FOUND);
        expect(router.getState()).toBeUndefined();
      }
    });

    it("should handle error when default route navigation fails", async () => {
      // Set invalid default route
      router = createTestRouter({
        defaultRoute: "invalid.default",
        allowNotFound: false,
      });
      const startListener = vi.fn();
      const transitionErrorListener = vi.fn();

      getPluginApi(router).addEventListener(events.ROUTER_START, startListener);
      getPluginApi(router).addEventListener(
        events.TRANSITION_ERROR,
        transitionErrorListener,
      );

      try {
        await router.start("/invalid/path");

        expect.fail("Should have thrown");
      } catch (error: any) {
        expect(router.isActive()).toBe(false);
        expect(startListener).not.toHaveBeenCalled();
        expect(transitionErrorListener).toHaveBeenCalledTimes(1);
        expect(error).toBeDefined();
        expect(error.code).toBe(errorCodes.ROUTE_NOT_FOUND);
      }
    });
  });

  describe("unsuccessful path matching with allowNotFound", () => {
    it("should create not found state when path matching fails and allowNotFound is true", async () => {
      router = createTestRouter({ allowNotFound: true });
      const startListener = vi.fn();

      getPluginApi(router).addEventListener(events.ROUTER_START, startListener);

      await router.start("/invalid/path");

      expect(router.isActive()).toBe(true);
      expect(startListener).toHaveBeenCalled();

      // Verify state is UNKNOWN_ROUTE
      const currentState = router.getState();

      expect(currentState?.name).toBe(constants.UNKNOWN_ROUTE);
      expect(currentState?.path).toBe("/invalid/path");
    });

    it("should successfully transition to not found state", async () => {
      router = createTestRouter({ allowNotFound: true });
      const startListener = vi.fn();
      const transitionSuccessListener = vi.fn();

      getPluginApi(router).addEventListener(events.ROUTER_START, startListener);
      getPluginApi(router).addEventListener(
        events.TRANSITION_SUCCESS,
        transitionSuccessListener,
      );

      const state = await router.start("/some/invalid/path");

      expect(router.isActive()).toBe(true);
      expect(startListener).toHaveBeenCalled();
      expect(transitionSuccessListener).toHaveBeenCalledTimes(1);
      expect(state).toBeDefined();
      expect(state?.name).toBe(constants.UNKNOWN_ROUTE);
      expect(state?.path).toBe("/some/invalid/path");

      const currentState = router.getState();

      expect(currentState?.name).toBe(constants.UNKNOWN_ROUTE);
      expect(currentState?.path).toBe("/some/invalid/path");
    });

    it("should prefer allowNotFound over defaultRoute when both are set", async () => {
      router = createTestRouter({ allowNotFound: true, defaultRoute: "home" });
      const state = await router.start("/invalid/path");

      expect(state?.name).toBe(constants.UNKNOWN_ROUTE);
    });
  });

  describe("allowNotFound with guard errors", () => {
    it("should emit TRANSITION_ERROR only once when guard fails for unknown route", async () => {
      router = createTestRouter({ allowNotFound: true, defaultRoute: "home" });

      const invalidPath = "/non/existent/path";

      lifecycle.addActivateGuard(constants.UNKNOWN_ROUTE, () => () => {
        return Promise.reject(new Error("Guard error"));
      });

      const transitionErrorListener = vi.fn();

      getPluginApi(router).addEventListener(
        events.TRANSITION_ERROR,
        transitionErrorListener,
      );

      try {
        await router.start(invalidPath);
      } catch (error: any) {
        expect(error).toBeDefined();
        expect(error?.code).toBe(errorCodes.CANNOT_ACTIVATE);
        expect(transitionErrorListener).toHaveBeenCalledTimes(1);
      }
    });

    it("should not attempt defaultRoute when navigating to unknown route", async () => {
      router = createTestRouter({ allowNotFound: true, defaultRoute: "home" });

      const invalidPath = "/non/existent/path";
      let pluginCallCount = 0;

      router.usePlugin(() => ({
        onTransitionSuccess: (toState) => {
          pluginCallCount++;

          expect(toState.name).toBe(constants.UNKNOWN_ROUTE); // only UNKNOWN_ROUTE, not defaultRoute
        },
      }));

      const state = await router.start(invalidPath);

      expect(state.name).toBe(constants.UNKNOWN_ROUTE);
      expect(pluginCallCount).toBe(1); // only for UNKNOWN_ROUTE, not defaultRoute
    });

    it("should successfully transition to UNKNOWN_ROUTE when middleware succeeds", async () => {
      router = createTestRouter({ allowNotFound: true, defaultRoute: "home" });

      const invalidPath = "/non/existent/path";

      const state = await router.start(invalidPath);

      expect(state.name).toBe(constants.UNKNOWN_ROUTE);
    });
  });

  describe("path string edge cases", () => {
    // "empty string as path" test removed in Task 6 — start() now requires path

    it("should handle whitespace-only path as invalid route", async () => {
      router = createTestRouter({ allowNotFound: false });

      // Whitespace is truthy, passed to matchPath, returns undefined
      await expect(router.start(" ".repeat(3))).rejects.toMatchObject({
        code: errorCodes.ROUTE_NOT_FOUND,
      });
    });

    it("should handle path with double slashes", async () => {
      router = createTestRouter({ allowNotFound: false });

      // Double slashes are likely not matched by routes
      await expect(router.start("//users//list//")).rejects.toMatchObject({
        code: errorCodes.ROUTE_NOT_FOUND,
      });
    });

    // --- #14: boundary / hostile path inputs to start() ---
    // No unicode route exists in the test fixture, so an unmatched unicode path
    // is exercised under both not-found policies.

    it("rejects a non-ASCII (unicode) path when allowNotFound is false", async () => {
      router = createTestRouter({ allowNotFound: false });

      await expect(router.start("/пользователи/тест")).rejects.toMatchObject({
        code: errorCodes.ROUTE_NOT_FOUND,
      });
    });

    it("routes a non-ASCII (unicode) path to UNKNOWN_ROUTE with the path preserved verbatim when allowNotFound is true", async () => {
      router = createTestRouter({ allowNotFound: true });

      const state = await router.start("/пользователи/тест");

      expect(state.name).toBe(constants.UNKNOWN_ROUTE);
      // The unicode is preserved un-mangled in state.path (no silent corruption).
      expect(state.path).toBe("/пользователи/тест");
      expect(router.isActive()).toBe(true);
    });

    it("matches a percent-encoded path and decodes the param value", async () => {
      router = createTestRouter({ allowNotFound: false });

      // "%D1%82%D0%B5%D1%81%D1%82" is UTF-8 for "тест".
      const state = await router.start("/items/%D1%82%D0%B5%D1%81%D1%82");

      expect(state.name).toBe("items");
      // The param is decoded back to its unicode form...
      expect(state.params).toStrictEqual({ id: "тест" });
      // ...while state.path keeps the encoded representation.
      expect(state.path).toBe("/items/%D1%82%D0%B5%D1%81%D1%82");
    });

    it("rejects a very long unmatched path without crashing", async () => {
      router = createTestRouter({ allowNotFound: false });

      // 10k-char single segment matches no route.
      const longPath = `/${"a".repeat(10_000)}`;

      await expect(router.start(longPath)).rejects.toMatchObject({
        code: errorCodes.ROUTE_NOT_FOUND,
      });
    });

    it("matches a very long param value without crashing (no RangeError)", async () => {
      router = createTestRouter({ allowNotFound: false });

      const longId = "a".repeat(10_000);
      const state = await router.start(`/items/${longId}`);

      expect(state.name).toBe("items");
      expect(state.params).toStrictEqual({ id: longId });
    });

    // FINDING (#14): a NUL byte in the URL is NOT rejected or sanitized — it is
    // silently accepted as a route param value (round-trips into state.params.id
    // as " ", with state.path percent-encoded to "/items/%00"). The matcher
    // treats it as an ordinary segment character. Documented here as current
    // behavior; whether this should be rejected is a separate question.
    it("accepts a NUL byte as a route param value (current behavior, allowNotFound false)", async () => {
      router = createTestRouter({ allowNotFound: false });

      const state = await router.start("/items/\0");

      expect(state.name).toBe("items");
      expect(state.params).toStrictEqual({ id: "\0" });
      expect(state.path).toBe("/items/%00");
      expect(router.isActive()).toBe(true);
    });

    // FINDING (#14): control characters (U+0001, U+0002) are likewise accepted
    // verbatim as a param value (percent-encoded in state.path), not rejected.
    it("accepts control characters as a route param value (current behavior, allowNotFound false)", async () => {
      router = createTestRouter({ allowNotFound: false });

      const state = await router.start("/items/\x01\x02");

      expect(state.name).toBe("items");
      expect(state.params).toStrictEqual({ id: "\x01\x02" });
      expect(state.path).toBe("/items/%01%02");
      expect(router.isActive()).toBe(true);
    });
  });

  describe("callback protection with paths", () => {
    it("should handle allowNotFound option correctly", async () => {
      router = createTestRouter({ allowNotFound: true });

      // Start with non-existent route
      const state = await router.start("/non-existent");

      // Should be called once with success (UNKNOWN_ROUTE state)
      expect(state.name).toBe("@@router/UNKNOWN_ROUTE");
    });

    it("should ensure callback is called exactly once on successful transition", async () => {
      const state = await router.start("/users");

      // Verify single invocation
      expect(state.name).toBe("users");
    });

    it("should ensure callback is called exactly once on route not found error", async () => {
      router = createTestRouter({ allowNotFound: false });

      await expect(router.start("/non-existent")).rejects.toMatchObject({
        code: errorCodes.ROUTE_NOT_FOUND,
      });
    });

    it("should protect callback when using defaultRoute", async () => {
      // Configure default route
      router = createTestRouter({ defaultRoute: "home" });

      // Start without path - should use defaultRoute
      const state = await router.start("/home");

      expect(state.name).toBe("home");
    });
  });

  describe("return value with path strings", () => {
    it("should return state for successful navigation", async () => {
      const validPath = "/users/list";

      // Call start and capture return value
      const state = await router.start(validPath);

      expect(state).toBeDefined();
      expect(state?.name).toBe("users.list");
    });

    it("should return state after navigation completes", async () => {
      const validPath = "/orders/view/123";

      // Verify start() returns state
      const state = await router.start(validPath);

      // Router should be in correct state
      expect(router.getState()?.name).toBe("orders.view");
      expect(state?.name).toBe("orders.view");
    });

    it("ignores an activate guard on UNKNOWN_ROUTE — navigateToNotFound bypasses the guard pipeline", async () => {
      // FINDING (#13): the original test was named "should throw error when
      // transition fails", added a throwing activate guard on UNKNOWN_ROUTE, and
      // asserted via `try { await start(); expect.fail() } catch (e) { expect(e).toBeDefined() }`.
      // It "passed" only because `expect.fail()`'s own AssertionError was caught by
      // its own catch. In reality the guard NEVER runs: this router defaults to
      // `allowNotFound: true`, so an unmatched path is committed via
      // `navigateToNotFound()`, which bypasses the guard pipeline entirely
      // (see core CLAUDE.md "navigateToNotFound() bypasses both"). start()
      // therefore RESOLVES to UNKNOWN_ROUTE regardless of the guard. (A real
      // guard-blocked start rejection is covered in state-object-scenarios'
      // "emit TRANSITION_ERROR on router start error" block, using a real route.)
      const invalidPath = "/nonexistent/route";

      let guardRan = false;

      lifecycle.addActivateGuard(constants.UNKNOWN_ROUTE, () => () => {
        guardRan = true;

        throw new Error("Blocked");
      });

      const state = await router.start(invalidPath);

      expect(state.name).toBe(constants.UNKNOWN_ROUTE);
      expect(state.path).toBe(invalidPath);
      expect(guardRan).toBe(false);
      expect(router.isActive()).toBe(true);
    });

    it("should return state on successful navigation", async () => {
      const validPath = "/profile/";

      const state = await router.start(validPath);

      expect(state).toBeDefined();
      expect(state?.name).toBe("profile.me");
    });
  });
});
