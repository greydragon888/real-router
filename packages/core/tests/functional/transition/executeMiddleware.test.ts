import { logger } from "@real-router/logger";
import { describe, it, expect, vi } from "vitest";

import { executeMiddleware } from "../../../src/namespaces/NavigationNamespace/transition/executeMiddleware";

import type { MiddlewareFn, State } from "@real-router/types";

describe("transition/executeMiddleware", () => {
  const createState = (name: string): State => ({
    name,
    params: {},
    path: `/${name}`,
    meta: { id: 1, params: {}, options: {} },
  });

  it("should call all middleware with correct args", () => {
    const toState = createState("users");
    const fromState = createState("home");
    const middleware1 = vi.fn().mockReturnValue(true);
    const middleware2 = vi.fn().mockReturnValue(true);

    executeMiddleware([middleware1, middleware2], toState, fromState);

    expect(middleware1).toHaveBeenCalledWith(toState, fromState);
    expect(middleware2).toHaveBeenCalledWith(toState, fromState);
  });

  it("should be a no-op with empty array", () => {
    const toState = createState("users");

    expect(() => {
      executeMiddleware([], toState, undefined);
    }).not.toThrowError();
  });

  it("should return toState when middleware returns true", () => {
    const toState = createState("users");
    const middleware: MiddlewareFn = vi.fn().mockReturnValue(true);

    expect(() => {
      executeMiddleware([middleware], toState, undefined);
    }).not.toThrowError();
    expect(middleware).toHaveBeenCalledTimes(1);
  });

  it("should return toState when middleware returns void", () => {
    const toState = createState("users");
    const middleware: MiddlewareFn = vi.fn().mockReturnValue(undefined);

    expect(() => {
      executeMiddleware([middleware], toState, undefined);
    }).not.toThrowError();
    expect(middleware).toHaveBeenCalledTimes(1);
  });

  it("should not throw when middleware returns false (fire-and-forget)", () => {
    const toState = createState("users");
    const middleware: MiddlewareFn = vi.fn().mockReturnValue(false);

    expect(() => {
      executeMiddleware([middleware], toState, undefined);
    }).not.toThrowError();
    expect(middleware).toHaveBeenCalledTimes(1);
  });

  it("should log error and continue when middleware throws synchronously", () => {
    const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => {});
    const toState = createState("users");
    const error = new Error("sync error");
    const errorMiddleware: MiddlewareFn = () => {
      throw error;
    };

    expect(() => {
      executeMiddleware([errorMiddleware], toState, undefined);
    }).not.toThrowError();

    expect(errorSpy).toHaveBeenCalledWith(
      "core:middleware",
      "Middleware error:",
      error,
    );

    errorSpy.mockRestore();
  });

  it("should attach catch handler when middleware returns Promise.reject", async () => {
    const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => {});
    const toState = createState("users");
    const error = new Error("async error");
    const asyncMiddleware: MiddlewareFn = () => Promise.reject(error);

    expect(() => {
      executeMiddleware([asyncMiddleware], toState, undefined);
    }).not.toThrowError();

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(errorSpy).toHaveBeenCalledWith(
      "core:middleware",
      "Async middleware error:",
      error,
    );

    errorSpy.mockRestore();
  });

  it("should call all middleware even when one throws (fire-and-forget chain)", () => {
    const toState = createState("users");
    const fromState = createState("home");
    const errorMiddleware: MiddlewareFn = () => {
      throw new Error("fail");
    };
    const middleware2 = vi.fn().mockReturnValue(true);

    expect(() => {
      executeMiddleware([errorMiddleware, middleware2], toState, fromState);
    }).not.toThrowError();

    expect(middleware2).toHaveBeenCalledTimes(1);
  });

  it("should call middleware even when it returns a State (return value ignored)", () => {
    const toState = createState("users");
    const redirectState = createState("home");
    const middleware: MiddlewareFn = vi.fn().mockReturnValue(redirectState);

    expect(() => {
      executeMiddleware([middleware], toState, undefined);
    }).not.toThrowError();
    expect(middleware).toHaveBeenCalledTimes(1);
  });

  it("should work when fromState is undefined", () => {
    const toState = createState("users");
    const middleware = vi.fn().mockReturnValue(true);

    expect(() => {
      executeMiddleware([middleware], toState, undefined);
    }).not.toThrowError();

    expect(middleware).toHaveBeenCalledWith(toState, undefined);
  });

  it("should call all middleware with same toState (no redirect chaining)", () => {
    const toState = createState("users");
    const redirectState = createState("admin");
    const fromState = createState("home");
    const middleware1: MiddlewareFn = vi.fn().mockReturnValue(redirectState);
    const middleware2 = vi.fn().mockReturnValue(true);

    executeMiddleware([middleware1, middleware2], toState, fromState);

    expect(middleware2).toHaveBeenCalledWith(toState, fromState);
  });
});
