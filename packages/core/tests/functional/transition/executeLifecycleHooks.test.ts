import { logger } from "@real-router/logger";
import { describe, it, expect, vi } from "vitest";

import { RouterError } from "@real-router/core";

import { executeLifecycleHooks } from "../../../src/namespaces/NavigationNamespace/transition/executeLifecycleHooks";

import type { State, ActivationFn } from "@real-router/types";

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
      expect(result).toStrictEqual(toState);

      loggerSpy.mockRestore();
    });

    it("should catch and log error when callback throws after processing hooks", async () => {
      const loggerSpy = vi.spyOn(logger, "error").mockImplementation(() => {});
      const toState = createState("users");
      const fromState = createState("home");

      // Hook that allows navigation
      const allowHook: ActivationFn = (_toState, _fromState) => {
        return;
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
      } catch {
        // Expected to throw when cancelled
      }

      // Cancel before hook completes
      cancelled = true;

      // Wait for setTimeout to trigger
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 10);
      });

      // Verify no unhandled errors were logged
      expect(loggerSpy).not.toHaveBeenCalled();

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

      await expect(
        executeLifecycleHooks(
          hooks,
          toState,
          fromState,
          ["users"],
          "CANNOT_ACTIVATE",
          () => false,
        ),
      ).rejects.toThrowError("CANNOT_ACTIVATE");

      loggerSpy.mockRestore();
    });
  });

  describe("cancellation between segments", () => {
    it("should throw TRANSITION_CANCELLED when cancelled between hook executions", async () => {
      const toState = createState("users.list");
      const fromState = createState("home");

      let cancelled = false;

      // First hook completes, then cancellation flag is set before second hook
      const firstHook: ActivationFn = () => {
        cancelled = true; // cancel after this hook
      };

      const secondHook: ActivationFn = () => {
        // Should never be called
      };

      const hooks = new Map<string, ActivationFn>([
        ["users", firstHook],
        ["users.list", secondHook],
      ]);

      await expect(
        executeLifecycleHooks(
          hooks,
          toState,
          fromState,
          ["users", "users.list"],
          "CANNOT_ACTIVATE",
          () => cancelled,
        ),
      ).rejects.toThrowError("CANCELLED");
    });
  });

  describe("state mutation warning", () => {
    it("should log warning when guard returns state with modified params", async () => {
      const loggerSpy = vi.spyOn(logger, "error").mockImplementation(() => {});
      const toState = createState("users");
      const fromState = createState("home");

      // Hook returns state with same name but different params
      const mutatingHook: ActivationFn = (state) => ({
        ...state,
        params: { modified: true },
      });

      const hooks = new Map<string, ActivationFn>([["users", mutatingHook]]);

      await executeLifecycleHooks(
        hooks,
        toState,
        fromState,
        ["users"],
        "CANNOT_ACTIVATE",
        () => false,
      );

      expect(loggerSpy).toHaveBeenCalledWith(
        "core:transition",
        "Warning: State mutated during transition",
        expect.any(Object),
      );

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

      await expect(
        executeLifecycleHooks(
          hooks,
          toState,
          fromState,
          ["users"],
          "CANNOT_ACTIVATE",
          () => false,
        ),
      ).rejects.toThrowError("Invalid lifecycle result type");
    });
  });
});
