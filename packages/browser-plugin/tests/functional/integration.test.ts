// Integration tests for browserPlugin with synthetic plugins
// Uses mock plugins to test various edge cases and scenarios

import { createRouter } from "@real-router/core";
import {
  describe,
  beforeAll,
  beforeEach,
  afterEach,
  afterAll,
  it,
  expect,
} from "vitest";

import { browserPluginFactory } from "@real-router/browser-plugin";

import { createSafeBrowser } from "../../src/browser";
import { noop } from "../../src/utils";
import {
  createTrackingPlugin,
  createStateModifierPlugin,
  createErrorPlugin,
  createPersistentParamsPlugin,
  createLoggerPlugin,
  createAsyncPlugin,
} from "../helpers/mockPlugins";

import type { Browser, HistoryState } from "../../src/types";
import type { Router, State, Unsubscribe } from "@real-router/core";

let router: Router;
let currentHistoryState: State | undefined;
let mockedBrowser: Browser;
let unsubscribe: Unsubscribe | undefined;

const createMockedBrowser = (): Browser => {
  const safeBrowser = createSafeBrowser();

  return {
    ...safeBrowser,
    getBase: () => globalThis.location.pathname,
    pushState: (state, title, url) => {
      currentHistoryState = state;
      safeBrowser.pushState(state, title, url);
    },
    replaceState: (state, title, url) => {
      currentHistoryState = state;
      safeBrowser.replaceState(state, title, url);
    },
    getState: () => currentHistoryState as HistoryState,
  };
};

const routerConfig = [
  {
    name: "users",
    path: "/users",
    children: [
      { name: "view", path: "/view/:id" },
      { name: "list", path: "/list" },
    ],
  },
  { name: "home", path: "/home" },
  { name: "index", path: "/" },
];

