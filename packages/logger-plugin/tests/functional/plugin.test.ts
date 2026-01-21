import { createRouter, errorCodes } from "@real-router/core";
import { logger } from "logger";
import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { loggerPlugin } from "../../src";

import type { Router } from "@real-router/core";

const noop = () => {};

describe("@real-router/logger-plugin", () => {
  let router: Router;
  let loggerSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let consoleGroupSpy: ReturnType<typeof vi.spyOn>;
  let consoleGroupEndSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Setup router
    router = createRouter(
      [
        { name: "home", path: "/" },
        { name: "users", path: "/users" },
        { name: "users.view", path: "/:id" },
        { name: "admin", path: "/admin" },
      ],
      { defaultRoute: "home" },
    );

    // Spy on logger methods
    loggerSpy = vi.spyOn(logger, "log").mockImplementation(noop);
    warnSpy = vi.spyOn(logger, "warn").mockImplementation(noop);
    errorSpy = vi.spyOn(logger, "error").mockImplementation(noop);

    // Spy on console methods
    consoleGroupSpy = vi.spyOn(console, "group").mockImplementation(noop);
    consoleGroupEndSpy = vi.spyOn(console, "groupEnd").mockImplementation(noop);
  });

  afterEach(() => {
    router.stop();
    vi.restoreAllMocks();
  });

  describe("Basic Functionality", () => {
    beforeEach(() => {
      router.usePlugin(loggerPlugin);
    });

    it("should log router start event", () => {
      router.start();

      expect(loggerSpy).toHaveBeenCalledWith("logger-plugin", "Router started");
    });

    it("should log router stop event", () => {
      router.start();
      loggerSpy.mockClear();

      router.stop();

      expect(loggerSpy).toHaveBeenCalledWith("logger-plugin", "Router stopped");
    });

    it("should log transition start with route names", () => {
      router.start();
      loggerSpy.mockClear();

      router.navigate("users");

      expect(loggerSpy).toHaveBeenCalledWith(
        "logger-plugin",
        "Transition: home → users",
        expect.objectContaining({
          from: expect.objectContaining({ name: "home" }),
          to: expect.objectContaining({ name: "users" }),
        }),
      );
    });

    it("should log transition success", () => {
      router.start();
      loggerSpy.mockClear();

      router.navigate("users");

      expect(loggerSpy).toHaveBeenCalledWith(
        "logger-plugin",
        expect.stringContaining("Transition success"),
        expect.any(Object),
      );
    });

    it("should log transition error when route not found", () => {
      router.start();
      errorSpy.mockClear();

      router.navigate("nonexistent", {}, {}, (err) => {
        expect(err?.code).toBe(errorCodes.ROUTE_NOT_FOUND);
      });

      expect(errorSpy).toHaveBeenCalledWith(
        "logger-plugin",
        expect.stringContaining("Transition error"),
        expect.any(Object),
      );
    });

    it("should log transition cancel", async () => {
      // Add async middleware to allow cancellation
      router.useMiddleware(() => (_toState, _fromState, done) => {
        setTimeout(done, 10);
      });

      router.start();
      await new Promise((resolve) => setTimeout(resolve, 50)); // Wait for start to complete
      warnSpy.mockClear();

      // Cancel the navigation by calling the cancel function
      const cancel = router.navigate("users");

      cancel();

      // Wait a bit for cancel to process
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(warnSpy).toHaveBeenCalledWith(
        "logger-plugin",
        expect.stringContaining("Transition cancelled"),
        expect.any(Object),
      );
    });

    it("should format route name as (none) when undefined", () => {
      router.start();
      loggerSpy.mockClear();

      router.navigate("users");

      expect(loggerSpy).toHaveBeenCalledWith(
        "logger-plugin",
        expect.stringContaining("home → users"),
        expect.any(Object),
      );
    });
  });

  describe("Console Groups", () => {
    it("should open group on transition start", () => {
      router.usePlugin(loggerPlugin);
      router.start();

      router.navigate("users");

      expect(consoleGroupSpy).toHaveBeenCalledWith("Router transition");
    });

    it("should close group on transition success", () => {
      router.usePlugin(loggerPlugin);
      router.start();

      router.navigate("users");

      expect(consoleGroupEndSpy).toHaveBeenCalled();
    });

    it("should close group on transition error", () => {
      router.usePlugin(loggerPlugin);
      router.start();

      router.navigate("nonexistent");

      expect(consoleGroupEndSpy).toHaveBeenCalled();
    });

    it("should close group on transition cancel", () => {
      router.canDeactivate("home", () => () => false);
      router.usePlugin(loggerPlugin);
      router.start();

      router.navigate("users");

      expect(consoleGroupEndSpy).toHaveBeenCalled();
    });

    it("should close any open group on router stop", async () => {
      // Use middleware that delays completion to keep group open
      router.useMiddleware(() => (_toState, _fromState, done) => {
        setTimeout(done, 100);
      });

      router.usePlugin(loggerPlugin);

      // Wait for router to fully start (two-phase start: isStarted only true after transition completes)
      await new Promise<void>((resolve) => {
        router.start(() => {
          resolve();
        });
      });

      // Start navigation but don't wait for it to complete
      router.navigate("users");

      // Wait just enough for transition to start (group opened)
      await new Promise((resolve) => setTimeout(resolve, 10));

      consoleGroupEndSpy.mockClear();

      router.stop();

      expect(consoleGroupEndSpy).toHaveBeenCalled();
    });

    it("should not open multiple groups for same transition", () => {
      router.usePlugin(loggerPlugin);
      router.start();
      consoleGroupSpy.mockClear(); // Clear calls from start

      router.navigate("users");

      // Group should be opened once for this navigation
      expect(consoleGroupSpy).toHaveBeenCalledTimes(1);
    });

    it("should auto-detect console.group support", () => {
      router.usePlugin(loggerPlugin);
      router.start();

      router.navigate("users");

      // Should use groups if available
      expect(consoleGroupSpy).toHaveBeenCalled();
    });
  });

  describe("Edge Cases", () => {
    it("should handle missing console.group gracefully", () => {
      const originalGroup = console.group;

      // @ts-expect-error - testing edge case
      console.group = undefined;

      router.usePlugin(loggerPlugin);
      router.start();

      expect(() => router.navigate("users")).not.toThrowError();

      console.group = originalGroup;
    });

    it("should handle missing console.groupEnd gracefully", () => {
      const originalGroupEnd = console.groupEnd;

      // @ts-expect-error - testing edge case
      console.groupEnd = undefined;

      router.usePlugin(loggerPlugin);
      router.start();

      router.navigate("users", {}, {}, () => {
        expect(loggerSpy).toHaveBeenCalled();

        console.groupEnd = originalGroupEnd;
      });
    });

    it("should handle missing console object gracefully", () => {
      const originalConsole = globalThis.console;

      // @ts-expect-error - testing edge case
      globalThis.console = undefined;

      router.usePlugin(loggerPlugin);

      expect(() => router.start()).not.toThrowError();

      globalThis.console = originalConsole;
    });

    it("should not open group twice for same transition", () => {
      router.usePlugin(loggerPlugin);
      router.start();
      consoleGroupSpy.mockClear();

      router.navigate("users");

      expect(consoleGroupSpy).toHaveBeenCalledTimes(1);
    });

    it("should handle rapid transitions correctly", () => {
      router.usePlugin(loggerPlugin);
      router.start();

      let callbackCount = 0;
      const checkDone = () => {
        callbackCount++;
        if (callbackCount !== 2) {
          return;
        }

        expect(consoleGroupEndSpy.mock.calls.length).toBeGreaterThanOrEqual(2);
      };

      router.navigate("users", {}, {}, checkDone);
      router.navigate("admin", {}, {}, checkDone);
    });

    it("should cleanup on teardown", async () => {
      // Use middleware that delays completion to keep group open
      router.useMiddleware(() => (_toState, _fromState, done) => {
        setTimeout(done, 100);
      });

      const unsubscribe = router.usePlugin(loggerPlugin);

      router.start();
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Start navigation but don't wait for it to complete
      router.navigate("users");
      await new Promise((resolve) => setTimeout(resolve, 10));

      consoleGroupEndSpy.mockClear();

      unsubscribe();

      expect(consoleGroupEndSpy).toHaveBeenCalled();
    });
  });

  describe("Integration with Router", () => {
    it("should work with multiple plugins", () => {
      const customPlugin = () => () => ({
        onStart: vi.fn(),
        onTransitionSuccess: vi.fn(),
      });

      router.usePlugin(customPlugin());
      router.usePlugin(loggerPlugin);

      router.start();

      router.navigate("users");

      expect(loggerSpy).toHaveBeenCalled();
    });

    it("should log nested route transitions", () => {
      router.usePlugin(loggerPlugin);
      router.start();
      loggerSpy.mockClear();

      router.navigate("users.view", { id: "123" });

      expect(loggerSpy).toHaveBeenCalledWith(
        "logger-plugin",
        expect.stringContaining("users.view"),
        expect.any(Object),
      );
    });

    it("should log transitions with parameters", () => {
      router.usePlugin(loggerPlugin);
      router.start();
      loggerSpy.mockClear();

      router.navigate("users.view", { id: "42" });

      const calls = loggerSpy.mock.calls;
      const transitionCall = calls.find((call: unknown[]) =>
        (call[1] as string).includes("Transition:"),
      );

      expect(transitionCall).toBeDefined();
      expect(transitionCall?.[2]).toMatchObject({
        to: expect.objectContaining({
          params: expect.objectContaining({ id: "42" }),
        }),
      });
    });

    it("should handle router restart", () => {
      router.usePlugin(loggerPlugin);
      router.start();
      router.stop();
      loggerSpy.mockClear();

      router.start();

      expect(loggerSpy).toHaveBeenCalledWith("logger-plugin", "Router started");
    });
  });

  describe("Params Diff Feature", () => {
    it("should show params diff when navigating within same route (default behavior)", () => {
      router.usePlugin(loggerPlugin);
      router.start();
      loggerSpy.mockClear();

      router.navigate("users.view", { id: "123" });
      loggerSpy.mockClear();

      router.navigate("users.view", { id: "456" });

      expect(loggerSpy).toHaveBeenCalledWith(
        "logger-plugin",
        expect.stringContaining('Changed: { id: "123" → "456" }'),
      );
    });

    it("should not show diff when navigating to different route", () => {
      router.usePlugin(loggerPlugin);
      router.start();
      loggerSpy.mockClear();

      router.navigate("users.view", { id: "123" });
      loggerSpy.mockClear();

      router.navigate("admin");

      const calls = loggerSpy.mock.calls.map(
        (call: unknown[]) => call[1] as string,
      );
      const hasDiff = calls.some((msg: string) => msg.includes("Changed:"));

      expect(hasDiff).toBe(false);
    });

    it("should not show diff when params are identical", () => {
      router.usePlugin(loggerPlugin);
      router.start();
      router.navigate("users.view", { id: "123" });
      loggerSpy.mockClear();

      router.navigate("users.view", { id: "123" }, { reload: true });

      const calls = loggerSpy.mock.calls.map(
        (call: unknown[]) => call[1] as string,
      );
      const hasDiff = calls.some(
        (msg: string) =>
          msg.includes("Changed:") ||
          msg.includes("Added:") ||
          msg.includes("Removed:"),
      );

      expect(hasDiff).toBe(false);
    });
  });

  describe("Backward Compatibility", () => {
    it("should work with default loggerPlugin export", () => {
      router.usePlugin(loggerPlugin);

      router.start();

      expect(loggerSpy).toHaveBeenCalledWith("logger-plugin", "Router started");
    });

    it("should maintain behavior for default usage", () => {
      router.usePlugin(loggerPlugin);
      router.start();

      loggerSpy.mockClear();
      consoleGroupSpy.mockClear();

      router.navigate("users");

      // Should log transition
      expect(loggerSpy).toHaveBeenCalled();
      // Should use groups
      expect(consoleGroupSpy).toHaveBeenCalled();
      // Should close group
      expect(consoleGroupEndSpy).toHaveBeenCalled();
    });
  });

  describe("Stress Testing", () => {
    it("should handle 100 transitions without errors", () => {
      router.usePlugin(loggerPlugin);
      router.start();
      for (let i = 0; i < 100; i++) {
        router.navigate(i % 2 ? "users" : "admin");
      }

      expect(() => router.getState()).not.toThrowError();
    });
  });
});
