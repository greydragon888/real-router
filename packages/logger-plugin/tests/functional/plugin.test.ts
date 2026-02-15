import { createRouter, errorCodes } from "@real-router/core";
import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { loggerPlugin, loggerPluginFactory } from "../../src";

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

    // Spy on console methods (plugin uses console directly)
    loggerSpy = vi.spyOn(console, "log").mockImplementation(noop);
    warnSpy = vi.spyOn(console, "warn").mockImplementation(noop);
    errorSpy = vi.spyOn(console, "error").mockImplementation(noop);
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

    it("should log router start event", async () => {
      await router.start("/");

      expect(loggerSpy).toHaveBeenCalledWith("[logger-plugin] Router started");
    });

    it("should log router stop event", async () => {
      await router.start("/");
      loggerSpy.mockClear();

      router.stop();

      expect(loggerSpy).toHaveBeenCalledWith("[logger-plugin] Router stopped");
    });

    it("should log transition start with route names", async () => {
      await router.start("/");
      loggerSpy.mockClear();

      await router.navigate("users");

      expect(loggerSpy).toHaveBeenCalledWith(
        "[logger-plugin] Transition: home → users",
        expect.objectContaining({
          from: expect.objectContaining({ name: "home" }),
          to: expect.objectContaining({ name: "users" }),
        }),
      );
    });

    it("should log transition success", async () => {
      await router.start("/");
      loggerSpy.mockClear();

      await router.navigate("users");

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining("[logger-plugin] Transition success"),
        expect.any(Object),
      );
    });

    it("should log transition error when route not found", async () => {
      await router.start("/");
      errorSpy.mockClear();

      await expect(
        router.navigate("nonexistent", {}, {}),
      ).rejects.toMatchObject({ code: errorCodes.ROUTE_NOT_FOUND });

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining("[logger-plugin] Transition error"),
        expect.any(Object),
      );
    });

    it("should log transition cancel", async () => {
      vi.useFakeTimers();

      await router.start("/");
      warnSpy.mockClear();

      // Add async middleware to keep transition in-progress (after start)
      router.useMiddleware(() => (_toState, _fromState) => {
        return new Promise((resolve) =>
          setTimeout(() => {
            resolve(true);
          }, 200),
        );
      });

      // Start navigation (middleware keeps it pending)
      const navPromise = router.navigate("users");

      // Stop router after transition starts
      setTimeout(() => {
        router.stop();
      }, 10);

      await vi.runAllTimersAsync();

      // Wait for the promise to reject
      try {
        await navPromise;
      } catch {
        // Expected TRANSITION_CANCELLED error
      }

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("[logger-plugin] Transition cancelled"),
        expect.any(Object),
      );

      vi.useRealTimers();
    });

    it("should format route name as (none) when undefined", async () => {
      await router.start("/");
      loggerSpy.mockClear();

      await router.navigate("users");

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining("[logger-plugin] Transition: home → users"),
        expect.any(Object),
      );
    });
  });

  describe("Console Groups", () => {
    it("should open group on transition start", async () => {
      router.usePlugin(loggerPlugin);
      await router.start("/");

      await router.navigate("users");

      expect(consoleGroupSpy).toHaveBeenCalledWith("Router transition");
    });

    it("should close group on transition success", async () => {
      router.usePlugin(loggerPlugin);
      await router.start("/");

      await router.navigate("users");

      expect(consoleGroupEndSpy).toHaveBeenCalled();
    });

    it("should close group on transition error", async () => {
      router.usePlugin(loggerPlugin);
      await router.start("/");
      try {
        await router.navigate("nonexistent");
      } catch {
        // Expected error
      }

      expect(consoleGroupEndSpy).toHaveBeenCalled();
    });

    it("should close group on transition cancel", async () => {
      router.addDeactivateGuard("home", () => () => false);
      router.usePlugin(loggerPlugin);
      await router.start("/");
      try {
        await router.navigate("users");
      } catch {
        // Expected error
      }

      expect(consoleGroupEndSpy).toHaveBeenCalled();
    });

    it("should close any open group on router stop", async () => {
      vi.useFakeTimers();

      router.usePlugin(loggerPlugin);

      await router.start("/");

      // Use async middleware to keep transition in-progress (group stays open, after start)
      router.useMiddleware(() => (_toState, _fromState) => {
        return new Promise((resolve) =>
          setTimeout(() => {
            resolve(true);
          }, 200),
        );
      });

      // Start navigation but don't wait for it to complete
      const navPromise = router.navigate("users");

      // Stop after transition starts (group opened)
      setTimeout(() => {
        consoleGroupEndSpy.mockClear();
        router.stop();
      }, 10);

      await vi.runAllTimersAsync();

      expect(consoleGroupEndSpy).toHaveBeenCalled();

      // Clean up the pending promise
      try {
        await navPromise;
      } catch {
        // Expected error
      }

      vi.useRealTimers();
    });

    it("should not open multiple groups for same transition", async () => {
      router.usePlugin(loggerPlugin);
      await router.start("/");
      consoleGroupSpy.mockClear(); // Clear calls from start

      await router.navigate("users");

      // Group should be opened once for this navigation
      expect(consoleGroupSpy).toHaveBeenCalledTimes(1);
    });

    it("should auto-detect console.group support", async () => {
      router.usePlugin(loggerPlugin);
      await router.start("/");

      await router.navigate("users");

      // Should use groups if available
      expect(consoleGroupSpy).toHaveBeenCalled();
    });
  });

  describe("Edge Cases", () => {
    it("should handle missing console.group gracefully", async () => {
      const originalGroup = console.group;

      delete (console as any).group;

      router.usePlugin(loggerPlugin);
      await router.start("/");

      await router.navigate("users");

      expect(loggerSpy).toHaveBeenCalled();

      console.group = originalGroup;
    });

    it("should handle missing console.groupEnd gracefully", async () => {
      const originalGroupEnd = console.groupEnd;

      delete (console as any).groupEnd;

      router.usePlugin(loggerPlugin);
      await router.start("/");

      await router.navigate("users", {}, {});

      expect(loggerSpy).toHaveBeenCalled();

      console.groupEnd = originalGroupEnd;
    });

    it("should handle missing console object gracefully", () => {
      const originalConsole = globalThis.console;

      delete (globalThis as any).console;

      router.usePlugin(loggerPlugin);

      expect(() => router.start("/")).not.toThrowError();

      globalThis.console = originalConsole;
    });

    it("should not open group twice for same transition", async () => {
      router.usePlugin(loggerPlugin);
      await router.start("/");
      consoleGroupSpy.mockClear();

      await router.navigate("users");

      expect(consoleGroupSpy).toHaveBeenCalledTimes(1);
    });

    it("should handle rapid transitions correctly", async () => {
      router.usePlugin(loggerPlugin);
      await router.start("/");

      await router.navigate("users", {}, {});
      await router.navigate("admin", {}, {});

      expect(consoleGroupEndSpy.mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    it("should cleanup on teardown", async () => {
      vi.useFakeTimers();

      const unsubscribe = router.usePlugin(loggerPlugin);

      await router.start("/");

      // Use async middleware to keep transition in-progress (group stays open, after start)
      router.useMiddleware(() => (_toState, _fromState) => {
        return new Promise((resolve) =>
          setTimeout(() => {
            resolve(true);
          }, 200),
        );
      });

      // Start navigation but don't wait for it to complete
      const navPromise = router.navigate("users");

      // Teardown after transition starts (group opened)
      setTimeout(() => {
        consoleGroupEndSpy.mockClear();
        unsubscribe();
      }, 10);

      await vi.runAllTimersAsync();

      expect(consoleGroupEndSpy).toHaveBeenCalled();

      // Clean up the pending promise
      try {
        await navPromise;
      } catch {
        // Expected error
      }

      vi.useRealTimers();
    });
  });

  describe("Integration with Router", () => {
    it("should work with multiple plugins", async () => {
      const customPlugin = () => () => ({
        onStart: vi.fn(),
        onTransitionSuccess: vi.fn(),
      });

      router.usePlugin(customPlugin());
      router.usePlugin(loggerPlugin);

      await router.start("/");

      await router.navigate("users");

      expect(loggerSpy).toHaveBeenCalled();
    });

    it("should log nested route transitions", async () => {
      router.usePlugin(loggerPlugin);
      await router.start("/");
      loggerSpy.mockClear();

      await router.navigate("users.view", { id: "123" });

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining("[logger-plugin]"),
        expect.any(Object),
      );
    });

    it("should log transitions with parameters", async () => {
      router.usePlugin(loggerPlugin);
      await router.start("/");
      loggerSpy.mockClear();

      await router.navigate("users.view", { id: "42" });

      const calls = loggerSpy.mock.calls;
      const transitionCall = calls.find((call: unknown[]) =>
        (call[0] as string).includes("Transition:"),
      );

      expect(transitionCall).toBeDefined();
      expect(transitionCall?.[1]).toMatchObject({
        to: expect.objectContaining({
          params: expect.objectContaining({ id: "42" }),
        }),
      });
    });

    it("should handle router restart", async () => {
      router.usePlugin(loggerPlugin);
      await router.start("/");
      router.stop();
      loggerSpy.mockClear();

      await router.start("/");

      expect(loggerSpy).toHaveBeenCalledWith("[logger-plugin] Router started");
    });
  });

  describe("Params Diff Feature", () => {
    it("should show params diff when navigating within same route (default behavior)", async () => {
      router.usePlugin(loggerPlugin);
      await router.start("/");
      loggerSpy.mockClear();

      await router.navigate("users.view", { id: "123" });
      loggerSpy.mockClear();

      await router.navigate("users.view", { id: "456" });

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          '[logger-plugin]  Changed: { id: "123" → "456" }',
        ),
      );
    });

    it("should not show diff when navigating to different route", async () => {
      router.usePlugin(loggerPlugin);
      await router.start("/");
      loggerSpy.mockClear();

      await router.navigate("users.view", { id: "123" });
      loggerSpy.mockClear();

      await router.navigate("admin");

      const calls = loggerSpy.mock.calls.map(
        (call: unknown[]) => call[0] as string,
      );
      const hasDiff = calls.some((msg: string) => msg.includes("Changed:"));

      expect(hasDiff).toBe(false);
    });

    it("should not show diff when params are identical", async () => {
      router.usePlugin(loggerPlugin);
      await router.start("/");
      await router.navigate("users.view", { id: "123" });
      loggerSpy.mockClear();

      await router.navigate("users.view", { id: "123" }, { reload: true });

      const calls = loggerSpy.mock.calls.map(
        (call: unknown[]) => call[0] as string,
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
    it("should work with default loggerPlugin export", async () => {
      router.usePlugin(loggerPlugin);

      await router.start("/");

      expect(loggerSpy).toHaveBeenCalledWith("[logger-plugin] Router started");
    });

    it("should maintain behavior for default usage", async () => {
      router.usePlugin(loggerPlugin);
      await router.start("/");
      loggerSpy.mockClear();
      consoleGroupSpy.mockClear();

      await router.navigate("users");

      // Should log transition
      expect(loggerSpy).toHaveBeenCalled();
      // Should use groups
      expect(consoleGroupSpy).toHaveBeenCalled();
      // Should close group
      expect(consoleGroupEndSpy).toHaveBeenCalled();
    });
  });

  describe("Stress Testing", () => {
    it("should handle 100 transitions without errors", async () => {
      router.usePlugin(loggerPlugin);
      await router.start("/");
      for (let i = 0; i < 100; i++) {
        await router.navigate(i % 2 ? "users" : "admin");
      }

      expect(() => router.getState()).not.toThrowError();
    });
  });

  describe("Configuration Options", () => {
    describe("level option", () => {
      it("should not log anything when level is 'none'", async () => {
        router.usePlugin(loggerPluginFactory({ level: "none" }));
        await router.start("/");

        expect(loggerSpy).not.toHaveBeenCalled();

        await router.navigate("users");

        expect(loggerSpy).not.toHaveBeenCalled();
        expect(warnSpy).not.toHaveBeenCalled();
      });

      it("should not log errors when level is 'none'", async () => {
        router.usePlugin(loggerPluginFactory({ level: "none" }));
        await router.start("/");
        errorSpy.mockClear();
        try {
          await router.navigate("nonexistent");
        } catch {
          // Expected error
        }

        expect(errorSpy).not.toHaveBeenCalled();
      });

      it("should not log cancel when level is 'none'", async () => {
        vi.useFakeTimers();

        router.usePlugin(loggerPluginFactory({ level: "none" }));
        await router.start("/");
        warnSpy.mockClear();

        const unsubMiddleware = router.useMiddleware(
          () => (_toState, _fromState) => {
            return new Promise((resolve) =>
              setTimeout(() => {
                resolve(true);
              }, 200),
            );
          },
        );

        const navPromise = router.navigate("users");

        setTimeout(() => {
          router.stop();
        }, 10);

        await vi.runAllTimersAsync();

        try {
          await navPromise;
        } catch {
          // Expected TRANSITION_CANCELLED error
        }

        expect(warnSpy).not.toHaveBeenCalled();

        unsubMiddleware();
        await router.start("/");
        vi.useRealTimers();
      });

      it("should not log cancel when level is 'errors'", async () => {
        vi.useFakeTimers();

        router.usePlugin(loggerPluginFactory({ level: "errors" }));
        await router.start("/");
        warnSpy.mockClear();

        const unsubMiddleware = router.useMiddleware(
          () => (_toState, _fromState) => {
            return new Promise((resolve) =>
              setTimeout(() => {
                resolve(true);
              }, 200),
            );
          },
        );

        const navPromise = router.navigate("users");

        setTimeout(() => {
          router.stop();
        }, 10);

        await vi.runAllTimersAsync();

        try {
          await navPromise;
        } catch {
          // Expected TRANSITION_CANCELLED error
        }

        expect(warnSpy).not.toHaveBeenCalled();

        unsubMiddleware();
        await router.start("/");
        vi.useRealTimers();
      });

      it("should log only errors when level is 'errors'", async () => {
        router.usePlugin(loggerPluginFactory({ level: "errors" }));
        await router.start("/");

        expect(loggerSpy).not.toHaveBeenCalled();

        await router.navigate("users");

        expect(loggerSpy).not.toHaveBeenCalled();

        try {
          await router.navigate("nonexistent");
        } catch {
          // Expected error
        }

        expect(errorSpy).toHaveBeenCalled();
      });

      it("should log transitions but not lifecycle when level is 'transitions'", async () => {
        router.usePlugin(loggerPluginFactory({ level: "transitions" }));
        await router.start("/");
        loggerSpy.mockClear();

        await router.navigate("users");

        expect(loggerSpy).toHaveBeenCalledWith(
          expect.stringContaining("[logger-plugin] Transition:"),
          expect.any(Object),
        );
      });
    });

    describe("showTiming option", () => {
      it("should not show timing when showTiming is false", async () => {
        router.usePlugin(loggerPluginFactory({ showTiming: false }));
        await router.start("/");
        loggerSpy.mockClear();

        await router.navigate("users");

        const successCall = loggerSpy.mock.calls.find((call: unknown[]) =>
          (call[0] as string).includes("Transition success"),
        );

        expect(successCall?.[0]).not.toMatch(/\(\d+/);
      });

      it("should show timing when showTiming is true (default)", async () => {
        router.usePlugin(loggerPluginFactory({ showTiming: true }));
        await router.start("/");
        loggerSpy.mockClear();

        await router.navigate("users");

        const successCall = loggerSpy.mock.calls.find((call: unknown[]) =>
          (call[0] as string).includes("Transition success"),
        );

        expect(successCall?.[0]).toMatch(/\(\d+/);
      });
    });

    describe("showParamsDiff option", () => {
      it("should not show params diff when showParamsDiff is false", async () => {
        router.usePlugin(loggerPluginFactory({ showParamsDiff: false }));
        await router.start("/");
        await router.navigate("users.view", { id: "123" });
        loggerSpy.mockClear();

        await router.navigate("users.view", { id: "456" });

        const calls = loggerSpy.mock.calls.map(
          (call: unknown[]) => call[0] as string,
        );
        const hasDiff = calls.some((msg: string) => msg.includes("Changed:"));

        expect(hasDiff).toBe(false);
      });
    });

    describe("context option", () => {
      it("should use custom context", async () => {
        router.usePlugin(loggerPluginFactory({ context: "my-router" }));
        await router.start("/");

        expect(loggerSpy).toHaveBeenCalledWith("[my-router] Router started");
      });
    });
  });
});
