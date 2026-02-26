import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import {
  errorCodes,
  events,
  getLifecycleApi,
  getPluginApi,
  RouterError,
} from "@real-router/core";

import { createTestRouter } from "../../../helpers";

import type { LifecycleApi, Router } from "@real-router/core";

let router: Router;
let lifecycle: LifecycleApi;

describe("router.start() - lifecycle events", () => {
  beforeEach(() => {
    router = createTestRouter();
    lifecycle = getLifecycleApi(router);
  });

  afterEach(() => {
    router.stop();
  });

  describe("router lifecycle events", () => {
    describe("ROUTER_START event emission", () => {
      it("should emit ROUTER_START event when starting router", async () => {
        const startListener = vi.fn();

        getPluginApi(router).addEventListener(
          events.ROUTER_START,
          startListener,
        );

        await router.start("/home");

        expect(router.isActive()).toBe(true);
        expect(startListener).toHaveBeenCalledTimes(1);
      });

      // Issue: Two-phase start - ROUTER_START emits AFTER successful transition
      it("should emit ROUTER_START event after transition succeeds (two-phase start)", async () => {
        const startListener = vi.fn();
        const transitionStartListener = vi.fn();
        const transitionSuccessListener = vi.fn();

        getPluginApi(router).addEventListener(
          events.ROUTER_START,
          startListener,
        );
        getPluginApi(router).addEventListener(
          events.TRANSITION_START,
          transitionStartListener,
        );
        getPluginApi(router).addEventListener(
          events.TRANSITION_SUCCESS,
          transitionSuccessListener,
        );

        await router.start("/home");

        expect(startListener).toHaveBeenCalledTimes(1);
        expect(transitionStartListener).toHaveBeenCalledTimes(1);
        expect(transitionSuccessListener).toHaveBeenCalledTimes(1);

        const startOrder = startListener.mock.invocationCallOrder[0];
        const transitionStartOrder =
          transitionStartListener.mock.invocationCallOrder[0];
        const transitionSuccessOrder =
          transitionSuccessListener.mock.invocationCallOrder[0];

        // R3: completeStart() fires ROUTER_START BEFORE navigateToState(),
        // so ROUTER_START now comes BEFORE TRANSITION_START (reversed from R2).
        // Order: ROUTER_START → TRANSITION_START → TRANSITION_SUCCESS
        expect(startOrder).toBeLessThan(transitionStartOrder);
        expect(transitionStartOrder).toBeLessThan(transitionSuccessOrder);
      });
    });
  });

  describe("Issue #45: Consistent TRANSITION_ERROR event emission for all error types", () => {
    describe("ROUTE_NOT_FOUND should emit TRANSITION_ERROR", () => {
      beforeEach(() => {
        router = createTestRouter({ allowNotFound: false });
      });

      it("should emit TRANSITION_ERROR for invalid path", async () => {
        const transitionErrorListener = vi.fn();

        getPluginApi(router).addEventListener(
          events.TRANSITION_ERROR,
          transitionErrorListener,
        );

        try {
          await router.start("/nonexistent/path");
        } catch {
          // Expected to fail
        }

        expect(transitionErrorListener).toHaveBeenCalledTimes(1);

        const [toState, fromState, error] =
          transitionErrorListener.mock.calls[0];

        expect(toState).toBeUndefined();
        expect(fromState).toBeUndefined();
        expect(error.code).toBe(errorCodes.ROUTE_NOT_FOUND);
      });

      it("should emit TRANSITION_ERROR for invalid state object", async () => {
        const transitionErrorListener = vi.fn();

        getPluginApi(router).addEventListener(
          events.TRANSITION_ERROR,
          transitionErrorListener,
        );

        try {
          await router.start("/nonexistent");
        } catch {
          // Expected to fail
        }

        expect(transitionErrorListener).toHaveBeenCalledTimes(1);

        const error = transitionErrorListener.mock.calls[0][2];

        expect(error.code).toBe(errorCodes.ROUTE_NOT_FOUND);
      });

      it("should return error to callback AND emit TRANSITION_ERROR", async () => {
        const transitionErrorListener = vi.fn();

        getPluginApi(router).addEventListener(
          events.TRANSITION_ERROR,
          transitionErrorListener,
        );

        try {
          await router.start("/nonexistent/path");
        } catch {
          // Expected to fail
        }

        // Event should be triggered
        expect(transitionErrorListener).toHaveBeenCalledTimes(1);

        // Check the error
        const eventError = transitionErrorListener.mock.calls[0][2];

        expect(eventError.code).toBe(errorCodes.ROUTE_NOT_FOUND);
      });
    });

    // "NO_START_PATH_OR_STATE should emit TRANSITION_ERROR" tests removed in Task 6 — start() now requires path

    describe("CANNOT_ACTIVATE should emit TRANSITION_ERROR", () => {
      it("should emit TRANSITION_ERROR when guard blocks transition", async () => {
        const transitionErrorListener = vi.fn();

        lifecycle.addActivateGuard("users.list", () => () => {
          throw new Error("Blocked");
        });

        getPluginApi(router).addEventListener(
          events.TRANSITION_ERROR,
          transitionErrorListener,
        );

        try {
          await router.start("/users/list");
        } catch {
          // Expected to fail
        }

        expect(transitionErrorListener).toHaveBeenCalledTimes(1);

        const error = transitionErrorListener.mock.calls[0][2];

        expect(error.code).toBe(errorCodes.CANNOT_ACTIVATE);
      });

      it("should emit TRANSITION_ERROR with toState information", async () => {
        const transitionErrorListener = vi.fn();

        lifecycle.addActivateGuard("users.view", () => () => {
          throw new Error("Blocked");
        });

        getPluginApi(router).addEventListener(
          events.TRANSITION_ERROR,
          transitionErrorListener,
        );

        try {
          await router.start("/users/view/123");
        } catch {
          // Expected to fail
        }

        expect(transitionErrorListener).toHaveBeenCalledTimes(1);

        const [toState, fromState, error] =
          transitionErrorListener.mock.calls[0];

        expect(toState).toBeDefined();
        expect(toState.name).toBe("users.view");
        expect(toState.params).toStrictEqual({ id: "123" });
        expect(fromState).toBeUndefined();
        expect(error.code).toBe(errorCodes.CANNOT_ACTIVATE);
      });

      it("should return error to callback AND emit TRANSITION_ERROR", async () => {
        const transitionErrorListener = vi.fn();

        lifecycle.addActivateGuard("users.list", () => () => {
          throw new Error("Blocked");
        });

        getPluginApi(router).addEventListener(
          events.TRANSITION_ERROR,
          transitionErrorListener,
        );

        try {
          await router.start("/users/list");
        } catch {
          // Expected to fail
        }

        expect(transitionErrorListener).toHaveBeenCalledTimes(1);

        const eventError = transitionErrorListener.mock.calls[0][2];

        expect(eventError.code).toBe(errorCodes.CANNOT_ACTIVATE);
      });
    });

    // Note: TRANSITION_CANCELLED tests were removed because they required mocking
    // navigateToState which is now called directly via dependency injection.
    // TRANSITION_CANCELLED during start() is not a realistic scenario since
    // start() is synchronous and can't be cancelled by another navigation.;

    describe("consistency of TRANSITION_ERROR event parameters", () => {
      it("should have consistent event signature (toState, fromState, error) for ROUTE_NOT_FOUND", async () => {
        router = createTestRouter({ allowNotFound: false });

        const transitionErrorListener = vi.fn();

        getPluginApi(router).addEventListener(
          events.TRANSITION_ERROR,
          transitionErrorListener,
        );

        try {
          await router.start("/nonexistent/path");
        } catch {
          // Expected to fail
        }

        const args = transitionErrorListener.mock.calls[0];

        expect(args).toHaveLength(3);

        const [toState, fromState, error] = args;

        // ROUTE_NOT_FOUND has no toState (route doesn't exist)
        expect(toState).toBeUndefined();
        expect(fromState).toBeUndefined();
        expect(error).toBeInstanceOf(RouterError);
        expect(error.code).toBe(errorCodes.ROUTE_NOT_FOUND);
      });

      // NO_START_PATH_OR_STATE test removed in Task 6 — start() now requires path

      it("should have consistent event signature (toState, fromState, error) for CANNOT_ACTIVATE", async () => {
        const transitionErrorListener = vi.fn();

        lifecycle.addActivateGuard("users.list", () => () => {
          throw new Error("Blocked");
        });

        getPluginApi(router).addEventListener(
          events.TRANSITION_ERROR,
          transitionErrorListener,
        );

        try {
          await router.start("/users/list");
        } catch {
          // Expected to fail
        }

        const args = transitionErrorListener.mock.calls[0];

        expect(args).toHaveLength(3);

        const [toState, fromState, error] = args;

        expect(toState).toBeDefined();
        expect(toState.name).toBe("users.list");
        expect(fromState).toBeUndefined();
        expect(error).toBeInstanceOf(Error);
        expect(error.code).toBe(errorCodes.CANNOT_ACTIVATE);
      });
    });

    describe("no TRANSITION_SUCCESS emission on errors", () => {
      it("should NOT emit TRANSITION_SUCCESS for ROUTE_NOT_FOUND", async () => {
        router = createTestRouter({ allowNotFound: false });

        const transitionSuccessListener = vi.fn();
        const transitionErrorListener = vi.fn();

        getPluginApi(router).addEventListener(
          events.TRANSITION_SUCCESS,
          transitionSuccessListener,
        );
        getPluginApi(router).addEventListener(
          events.TRANSITION_ERROR,
          transitionErrorListener,
        );

        try {
          await router.start("/nonexistent/path");
        } catch {
          // Expected to fail
        }

        expect(transitionSuccessListener).not.toHaveBeenCalled();
        expect(transitionErrorListener).toHaveBeenCalledTimes(1);
      });

      // NO_START_PATH_OR_STATE test removed in Task 6 — start() now requires path

      it("should NOT emit TRANSITION_SUCCESS for CANNOT_ACTIVATE", async () => {
        const transitionSuccessListener = vi.fn();
        const transitionErrorListener = vi.fn();

        lifecycle.addActivateGuard("users.list", () => () => {
          throw new Error("Blocked");
        });

        getPluginApi(router).addEventListener(
          events.TRANSITION_SUCCESS,
          transitionSuccessListener,
        );
        getPluginApi(router).addEventListener(
          events.TRANSITION_ERROR,
          transitionErrorListener,
        );

        try {
          await router.start("/users/list");
        } catch {
          // Expected to fail
        }

        expect(transitionSuccessListener).not.toHaveBeenCalled();
        expect(transitionErrorListener).toHaveBeenCalledTimes(1);
      });
    });
  });
});
