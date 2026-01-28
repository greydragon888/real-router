import { logger } from "@real-router/logger";
import { describe, it, expect, vi } from "vitest";

import { RouterError } from "@real-router/core";

import { executeLifecycleHooks } from "../../../src/namespaces/NavigationNamespace/transition/executeLifecycleHooks";

import type {
  State,
  ActivationFn,
  RouterError as RouterErrorType,
} from "@real-router/types";

describe("transition/executeLifecycleHooks", () => {
  const createState = (name: string): State => ({
    name,
    params: {},
    path: `/${name}`,
    meta: { id: 1, params: {}, options: {}, redirected: false },
  });

  describe("safeCallback error handling", () => {
    it("should catch and log error when callback throws", () => {
      const loggerSpy = vi.spyOn(logger, "error").mockImplementation(() => {});
      const toState = createState("users");
      const fromState = createState("home");
      const hooks = new Map<string, ActivationFn>();

      // Callback that throws
      const throwingCallback = () => {
        throw new Error("Callback error");
      };

      // When no hooks to process, callback is called immediately
      executeLifecycleHooks(
        hooks,
        toState,
        fromState,
        [],
        "CANNOT_DEACTIVATE",
        () => false,
        throwingCallback as unknown as (
          error: RouterErrorType | undefined,
          state: State,
        ) => void,
      );

      expect(loggerSpy).toHaveBeenCalledWith(
        "core:lifecycle",
        "Error in lifecycle callback:",
        expect.any(Error),
      );

      loggerSpy.mockRestore();
    });

    it("should catch and log error when callback throws after processing hooks", () => {
      const loggerSpy = vi.spyOn(logger, "error").mockImplementation(() => {});
      const toState = createState("users");
      const fromState = createState("home");

      // Hook that allows navigation
      const allowHook: ActivationFn = (_toState, _fromState, done) => {
        done();
      };

      const hooks = new Map<string, ActivationFn>([["users", allowHook]]);

      // Callback that throws
      const throwingCallback = () => {
        throw new Error("Callback error after hooks");
      };

      executeLifecycleHooks(
        hooks,
        toState,
        fromState,
        ["users"],
        "CANNOT_ACTIVATE",
        () => false,
        throwingCallback as unknown as (
          error: RouterErrorType | undefined,
          state: State,
        ) => void,
      );

      expect(loggerSpy).toHaveBeenCalledWith(
        "core:lifecycle",
        "Error in lifecycle callback:",
        expect.any(Error),
      );

      loggerSpy.mockRestore();
    });

    it("should catch and log error when callback throws on cancellation", async () => {
      const loggerSpy = vi.spyOn(logger, "error").mockImplementation(() => {});
      const toState = createState("users");
      const fromState = createState("home");

      // Hook that will be interrupted by cancellation
      const slowHook: ActivationFn = (_toState, _fromState, done) => {
        // Simulate async - done is called after isCancelled returns true
        setTimeout(() => {
          done();
        }, 0);
      };

      const hooks = new Map<string, ActivationFn>([["users", slowHook]]);

      let cancelled = false;

      // Callback that throws
      const throwingCallback = () => {
        throw new Error("Callback error on cancel");
      };

      executeLifecycleHooks(
        hooks,
        toState,
        fromState,
        ["users"],
        "CANNOT_ACTIVATE",
        () => cancelled,
        throwingCallback as unknown as (
          error: RouterErrorType | undefined,
          state: State,
        ) => void,
      );

      // Cancel before hook completes
      cancelled = true;

      // Wait for setTimeout to trigger
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 10);
      });

      expect(loggerSpy).toHaveBeenCalledWith(
        "core:lifecycle",
        "Error in lifecycle callback:",
        expect.any(Error),
      );

      loggerSpy.mockRestore();
    });

    it("should catch and log error when callback throws on hook error", () => {
      const loggerSpy = vi.spyOn(logger, "error").mockImplementation(() => {});
      const toState = createState("users");
      const fromState = createState("home");

      // Hook that rejects navigation
      const rejectHook: ActivationFn = (_toState, _fromState, done) => {
        done(new RouterError("CANNOT_ACTIVATE"));
      };

      const hooks = new Map<string, ActivationFn>([["users", rejectHook]]);

      // Callback that throws
      const throwingCallback = () => {
        throw new Error("Callback error on hook rejection");
      };

      executeLifecycleHooks(
        hooks,
        toState,
        fromState,
        ["users"],
        "CANNOT_ACTIVATE",
        () => false,
        throwingCallback as unknown as (
          error: RouterErrorType | undefined,
          state: State,
        ) => void,
      );

      expect(loggerSpy).toHaveBeenCalledWith(
        "core:lifecycle",
        "Error in lifecycle callback:",
        expect.any(Error),
      );

      loggerSpy.mockRestore();
    });
  });

  describe("newState handling (line 107)", () => {
    it("should skip state checks when newState equals currentState (same reference)", () => {
      const toState = createState("users");
      const fromState = createState("home");
      const callback = vi.fn();

      // Hook that returns the same state reference
      const sameStateHook: ActivationFn = (state, _fromState, done) => {
        // Return the same state object (newState === currentState)
        done(undefined, state);
      };

      const hooks = new Map<string, ActivationFn>([["users", sameStateHook]]);

      executeLifecycleHooks(
        hooks,
        toState,
        fromState,
        ["users"],
        "CANNOT_ACTIVATE",
        () => false,
        callback,
      );

      // Should complete successfully without error
      expect(callback).toHaveBeenCalledWith(undefined, toState);
    });

    it("should skip state checks when newState is not a valid state object", () => {
      const toState = createState("users");
      const fromState = createState("home");
      const callback = vi.fn();

      // Hook that returns an invalid state (not a State object)
      const invalidStateHook: ActivationFn = (_toState, _fromState, done) => {
        // Return something that's not a valid State (missing required fields)
        done(undefined, { invalid: true } as unknown as State);
      };

      const hooks = new Map<string, ActivationFn>([
        ["users", invalidStateHook],
      ]);

      executeLifecycleHooks(
        hooks,
        toState,
        fromState,
        ["users"],
        "CANNOT_ACTIVATE",
        () => false,
        callback,
      );

      // Should complete successfully (invalid state is ignored)
      expect(callback).toHaveBeenCalledWith(undefined, toState);
    });
  });
});
