import { createRouter } from "@real-router/core";
import { describe, expect, it } from "vitest";

import { navigationPluginFactory } from "../../src/factory";
import { createNavigationFallbackBrowser } from "../../src/ssr-fallback";
import { MockNavigation } from "../helpers/mockNavigation";
import {
  createMockNavigationBrowser,
  routerConfig,
} from "../helpers/testUtils";

// `extractPath` / `buildUrl` / `urlToPath` are generic browser-env URL helpers,
// owned and unit-tested to 100% by the shared test node. This file drives the
// navigation-plugin's URL *wiring* through its public surface rather than
// calling those functions directly:
//   - extractPath → the real browser's getLocation (navigation-browser.test.ts,
//     base-stripping precision).
//   - buildUrl    → router.buildUrl(...) below.
//   - urlToPath   → router.matchUrl(...) below.
// Pure-function edge cases (empty pathname, "//"-preservation) stay in the
// shared node — they are not distinct plugin behaviours.

describe("buildUrl extension (via plugin)", () => {
  it("builds URL with base path via router.buildUrl()", async () => {
    const mock = new MockNavigation("http://localhost/app/home");
    const browser = createMockNavigationBrowser(mock);
    const router = createRouter(routerConfig);

    router.usePlugin(navigationPluginFactory({ base: "/app" }, browser));
    await router.start("/home");

    expect(router.buildUrl("users.list")).toBe("/app/users/list");
  });

  it("builds URL without base (empty base)", async () => {
    const mock = new MockNavigation("http://localhost/home");
    const browser = createMockNavigationBrowser(mock);
    const router = createRouter(routerConfig);

    router.usePlugin(navigationPluginFactory({ base: "" }, browser));
    await router.start("/home");

    expect(router.buildUrl("users.list")).toBe("/users/list");
  });

  // Index route (path "/") with a base collapses to the bare base — the
  // integration form of the former `buildUrl("/", "/app") === "/app"` unit test.
  it("builds the canonical base URL for the index route (path='/')", async () => {
    const mock = new MockNavigation("http://localhost/app/home");
    const browser = createMockNavigationBrowser(mock);
    const router = createRouter(routerConfig);

    router.usePlugin(navigationPluginFactory({ base: "/app" }, browser));
    await router.start("/home");

    expect(router.buildUrl("index")).toBe("/app");
  });
});

describe("matchUrl extension (via plugin)", () => {
  it("matches URL and returns state", async () => {
    const mock = new MockNavigation("http://localhost/home");
    const browser = createMockNavigationBrowser(mock);
    const router = createRouter(routerConfig);

    router.usePlugin(navigationPluginFactory({ base: "" }, browser));
    await router.start("/home");

    const state = router.matchUrl("http://localhost/users/view/42");

    expect(state).toBeDefined();
    expect(state!.name).toBe("users.view");
    expect(state!.params).toStrictEqual({ id: "42" });
  });

  it("returns undefined for non-matching URL", async () => {
    const mock = new MockNavigation("http://localhost/home");
    const browser = createMockNavigationBrowser(mock);
    const router = createRouter(routerConfig);

    router.usePlugin(navigationPluginFactory({ base: "" }, browser));
    await router.start("/home");

    const state = router.matchUrl("http://localhost/nonexistent");

    expect(state).toBeUndefined();
  });

  it("returns undefined for URL whose path does not match any route", async () => {
    const mock = new MockNavigation("http://localhost/home");
    const browser = createMockNavigationBrowser(mock);
    const router = createRouter(routerConfig);

    router.usePlugin(navigationPluginFactory({ base: "" }, browser));
    await router.start("/home");

    const state = router.matchUrl("javascript:alert(1)");

    expect(state).toBeUndefined();
  });

  it("handles base path in URL matching", async () => {
    const mock = new MockNavigation("http://localhost/app/home");
    const browser = createMockNavigationBrowser(mock);
    const router = createRouter(routerConfig);

    router.usePlugin(navigationPluginFactory({ base: "/app" }, browser));
    await router.start("/home");

    const state = router.matchUrl("http://localhost/app/users/list");

    expect(state).toBeDefined();
    expect(state!.name).toBe("users.list");
  });

  // Empty URL parses to "/" → resolves to the index route. Integration form of
  // the former `urlToPath("", "") === "/"` unit test.
  it("resolves an empty URL to the index route", async () => {
    const mock = new MockNavigation("http://localhost/home");
    const browser = createMockNavigationBrowser(mock);
    const router = createRouter(routerConfig);

    router.usePlugin(navigationPluginFactory({ base: "" }, browser));
    await router.start("/home");

    const state = router.matchUrl("");

    expect(state).toBeDefined();
    expect(state!.name).toBe("index");
  });

  // urlToPath is scheme-agnostic: "ftp://host/doc" → "/doc" (authority
  // stripped), which matches no route here → undefined. Integration form of the
  // former `urlToPath("ftp://…") === "/doc"` unit test.
  it("extracts the path from a non-http scheme and returns undefined when unmatched", async () => {
    const mock = new MockNavigation("http://localhost/home");
    const browser = createMockNavigationBrowser(mock);
    const router = createRouter(routerConfig);

    router.usePlugin(navigationPluginFactory({ base: "" }, browser));
    await router.start("/home");

    expect(router.matchUrl("ftp://files.example.com/doc")).toBeUndefined();
  });
});

describe("SSR Fallback", () => {
  it("createNavigationFallbackBrowser returns no-op browser", () => {
    const browser = createNavigationFallbackBrowser("test-context");

    expect(browser.getLocation()).toBe("/");
    expect(browser.getHash()).toBe("");
    expect(browser.currentEntry).toBeNull();
    expect(browser.entries()).toStrictEqual([]);

    browser.navigate("http://localhost/foo", { state: {}, history: "push" });
    browser.replaceState({}, "http://localhost/bar");
    browser.updateCurrentEntry({ state: {} });
    browser.traverseTo("some-key");

    // noop methods must not mutate state
    expect(browser.getLocation()).toBe("/");
    expect(browser.getHash()).toBe("");
    expect(browser.currentEntry).toBeNull();
    expect(browser.entries()).toStrictEqual([]);

    const cleanup = browser.addNavigateListener(() => {});

    expect(typeof cleanup).toBe("function");

    cleanup();
  });

  it("warns once in SSR context", () => {
    const warnings: string[] = [];
    const origWarn = console.warn;

    console.warn = (...args: unknown[]) => {
      warnings.push(String(args[0]));
    };

    try {
      const browser = createNavigationFallbackBrowser("ssr-test");

      browser.getLocation();
      browser.getHash();
      browser.navigate("http://localhost/x", { state: {}, history: "push" });

      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain("ssr-test");
    } finally {
      console.warn = origWarn;
    }
  });
});
