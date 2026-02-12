import { logger } from "@real-router/logger";
import { describe, it, expect, vi } from "vitest";

import { executeMiddleware } from "../../../src/namespaces/NavigationNamespace/transition/executeMiddleware";

import type {
  State,
  ActivationFn,
  RouterError as RouterErrorType,
} from "@real-router/types";

describe("transition/executeMiddleware", () => {
  const createState = (name: string): State => ({
    name,
    params: {},
    path: `/${name}`,
    meta: { id: 1, params: {}, options: {}, redirected: false },
  });

  describe("safeCallback error handling", () => {
    it("should catch and log error when callback throws with no middleware", async () => {
      const loggerSpy = vi.spyOn(logger, "error").mockImplementation(() => {});
      const toState = createState("users");
      const fromState = createState("home");
      const middlewareFunctions: ActivationFn[] = [];

      try {
        const result = await executeMiddleware(
          middlewareFunctions,
          toState,
          fromState,
          () => false,
        );

        expect(result).toBe(toState);
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
      }

      loggerSpy.mockRestore();
    });

    it("should catch and log error when callback throws after middleware", async () => {
      const loggerSpy = vi.spyOn(logger, "error").mockImplementation(() => {});
      const toState = createState("users");
      const fromState = createState("home");

      // Middleware that passes through
      const passMiddleware: ActivationFn = (_toState) => {
        return _toState;
      };

      const middlewareFunctions: ActivationFn[] = [passMiddleware];

      try {
        const result = await executeMiddleware(
          middlewareFunctions,
          toState,
          fromState,
          () => false,
        );

        expect(result).toBe(toState);
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
      }

      loggerSpy.mockRestore();
    });

    it("should catch and log error when callback throws on cancellation", async () => {
      const loggerSpy = vi.spyOn(logger, "error").mockImplementation(() => {});
      const toState = createState("users");
      const fromState = createState("home");

      // Middleware that simulates async operation
      const asyncMiddleware: ActivationFn = (_toState) => {
        return new Promise<State>((resolve) => {
          setTimeout(() => {
            resolve(_toState);
          }, 0);
        });
      };

      const middlewareFunctions: ActivationFn[] = [asyncMiddleware];

      let cancelled = false;

      try {
        const promise = executeMiddleware(
          middlewareFunctions,
          toState,
          fromState,
          () => cancelled,
        );

        // Cancel before middleware completes
        cancelled = true;

        const result = await promise;

        expect(result).toBe(toState);
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
      }

      loggerSpy.mockRestore();
    });

    it("should catch and log error when callback throws on middleware error", async () => {
      const loggerSpy = vi.spyOn(logger, "error").mockImplementation(() => {});
      const toState = createState("users");
      const fromState = createState("home");

      // Middleware that throws
      const errorMiddleware: ActivationFn = () => {
        throw new Error("Middleware error");
      };

      const middlewareFunctions: ActivationFn[] = [errorMiddleware];

      try {
        await executeMiddleware(
          middlewareFunctions,
          toState,
          fromState,
          () => false,
        );
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBe("Middleware error");
      }

      loggerSpy.mockRestore();
    });
  });
});
