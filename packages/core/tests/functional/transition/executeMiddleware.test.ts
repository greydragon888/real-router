import { logger } from "@real-router/logger";
import { describe, it, expect, vi } from "vitest";

import { executeMiddleware } from "../../../src/transition/executeMiddleware";

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
    it("should catch and log error when callback throws with no middleware", () => {
      const loggerSpy = vi.spyOn(logger, "error").mockImplementation(() => {});
      const toState = createState("users");
      const fromState = createState("home");
      const middlewareFunctions: ActivationFn[] = [];

      // Callback that throws
      const throwingCallback = () => {
        throw new Error("Callback error");
      };

      executeMiddleware(
        middlewareFunctions,
        toState,
        fromState,
        () => false,
        throwingCallback as unknown as (
          error: RouterErrorType | undefined,
          state: State,
        ) => void,
      );

      expect(loggerSpy).toHaveBeenCalledWith(
        "real-router:middleware",
        "Error in middleware callback:",
        expect.any(Error),
      );

      loggerSpy.mockRestore();
    });

    it("should catch and log error when callback throws after middleware", () => {
      const loggerSpy = vi.spyOn(logger, "error").mockImplementation(() => {});
      const toState = createState("users");
      const fromState = createState("home");

      // Middleware that passes through
      const passMiddleware: ActivationFn = (_toState, _fromState, done) => {
        done();
      };

      const middlewareFunctions: ActivationFn[] = [passMiddleware];

      // Callback that throws
      const throwingCallback = () => {
        throw new Error("Callback error after middleware");
      };

      executeMiddleware(
        middlewareFunctions,
        toState,
        fromState,
        () => false,
        throwingCallback as unknown as (
          error: RouterErrorType | undefined,
          state: State,
        ) => void,
      );

      expect(loggerSpy).toHaveBeenCalledWith(
        "real-router:middleware",
        "Error in middleware callback:",
        expect.any(Error),
      );

      loggerSpy.mockRestore();
    });

    it("should catch and log error when callback throws on cancellation", async () => {
      const loggerSpy = vi.spyOn(logger, "error").mockImplementation(() => {});
      const toState = createState("users");
      const fromState = createState("home");

      // Middleware that simulates async operation
      const asyncMiddleware: ActivationFn = (_toState, _fromState, done) => {
        setTimeout(() => {
          done();
        }, 0);
      };

      const middlewareFunctions: ActivationFn[] = [asyncMiddleware];

      let cancelled = false;

      // Callback that throws
      const throwingCallback = () => {
        throw new Error("Callback error on cancel");
      };

      executeMiddleware(
        middlewareFunctions,
        toState,
        fromState,
        () => cancelled,
        throwingCallback as unknown as (
          error: RouterErrorType | undefined,
          state: State,
        ) => void,
      );

      // Cancel before middleware completes
      cancelled = true;

      // Wait for setTimeout to trigger
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 10);
      });

      expect(loggerSpy).toHaveBeenCalledWith(
        "real-router:middleware",
        "Error in middleware callback:",
        expect.any(Error),
      );

      loggerSpy.mockRestore();
    });

    it("should catch and log error when callback throws on middleware error", () => {
      const loggerSpy = vi.spyOn(logger, "error").mockImplementation(() => {});
      const toState = createState("users");
      const fromState = createState("home");

      // Middleware that throws
      const errorMiddleware: ActivationFn = () => {
        throw new Error("Middleware error");
      };

      const middlewareFunctions: ActivationFn[] = [errorMiddleware];

      // Callback that throws
      const throwingCallback = () => {
        throw new Error("Callback error on middleware error");
      };

      executeMiddleware(
        middlewareFunctions,
        toState,
        fromState,
        () => false,
        throwingCallback as unknown as (
          error: RouterErrorType | undefined,
          state: State,
        ) => void,
      );

      expect(loggerSpy).toHaveBeenCalledWith(
        "real-router:middleware",
        "Error in middleware callback:",
        expect.any(Error),
      );

      loggerSpy.mockRestore();
    });
  });
});
