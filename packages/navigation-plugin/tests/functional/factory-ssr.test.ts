import { createRouter } from "@real-router/core";
import { describe, it, expect, vi } from "vitest";

import { navigationPluginFactory } from "../../src/factory";
import { routerConfig } from "../helpers/testUtils";

vi.mock(import("../../src/browser-env/index.js"), async (importOriginal) => {
  const actual = await importOriginal();

  return {
    ...actual,
    isBrowserEnvironment: () => false,
  };
});

describe("navigationPluginFactory — SSR environment", () => {
  it("uses SSR fallback when not in browser environment", () => {
    const factory = navigationPluginFactory();
    const router = createRouter(routerConfig);

    router.usePlugin(factory);

    expect(router.buildUrl("home")).toBe("/home");
    expect(router.matchUrl("/home")).toBeDefined();
    expect(router.matchUrl("/home")!.name).toBe("home");

    // Navigation API history extensions must not throw in SSR (empty entries)
    expect(router.peekBack()).toBeUndefined();
    expect(router.peekForward()).toBeUndefined();
    expect(router.hasVisited("home")).toBe(false);
    expect(router.canGoBack()).toBe(false);
    expect(router.canGoForward()).toBe(false);
    expect(router.canGoBackTo("home")).toBe(false);
    expect(router.getRouteVisitCount("home")).toBe(0);
    expect(router.getVisitedRoutes()).toStrictEqual([]);

    router.stop();
  });

  it("traverseToLast rejects with a descriptive error under SSR fallback", async () => {
    const factory = navigationPluginFactory();
    const router = createRouter(routerConfig);

    router.usePlugin(factory);

    // Empty entries() → findLastEntryForRoute returns undefined →
    // resolveEntryToMatchedState throws "No history entry for route ...".
    await expect(router.traverseToLast("home")).rejects.toThrow(
      'No history entry for route "home"',
    );

    router.stop();
  });
});
