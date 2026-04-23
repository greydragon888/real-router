import { createRouter } from "@real-router/core";
import { describe, expect, it } from "vitest";

import { buildUrl, extractPath, urlToPath } from "../../src/browser-env";
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

  // Edge cases: empty pathname — the fallback branch `if (!pathname)`
  // returns "/" so callers never see an empty string. Pin both base
  // variants so a regression that returns "" or `base` stands out.
  it("returns / for empty pathname with empty base", () => {
    expect(extractPath("", "")).toBe("/");
  });

  it("returns / for empty pathname with non-empty base", () => {
    expect(extractPath("", "/app")).toBe("/");
  });

  it("does not strip partial segment match", () => {
    expect(extractPath("/application/users", "/app")).toBe(
      "/application/users",
    );
  });

  it("does not strip when base is prefix of segment", () => {
    expect(extractPath("/app-v2/users", "/app")).toBe("/app-v2/users");
  });

  it("strips exact segment match", () => {
    expect(extractPath("/app/users", "/app")).toBe("/users");
  });

  it("returns / for exact base match", () => {
    expect(extractPath("/app", "/app")).toBe("/");
  });

  // Baseline behavior doc: with a canonical base, extractPath preserves any
  // runs of '/' inside the tail unchanged. Callers that want collapsed paths
  // must normalize downstream (router.matchPath tolerates '//foo' as no-match).
  it("preserves double slashes after stripping base (extractPath is not a normalizer)", () => {
    expect(extractPath("/app//users", "/app")).toBe("//users");
  });

  it("preserves double slashes when base is empty", () => {
    expect(extractPath("//foo", "")).toBe("//foo");
  });
});

describe("buildUrl", () => {
  it("prepends base to path", () => {
    expect(buildUrl("/users", "/app")).toBe("/app/users");
  });

  it("returns path unchanged when base is empty", () => {
    expect(buildUrl("/users", "")).toBe("/users");
  });

  // Edge cases: empty path and index-with-base.
  it("returns empty string for empty path with empty base", () => {
    expect(buildUrl("", "")).toBe("");
  });

  it("returns base unchanged for empty path with non-empty base", () => {
    expect(buildUrl("", "/app")).toBe("/app");
  });

  it("returns canonical base (no trailing slash) for path=/ with non-empty base", () => {
    // Historically this produced "/app/" — the collapse to bare base keeps
    // index URLs symmetric with `normalizeBase("/app/") === "/app"`. Roundtrip
    // holds: extractPath("/app", "/app") === "/".
    expect(buildUrl("/", "/app")).toBe("/app");
  });

  it("returns / for path=/ with empty base", () => {
    expect(buildUrl("/", "")).toBe("/");
  });
});

describe("urlToPath", () => {
  it("parses absolute URL and extracts path with search", () => {
    expect(urlToPath("http://localhost/users?page=1", "")).toBe(
      "/users?page=1",
    );
  });

  it("returns '/' for scheme-only URL with no path (authority stripped)", () => {
    expect(urlToPath("not-a-valid-url-at-all://broken", "")).toBe("/");
  });

  it("returns '/' for empty URL input (parser is total)", () => {
    expect(urlToPath("", "")).toBe("/");
  });

  it("extracts path from ftp:// URL (scheme-agnostic)", () => {
    expect(urlToPath("ftp://files.example.com/doc", "")).toBe("/doc");
  });

  it("treats javascript: as literal pathname (no route will match)", () => {
    expect(urlToPath("javascript:alert(1)", "")).toBe("/javascript:alert(1)");
  });

  it("handles URL with base path correctly", () => {
    expect(urlToPath("http://localhost/app/users?tab=active", "/app")).toBe(
      "/users?tab=active",
    );
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
