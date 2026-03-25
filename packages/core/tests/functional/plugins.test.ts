import { logger } from "@real-router/logger";
import {
  describe,
  beforeEach,
  afterEach,
  it,
  expect,
  expectTypeOf,
} from "vitest";

import { getDependenciesApi } from "@real-router/core/api";

import { createTestRouter } from "../helpers";

import type { Router, PluginFactory, Plugin } from "@real-router/core";

let router: Router;
let myPlugin: PluginFactory;
let myPluginMethods: Plugin;

/**
 * Creates a trackable plugin that records when its hooks are called.
 * Used to verify plugin registration/execution behavior.
 */
function createTrackingPlugin() {
  const calls = {
    onStart: 0,
    onStop: 0,
    onTransitionStart: 0,
    onTransitionSuccess: 0,
    onTransitionError: 0,
    onTransitionCancel: 0,
    teardown: 0,
  };

  return {
    factory: () => ({
      onStart: () => {
        calls.onStart++;
      },
      onStop: () => {
        calls.onStop++;
      },
      onTransitionStart: () => {
        calls.onTransitionStart++;
      },
      onTransitionSuccess: () => {
        calls.onTransitionSuccess++;
      },
      onTransitionError: () => {
        calls.onTransitionError++;
      },
      onTransitionCancel: () => {
        calls.onTransitionCancel++;
      },
      teardown: () => {
        calls.teardown++;
      },
    }),
    getCalls: () => ({ ...calls }),
    reset: () => {
      for (const k in calls) {
        calls[k as keyof typeof calls] = 0;
      }
    },
  };
}

/**
 * Creates a plugin that tracks execution order.
 */
function createOrderedPlugin(id: string, orderTracker: string[]) {
  return {
    factory: () => ({
      onStart: () => {
        orderTracker.push(id);
      },
      onStop: () => {
        orderTracker.push(`${id}-stop`);
      },
      teardown: () => {
        orderTracker.push(`${id}-teardown`);
      },
    }),
  };
}

