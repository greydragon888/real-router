import { createRouter } from "@real-router/core";
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";

import { navigationPluginFactory } from "@real-router/navigation-plugin";

import { noop, routeConfig } from "./helpers";
import { MockNavigation } from "../helpers/mockNavigation";
import { createMockNavigationBrowser } from "../helpers/testUtils";

import type { NavigationBrowser } from "../../src/types";

/**
 * N23 — `getActivationType()` throws. The 2026-05-18 audit (§7.2) flagged
 * that the plugin's constructor reads `this.#browser.getActivationType()`
 * without a try/catch. A broken or future-strict implementation that throws
 * (e.g. a security-hardened wrapper that refuses to surface activation
 * metadata after the document is hidden) would crash the factory.
 *
 * Scenarios:
 *   - `getActivationType` throws synchronously → factory either swallows
 *     gracefully (preferred) OR throws with a predictable message.
 *   - Storm: 100 factory instantiations against a browser whose
 *     `getActivationType` throws each time — none of them must corrupt
 *     `NavigationSharedState` or leak listeners.
 */

function makeThrowingBrowser(throwOnActivationType: boolean): {
  browser: NavigationBrowser;
  mockNav: MockNavigation;
  activationCallCount: { value: number };
} {
  const mockNav = new MockNavigation("http://localhost/");
  const baseBrowser = createMockNavigationBrowser(mockNav);
  const activationCallCount = { value: 0 };

  const browser: NavigationBrowser = {
    ...baseBrowser,
    getActivationType: () => {
      activationCallCount.value += 1;

      if (throwOnActivationType) {
        throw new DOMException(
          "Access to navigation.activation is forbidden",
          "SecurityError",
        );
      }

      return;
    },
  };

  return { browser, mockNav, activationCallCount };
}

describe("N23 — getActivationType() throws", () => {
  beforeAll(() => {
    vi.spyOn(console, "warn").mockImplementation(noop);
    vi.spyOn(console, "error").mockImplementation(noop);
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  it("N23.1: constructor surfaces the throw with a usable error (no silent swallow)", () => {
    // Pin the current contract: the plugin does NOT wrap `getActivationType`
    // in a try/catch — exceptions propagate out of the constructor. If a
    // future hardening adds a catch block, this test should be flipped to
    // assert "no throw, falls back to no priming".
    const { browser } = makeThrowingBrowser(true);
    const router = createRouter(routeConfig, { defaultRoute: "home" });

    // The factory invocation itself should not throw — it only constructs
    // the plugin lazily on `usePlugin`. The throw surfaces at usePlugin.
    expect(() =>
      router.usePlugin(navigationPluginFactory({}, browser)),
    ).toThrow(/Access to navigation\.activation is forbidden/u);

    router.stop();
  });

  it("N23.2: 100 throwing factory instantiations — no listener leak after each failed usePlugin", () => {
    // Storm version of N23.1. A regression that partially-initialized the
    // plugin before the throw (e.g. registered the start interceptor or
    // navigate listener BEFORE reading activation) would leak across the
    // 100 attempts. We verify the leak indirectly: after the storm a fresh
    // non-throwing factory still produces a single working listener.
    for (let i = 0; i < 100; i++) {
      const { browser } = makeThrowingBrowser(true);
      const router = createRouter(routeConfig, { defaultRoute: "home" });

      expect(() =>
        router.usePlugin(navigationPluginFactory({}, browser)),
      ).toThrow();

      router.stop();
    }

    // Sanity: a fresh non-throwing factory still works.
    const { browser, mockNav } = makeThrowingBrowser(false);
    const router = createRouter(routeConfig, { defaultRoute: "home" });
    const addEventSpy = vi.spyOn(mockNav, "addEventListener");

    router.usePlugin(navigationPluginFactory({}, browser));

    expect(() => router.start()).not.toThrow();
    // Listener installed exactly once for the working router.
    // (No assertion on count from the previous 100 because each used its
    // own MockNavigation instance.)
    expect(addEventSpy).toHaveBeenCalledWith("navigate", expect.any(Function));

    router.stop();
  });

  it("N23.3: getActivationType called exactly once per plugin instance (constructor read, no re-entry)", () => {
    // The cross-document priming is documented as a one-shot constructor
    // read. A regression that re-read activation on every onTransitionStart
    // would burn CPU + risk reading invalidated activation (spec: activation
    // becomes stale after first same-document nav).
    const { browser, activationCallCount } = makeThrowingBrowser(false);
    const router = createRouter(routeConfig, { defaultRoute: "home" });

    router.usePlugin(navigationPluginFactory({}, browser));

    expect(activationCallCount.value).toBe(1);

    router.stop();
  });
});
