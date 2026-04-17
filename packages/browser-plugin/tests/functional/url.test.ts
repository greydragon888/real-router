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

import {
  createMockedBrowser,
  routerConfig,
  withoutMeta,
  noop,
} from "../helpers/testUtils";

import type { Browser } from "../../src/browser-env/index.js";
import type { Router, State, Unsubscribe } from "@real-router/core";

let router: Router;
let mockedBrowser: Browser;
let unsubscribe: Unsubscribe | undefined;

describe("Browser Plugin — URL", () => {
  beforeAll(() => {
    vi.spyOn(console, "error").mockImplementation(noop);
  });

  beforeEach(async () => {
    mockedBrowser = createMockedBrowser(noop);
    globalThis.history.replaceState({}, "", "/");
    router = createRouter(routerConfig, {
      defaultRoute: "home",
      queryParamsMode: "default",
    });
  });

  afterEach(() => {
    router.stop();
    unsubscribe?.();
    vi.clearAllMocks();
  });

  afterAll(() => {
    (console.error as unknown as { mockRestore?: () => void }).mockRestore?.();
  });

  describe("Core URL Operations", () => {
    describe("buildUrl", () => {
      it("builds URL without hash or base", async () => {
        router.usePlugin(browserPluginFactory({}));

        expect(router.buildUrl("home", {})).toBe("/home");
        expect(router.buildUrl("users.view", { id: "123" })).toBe(
          "/users/view/123",
        );
      });

      it("builds URL with base path", async () => {
        router.usePlugin(browserPluginFactory({ base: "/app" }));

        expect(router.buildUrl("home", {})).toBe("/app/home");
        expect(router.buildUrl("users.list", {})).toBe("/app/users/list");
      });

      it("handles special characters in base (escapeRegExp)", async () => {
        router.usePlugin(browserPluginFactory({ base: "/app.test" }));

        expect(router.buildUrl("home", {})).toBe("/app.test/home");
      });
    });

    describe("matchUrl (URL API)", () => {
      beforeEach(async () => {
        router.usePlugin(browserPluginFactory({}));
      });

      it("matches standard URL", async () => {
        const state = router.matchUrl("https://example.com/users/list");

        expect(withoutMeta(state!)).toStrictEqual({
          name: "users.list",
          params: {},
          path: "/users/list",
        });
      });

      it("matches URL with query params", async () => {
        const state = router.matchUrl(
          "https://example.com/users/list?page=1&sort=asc",
        );

        expect(withoutMeta(state!)).toStrictEqual({
          name: "users.list",
          params: { page: 1, sort: "asc" },
          path: "/users/list",
        });
      });

      it("handles IPv6 addresses", async () => {
        const state = router.matchUrl("https://[::1]:8080/users/list");

        expect(withoutMeta(state!)).toStrictEqual({
          name: "users.list",
          params: {},
          path: "/users/list",
        });
      });

      it("handles Unicode domains", async () => {
        const state = router.matchUrl("https://例え.jp/home");

        expect(withoutMeta(state!)).toStrictEqual({
          name: "home",
          params: {},
          path: "/home",
        });
      });

      it("handles double slashes", async () => {
        const state = router.matchUrl("https://example.com//users//list");

        // Double slashes don't match route definition /users/list
        expect(state).toBeUndefined();
      });

      it("returns undefined for invalid URL protocol (graceful)", async () => {
        const consoleSpy = vi.spyOn(console, "warn").mockImplementation(noop);

        const state = router.matchUrl("not-a-valid-url://example.com");

        expect(state).toBeUndefined();
        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining("Invalid URL protocol"),
        );

        consoleSpy.mockRestore();
      });

      it("strips base from URL", async () => {
        router = createRouter(routerConfig, { defaultRoute: "home" });
        router.usePlugin(browserPluginFactory({ base: "/app" }));

        const state = router.matchUrl("https://example.com/app/users/view/42");

        expect(withoutMeta(state!)).toStrictEqual({
          name: "users.view",
          params: { id: "42" },
          path: "/users/view/42",
        });
      });

      it("does not strip base when match is not at segment boundary", async () => {
        router = createRouter(routerConfig, { defaultRoute: "home" });
        router.usePlugin(browserPluginFactory({ base: "/app" }));

        // "/appusers/list" should NOT match base "/app" — not a segment boundary
        const state = router.matchUrl("https://example.com/appusers/list");

        expect(state).toBeUndefined();
      });
    });
  });

  describe("URL parsing error (lines 180-182)", () => {
    it("handles URL constructor throwing (lines 180-182)", async () => {
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(noop);

      router.usePlugin(browserPluginFactory({}, mockedBrowser));

      // Mock URL constructor to throw
      const OriginalURL = globalThis.URL;

      vi.stubGlobal(
        "URL",
        class extends OriginalURL {
          constructor(url: string | URL, base?: string | URL) {
            if (url === "throw://error") {
              throw new Error("URL parse error");
            }

            super(url, base);
          }
        },
      );

      const state = router.matchUrl("throw://error");

      expect(state).toBeUndefined();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Could not parse url"),
        expect.any(Error),
      );

      vi.unstubAllGlobals();
      consoleSpy.mockRestore();
    });
  });

  describe("URL Parsing Edge Cases", () => {
    beforeEach(async () => {
      router.usePlugin(browserPluginFactory({}, mockedBrowser));
    });

    it("handles file: protocol gracefully", async () => {
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(noop);

      const state = router.matchUrl("file:///home/user/file.html");

      expect(state).toBeUndefined();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Invalid URL protocol"),
      );

      consoleSpy.mockRestore();
    });

    it("handles encoded special characters in params", async () => {
      const state = router.matchUrl(
        "https://example.com/users/view/John%20Doe",
      );

      expect(state).toBeDefined();
      expect(state?.params.id).toBe("John Doe");
    });

    it("handles URL with port number", async () => {
      const state = router.matchUrl("http://localhost:3000/users/list");

      expect(withoutMeta(state!)).toStrictEqual({
        name: "users.list",
        params: {},
        path: "/users/list",
      });
    });

    it("handles URL with authentication", async () => {
      const state = router.matchUrl("https://user:pass@example.com/home");

      expect(withoutMeta(state!)).toStrictEqual({
        name: "home",
        params: {},
        path: "/home",
      });
    });

    it("handles relative URL resolution", async () => {
      // matchUrl uses window.location.origin as base
      const state = router.matchUrl("/users/list");

      expect(withoutMeta(state!)).toStrictEqual({
        name: "users.list",
        params: {},
        path: "/users/list",
      });
    });

    it("handles malformed URL gracefully", async () => {
      const state = router.matchUrl("not a valid url at all");

      expect(state).toBeUndefined();
    });
  });

  describe("Base Path Validation", () => {
    /**
     * These tests check whether invalid base paths cause issues.
     * According to the code analysis, base path without leading "/" might be problematic.
     */

    it("handles base path with leading slash (correct format)", async () => {
      router.usePlugin(browserPluginFactory({ base: "/app" }));

      const url = router.buildUrl("home", {});

      expect(url).toBe("/app/home");

      const url2 = router.buildUrl("users.view", { id: "123" });

      expect(url2).toBe("/app/users/view/123");
    });

    it("handles base path WITHOUT leading slash (auto-normalized)", async () => {
      // Base path "app" is automatically normalized to "/app"
      router.usePlugin(browserPluginFactory({ base: "app" }));

      const url = router.buildUrl("home", {});

      // After normalization: leading slash is added automatically
      expect(url).toBe("/app/home");

      // Normalization prevents relative path issues
      // All base paths are converted to absolute format
    });

    it("demonstrates normalization: both formats produce absolute URLs", async () => {
      router = createRouter(routerConfig, { defaultRoute: "home" });

      // Test with absolute base (already correct)
      router.usePlugin(browserPluginFactory({ base: "/app" }));
      const absoluteUrl = router.buildUrl("users.view", { id: "42" });

      expect(absoluteUrl).toBe("/app/users/view/42");

      // Test with relative base (gets normalized to absolute)
      router = createRouter(routerConfig, { defaultRoute: "home" });
      router.usePlugin(browserPluginFactory({ base: "app" }));
      const normalizedUrl = router.buildUrl("users.view", { id: "42" });

      expect(normalizedUrl).toBe("/app/users/view/42"); // Normalized to absolute!

      // After normalization: both produce the same absolute URL
      // No more relative path issues
    });

    it("shows matching behavior with normalized base path", async () => {
      router = createRouter(routerConfig, { defaultRoute: "home" });
      router.usePlugin(browserPluginFactory({ base: "app" }));

      // Try to match a URL - base "app" gets normalized to "/app"
      const state = router.matchUrl("https://example.com/app/users/list");

      // After normalization: "app" → "/app", so matching now works!
      expect(state).toBeDefined();
      expect(state?.name).toBe("users.list");
    });

    it("handles empty base path", async () => {
      router.usePlugin(browserPluginFactory({ base: "" }));

      const url = router.buildUrl("home", {});

      expect(url).toBe("/home");
    });

    it("handles undefined base path (default)", async () => {
      router.usePlugin(browserPluginFactory({}));

      const url = router.buildUrl("home", {});

      expect(url).toBe("/home");
    });

    it("handles base path with trailing slash (auto-normalized)", async () => {
      router.usePlugin(browserPluginFactory({ base: "/app/" }));

      const url = router.buildUrl("home", {});

      // Trailing slash is automatically removed during normalization
      expect(url).toBe("/app/home"); // No double slash - normalization removes trailing slash!
    });
  });

  describe("URL Security & Special Characters", () => {
    beforeEach(async () => {
      router.usePlugin(browserPluginFactory({}, mockedBrowser));
    });

    /**
     * These tests verify that buildUrl correctly encodes potentially
     * dangerous characters. Note: XSS protection is the responsibility
     * of the UI framework (React/Vue/Angular), NOT the routing library.
     *
     * The router's responsibility is URL encoding for browser APIs.
     */

    it("encodes HTML special characters in path params", async () => {
      // Note: matcher only validates explicit constraints (e.g., :id<\d+>)
      // Use simpler XSS attempt without parentheses
      const url = router.buildUrl("users.view", {
        id: "<script>xss</script>",
      });

      // Route-node should encode these characters for URL safety
      expect(url).not.toContain("<script>");
      expect(url).not.toContain("</script>");
      // URL-encoded version is safe for browser history API
      expect(url).toContain("%3C"); // <
      expect(url).toContain("%3E"); // >
    });

    it("encodes quotes and special chars in path params", async () => {
      const url = router.buildUrl("users.view", {
        id: '"><test>',
      });

      // These should be URL-encoded
      expect(url).not.toContain('"');
      expect(url).toContain("%22"); // "
      expect(url).toContain("%3C"); // <
    });

    it("encodes ampersands in query params", async () => {
      // Create router with query params
      router = createRouter([{ name: "search", path: "/search?q&category" }], {
        queryParamsMode: "default",
      });
      router.usePlugin(browserPluginFactory({}, mockedBrowser));

      const url = router.buildUrl("search", {
        q: "test&debug=true",
        category: "books",
      });

      // Ampersand in param value should be encoded
      expect(url).toContain("test%26debug%3Dtrue");
    });

    it("treats already-percent-encoded input as literal (double-encoding is by design)", async () => {
      // route-node treats param values as literal strings — a `%` in the input gets encoded.
      // If the caller needs the raw byte, they should pass the decoded value.
      const url = router.buildUrl("users.view", {
        id: "already%20encoded",
      });

      expect(url).toContain("already%2520encoded");
    });

    it("matches and decodes special characters correctly", async () => {
      const testId = "user<test>&more";
      const url = router.buildUrl("users.view", { id: testId });

      // Match the built URL
      const fullUrl = `https://example.com${url}`;
      const state = router.matchUrl(fullUrl);

      // Should decode back to original (route-node handles this)
      expect(state).toBeDefined();
      expect(state?.params.id).toBe(testId);
    });

    /**
     * Documentation test: Show proper usage with UI frameworks
     */
    it("documents safe usage patterns (documentation test)", async () => {
      // ✅ SAFE: Modern frameworks automatically escape HTML
      // React: <Link to={router.buildUrl('users.view', { id: userInput })} />
      // Vue: <router-link :to="router.buildUrl('users.view', { id: userInput })" />
      // Angular: <a [routerLink]="router.buildUrl('users.view', { id: userInput })">

      // ❌ UNSAFE: Don't use innerHTML (developer responsibility)
      // element.innerHTML = `<a href="${router.buildUrl('users.view', params)}">Link</a>`;

      // The router encodes URLs for browser history API
      const simpleParam = "user123";
      const url = router.buildUrl("users.view", { id: simpleParam });

      expect(url).toContain("user123");
    });
  });

  describe("Hash Preservation Through Navigation", () => {
    beforeEach(async () => {
      router.usePlugin(browserPluginFactory({}, mockedBrowser));
    });

    it("preserves hash when reloading the same route (path unchanged)", async () => {
      await router.start("/home");

      const replaceStateSpy = vi.spyOn(mockedBrowser, "replaceState");

      // Simulate hash being set on the current location
      globalThis.history.replaceState(
        globalThis.history.state,
        "",
        "/home#section",
      );

      // Reload same route — path stays the same, hash should be preserved
      await router.navigate("home", {}, { reload: true });

      // shouldPreserveHash: fromState.path === toState.path → true
      expect(replaceStateSpy).toHaveBeenCalled();

      const lastUrl = replaceStateSpy.mock.calls.at(-1)?.[1];

      expect(lastUrl).toContain("#section");
    });

    it("clears hash when navigating to a different route (path changed)", async () => {
      await router.start("/home");

      const pushStateSpy = vi.spyOn(mockedBrowser, "pushState");

      // Simulate hash on current location
      globalThis.history.replaceState(
        globalThis.history.state,
        "",
        "/home#section",
      );

      // Navigate to a different route (different path)
      await router.navigate("users.list");

      // shouldPreserveHash: fromState.path !== toState.path → false
      expect(pushStateSpy).toHaveBeenCalled();

      const lastUrl = pushStateSpy.mock.calls.at(-1)?.[1];

      expect(lastUrl).not.toContain("#section");
    });

    it("clears hash when navigating to same route name with different path", async () => {
      await router.start("/users/view/1");

      const pushStateSpy = vi.spyOn(mockedBrowser, "pushState");

      // Simulate hash on current location
      globalThis.history.replaceState(
        globalThis.history.state,
        "",
        "/users/view/1#section",
      );

      // Navigate to same route but different param → different path
      await router.navigate("users.view", { id: "2" });

      // Path changed (/users/view/1 → /users/view/2), hash should be cleared
      expect(pushStateSpy).toHaveBeenCalled();

      const lastUrl = pushStateSpy.mock.calls.at(-1)?.[1];

      expect(lastUrl).not.toContain("#section");
    });

    it("preserves hash on replaceHistoryState", async () => {
      await router.start("/home");

      globalThis.history.replaceState(
        globalThis.history.state,
        "",
        "/home#section",
      );

      const replaceStateSpy = vi.spyOn(mockedBrowser, "replaceState");

      router.replaceHistoryState("users.view", { id: "7" });

      expect(replaceStateSpy).toHaveBeenCalled();

      const lastUrl = replaceStateSpy.mock.calls.at(-1)?.[1];

      expect(lastUrl).toContain("#section");
    });
  });

  describe("State persistence through History API", () => {
    let currentHistoryState: State | undefined;

    beforeEach(async () => {
      mockedBrowser = createMockedBrowser((state) => {
        currentHistoryState = state;
      });
      currentHistoryState = undefined;
      router.usePlugin(browserPluginFactory({}, mockedBrowser));
    });

    it("persists name, params, and path through pushState", async () => {
      await router.start("/home");

      await router.navigate("users.view", { id: "42" });

      // history.state should contain the core state fields
      expect(currentHistoryState).toBeDefined();
      expect(currentHistoryState!.name).toBe("users.view");
      expect(currentHistoryState!.params).toStrictEqual({ id: "42" });
      expect(currentHistoryState!.path).toBe("/users/view/42");
    });

    it("updates history.state on each navigation", async () => {
      await router.start("/home");

      await router.navigate("users.list");

      expect(currentHistoryState!.name).toBe("users.list");
      expect(currentHistoryState!.path).toBe("/users/list");

      await router.navigate("users.view", { id: "99" });

      expect(currentHistoryState!.name).toBe("users.view");
      expect(currentHistoryState!.params.id).toBe("99");
      expect(currentHistoryState!.path).toBe("/users/view/99");
    });
  });

  describe("Nested Parameterized Routes", () => {
    it("buildUrl and matchUrl with /users/:userId/posts/:postId", () => {
      const nestedConfig = [
        {
          name: "users",
          path: "/users/:userId",
          children: [
            {
              name: "posts",
              path: "/posts/:postId",
            },
          ],
        },
        { name: "home", path: "/home" },
      ];
      const nestedRouter = createRouter(nestedConfig, {
        defaultRoute: "home",
      });

      nestedRouter.usePlugin(browserPluginFactory({}, mockedBrowser));

      const url = nestedRouter.buildUrl("users.posts", {
        userId: "42",
        postId: "99",
      });

      expect(url).toBe("/users/42/posts/99");

      const state = nestedRouter.matchUrl(
        "https://example.com/users/42/posts/99",
      );

      expect(state).toBeDefined();
      expect(state?.name).toBe("users.posts");
      expect(state?.params).toStrictEqual({ userId: "42", postId: "99" });
    });

    it("navigate with two params and verify both in state", async () => {
      const nestedConfig = [
        {
          name: "users",
          path: "/users/:userId",
          children: [
            {
              name: "posts",
              path: "/posts/:postId",
            },
          ],
        },
        { name: "home", path: "/home" },
      ];
      const nestedRouter = createRouter(nestedConfig, {
        defaultRoute: "home",
      });

      nestedRouter.usePlugin(browserPluginFactory({}, mockedBrowser));
      await nestedRouter.start("/home");

      await nestedRouter.navigate("users.posts", {
        userId: "42",
        postId: "99",
      });

      const state = nestedRouter.getState();

      expect(state?.name).toBe("users.posts");
      expect(state?.params.userId).toBe("42");
      expect(state?.params.postId).toBe("99");

      nestedRouter.stop();
    });
  });

  describe("Real Browser (no mock)", () => {
    describe("safelyEncodePath catch block (browser.ts lines 69-71)", () => {
      it("returns original path when decodeURI throws on malformed percent-encoding", async () => {
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(noop);

        // Truncated UTF-8 sequence causes decodeURI to throw URIError
        globalThis.history.replaceState({}, "", "/%E0%A4%A");

        try {
          const realRouter = createRouter(routerConfig, {
            defaultRoute: "home",
          });

          realRouter.usePlugin(browserPluginFactory({}));

          await realRouter.start();

          expect(realRouter.getState()).toBeDefined();
          expect(warnSpy).toHaveBeenCalledWith(
            expect.stringContaining("Could not encode path"),
            expect.any(URIError),
          );

          realRouter.stop();
        } finally {
          globalThis.history.replaceState({}, "", "/");
          warnSpy.mockRestore();
        }
      });
    });
  });
});
