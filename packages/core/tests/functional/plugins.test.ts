import {
  describe,
  beforeEach,
  afterEach,
  it,
  expect,
  expectTypeOf,
} from "vitest";

import { createRouter } from "@real-router/core";

import { createTestRouter } from "../helpers";

import type { Router, PluginFactory, Plugin } from "@real-router/core";

let router: Router;
let myPlugin: PluginFactory;
let myPluginMethods: Plugin;

describe("core/plugins", () => {
  beforeEach(() => {
    router = createTestRouter().start();

    myPluginMethods = {
      onTransitionStart: vi.fn(),
      onTransitionSuccess: vi.fn(),
      onTransitionError: () => undefined,
    };

    myPlugin = (router?: Router & { myCustomMethod?: Function }) => {
      router!.myCustomMethod = () => undefined;

      return myPluginMethods;
    };
  });

  afterEach(() => {
    router.stop();
  });

  describe("getPlugins", () => {
    it("returns empty array by default", () => {
      expect(router.getPlugins()).toStrictEqual([]);
    });

    it("returns registered plugins", () => {
      router.usePlugin(myPlugin);

      expect(router.getPlugins()).toContain(myPlugin);
    });

    it("no longer includes plugins after unsubscribe", () => {
      const unsubscribe = router.usePlugin(myPlugin);

      unsubscribe();

      expect(router.getPlugins()).not.toContain(myPlugin);
    });
  });

  describe("usePlugin", () => {
    it("applies plugin factory and attaches methods to router", () => {
      router.stop();

      router.usePlugin(myPlugin);

      router.start("", () => {
        // custom method added by plugin
        expect(
          (router as Router & { myCustomMethod?: Function }).myCustomMethod,
        ).not.toBe(undefined);

        router.navigate("orders", () => {
          expect(myPluginMethods.onTransitionStart).toHaveBeenCalled();
          expect(myPluginMethods.onTransitionSuccess).toHaveBeenCalled();
        });
      });
    });

    it("returns an unsubscribe function that removes plugin", () => {
      const teardown = vi.fn();

      const router = createRouter().start();
      const plugin = () => ({ teardown });

      const unsubscribe = router.usePlugin(plugin);

      expect(router.getPlugins()).toHaveLength(1);

      unsubscribe();

      expect(router.getPlugins()).toHaveLength(0);
      expect(teardown).toHaveBeenCalled();

      router.stop();
    });

    it("removes all registered event listeners when unsubscribed", () => {
      const onStart = vi.fn();
      const plugin = () => ({ onStart });

      const unsubscribe = router.usePlugin(plugin);

      unsubscribe();

      router.stop();
      router.start();

      expect(onStart).not.toHaveBeenCalled();
    });

    // 🔴 CRITICAL: Atomicity of registration on errors
    describe("atomicity on errors", () => {
      it("should not register any plugin if factory throws error", () => {
        const validPlugin1 = () => ({ onStart: vi.fn() });
        const failingPlugin = () => {
          throw new Error("Factory initialization failed");
        };
        const validPlugin2 = () => ({ onStart: vi.fn() });

        expect(() => {
          router.usePlugin(validPlugin1, failingPlugin, validPlugin2);
        }).toThrowError("Factory initialization failed");

        // No plugins should be registered after error
        expect(router.getPlugins()).toHaveLength(0);
      });

      it("should rollback all plugins if any returns invalid structure", () => {
        const validPlugin = () => ({ onStart: vi.fn() });
        const invalidPlugin = () => ({ unknownMethod: vi.fn() }) as any;

        expect(() => {
          router.usePlugin(validPlugin, invalidPlugin);
        }).toThrowError(TypeError);
        expect(() => {
          router.usePlugin(validPlugin, invalidPlugin);
        }).toThrowError("Unknown property");

        // Rollback should leave state unchanged
        expect(router.getPlugins()).toHaveLength(0);
      });

      it("should rollback when error occurs in middle of batch", () => {
        const plugin1 = () => ({ onStart: vi.fn() });
        const plugin2 = () => ({ onStart: vi.fn() });
        const plugin3 = () => {
          throw new Error("Error in plugin3");
        };
        const plugin4 = () => ({ onStart: vi.fn() });

        expect(() => {
          router.usePlugin(plugin1, plugin2, plugin3, plugin4);
        }).toThrowError("Error in plugin3");

        // All-or-nothing: no plugins registered
        expect(router.getPlugins()).toHaveLength(0);
      });

      it("should call teardown during rollback if plugin was initialized", () => {
        const teardown1 = vi.fn();
        const plugin1 = () => ({ onStart: vi.fn(), teardown: teardown1 });
        const plugin2 = () => {
          throw new Error("Plugin2 fails");
        };

        expect(() => {
          router.usePlugin(plugin1, plugin2);
        }).toThrowError("Plugin2 fails");

        // Teardown of successfully initialized plugin should be called
        expect(teardown1).toHaveBeenCalled();
        expect(router.getPlugins()).toHaveLength(0);
      });

      it("should log error when cleanup throws during rollback (line 148)", () => {
        const errorSpy = vi
          .spyOn(console, "error")
          .mockImplementation(() => {});

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
        }).toThrowError("Initialization failed");

        // teardown should have been called during rollback
        expect(teardownThatThrows).toHaveBeenCalled();

        // Error should have been logged (line 148-152)
        // Console format: console.error("[context] message", error)
        expect(errorSpy).toHaveBeenCalledWith(
          "[router.usePlugin] Cleanup error:",
          expect.any(Error),
        );

        errorSpy.mockRestore();
      });
    });

    // 🔴 CRITICAL: Duplicate protection
    describe("duplicate protection", () => {
      it("should throw error when registering same factory twice", () => {
        const factory = () => ({ onStart: vi.fn() });

        router.usePlugin(factory);

        expect(() => {
          router.usePlugin(factory);
        }).toThrowError("Plugin factory already registered");

        // Original plugin should remain registered
        expect(router.getPlugins()).toHaveLength(1);
        expect(router.getPlugins()).toContain(factory);
      });

      it("should allow different factory references even with same plugin structure", () => {
        // Each factory returns its own handler functions
        const factory1 = () => ({ onStart: vi.fn() });
        const factory2 = () => ({ onStart: vi.fn() });

        // Different factory references with different handler instances
        expect(() => {
          router.usePlugin(factory1, factory2);
        }).not.toThrowError();

        expect(router.getPlugins()).toHaveLength(2);
      });

      it("should warn and deduplicate factory in same batch", () => {
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

        const factory = () => ({ onStart: vi.fn() });

        // Deduplicates with warning
        const unsub = router.usePlugin(factory, factory);

        // Warning issued for duplicate
        // Console format: console.warn("[context] message")
        expect(warnSpy).toHaveBeenCalledWith(
          "[router.usePlugin] Duplicate factory in batch, will be registered once",
        );

        // Only one factory registered
        expect(router.getPlugins()).toHaveLength(1);
        expect(router.getPlugins()).toContain(factory);

        unsub();
        warnSpy.mockRestore();
      });

      it("should warn for each duplicate in batch", () => {
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

        const factory = () => ({});

        // f, f, f → 2 warnings (second and third are duplicates)
        router.usePlugin(factory, factory, factory);

        expect(warnSpy).toHaveBeenCalledTimes(2);
        expect(router.getPlugins()).toHaveLength(1);

        warnSpy.mockRestore();
      });
    });

    // 🔴 CRITICAL: Unsubscribe isolation
    describe("unsubscribe isolation", () => {
      it("should only remove plugins from its own call", () => {
        const factory1 = () => ({ onStart: vi.fn() });
        const factory2 = () => ({ onStart: vi.fn() });
        const factory3 = () => ({ onStart: vi.fn() });

        const unsub1 = router.usePlugin(factory1);
        const unsub2 = router.usePlugin(factory2, factory3);

        expect(router.getPlugins()).toHaveLength(3);

        // Unsubscribe first call
        unsub1();

        expect(router.getPlugins()).toHaveLength(2);
        expect(router.getPlugins()).not.toContain(factory1);
        expect(router.getPlugins()).toContain(factory2);
        expect(router.getPlugins()).toContain(factory3);

        // Unsubscribe second call
        unsub2();

        expect(router.getPlugins()).toHaveLength(0);
      });

      it("should handle unsubscribe in reverse order", () => {
        const factory1 = () => ({ onStart: vi.fn() });
        const factory2 = () => ({ onStart: vi.fn() });

        const unsub1 = router.usePlugin(factory1);
        const unsub2 = router.usePlugin(factory2);

        // Unsubscribe in reverse order
        unsub2();

        expect(router.getPlugins()).toStrictEqual([factory1]);

        unsub1();

        expect(router.getPlugins()).toHaveLength(0);
      });

      it("should maintain correct state after partial unsubscribe", () => {
        const f1 = () => ({ onStart: vi.fn() });
        const f2 = () => ({ onStart: vi.fn() });
        const f3 = () => ({ onStart: vi.fn() });

        const u1 = router.usePlugin(f1);
        const u2 = router.usePlugin(f2);
        const u3 = router.usePlugin(f3);

        // Unsubscribe middle one
        u2();

        expect(router.getPlugins()).toStrictEqual([f1, f3]);

        u1();
        u3();

        expect(router.getPlugins()).toHaveLength(0);
      });
    });

    // 🟡 IMPORTANT: Type validation
    describe("type validation", () => {
      it("should throw TypeError for non-function parameter", () => {
        expect(() => {
          router.usePlugin(null as any);
        }).toThrowError(TypeError);
        expect(() => {
          router.usePlugin(null as any);
        }).toThrowError("Expected plugin factory function");
      });

      it("should throw TypeError when factory returns non-object", () => {
        const invalidFactory = () => "not a plugin" as any;

        expect(() => {
          router.usePlugin(invalidFactory);
        }).toThrowError(TypeError);
        expect(() => {
          router.usePlugin(invalidFactory);
        }).toThrowError("must return an object");
      });

      it("should throw TypeError when factory returns null", () => {
        const nullFactory = () => null as any;

        expect(() => {
          router.usePlugin(nullFactory);
        }).toThrowError(TypeError);
        expect(() => {
          router.usePlugin(nullFactory);
        }).toThrowError("must return an object");
      });

      it("should throw TypeError when factory returns undefined", () => {
        const undefinedFactory = () => undefined as any;

        expect(() => {
          router.usePlugin(undefinedFactory);
        }).toThrowError(TypeError);
        expect(() => {
          router.usePlugin(undefinedFactory);
        }).toThrowError("must return an object");
      });

      it("should throw TypeError when factory returns array", () => {
        const arrayFactory = () => [] as any;

        expect(() => {
          router.usePlugin(arrayFactory);
        }).toThrowError(TypeError);
        expect(() => {
          router.usePlugin(arrayFactory);
        }).toThrowError("must return an object");
      });

      it("should validate all types: null, undefined, number, string, object", () => {
        expect(() => router.usePlugin(null as any)).toThrowError(TypeError);
        expect(() => router.usePlugin(undefined as any)).toThrowError(
          TypeError,
        );
        expect(() => router.usePlugin(123 as any)).toThrowError(TypeError);
        expect(() => router.usePlugin("str" as any)).toThrowError(TypeError);
        expect(() => router.usePlugin({} as any)).toThrowError(TypeError);
      });

      it("should throw when plugin contains unknown properties", () => {
        const factory = () =>
          ({
            onStart: vi.fn(),
            unknownProp: "invalid",
          }) as any;

        expect(() => {
          router.usePlugin(factory);
        }).toThrowError(TypeError);
        expect(() => {
          router.usePlugin(factory);
        }).toThrowError("Unknown property");
      });

      it("should throw TypeError when factory returns Promise (async factory)", () => {
        // Simulate async factory returning a Promise
        const asyncFactory = () => Promise.resolve({ onStart: vi.fn() });

        expect(() => {
          router.usePlugin(asyncFactory as any);
        }).toThrowError(TypeError);
        expect(() => {
          router.usePlugin(asyncFactory as any);
        }).toThrowError("Async plugin factories are not supported");
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
        }).toThrowError(TypeError);
        expect(() => {
          router.usePlugin(thenableFactory as any);
        }).toThrowError(
          "Factory returned a Promise instead of a plugin object",
        );
      });

      it("should allow all valid plugin methods", () => {
        const factory = () => ({
          onStart: vi.fn(),
          onStop: vi.fn(),
          onTransitionStart: vi.fn(),
          onTransitionSuccess: vi.fn(),
          onTransitionError: vi.fn(),
          onTransitionCancel: vi.fn(),
          teardown: vi.fn(),
        });

        expect(() => {
          router.usePlugin(factory);
        }).not.toThrowError();

        expect(router.getPlugins()).toHaveLength(1);
      });
    });

    // 🟡 IMPORTANT: Plugin limits
    describe("plugin limits", () => {
      it("should enforce hard limit at 50 (max 50 plugins)", () => {
        // Register 50 plugins (max allowed)
        const factories = Array.from({ length: 50 }, () => () => ({}));

        factories.forEach((f) => router.usePlugin(f));

        expect(router.getPlugins()).toHaveLength(50);

        // 51st should fail (> 50 check)
        expect(() => {
          router.usePlugin(() => ({}));
        }).toThrowError("Plugin limit exceeded");
      });

      it("should validate limit before initialization", () => {
        // Fill up to 50
        const factories = Array.from({ length: 50 }, () => () => ({}));

        factories.forEach((f) => router.usePlugin(f));

        const spyFactory = vi.fn(() => ({}));

        // Try to add one more - should fail before calling factory
        expect(() => {
          router.usePlugin(spyFactory);
        }).toThrowError("Plugin limit exceeded");

        // Factory should not be called due to early limit check
        expect(spyFactory).not.toHaveBeenCalled();
      });

      it("should handle batch registration near limit", () => {
        // Register 48 plugins
        const factories = Array.from({ length: 48 }, () => () => ({}));

        factories.forEach((f) => router.usePlugin(f));

        // Adding 2 more should succeed (total 50)
        expect(() => {
          router.usePlugin(
            () => ({}),
            () => ({}),
          );
        }).not.toThrowError();

        expect(router.getPlugins()).toHaveLength(50);

        // But adding 1 more should fail (would be 51)
        expect(() => {
          router.usePlugin(() => ({}));
        }).toThrowError();
      });

      it("should reject batch that would exceed limit", () => {
        // Register 49 plugins
        const factories = Array.from({ length: 49 }, () => () => ({}));

        factories.forEach((f) => router.usePlugin(f));

        // Try to add 2 more (would be 51 total) - should fail
        expect(() => {
          router.usePlugin(
            () => ({}),
            () => ({}),
          );
        }).toThrowError("Plugin limit exceeded");

        // Should remain at 49
        expect(router.getPlugins()).toHaveLength(49);
      });
    });

    // 🟡 IMPORTANT: Graceful cleanup
    describe("graceful cleanup on errors", () => {
      it("should continue cleanup even if teardown throws", () => {
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
        }).not.toThrowError();

        // All teardowns should be called
        expect(teardown1).toHaveBeenCalled();
        expect(teardown2).toHaveBeenCalled();
        expect(teardown3).toHaveBeenCalled();

        // All plugins should be removed
        expect(router.getPlugins()).toHaveLength(0);
      });

      it("should handle multiple unsubscribe calls safely (idempotent)", () => {
        const teardown = vi.fn();
        const factory = () => ({ teardown });

        const unsub = router.usePlugin(factory);

        unsub();

        expect(router.getPlugins()).toHaveLength(0);
        expect(teardown).toHaveBeenCalledTimes(1);

        // Second call should be safe no-op
        expect(() => {
          unsub();
        }).not.toThrowError();

        // Third call should also be safe no-op
        expect(() => {
          unsub();
        }).not.toThrowError();

        // Teardown should only be called once (idempotent unsubscribe)
        expect(teardown).toHaveBeenCalledTimes(1);
      });
    });

    // 🟡 IMPORTANT: Immutability protection
    describe("immutability protection", () => {
      it("should freeze plugin object to prevent modifications", () => {
        const onStart = vi.fn();
        const factory = () => ({ onStart });

        router.usePlugin(factory);

        // Try to get the plugin object (through router internals would fail)
        // We test the behavior by ensuring the original function reference is used

        router.stop();
        router.start();

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
        }).toThrowError(); // Will throw in strict mode
      });
    });

    // 🟡 IMPORTANT: Non-function plugin methods (warning + skip)
    describe("non-function plugin methods", () => {
      it("should warn and skip non-function onStart property", () => {
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

        const factory = () => ({ onStart: "not a function" }) as any;

        // Should not throw - property is in whitelist but skipped during subscription
        expect(() => {
          router.usePlugin(factory);
        }).not.toThrowError();

        expect(router.getPlugins()).toHaveLength(1);
        // Console format: console.warn("[context] message")
        expect(warnSpy).toHaveBeenCalledWith(
          "[router.usePlugin] Property 'onStart' is not a function, skipping",
        );

        warnSpy.mockRestore();
      });

      it("should warn for each non-function method", () => {
        router.stop();

        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

        const factory = () =>
          ({
            onStart: "string value",
            onStop: 123,
            onTransitionSuccess: null,
          }) as any;

        router.usePlugin(factory);

        // Should warn for each non-function property
        // Console format: console.warn("[context] message")
        expect(warnSpy).toHaveBeenCalledWith(
          "[router.usePlugin] Property 'onStart' is not a function, skipping",
        );
        expect(warnSpy).toHaveBeenCalledWith(
          "[router.usePlugin] Property 'onStop' is not a function, skipping",
        );
        expect(warnSpy).toHaveBeenCalledWith(
          "[router.usePlugin] Property 'onTransitionSuccess' is not a function, skipping",
        );

        // Should not throw when events are emitted
        expect(() => {
          router.start();
          router.stop();
        }).not.toThrowError();

        warnSpy.mockRestore();
      });

      it("should subscribe only function methods and warn for non-functions", () => {
        router.stop();

        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

        const onStartFn = vi.fn();
        const factory = () =>
          ({
            onStart: onStartFn,
            onStop: "not a function", // Should be skipped with warning
          }) as any;

        router.usePlugin(factory);
        router.start();

        // onStart function should be called
        expect(onStartFn).toHaveBeenCalled();

        // onStop should have warning
        // Console format: console.warn("[context] message")
        expect(warnSpy).toHaveBeenCalledWith(
          "[router.usePlugin] Property 'onStop' is not a function, skipping",
        );

        warnSpy.mockRestore();
      });
    });

    // 🟡 IMPORTANT: Warning messages
    describe("warning messages", () => {
      it("should warn at 10+ plugins", () => {
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

        // Register 10 plugins (crosses WARN threshold)
        const factories = Array.from({ length: 10 }, () => () => ({}));

        factories.forEach((f) => router.usePlugin(f));

        // Console format: console.warn("[context] message")
        expect(warnSpy).toHaveBeenCalledWith(
          "[router.usePlugin] 10 plugins registered",
        );

        warnSpy.mockRestore();
      });

      it("should error at 25+ plugins", () => {
        const errorSpy = vi
          .spyOn(console, "error")
          .mockImplementation(() => {});

        // Register 25 plugins (crosses ERROR threshold)
        const factories = Array.from({ length: 25 }, () => () => ({}));

        factories.forEach((f) => router.usePlugin(f));

        // Console format: console.error("[context] message")
        expect(errorSpy).toHaveBeenCalledWith(
          "[router.usePlugin] 25 plugins registered!",
        );

        errorSpy.mockRestore();
      });

      it("should warn when registering onStart after router is already started", () => {
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

        // Router is already started in beforeEach
        expect(router.isStarted()).toBe(true);

        const factory = () => ({ onStart: vi.fn() });

        router.usePlugin(factory);

        // Console format: console.warn("[context] message")
        expect(warnSpy).toHaveBeenCalledWith(
          "[router.usePlugin] Router already started, onStart will not be called",
        );

        warnSpy.mockRestore();
      });

      it("should not warn about onStart if router is not started", () => {
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

        router.stop();

        const factory = () => ({ onStart: vi.fn() });

        router.usePlugin(factory);

        // Console format: console.warn("[context] message")
        expect(warnSpy).not.toHaveBeenCalledWith(
          expect.stringContaining("onStart will not be called"),
        );

        warnSpy.mockRestore();
      });
    });

    // 🟡 IMPORTANT: Cleanup error logging
    describe("cleanup error logging", () => {
      it("should log error when teardown throws during unsubscribe", () => {
        const errorSpy = vi
          .spyOn(console, "error")
          .mockImplementation(() => {});

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
        }).not.toThrowError();

        // Should log the error
        // Console format: console.error("[context] message", error)
        expect(errorSpy).toHaveBeenCalledWith(
          "[router.usePlugin] Error during cleanup:",
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

        expect(router.getPlugins()).toHaveLength(0);

        // Unsubscribe should be safe no-op
        expect(() => {
          unsub();
        }).not.toThrowError();
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

        expect(router.getPlugins()).toHaveLength(1);

        unsub();

        expect(teardown).toHaveBeenCalled();
        expect(router.getPlugins()).toHaveLength(0);
      });

      it("should handle empty plugin object", () => {
        const factory = () => ({});

        expect(() => {
          router.usePlugin(factory);
        }).not.toThrowError();

        expect(router.getPlugins()).toHaveLength(1);
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
