import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { constants, errorCodes, events } from "@real-router/core";

import { createTestRouter, omitMeta } from "../../../helpers";

import type { Router } from "@real-router/core";

let router: Router;

const noop = () => undefined;

describe("router.start() - arguments validation", () => {
  beforeEach(() => {
    router = createTestRouter();
  });

  afterEach(() => {
    router.stop();
  });

  describe("arguments validation", () => {
    describe("call without arguments", () => {
      it("should handle start without arguments when defaultRoute is present", () => {
        const startListener = vi.fn();
        const transitionSuccessListener = vi.fn();

        router.addEventListener(events.ROUTER_START, startListener);
        router.addEventListener(
          events.TRANSITION_SUCCESS,
          transitionSuccessListener,
        );

        router.start();

        expect(router.isActive()).toBe(true);
        expect(startListener).toHaveBeenCalledTimes(1);
        expect(transitionSuccessListener).toHaveBeenCalledTimes(1);

        const currentState = router.getState();

        expect(currentState).toBeDefined();
        expect(currentState?.name).toBe("home"); // defaultRoute from createTestRouter
      });

      it("should handle start with defaultParams", () => {
        // Test the defaultParams ?? {} branch when defaultParams is defined
        router = createTestRouter({
          defaultRoute: "items",
          defaultParams: { id: "123" },
        });

        router.start();

        expect(router.isActive()).toBe(true);

        const currentState = router.getState();

        expect(currentState).toBeDefined();
        expect(currentState?.name).toBe("items");
        expect(currentState?.params).toStrictEqual({ id: "123" });
        expect(currentState?.path).toBe("/items/123");
      });

      it("should handle start without defaultParams (undefined)", () => {
        // Test navigateToDefault with undefined defaultParams
        // Reset router and only set defaultRoute without defaultParams
        router.stop();
        router = createTestRouter({ defaultRoute: "home" });

        router.start();

        expect(router.isActive()).toBe(true);

        const currentState = router.getState();

        expect(currentState).toBeDefined();
        expect(currentState?.name).toBe("home");
        expect(currentState?.path).toBe("/home");
        // With undefined defaultParams, empty object is used
        expect(currentState?.params).toStrictEqual({});
      });

      it("should handle start when defaultRoute buildState fails", async () => {
        router = createTestRouter({ defaultRoute: "nonexistent-route" });

        try {
          await router.start();

          expect.fail("Should have thrown");
        } catch (error: any) {
          expect(error).toBeDefined();
          expect(error?.code).toBe(errorCodes.ROUTE_NOT_FOUND);
        }

        expect(router.isActive()).toBe(false);
      });
    });

    describe("call with path string", () => {
      it("should handle start with path when defaultRoute is present", async () => {
        const startListener = vi.fn();
        const transitionSuccessListener = vi.fn();

        router.addEventListener(events.ROUTER_START, startListener);
        router.addEventListener(
          events.TRANSITION_SUCCESS,
          transitionSuccessListener,
        );

        await router.start("/home");

        expect(router.isActive()).toBe(true);
        expect(startListener).toHaveBeenCalledTimes(1);
        expect(transitionSuccessListener).toHaveBeenCalledTimes(1);

        const state = router.getState();

        expect(state).toBeDefined();
        expect(state?.name).toBe("home");
      });
    });

    describe("call with path string", () => {
      it("should handle start with valid path", async () => {
        const startListener = vi.fn();
        const transitionSuccessListener = vi.fn();

        router.addEventListener(events.ROUTER_START, startListener);
        router.addEventListener(
          events.TRANSITION_SUCCESS,
          transitionSuccessListener,
        );

        await router.start("/users/list");

        expect(router.isActive()).toBe(true);
        expect(startListener).toHaveBeenCalledTimes(1);
        expect(transitionSuccessListener).toHaveBeenCalledTimes(1);

        const currentState = router.getState();

        expect(currentState).toBeDefined();
        expect(currentState?.name).toBe("users.list");
        expect(currentState?.path).toBe("/users/list");
      });

      it("should not handle start with invalid path when defaultRoute is present", async () => {
        router = createTestRouter({ allowNotFound: false });

        const startListener = vi.fn();
        const transitionErrorListener = vi.fn();

        router.addEventListener(events.ROUTER_START, startListener);
        router.addEventListener(
          events.TRANSITION_ERROR,
          transitionErrorListener,
        );

        try {
          await router.start("/invalid/path");

          expect.fail("Should have thrown");
        } catch (error: any) {
          expect(error).toBeDefined();
          expect(error.code).toBe(errorCodes.ROUTE_NOT_FOUND);
        }

        expect(router.isActive()).toBe(false);
        expect(startListener).not.toHaveBeenCalled();
        expect(transitionErrorListener).toHaveBeenCalledTimes(1);
        expect(router.getState()).toBeUndefined();
      });

      it("should handle start with invalid path when allowNotFound is true", async () => {
        router = createTestRouter({ allowNotFound: true });

        const startListener = vi.fn();
        const transitionSuccessListener = vi.fn();

        router.addEventListener(events.ROUTER_START, startListener);
        router.addEventListener(
          events.TRANSITION_SUCCESS,
          transitionSuccessListener,
        );

        await router.start("/invalid/path");

        expect(router.isActive()).toBe(true);
        expect(startListener).toHaveBeenCalled();
        expect(transitionSuccessListener).toHaveBeenCalledTimes(1);

        const currentState = router.getState();

        expect(currentState).toBeDefined();
        expect(currentState?.name).toBe(constants.UNKNOWN_ROUTE);
        expect(currentState?.params.path).toBe("/invalid/path");
      });
    });

    describe("call with path string", () => {
      it("should handle start with valid path", async () => {
        const startListener = vi.fn();
        const transitionSuccessListener = vi.fn();

        router.addEventListener(events.ROUTER_START, startListener);
        router.addEventListener(
          events.TRANSITION_SUCCESS,
          transitionSuccessListener,
        );

        await router.start("/users/list");

        expect(router.isActive()).toBe(true);
        expect(startListener).toHaveBeenCalledTimes(1);
        expect(transitionSuccessListener).toHaveBeenCalledTimes(1);

        const state = router.getState();

        expect(state).toBeDefined();
        expect(state?.name).toBe("users.list");
        expect(state?.path).toBe("/users/list");
      });

      it("should not handle start with invalid path when defaultRoute is present", async () => {
        router = createTestRouter({ allowNotFound: false });

        const startListener = vi.fn();
        const transitionErrorListener = vi.fn();

        router.addEventListener(events.ROUTER_START, startListener);
        router.addEventListener(
          events.TRANSITION_ERROR,
          transitionErrorListener,
        );

        try {
          await router.start("/invalid/path");

          expect.fail("Should have thrown");
        } catch (error: any) {
          expect(error).toBeDefined();
          expect(error.code).toBe(errorCodes.ROUTE_NOT_FOUND);
        }

        expect(router.isActive()).toBe(false);
        expect(startListener).not.toHaveBeenCalled();
        expect(transitionErrorListener).toHaveBeenCalledTimes(1);
        expect(router.getState()).toBeUndefined();
      });

      it("should not handle start with invalid path when allowNotFound is true", async () => {
        router = createTestRouter({ allowNotFound: true });

        const startListener = vi.fn();
        const transitionSuccessListener = vi.fn();

        router.addEventListener(events.ROUTER_START, startListener);
        router.addEventListener(
          events.TRANSITION_SUCCESS,
          transitionSuccessListener,
        );

        await router.start("/invalid/path");

        expect(router.isActive()).toBe(true);
        expect(startListener).toHaveBeenCalled();
        expect(transitionSuccessListener).toHaveBeenCalledTimes(1);

        const state = router.getState();

        expect(state).toBeDefined();
        expect(state?.name).toBe(constants.UNKNOWN_ROUTE);
        expect(state?.params.path).toBe("/invalid/path");
      });
    });

    describe("call with invalid number of arguments", () => {
      it("should throw error when called with more than 2 arguments", () => {
        expect(() => {
          // @ts-expect-error - testing invalid argument count
          router.start("path", {}, {}, noop);
        }).toThrowError("Invalid number of arguments");
      });

      it("should throw error when called with 3 arguments", () => {
        expect(() => {
          // @ts-expect-error - testing invalid argument count
          router.start("path", noop, "extra");
        }).toThrowError("Invalid number of arguments");
      });
    });
  });

  describe("router state check", () => {
    describe("repeated start of already started router", () => {
      it("should return error when starting already started router", async () => {
        await router.start();

        const startListener = vi.fn();

        router.addEventListener(events.ROUTER_START, startListener);

        try {
          await router.start();

          expect.fail("Should have thrown");
        } catch (error: any) {
          expect(error).toBeDefined();
          expect(error.code).toBe(errorCodes.ROUTER_ALREADY_STARTED);
        }

        expect(router.isActive()).toBe(true);
        expect(startListener).not.toHaveBeenCalled();
      });

      it("should not execute start logic when router is already started", async () => {
        await router.start();

        const transitionStartListener = vi.fn();
        const transitionSuccessListener = vi.fn();

        router.addEventListener(
          events.TRANSITION_START,
          transitionStartListener,
        );
        router.addEventListener(
          events.TRANSITION_SUCCESS,
          transitionSuccessListener,
        );

        try {
          await router.start("/users/list");
        } catch {
          // Expected to throw
        }

        expect(transitionStartListener).not.toHaveBeenCalled();
        expect(transitionSuccessListener).not.toHaveBeenCalled();
      });

      it("should maintain current state when attempting to restart", async () => {
        await router.start("/users/list");
        const initialState = router.getState();

        try {
          await router.start("/orders/pending");

          expect.fail("Should have thrown");
        } catch (error: any) {
          expect(error.code).toBe(errorCodes.ROUTER_ALREADY_STARTED);
        }

        const currentState = router.getState();

        expect(omitMeta(currentState)).toStrictEqual(omitMeta(initialState));
        expect(currentState?.name).toBe("users.list");
      });
    });
  });
});
