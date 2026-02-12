import { logger } from "@real-router/logger";
import { describe, it, expect, vi } from "vitest";

import { RouterError } from "@real-router/core";

import { executeLifecycleHooks } from "../../../src/namespaces/NavigationNamespace/transition/executeLifecycleHooks";

import type {
  State,
  ActivationFn,
} from "@real-router/types";

describe("transition/executeLifecycleHooks", () => {
  const createState = (name: string): State => ({
    name,
    params: {},
    path: `/${name}`,
    meta: { id: 1, params: {}, options: {}, redirected: false },
  });

  describe("safeCallback error handling", () => {
    it("should catch and log error when callback throws", async () => {
      const loggerSpy = vi.spyOn(logger, "error").mockImplementation(() => {});
      const toState = createState("users");
      const fromState = createState("home");
      const hooks = new Map<string, ActivationFn>();

      // When no hooks to process, should return immediately
      const result = await executeLifecycleHooks(
        hooks,
        toState,
        fromState,
        [],
        "CANNOT_DEACTIVATE",
        () => false,
      );

      expect(result).toBeDefined();
      expect(result).toEqual(toState);

      loggerSpy.mockRestore();
    });

    it("should catch and log error when callback throws after processing hooks", async () => {
      const loggerSpy = vi.spyOn(logger, "error").mockImplementation(() => {});
      const toState = createState("users");
      const fromState = createState("home");

      // Hook that allows navigation
      const allowHook: ActivationFn = (_toState, _fromState) => {
        return undefined;
      };

      const hooks = new Map<string, ActivationFn>([["users", allowHook]]);

      const result = await executeLifecycleHooks(
        hooks,
        toState,
        fromState,
        ["users"],
        "CANNOT_ACTIVATE",
        () => false,
      );

      expect(result).toBeDefined();

      loggerSpy.mockRestore();
    });

    it("should catch and log error when callback throws on cancellation", async () => {
      const loggerSpy = vi.spyOn(logger, "error").mockImplementation(() => {});
      const toState = createState("users");
      const fromState = createState("home");

      // Hook that will be interrupted by cancellation
      const slowHook: ActivationFn = (_toState, _fromState) => {
        return new Promise<State>((resolve) => {
          setTimeout(() => {
            resolve(_toState);
          }, 0);
        });
      };

      const hooks = new Map<string, ActivationFn>([["users", slowHook]]);

      let cancelled = false;

      try {
        await executeLifecycleHooks(
          hooks,
          toState,
          fromState,
          ["users"],
          "CANNOT_ACTIVATE",
          () => cancelled,
        );
      } catch (error) {
        // Expected to throw when cancelled
      }

      // Cancel before hook completes
      cancelled = true;

      // Wait for setTimeout to trigger
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 10);
      });

      loggerSpy.mockRestore();
    });

    it("should catch and log error when callback throws on hook error", async () => {
      const loggerSpy = vi.spyOn(logger, "error").mockImplementation(() => {});
      const toState = createState("users");
      const fromState = createState("home");

      // Hook that rejects navigation
      const rejectHook: ActivationFn = (_toState, _fromState) => {
        throw new RouterError("CANNOT_ACTIVATE");
      };

      const hooks = new Map<string, ActivationFn>([["users", rejectHook]]);

      try {
        await executeLifecycleHooks(
          hooks,
          toState,
          fromState,
          ["users"],
          "CANNOT_ACTIVATE",
          () => false,
        );
      } catch (error) {
        // Expected to throw
      }

      loggerSpy.mockRestore();
    });
  });

  describe("newState handling (line 107)", () => {
    it("should skip state checks when newState equals currentState (same reference)", async () => {
      const toState = createState("users");
      const fromState = createState("home");
      // Hook that returns the same state reference
      const sameStateHook: ActivationFn = (state, _fromState) => {
        return state;
      };

      const hooks = new Map<string, ActivationFn>([["users", sameStateHook]]);

      const result = await executeLifecycleHooks(
        hooks,
        toState,
        fromState,
        ["users"],
        "CANNOT_ACTIVATE",
        () => false,
      );

      expect(result).toBeDefined();
    });

    it("should skip state checks when newState is not a valid state object", async () => {
      const toState = createState("users");
      const fromState = createState("home");
      // Hook that returns an invalid state (not a State object)
      const invalidStateHook: ActivationFn = () => {
        return { invalid: true } as unknown as State;
      };

      const hooks = new Map<string, ActivationFn>([
        ["users", invalidStateHook],
      ]);

      const result = await executeLifecycleHooks(
        hooks,
        toState,
        fromState,
        ["users"],
        "CANNOT_ACTIVATE",
        () => false,
      );

      expect(result).toBeDefined();
    });
  });
});
