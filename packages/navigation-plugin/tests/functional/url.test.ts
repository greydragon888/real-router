import { createRouter } from "@real-router/core";
import { describe, expect, it } from "vitest";

import {
  buildUrl,
  extractPath,
  urlToPath,
} from "../../src/browser-env/index.js";
import { navigationPluginFactory } from "../../src/factory";
import { createNavigationFallbackBrowser } from "../../src/ssr-fallback";
import { MockNavigation } from "../helpers/mockNavigation";
import {
  createMockNavigationBrowser,
  routerConfig,
} from "../helpers/testUtils";

describe("extractPath", () => {
  it("returns path without base when base matches", () => {
    expect(extractPath("/app/users", "/app")).toBe("/users");
  });

  it("ensures leading slash when base stripped", () => {
    expect(extractPath("/app", "/app")).toBe("/");
  });

  it("returns original path when no base match", () => {
    expect(extractPath("/users", "/app")).toBe("/users");
  });

  it("returns original path when base is empty", () => {
    expect(extractPath("/users/list", "")).toBe("/users/list");
  });
});

describe("buildUrl", () => {
  it("prepends base to path", () => {
    expect(buildUrl("/users", "/app")).toBe("/app/users");
  });

  it("returns path unchanged when base is empty", () => {
    expect(buildUrl("/users", "")).toBe("/users");
  });
});

describe("urlToPath", () => {
  it("parses absolute URL and extracts path with search", () => {
    const result = urlToPath(
      "http://localhost/users?page=1",
      "",
      "navigation-plugin",
    );

    expect(result).toBe("/users?page=1");
  });

  it("returns null for invalid URL", () => {
    const result = urlToPath(
      "not-a-valid-url-at-all://broken",
      "",
      "navigation-plugin",
    );

    expect(result).toBeNull();
  });

  it("returns null for non-HTTP URL (ftp://)", () => {
    expect(
      urlToPath("ftp://files.example.com/doc", "", "navigation-plugin"),
    ).toBeNull();
  });

  it("returns null for non-HTTP URL (javascript:)", () => {
    expect(
      urlToPath("javascript:alert(1)", "", "navigation-plugin"),
    ).toBeNull();
  });

  it("handles URL with base path correctly", () => {
    const result = urlToPath(
      "http://localhost/app/users?tab=active",
      "/app",
      "navigation-plugin",
    );

    expect(result).toBe("/users?tab=active");
  });
});

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

  it("returns undefined for invalid URL (null from safeParseUrl)", async () => {
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