describe("Browser Plugin Integration", () => {
  beforeAll(() => {
    vi.spyOn(console, "error").mockImplementation(noop);
    vi.spyOn(console, "warn").mockImplementation(noop);
  });

  beforeEach(async () => {
    mockedBrowser = createMockedBrowser();
    globalThis.history.replaceState({}, "", "/");

    router = createRouter(routerConfig, {
      defaultRoute: "home",
      queryParamsMode: "default",
    });

    currentHistoryState = undefined;
  });

  afterEach(() => {
    router.stop();
    unsubscribe?.();
    vi.clearAllMocks();
  });

  afterAll(() => {
    (console.error as unknown as { mockRestore?: () => void }).mockRestore?.();
    (console.warn as unknown as { mockRestore?: () => void }).mockRestore?.();
  });

  describe("Hook Execution Order", () => {
    it("calls plugins in registration order", async () => {
      const executionOrder: string[] = [];

      router.usePlugin(
        createTrackingPlugin({ namespace: "plugin1", executionOrder }),
      );
      router.usePlugin(
        createTrackingPlugin({ namespace: "plugin2", executionOrder }),
      );
      router.usePlugin(browserPluginFactory({}, mockedBrowser));

      // Track browser plugin manually
      vi.spyOn(mockedBrowser, "replaceState").mockImplementation(
        (...args: any[]) => {
          executionOrder.push("browser:replaceState");
          currentHistoryState = args[0];
        },
      );
      vi.spyOn(mockedBrowser, "pushState").mockImplementation(
        (...args: any[]) => {
          executionOrder.push("browser:pushState");
          currentHistoryState = args[0];
        },
      );

      await router.start();
      await router.navigate("users.list");

      // Verify execution order - hooks fire in order per lifecycle stage
      // Note: Two-phase start (Issue #50) means TRANSITION_START fires before ROUTER_START
      // because the transition must complete before router is considered "started"
      expect(executionOrder).toStrictEqual([
        "plugin1:onTransitionStart", // Start transition begins
        "plugin2:onTransitionStart",
        "plugin1:onStart", // Router marked as started after successful transition
        "plugin2:onStart",
        "plugin1:onTransitionSuccess", // Start transition completes
        "plugin2:onTransitionSuccess",
        "browser:replaceState", // Browser plugin updates history for start()
        "plugin1:onTransitionStart", // Navigate transition begins
        "plugin2:onTransitionStart",
        "plugin1:onTransitionSuccess",
        "plugin2:onTransitionSuccess",
        "browser:pushState", // Browser plugin updates history for navigate()
      ]);
    });

    it("browser plugin updates URL in registration order", async () => {
      const executionOrder: string[] = [];
      const stateHistory: State[] = [];

      router.usePlugin(
        createTrackingPlugin({
          namespace: "early",
          executionOrder,
          stateHistory,
        }),
      );
      router.usePlugin(browserPluginFactory({}, mockedBrowser));
      router.usePlugin(
        createTrackingPlugin({
          namespace: "late",
          executionOrder,
          stateHistory,
        }),
      );

      vi.spyOn(mockedBrowser, "replaceState").mockImplementation(
        (...args: any[]) => {
          executionOrder.push("browser:replaceState");
          currentHistoryState = args[0];
        },
      );

      await router.start();

      // Browser updates history during its onTransitionSuccess hook
      // which fires after early plugin but before late plugin
      const browserIndex = executionOrder.indexOf("browser:replaceState");
      const earlyIndex = executionOrder.indexOf("early:onTransitionSuccess");
      const lateIndex = executionOrder.indexOf("late:onTransitionSuccess");

      // Browser fires after early (registered before)
      expect(browserIndex).toBeGreaterThan(earlyIndex);
      // Browser fires before late (registered after)
      expect(browserIndex).toBeLessThan(lateIndex);
    });
  });

  describe("State Modification", () => {
    it("handles state modifications by other plugins", async () => {
      const modifiedStates: State[] = [];

      // Plugin that modifies state
      router.usePlugin(
        createStateModifierPlugin({
          modifyState: (state) => {
            state.params.modified = true;
            modifiedStates.push({ ...state });
          },
        }),
      );
      router.usePlugin(browserPluginFactory({}, mockedBrowser));

      await router.start();
      await router.navigate("users.view", { id: "1" });

      // Browser plugin should handle modified state
      expect(currentHistoryState?.params.modified).toBe(true);
      expect(modifiedStates.length).toBeGreaterThan(0);
    });

    it("persistent params work with browser plugin", async () => {
      router.usePlugin(
        createPersistentParamsPlugin({ params: ["lang", "theme"] }),
      );
      router.usePlugin(browserPluginFactory({}, mockedBrowser));

      await router.start();

      // Set persistent params
      await router.navigate("home", { lang: "en", theme: "dark" });

      expect(router.getState()?.params.lang).toBe("en");
      expect(router.getState()?.params.theme).toBe("dark");

      // Navigate to different route - params should persist
      await router.navigate("users.list");

      expect(router.getState()?.params.lang).toBe("en");
      expect(router.getState()?.params.theme).toBe("dark");

      // Browser history should include persistent params
      expect(currentHistoryState?.params.lang).toBe("en");
      expect(currentHistoryState?.params.theme).toBe("dark");
    });
  });

  describe("Error Handling", () => {
    it("handles errors in other plugin hooks gracefully", async () => {
      const executionOrder: string[] = [];

      router.usePlugin(
        createErrorPlugin({
          throwOn: "onTransitionSuccess",
          throwOnce: true,
          error: new Error("Plugin error"),
        }),
      );
      router.usePlugin(
        createTrackingPlugin({ namespace: "after", executionOrder }),
      );
      router.usePlugin(browserPluginFactory({}, mockedBrowser));

      await router.start();
      await router.navigate("users.list");

      // Browser plugin should still work despite error
      expect(currentHistoryState?.name).toBe("users.list");
      // Tracking plugin after error should still execute
      expect(executionOrder).toContain("after:onTransitionSuccess");
    });

    it("browser plugin works when other plugins throw on start", async () => {
      router.usePlugin(
        createErrorPlugin({
          throwOn: "onStart",
          error: new Error("Start error"),
        }),
      );
      router.usePlugin(browserPluginFactory({}, mockedBrowser));

      // Should not crash
      await expect(router.start()).resolves.not.toThrowError();
    });
  });

  describe("Async Plugins", () => {
    it("works with async middleware plugins", async () => {
      router.usePlugin(createAsyncPlugin({ delay: 50 }));
      router.usePlugin(browserPluginFactory({}, mockedBrowser));

      // start() and navigate() return Promises
      await router.start();
      await router.navigate("users.list");

      expect(router.getState()?.name).toBe("users.list");
      expect(currentHistoryState?.name).toBe("users.list");
    });

    it("handles multiple async plugins correctly", async () => {
      const executionOrder: string[] = [];

      router.usePlugin(createAsyncPlugin({ delay: 30 }));
      router.usePlugin(
        createTrackingPlugin({ namespace: "tracking", executionOrder }),
      );
      router.usePlugin(createAsyncPlugin({ delay: 20 }));
      router.usePlugin(browserPluginFactory({}, mockedBrowser));

      // start() and navigate() return Promises
      await router.start();
      await router.navigate("users.view", { id: "42" });

      // All plugins should execute
      expect(executionOrder).toContain("tracking:onTransitionSuccess");
      expect(currentHistoryState?.name).toBe("users.view");
      expect(currentHistoryState?.params.id).toBe("42");
    });
  });

  describe("Multiple Plugins Combinations", () => {
    it("works with 5+ plugins simultaneously", async () => {
      const logs: string[] = [];
      const executionOrder: string[] = [];

      router.usePlugin(createLoggerPlugin({ logs }));
      router.usePlugin(
        createTrackingPlugin({ namespace: "tracker1", executionOrder }),
      );
      router.usePlugin(createPersistentParamsPlugin({ params: ["sessionId"] }));
      router.usePlugin(
        createTrackingPlugin({ namespace: "tracker2", executionOrder }),
      );
      router.usePlugin(browserPluginFactory({}, mockedBrowser));

      await router.start();
      await router.navigate("users.view", { id: "1", sessionId: "abc" });

      // Logger logged events
      expect(logs.length).toBeGreaterThan(0);
      expect(logs).toContain("Success: users.view");

      // Trackers tracked execution
      expect(executionOrder).toContain("tracker1:onTransitionSuccess");
      expect(executionOrder).toContain("tracker2:onTransitionSuccess");

      // Persistent params worked
      await router.navigate("home");

      expect(router.getState()?.params.sessionId).toBe("abc");

      // Browser plugin updated history
      expect(currentHistoryState?.name).toBe("home");
    });

    it("maintains stability with plugin lifecycle operations", async () => {
      const logs: string[] = [];

      router.usePlugin(createLoggerPlugin({ logs }));
      const browserUnsubscribe = router.usePlugin(
        browserPluginFactory({}, mockedBrowser),
      );

      await router.start();
      await router.navigate("users.list");

      expect(currentHistoryState?.name).toBe("users.list");

      // Unsubscribe browser plugin
      browserUnsubscribe();

      // Router should still work
      await router.navigate("home");

      expect(router.getState()?.name).toBe("home");

      // But browser history won't update
      expect(currentHistoryState?.name).toBe("users.list"); // Still old state
    });
  });

  describe("Edge Cases", () => {
    it("handles rapid plugin registrations", async () => {
      const executionOrder: string[] = [];

      // Register many plugins rapidly
      for (let i = 0; i < 10; i++) {
        router.usePlugin(
          createTrackingPlugin({
            namespace: `plugin${i}`,
            executionOrder,
          }),
        );
      }

      router.usePlugin(browserPluginFactory({}, mockedBrowser));

      await router.start();
      await router.navigate("users.list");

      // All plugins should execute
      for (let i = 0; i < 10; i++) {
        expect(executionOrder).toContain(`plugin${i}:onTransitionSuccess`);
      }

      expect(currentHistoryState?.name).toBe("users.list");
    });

    it("handles plugins registered after browser plugin", async () => {
      const executionOrder: string[] = [];

      router.usePlugin(browserPluginFactory({}, mockedBrowser));
      router.usePlugin(
        createTrackingPlugin({ namespace: "late", executionOrder }),
      );

      await router.start();
      await router.navigate("users.list");

      // Late plugin should still execute
      expect(executionOrder).toContain("late:onTransitionSuccess");
      expect(currentHistoryState?.name).toBe("users.list");
    });

    it("handles state with complex nested params", async () => {
      router.usePlugin(
        createStateModifierPlugin({
          modifyState: (state) => {
            state.params.nested = { deep: { value: 42 } };
            state.params.array = [1, 2, 3];
          },
        }),
      );
      router.usePlugin(browserPluginFactory({}, mockedBrowser));

      await router.start();
      await router.navigate("users.list");

      // Browser plugin should handle complex params
      expect(currentHistoryState?.params.nested).toStrictEqual({
        deep: { value: 42 },
      });
      expect(currentHistoryState?.params.array).toStrictEqual([1, 2, 3]);
    });
  });

  describe("Performance", () => {
    it("handles many sequential transitions with multiple plugins", async () => {
      router.usePlugin(createLoggerPlugin());
      router.usePlugin(createTrackingPlugin());
      router.usePlugin(createPersistentParamsPlugin({ params: ["lang"] }));
      router.usePlugin(browserPluginFactory({}, mockedBrowser));

      await router.start();

      // 50 rapid transitions
      for (let i = 0; i < 50; i++) {
        const route = i % 2 === 0 ? "home" : "users.list";

        await router.navigate(route, { lang: "en" });
      }

      // Final state should be correct (49 % 2 === 1, so last route is "users.list")
      expect(router.getState()?.name).toBe("users.list");
      expect(currentHistoryState?.name).toBe("users.list");
      expect(router.getState()?.params.lang).toBe("en");
    });
  });
});
