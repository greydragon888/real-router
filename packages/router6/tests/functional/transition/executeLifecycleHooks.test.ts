import { describe, it, expect, vi } from "vitest";

import { RouterError } from "router6";

import { executeLifecycleHooks } from "../../../modules/transition/executeLifecycleHooks";

import type {
  State,
  ActivationFn,
  RouterError as RouterErrorType,
} from "router6-types";

describe("transition/executeLifecycleHooks", () => {
  const createState = (name: string): State => ({
    name,
    params: {},
    path: `/${name}`,
    meta: { id: 1, params: {}, options: {}, redirected: false },
  });

  describe("safeCallback error handling", () => {
    it("should catch and log error when callback throws", () => {
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
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

      expect(consoleSpy).toHaveBeenCalledWith(
        "router6:lifecycle",
        "Error in lifecycle callback:",
        expect.any(Error),
      );

      consoleSpy.mockRestore();
    });

    it("should catch and log error when callback throws after processing hooks", () => {
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
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

      expect(consoleSpy).toHaveBeenCalledWith(
        "router6:lifecycle",
        "Error in lifecycle callback:",
        expect.any(Error),
      );

      consoleSpy.mockRestore();
    });

    it("should catch and log error when callback throws on cancellation", async () => {
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
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

      expect(consoleSpy).toHaveBeenCalledWith(
        "router6:lifecycle",
        "Error in lifecycle callback:",
        expect.any(Error),
      );

      consoleSpy.mockRestore();
    });

    it("should catch and log error when callback throws on hook error", () => {
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
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

      expect(consoleSpy).toHaveBeenCalledWith(
        "router6:lifecycle",
        "Error in lifecycle callback:",
        expect.any(Error),
      );

      consoleSpy.mockRestore();
    });
  });
});