describe("core/plugins", () => {
  beforeEach(async () => {
    router = createTestRouter();
    await router.start("/home");

    myPluginMethods = {
      onTransitionStart: vi.fn(),
      onTransitionSuccess: vi.fn(),
      onTransitionError: () => undefined,
    };

    myPlugin = (router) => {
      (router as unknown as Record<string, unknown>).myCustomMethod = () =>
        undefined;

      return myPluginMethods;
    };
  });

  afterEach(() => {
    router.stop();
  });

  describe("usePlugin", () => {
    it("applies plugin factory and attaches methods to router", async () => {
      router.stop();

      router.usePlugin(myPlugin);

      await router.start("/home");

      // custom method added by plugin
      expect(
        (router as Router & { myCustomMethod?: Function }).myCustomMethod,
      ).not.toBe(undefined);

      await router.navigate("orders", {});

      expect(myPluginMethods.onTransitionStart).toHaveBeenCalled();
      expect(myPluginMethods.onTransitionSuccess).toHaveBeenCalled();
    });

    it("returns an unsubscribe function that removes plugin", async () => {
      const teardown = vi.fn();
      const onStop = vi.fn();

      const testRouter = createTestRouter();
      const plugin = () => ({ teardown, onStop });

      const unsubscribe = testRouter.usePlugin(plugin);

      // Start and stop to verify plugin is active
      await testRouter.start("/home");
      testRouter.stop();

      expect(onStop).toHaveBeenCalledTimes(1);

      unsubscribe();

      // teardown should be called when unsubscribing
      expect(teardown).toHaveBeenCalled();

      // Verify plugin is removed - onStop should not be called again on restart
      await testRouter.start("/home");
      testRouter.stop();

      // onStop should still be 1 (not called after unsubscribe)
      expect(onStop).toHaveBeenCalledTimes(1);
    });

    it("removes all registered event listeners when unsubscribed", async () => {
      const onStart = vi.fn();
      const plugin = () => ({ onStart });

      const unsubscribe = router.usePlugin(plugin);

      unsubscribe();

      router.stop();
      await router.start("/home");

      expect(onStart).not.toHaveBeenCalled();
    });

    // 🔴 CRITICAL: Atomicity of registration on errors
    describe("atomicity on errors", () => {
      it("should not register any plugin if factory throws error", async () => {
        const tracker = createTrackingPlugin();
        const validPlugin1 = tracker.factory;
        const failingPlugin = () => {
          throw new Error("Factory initialization failed");
        };
        const validPlugin2 = () => ({ onStart: vi.fn() });

        router.stop();

        expect(() => {
          router.usePlugin(validPlugin1, failingPlugin, validPlugin2);
        }).toThrow("Factory initialization failed");

        // No plugins should be registered - verify by starting router
        await router.start("/home");

        // tracker's onStart should not have been called (plugin was rolled back)
        expect(tracker.getCalls().onStart).toBe(0);
      });

      it("without validation plugin, plugin with unknown properties does NOT throw (no rollback)", async () => {
        const tracker = createTrackingPlugin();
        const validPlugin = tracker.factory;
        const invalidPlugin = () => ({ unknownMethod: vi.fn() }) as any;

        router.stop();

        // Without validation plugin, unknown properties don't cause a throw
        expect(() => {
          router.usePlugin(validPlugin, invalidPlugin);
        }).not.toThrow();

        // Both plugins registered (no rollback)
        await router.start("/home");

        expect(tracker.getCalls().onStart).toBe(1);
      });

      it("should rollback when error occurs in middle of batch", async () => {
        const tracker1 = createTrackingPlugin();
        const tracker2 = createTrackingPlugin();
        const plugin1 = tracker1.factory;
        const plugin2 = tracker2.factory;
        const plugin3 = () => {
          throw new Error("Error in plugin3");
        };
        const plugin4 = () => ({ onStart: vi.fn() });

        router.stop();

        expect(() => {
          router.usePlugin(plugin1, plugin2, plugin3, plugin4);
        }).toThrow("Error in plugin3");

        // All-or-nothing: no plugins registered - verify by starting router
        await router.start("/home");

        expect(tracker1.getCalls().onStart).toBe(0);
        expect(tracker2.getCalls().onStart).toBe(0);
      });

      it("should call teardown during rollback if plugin was initialized", () => {
        const teardown1 = vi.fn();
        const plugin1 = () => ({ onStart: vi.fn(), teardown: teardown1 });
        const plugin2 = () => {
          throw new Error("Plugin2 fails");
        };

        expect(() => {
          router.usePlugin(plugin1, plugin2);
        }).toThrow("Plugin2 fails");

        // Teardown of successfully initialized plugin should be called
        expect(teardown1).toHaveBeenCalled();
      });

      it("should log error when cleanup throws during rollback (line 148)", () => {
        const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => {});

        // Create a plugin whose teardown throws - teardown is called during cleanup
        const teardownThatThrows = vi.fn(() => {
          throw new Error("Cleanup failed");
        });
        const pluginWithFailingTeardown = () => ({
          onStart: vi.fn(),
          teardown: teardownThatThrows,
        });

        // This plugin will throw during initialization, triggering rollback
        const failingPlugin = () => {
          throw new Error("Initialization failed");
        };

        // When pluginWithFailingTeardown initializes, then failingPlugin throws,
        // rollback will call cleanup() which calls teardown() which throws
        // The catch block at line 147-153 should catch this
        expect(() => {
          router.usePlugin(pluginWithFailingTeardown, failingPlugin);
        }).toThrow("Initialization failed");

        // teardown should have been called during rollback
        expect(teardownThatThrows).toHaveBeenCalled();

        // Error should have been logged (line 148-152)
        // Logger format: logger.error(context, message, error)
        expect(errorSpy).toHaveBeenCalledWith(
          "router.usePlugin",
          "Cleanup error:",
          expect.any(Error),
        );

        errorSpy.mockRestore();
      });
    });

    // 🔴 CRITICAL: Duplicate protection
    describe("duplicate protection", () => {
      it("should allow different factory references even with same plugin structure", async () => {
        const tracker1 = createTrackingPlugin();
        const tracker2 = createTrackingPlugin();

        router.stop();

        // Different factory references with different handler instances
        expect(() => {
          router.usePlugin(tracker1.factory, tracker2.factory);
        }).not.toThrow();

        // Both plugins should be registered - verify by starting router
        await router.start("/home");

        expect(tracker1.getCalls().onStart).toBe(1);
        expect(tracker2.getCalls().onStart).toBe(1);
      });

      it("should deduplicate factory in same batch (without validation plugin, no warn)", async () => {
        const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});

        const tracker = createTrackingPlugin();
        const factory = tracker.factory;

        router.stop();

        const unsub = router.usePlugin(factory, factory);

        expect(warnSpy).not.toHaveBeenCalledWith(
          "router.usePlugin",
          "Duplicate factory in batch, will be registered once",
        );

        await router.start("/home");

        expect(tracker.getCalls().onStart).toBe(1);

        unsub();
        warnSpy.mockRestore();
      });

      it("without validation plugin, duplicates in batch do NOT log warn", () => {
        const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});

        const factory = () => ({});

        router.usePlugin(factory, factory, factory);

        expect(warnSpy).not.toHaveBeenCalledWith(
          "router.usePlugin",
          "Duplicate factory in batch, will be registered once",
        );

        warnSpy.mockRestore();
      });
    });

    // 🔴 CRITICAL: Unsubscribe isolation
    describe("unsubscribe isolation", () => {
      it("should only remove plugins from its own call", async () => {
        const tracker1 = createTrackingPlugin();
        const tracker2 = createTrackingPlugin();
        const tracker3 = createTrackingPlugin();

        router.stop();

        const unsub1 = router.usePlugin(tracker1.factory);
        const unsub2 = router.usePlugin(tracker2.factory, tracker3.factory);

        // All three should be registered - verify by starting router
        await router.start("/home");

        expect(tracker1.getCalls().onStart).toBe(1);
        expect(tracker2.getCalls().onStart).toBe(1);
        expect(tracker3.getCalls().onStart).toBe(1);

        // Reset and unsubscribe first call
        tracker1.reset();
        tracker2.reset();
        tracker3.reset();
        unsub1();

        router.stop();
        await router.start("/home");

        // tracker1 should not respond (unsubscribed)
        expect(tracker1.getCalls().onStart).toBe(0);
        // tracker2 and tracker3 should still respond
        expect(tracker2.getCalls().onStart).toBe(1);
        expect(tracker3.getCalls().onStart).toBe(1);

        // Unsubscribe second call
        tracker2.reset();
        tracker3.reset();
        unsub2();

        router.stop();
        await router.start("/home");

        // None should respond
        expect(tracker1.getCalls().onStart).toBe(0);
        expect(tracker2.getCalls().onStart).toBe(0);
        expect(tracker3.getCalls().onStart).toBe(0);
      });

      it("should handle unsubscribe in reverse order", async () => {
        const orderTracker: string[] = [];
        const plugin1 = createOrderedPlugin("p1", orderTracker);
        const plugin2 = createOrderedPlugin("p2", orderTracker);

        router.stop();

        const unsub1 = router.usePlugin(plugin1.factory);
        const unsub2 = router.usePlugin(plugin2.factory);

        // Unsubscribe in reverse order
        unsub2();

        await router.start("/home");

        // Only p1 should have onStart called
        expect(orderTracker).toContain("p1");
        expect(orderTracker).not.toContain("p2");

        orderTracker.length = 0;
        unsub1();

        router.stop();
        await router.start("/home");

        // Neither should respond
        expect(orderTracker).not.toContain("p1");
        expect(orderTracker).not.toContain("p2");
      });

      it("should maintain correct state after partial unsubscribe", async () => {
        const orderTracker: string[] = [];
        const p1 = createOrderedPlugin("p1", orderTracker);
        const p2 = createOrderedPlugin("p2", orderTracker);
        const p3 = createOrderedPlugin("p3", orderTracker);

        router.stop();

        const u1 = router.usePlugin(p1.factory);
        const u2 = router.usePlugin(p2.factory);
        const u3 = router.usePlugin(p3.factory);

        // Unsubscribe middle one
        u2();

        await router.start("/home");

        // p1 and p3 should respond, p2 should not
        expect(orderTracker).toContain("p1");
        expect(orderTracker).not.toContain("p2");
        expect(orderTracker).toContain("p3");

        u1();
        u3();

        // Clear after unsubscribes (which add teardown entries)
        orderTracker.length = 0;

        router.stop();
        await router.start("/home");

        // None should respond (only onStart events, no teardowns)
        expect(
          orderTracker.filter((entry) => !entry.includes("teardown")),
        ).toHaveLength(0);
      });
    });

    // 🟡 IMPORTANT: Type validation
    describe("type validation", () => {
      it("should throw TypeError when factory returns non-object", () => {
        const invalidFactory = () => "not a plugin" as any;

        expect(() => {
          router.usePlugin(invalidFactory);
        }).toThrow(TypeError);
        expect(() => {
          router.usePlugin(invalidFactory);
        }).toThrow("must return an object");
      });

      it("should throw TypeError when factory returns null", () => {
        const nullFactory = () => null as any;

        expect(() => {
          router.usePlugin(nullFactory);
        }).toThrow(TypeError);
        expect(() => {
          router.usePlugin(nullFactory);
        }).toThrow("must return an object");
      });

      it("should throw TypeError when factory returns undefined", () => {
        const undefinedFactory = () => undefined as any;

        expect(() => {
          router.usePlugin(undefinedFactory);
        }).toThrow(TypeError);
        expect(() => {
          router.usePlugin(undefinedFactory);
        }).toThrow("must return an object");
      });

      it("should throw TypeError when factory returns array", () => {
        const arrayFactory = () => [] as any;

        expect(() => {
          router.usePlugin(arrayFactory);
        }).toThrow(TypeError);
        expect(() => {
          router.usePlugin(arrayFactory);
        }).toThrow("must return an object");
      });

      it("should silently skip null, undefined, false (falsy plugin values)", () => {
        expect(() => router.usePlugin(null)).not.toThrow();
        expect(() => router.usePlugin(undefined)).not.toThrow();
        expect(() => router.usePlugin(false)).not.toThrow();
        expect(() => router.usePlugin(null, undefined, false)).not.toThrow();
      });

      it("should return noop unsubscribe when all plugins are falsy", () => {
        const unsub = router.usePlugin(null, false, undefined);

        expect(unsub).toBeTypeOf("function");
        expect(() => {
          unsub();
        }).not.toThrow();
      });

      it("should register valid plugins and skip falsy in mixed call", async () => {
        router.stop();
        const tracker = createTrackingPlugin();

        router.usePlugin(false, tracker.factory, null, undefined);
        await router.start("/home");

        expect(tracker.getCalls().onStart).toBe(1);
      });

      it("without validation plugin, plugin with unknown properties does NOT throw", () => {
        const factory = () =>
          ({
            onStart: vi.fn(),
            unknownProp: "invalid",
          }) as any;

        expect(() => {
          router.usePlugin(factory);
        }).not.toThrow();
      });

      it("should throw TypeError when factory returns Promise (async factory)", () => {
        // Simulate async factory returning a Promise
        const asyncFactory = () => Promise.resolve({ onStart: vi.fn() });

        expect(() => {
          router.usePlugin(asyncFactory as any);
        }).toThrow(TypeError);
        expect(() => {
          router.usePlugin(asyncFactory as any);
        }).toThrow("Async plugin factories are not supported");
      });

      it("should throw TypeError for Promise-like objects (thenable)", () => {
        // Thenable - object with then method
        const thenableFactory = () => ({
          // eslint-disable-next-line unicorn/no-thenable
          then: vi.fn(),
          onStart: vi.fn(),
        });

        expect(() => {
          router.usePlugin(thenableFactory as any);
        }).toThrow(TypeError);
        expect(() => {
          router.usePlugin(thenableFactory as any);
        }).toThrow("Factory returned a Promise instead of a plugin object");
      });

      it("should allow all valid plugin methods", async () => {
        const tracker = createTrackingPlugin();

        expect(() => {
          router.usePlugin(tracker.factory);
        }).not.toThrow();

        // Verify plugin is registered by checking it responds to events
        router.stop();
        await router.start("/home");

        expect(tracker.getCalls().onStart).toBe(1);
      });
    });

    // 🟡 IMPORTANT: Graceful cleanup on errors
    describe("graceful cleanup on errors", () => {
      it("should continue cleanup even if teardown throws", async () => {
        const teardown1 = vi.fn();
        const teardown2 = vi.fn(() => {
          throw new Error("Teardown2 error");
        });
        const teardown3 = vi.fn();

        const f1 = () => ({ teardown: teardown1 });
        const f2 = () => ({ teardown: teardown2 });
        const f3 = () => ({ teardown: teardown3 });

        const unsub = router.usePlugin(f1, f2, f3);

        // Unsubscribe should not throw even if teardown2 throws
        expect(() => {
          unsub();
        }).not.toThrow();

        // All teardowns should be called
        expect(teardown1).toHaveBeenCalled();
        expect(teardown2).toHaveBeenCalled();
        expect(teardown3).toHaveBeenCalled();

        // Verify all plugins are removed - register new tracker
        const tracker = createTrackingPlugin();

        router.usePlugin(tracker.factory);

        router.stop();
        await router.start("/home");

        // Only the new tracker should respond
        expect(tracker.getCalls().onStart).toBe(1);
      });

      it("should handle multiple unsubscribe calls safely (idempotent)", () => {
        const teardown = vi.fn();
        const factory = () => ({ teardown });

        const unsub = router.usePlugin(factory);

        unsub();

        expect(teardown).toHaveBeenCalledTimes(1);

        // Second call should be safe no-op
        expect(() => {
          unsub();
        }).not.toThrow();

        // Third call should also be safe no-op
        expect(() => {
          unsub();
        }).not.toThrow();

        // Teardown should only be called once (idempotent unsubscribe)
        expect(teardown).toHaveBeenCalledTimes(1);
      });

      it("should handle multiple unsubscribe calls safely with multi-plugin batch", () => {
        const teardown1 = vi.fn();
        const teardown2 = vi.fn();
        const factory1 = () => ({ teardown: teardown1 });
        const factory2 = () => ({ teardown: teardown2 });

        const unsub = router.usePlugin(factory1, factory2);

        unsub();

        expect(teardown1).toHaveBeenCalledTimes(1);
        expect(teardown2).toHaveBeenCalledTimes(1);

        // Second call should be safe no-op
        expect(() => {
          unsub();
        }).not.toThrow();

        // Third call should also be safe no-op
        expect(() => {
          unsub();
        }).not.toThrow();

        // Teardowns should only be called once (idempotent unsubscribe)
        expect(teardown1).toHaveBeenCalledTimes(1);
        expect(teardown2).toHaveBeenCalledTimes(1);
      });
    });

    // 🟡 IMPORTANT: Immutability protection
    describe("immutability protection", () => {
      it("should freeze plugin object to prevent modifications", async () => {
        const onStart = vi.fn();
        const factory = () => ({ onStart });

        router.usePlugin(factory);

        // Try to get the plugin object (through router internals would fail)
        // We test the behavior by ensuring the original function reference is used

        router.stop();
        await router.start("/home");

        // onStart should have been called with original reference
        expect(onStart).toHaveBeenCalled();
      });

      it("should prevent adding new properties to plugin after registration", () => {
        const plugin = { onStart: vi.fn() };
        const factory = () => plugin;

        router.usePlugin(factory);

        // Attempt to modify plugin (should be frozen)
        expect(() => {
          (plugin as any).newProperty = "test";
        }).toThrow(); // Will throw in strict mode
      });
    });

    // 🟡 IMPORTANT: Non-function plugin methods (warning + skip)
    describe("non-function plugin methods", () => {
      it("should skip non-function onStart property (without validation plugin, no warn)", async () => {
        const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});

        const factory = () => ({ onStart: "not a function" }) as any;

        expect(() => {
          router.usePlugin(factory);
        }).not.toThrow();

        expect(warnSpy).not.toHaveBeenCalledWith(
          "router.usePlugin",
          "Property 'onStart' is not a function, skipping",
        );

        warnSpy.mockRestore();
      });

      it("without validation plugin, non-function methods do NOT log warn", async () => {
        router.stop();

        const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});

        const factory = () =>
          ({
            onStart: "string value",
            onStop: 123,
            onTransitionSuccess: null,
          }) as any;

        router.usePlugin(factory);

        expect(warnSpy).not.toHaveBeenCalledWith(
          "router.usePlugin",
          "Property 'onStart' is not a function, skipping",
        );

        router.start("/home").catch(() => {});
        router.stop();

        warnSpy.mockRestore();
      });

      it("should subscribe only function methods (without validation plugin, no warn for non-functions)", async () => {
        router.stop();

        const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});

        const onStartFn = vi.fn();
        const factory = () =>
          ({
            onStart: onStartFn,
            onStop: "not a function",
          }) as any;

        router.usePlugin(factory);
        await router.start("/home");

        expect(onStartFn).toHaveBeenCalled();

        expect(warnSpy).not.toHaveBeenCalledWith(
          "router.usePlugin",
          "Property 'onStop' is not a function, skipping",
        );

        warnSpy.mockRestore();
      });
    });

    // 🟡 IMPORTANT: Warning messages
    describe("warning messages", () => {
      it("without validation plugin, registering 10+ plugins does NOT log warn", () => {
        const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});

        // Register 10 plugins (would cross WARN threshold with plugin)
        const factories = Array.from({ length: 10 }, () => () => ({}));

        factories.forEach((f) => router.usePlugin(f));

        // Without validation plugin, no threshold warning is emitted
        expect(warnSpy).not.toHaveBeenCalledWith(
          "router.usePlugin",
          expect.stringContaining("plugins registered"),
        );

        warnSpy.mockRestore();
      });

      it("without validation plugin, registering 25+ plugins does NOT log error", () => {
        const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => {});

        // Register 25 plugins (would cross ERROR threshold with plugin)
        const factories = Array.from({ length: 25 }, () => () => ({}));

        factories.forEach((f) => router.usePlugin(f));

        // Without validation plugin, no threshold error is emitted
        expect(errorSpy).not.toHaveBeenCalledWith(
          "router.usePlugin",
          expect.stringContaining("plugins registered"),
        );

        errorSpy.mockRestore();
      });

      it("without validation plugin, registering onStart after start does NOT log warn", () => {
        const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});

        // Router is already started in beforeEach
        expect(router.isActive()).toBe(true);

        const factory = () => ({ onStart: vi.fn() });

        router.usePlugin(factory);

        expect(warnSpy).not.toHaveBeenCalledWith(
          "router.usePlugin",
          "Router already started, onStart will not be called",
        );

        warnSpy.mockRestore();
      });

      it("should not warn about onStart if router is not started", () => {
        const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});

        router.stop();

        const factory = () => ({ onStart: vi.fn() });

        router.usePlugin(factory);

        // Logger format: logger.warn(context, message)
        expect(warnSpy).not.toHaveBeenCalledWith(
          "router.usePlugin",
          expect.stringContaining("onStart will not be called"),
        );

        warnSpy.mockRestore();
      });
    });

    // 🟡 IMPORTANT: Cleanup error logging
    describe("cleanup error logging", () => {
      it("should log error when teardown throws during unsubscribe", () => {
        const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => {});

        const teardownError = new Error("Teardown failed");
        const factory = () => ({
          teardown: () => {
            throw teardownError;
          },
        });

        const unsub = router.usePlugin(factory);

        // Should not throw
        expect(() => {
          unsub();
        }).not.toThrow();

        // Should log the error
        // Logger format: logger.error(context, message, error)
        expect(errorSpy).toHaveBeenCalledWith(
          "router.usePlugin",
          "Error during cleanup:",
          teardownError,
        );

        errorSpy.mockRestore();
      });
    });

    // 🟢 DESIRABLE: Edge cases
    describe("edge cases", () => {
      it("should handle call with no parameters", () => {
        const unsub = router.usePlugin();

        expectTypeOf(unsub).toBeFunction();

        // Unsubscribe should be safe no-op
        expect(() => {
          unsub();
        }).not.toThrow();
      });

      it("should return function for empty batch", () => {
        const unsub = router.usePlugin();

        expect(unsub).toBeInstanceOf(Function);

        unsub(); // Should not throw
      });

      it("should handle plugin with only teardown method", () => {
        const teardown = vi.fn();
        const factory = () => ({ teardown });

        const unsub = router.usePlugin(factory);

        unsub();

        expect(teardown).toHaveBeenCalled();
      });

      it("should handle empty plugin object", async () => {
        const factory = () => ({});

        expect(() => {
          router.usePlugin(factory);
        }).not.toThrow();

        // Verify plugin was registered - should not throw on restart
        router.stop();
        await router.start("/home");
      });

      it("should provide getDependency function to plugin factory", () => {
        const deps = getDependenciesApi(router);

        (deps as any).set("apiKey", "my-api-key-456");

        let capturedApiKey: string | undefined;
        const factoryUsingDeps = (
          _r: typeof router,
          getDep: (key: string) => unknown,
        ) => {
          capturedApiKey = getDep("apiKey") as string;

          return {
            onStart: vi.fn(),
          };
        };

        router.usePlugin(factoryUsingDeps as any);

        expect(capturedApiKey).toBe("my-api-key-456");

        deps.remove("apiKey" as never);
      });
    });

    // 🟢 DESIRABLE: Return value
    describe("return value", () => {
      it("should always return unsubscribe function", () => {
        const factory = () => ({ onStart: vi.fn() });

        const result = router.usePlugin(factory);

        expect(typeof result).toBe("function");
      });

      it("should return function even for empty call", () => {
        const result = router.usePlugin();

        expect(typeof result).toBe("function");
      });

      it("should return different unsubscribe functions for different calls", () => {
        const f1 = () => ({ onStart: vi.fn() });
        const f2 = () => ({ onStart: vi.fn() });

        const unsub1 = router.usePlugin(f1);
        const unsub2 = router.usePlugin(f2);

        expect(unsub1).not.toBe(unsub2);

        expectTypeOf(unsub1).toBeFunction();
        expectTypeOf(unsub2).toBeFunction();
      });
    });
  });
});
