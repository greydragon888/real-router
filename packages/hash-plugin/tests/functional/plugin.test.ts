import { createRouter, errorCodes, getLifecycleApi } from "@real-router/core";
import {
  createSafeBrowser,
  getRouteFromEvent,
  safelyEncodePath,
  updateBrowserState,
} from "browser-env";
import {
  describe,
  beforeAll,
  beforeEach,
  afterEach,
  afterAll,
  it,
  expect,
} from "vitest";

import { hashPluginFactory } from "@real-router/hash-plugin";

import {
  escapeRegExp,
  createRegExpCache,
  extractHashPath,
  buildHashUrl,
  hashUrlToPath,
} from "../../src/hash-utils";
import { validateOptions } from "../../src/validation";
import { createMockedBrowser } from "../helpers/mockPlugins";

import type { Router, State, Unsubscribe } from "@real-router/core";
import type { Browser } from "browser-env";

const noop = (): void => undefined;

let router: Router;
let currentHistoryState: State | undefined;
let mockedBrowser: Browser;
let unsubscribe: Unsubscribe | undefined;

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

const withoutMeta = (state: State) => ({
  name: state.name,
  params: state.params,
  path: state.path,
});

describe("Hash Plugin", async () => {
  beforeAll(() => {
    vi.spyOn(console, "error").mockImplementation(noop);
  });

  beforeEach(async () => {
    currentHistoryState = undefined;
    mockedBrowser = createMockedBrowser((state) => {
      currentHistoryState = state as State;
    });
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

  describe("Hash Utilities", () => {
    describe("escapeRegExp", () => {
      it("returns plain string unchanged", () => {
        expect(escapeRegExp("hello")).toBe("hello");
      });

      it("escapes special regex chars", () => {
        expect(escapeRegExp("!")).toBe("!");
        expect(escapeRegExp(".")).toBe(String.raw`\.`);
        expect(escapeRegExp("$")).toBe(String.raw`\$`);
        expect(escapeRegExp("(")).toBe(String.raw`\(`);
        expect(escapeRegExp(")")).toBe(String.raw`\)`);
        expect(escapeRegExp("*")).toBe(String.raw`\*`);
        expect(escapeRegExp("+")).toBe(String.raw`\+`);
        expect(escapeRegExp("?")).toBe(String.raw`\?`);
        expect(escapeRegExp("[")).toBe(String.raw`\[`);
        expect(escapeRegExp("]")).toBe(String.raw`\]`);
        expect(escapeRegExp("^")).toBe(String.raw`\^`);
        expect(escapeRegExp("{")).toBe(String.raw`\{`);
        expect(escapeRegExp("|")).toBe(String.raw`\|`);
        expect(escapeRegExp("}")).toBe(String.raw`\}`);
        expect(escapeRegExp("-")).toBe(String.raw`\-`);
      });

      it("returns cached result on second call", () => {
        const first = escapeRegExp("test.special");
        const second = escapeRegExp("test.special");

        expect(first).toBe(String.raw`test\.special`);
        expect(second).toBe(String.raw`test\.special`);
      });
    });

    describe("createRegExpCache", () => {
      it("creates new RegExp on cache miss", () => {
        const cache = createRegExpCache();
        const re = cache.get("^#/");

        expect(re).toBeInstanceOf(RegExp);
        expect("#/path").toMatch(re);
        expect("#!/path").not.toMatch(re);
      });

      it("returns same RegExp on cache hit", () => {
        const cache = createRegExpCache();
        const re1 = cache.get("^#!/");
        const re2 = cache.get("^#!/");

        expect(re1).toBe(re2);
      });
    });

    describe("extractHashPath", () => {
      it("extracts path from hash without prefix", () => {
        const cache = createRegExpCache();

        expect(extractHashPath("#/home", "", cache)).toBe("/home");
        expect(extractHashPath("#/users/list", "", cache)).toBe("/users/list");
      });

      it("extracts path from hash with prefix", () => {
        const cache = createRegExpCache();

        expect(extractHashPath("#!/home", "!", cache)).toBe("/home");
        expect(extractHashPath("#!/users/list", "!", cache)).toBe(
          "/users/list",
        );
      });

      it("handles special regex chars in hashPrefix", () => {
        const cache = createRegExpCache();

        expect(extractHashPath("#./home", ".", cache)).toBe("/home");
        expect(extractHashPath("#$/home", "$", cache)).toBe("/home");
      });

      it("returns / when path is empty", () => {
        const cache = createRegExpCache();

        expect(extractHashPath("", "", cache)).toBe("/");
        expect(extractHashPath("#", "", cache)).toBe("/");
      });
    });

    describe("buildHashUrl", () => {
      it("builds basic hash URL", () => {
        expect(buildHashUrl("/home", "", "")).toBe("#/home");
      });

      it("builds URL with hashPrefix", () => {
        expect(buildHashUrl("/home", "", "!")).toBe("#!/home");
      });

      it("builds URL with base", () => {
        expect(buildHashUrl("/home", "/app", "")).toBe("/app#/home");
      });

      it("builds URL with base and hashPrefix", () => {
        expect(buildHashUrl("/home", "/app", "!")).toBe("/app#!/home");
      });
    });

    describe("hashUrlToPath", () => {
      it("extracts path from http URL with hash", () => {
        const cache = createRegExpCache();
        const result = hashUrlToPath(
          "https://example.com/#/users/list",
          "",
          cache,
        );

        expect(result).toBe("/users/list");
      });

      it("extracts path from http URL with hash and prefix", () => {
        const cache = createRegExpCache();
        const result = hashUrlToPath(
          "https://example.com/#!/users/list",
          "!",
          cache,
        );

        expect(result).toBe("/users/list");
      });

      it("includes search params", () => {
        const cache = createRegExpCache();
        const result = hashUrlToPath(
          "https://example.com/#/users/list?page=1",
          "",
          cache,
        );

        expect(result).toBe("/users/list?page=1");
      });

      it("returns null for invalid protocol", () => {
        const consoleSpy = vi.spyOn(console, "warn").mockImplementation(noop);
        const cache = createRegExpCache();
        const result = hashUrlToPath("file:///home/user/file.html", "", cache);

        expect(result).toBeNull();
        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining("Invalid URL protocol"),
        );

        consoleSpy.mockRestore();
      });

      it("returns null when URL constructor throws", () => {
        const consoleSpy = vi.spyOn(console, "warn").mockImplementation(noop);
        const OriginalURL = globalThis.URL;
        const cache = createRegExpCache();

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

        const result = hashUrlToPath("throw://error", "", cache);

        expect(result).toBeNull();
        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining("Could not parse url"),
          expect.any(Error),
        );

        vi.unstubAllGlobals();
        consoleSpy.mockRestore();
      });
    });
  });

  describe("Option Validation", () => {
    it("does not throw when opts is undefined", () => {
      expect(() => {
        validateOptions(undefined);
      }).not.toThrowError();
    });

    it("does not throw for empty options", () => {
      expect(() => {
        validateOptions({});
      }).not.toThrowError();
    });

    it("does not throw for valid option types", () => {
      expect(() => {
        validateOptions({
          hashPrefix: "!",
          base: "/app",
          forceDeactivate: false,
        });
      }).not.toThrowError();
    });

    it("does not throw when value is undefined (skips undefined check)", () => {
      expect(() => {
        validateOptions({ base: undefined } as unknown as Partial<
          Parameters<typeof validateOptions>[0]
        >);
      }).not.toThrowError();
    });

    it("does not throw for unknown option keys", () => {
      expect(() => {
        validateOptions({ unknownKey: "value" } as unknown as Record<
          string,
          unknown
        >);
      }).not.toThrowError();
    });

    it("throws for invalid hashPrefix type", () => {
      expect(() => {
        validateOptions({ hashPrefix: 123 as unknown as string });
      }).toThrowError(/hashPrefix.*string.*number/);
    });

    it("throws for invalid base type", () => {
      expect(() => {
        validateOptions({ base: 123 as unknown as string });
      }).toThrowError(/base.*string.*number/);
    });

    it("throws for invalid forceDeactivate type", () => {
      expect(() => {
        validateOptions({ forceDeactivate: "true" as unknown as boolean });
      }).toThrowError(/forceDeactivate.*boolean.*string/);
    });

    it("factory throws for invalid base type", () => {
      expect(() =>
        hashPluginFactory({ base: 123 as unknown as string }),
      ).toThrowError();
    });

    it("factory does not throw when opts is undefined", () => {
      expect(() => hashPluginFactory()).not.toThrowError();
    });

    it("factory creates working browser when none provided", async () => {
      globalThis.history.replaceState({}, "", "/#/home");

      const testRouter = createRouter(routerConfig, { defaultRoute: "home" });

      testRouter.usePlugin(hashPluginFactory());
      await testRouter.start();

      expect(testRouter.getState()?.name).toBe("home");

      testRouter.stop();
    });
  });

  describe("Popstate Utilities", () => {
    describe("getRouteFromEvent", () => {
      it("returns name and params from valid state in event", () => {
        const validState: State = {
          name: "users.list",
          params: {},
          path: "/users/list",
          meta: { id: 1, params: {} },
        };

        const mockApi = { matchPath: vi.fn() } as unknown as Parameters<
          typeof getRouteFromEvent
        >[1];
        const mockBrowser = {
          getLocation: vi.fn().mockReturnValue("/"),
        } as unknown as Browser;

        const result = getRouteFromEvent(
          new PopStateEvent("popstate", { state: validState }),
          mockApi,
          mockBrowser,
        );

        expect(result).toStrictEqual({ name: "users.list", params: {} });
      });

      it("matches URL when state is null and route exists", () => {
        const matchedState = {
          name: "home",
          params: {},
          path: "/home",
          meta: { id: 1, params: {} },
        };
        const mockApi = {
          matchPath: vi.fn().mockReturnValue(matchedState),
        } as unknown as Parameters<typeof getRouteFromEvent>[1];
        const mockBrowser = {
          getLocation: vi.fn().mockReturnValue("/home"),
        } as unknown as Browser;

        const result = getRouteFromEvent(
          new PopStateEvent("popstate", { state: null }),
          mockApi,
          mockBrowser,
        );

        expect(result).toStrictEqual({ name: "home", params: {} });
      });

      it("returns undefined when state is null and no route matches", () => {
        const mockApi = {
          matchPath: vi.fn().mockReturnValue(undefined),
        } as unknown as Parameters<typeof getRouteFromEvent>[1];
        const mockBrowser = {
          getLocation: vi.fn().mockReturnValue("/nonexistent"),
        } as unknown as Browser;

        const result = getRouteFromEvent(
          new PopStateEvent("popstate", { state: null }),
          mockApi,
          mockBrowser,
        );

        expect(result).toBeUndefined();
      });
    });

    describe("updateBrowserState", () => {
      it("calls replaceState when replace is true", () => {
        const state: State = {
          name: "home",
          params: {},
          path: "/home",
          meta: { id: 1, params: {} },
        };
        const mockBrowser = {
          pushState: vi.fn(),
          replaceState: vi.fn(),
        } as unknown as Browser;

        updateBrowserState(state, "#/home", true, mockBrowser);

        expect(mockBrowser.replaceState).toHaveBeenCalledWith(
          expect.objectContaining({ name: "home" }),
          "#/home",
        );
        expect(mockBrowser.pushState).not.toHaveBeenCalled();
      });

      it("calls pushState when replace is false", () => {
        const state: State = {
          name: "users.list",
          params: {},
          path: "/users/list",
          meta: { id: 2, params: {} },
        };
        const mockBrowser = {
          pushState: vi.fn(),
          replaceState: vi.fn(),
        } as unknown as Browser;

        updateBrowserState(state, "#/users/list", false, mockBrowser);

        expect(mockBrowser.pushState).toHaveBeenCalledWith(
          expect.objectContaining({ name: "users.list" }),
          "#/users/list",
        );
        expect(mockBrowser.replaceState).not.toHaveBeenCalled();
      });
    });
  });

  describe("Browser Module", () => {
    it("getLocation reads hash and returns path", () => {
      globalThis.history.replaceState({}, "", "/#/home");
      const cache = createRegExpCache();
      const browser = createSafeBrowser(
        () =>
          safelyEncodePath(
            extractHashPath(globalThis.location.hash, "", cache),
          ) + globalThis.location.search,
        "hash-plugin",
      );

      expect(browser.getLocation()).toBe("/home");
    });

    it("getLocation extracts path with hashPrefix", () => {
      globalThis.history.replaceState({}, "", "/#!/home");
      const cache = createRegExpCache();
      const browser = createSafeBrowser(
        () =>
          safelyEncodePath(
            extractHashPath(globalThis.location.hash, "!", cache),
          ) + globalThis.location.search,
        "hash-plugin",
      );

      expect(browser.getLocation()).toBe("/home");
    });

    it("getLocation returns / for empty hash", () => {
      globalThis.history.replaceState({}, "", "/");
      const cache = createRegExpCache();
      const browser = createSafeBrowser(
        () =>
          safelyEncodePath(
            extractHashPath(globalThis.location.hash, "", cache),
          ) + globalThis.location.search,
        "hash-plugin",
      );

      expect(browser.getLocation()).toBe("/");
    });

    it("getLocation includes search params", () => {
      globalThis.history.replaceState({}, "", "/#/home?page=1");
      const cache = createRegExpCache();
      const browser = createSafeBrowser(
        () =>
          safelyEncodePath(
            extractHashPath(globalThis.location.hash, "", cache),
          ) + globalThis.location.search,
        "hash-plugin",
      );

      expect(browser.getLocation()).toBe("/home?page=1");
    });

    it("SSR: getLocation returns empty string and warns once", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(noop);
      const originalWindow = globalThis.window;

      // @ts-expect-error -- simulating SSR
      delete globalThis.window;

      try {
        const ssrRouter = createRouter(routerConfig, { defaultRoute: "home" });

        ssrRouter.usePlugin(hashPluginFactory());
        await ssrRouter.start();

        expect(ssrRouter.getState()).toBeDefined();
        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining("non-browser environment"),
        );

        ssrRouter.stop();
      } finally {
        globalThis.window = originalWindow;
        warnSpy.mockRestore();
      }
    });
  });

  describe("Core URL Operations", () => {
    describe("buildUrl", () => {
      it("builds hash URL without base or prefix", () => {
        router.usePlugin(hashPluginFactory({}, mockedBrowser));

        expect(router.buildUrl("home", {})).toBe("#/home");
        expect(router.buildUrl("users.view", { id: "123" })).toBe(
          "#/users/view/123",
        );
      });

      it("builds URL with hashPrefix", () => {
        router.usePlugin(
          hashPluginFactory(
            { hashPrefix: "!" },
            createMockedBrowser(noop, "!"),
          ),
        );

        expect(router.buildUrl("home", {})).toBe("#!/home");
        expect(router.buildUrl("users.list", {})).toBe("#!/users/list");
      });

      it("builds URL with base path", () => {
        router.usePlugin(hashPluginFactory({ base: "/app" }, mockedBrowser));

        expect(router.buildUrl("home", {})).toBe("/app#/home");
        expect(router.buildUrl("users.list", {})).toBe("/app#/users/list");
      });

      it("builds URL with base and hashPrefix", () => {
        router.usePlugin(
          hashPluginFactory(
            { base: "/app", hashPrefix: "!" },
            createMockedBrowser(noop, "!"),
          ),
        );

        expect(router.buildUrl("home", {})).toBe("/app#!/home");
      });
    });

    describe("matchUrl", () => {
      beforeEach(() => {
        router.usePlugin(hashPluginFactory({}, mockedBrowser));
      });

      it("matches URL with hash fragment", () => {
        const state = router.matchUrl("https://example.com/#/users/list");

        expect(withoutMeta(state!)).toStrictEqual({
          name: "users.list",
          params: {},
          path: "/users/list",
        });
      });

      it("matches URL with hash and params", () => {
        const state = router.matchUrl("https://example.com/#/users/view/42");

        expect(withoutMeta(state!)).toStrictEqual({
          name: "users.view",
          params: { id: "42" },
          path: "/users/view/42",
        });
      });

      it("matches URL with search params", () => {
        const state = router.matchUrl(
          "https://example.com/#/users/list?page=1&sort=asc",
        );

        expect(withoutMeta(state!)).toStrictEqual({
          name: "users.list",
          params: { page: "1", sort: "asc" },
          path: "/users/list",
        });
      });

      it("returns undefined for invalid protocol", () => {
        const consoleSpy = vi.spyOn(console, "warn").mockImplementation(noop);
        const state = router.matchUrl("file:///home/user/file.html");

        expect(state).toBeUndefined();
        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining("Invalid URL protocol"),
        );

        consoleSpy.mockRestore();
      });

      it("returns undefined when hash does not match any route", () => {
        const state = router.matchUrl("https://example.com/#/nonexistent-path");

        expect(state).toBeUndefined();
      });
    });

    describe("matchUrl with hashPrefix", () => {
      it("matches URL with hashPrefix", () => {
        router.usePlugin(
          hashPluginFactory(
            { hashPrefix: "!" },
            createMockedBrowser(noop, "!"),
          ),
        );

        const state = router.matchUrl("https://example.com/#!/users/list");

        expect(withoutMeta(state!)).toStrictEqual({
          name: "users.list",
          params: {},
          path: "/users/list",
        });
      });
    });
  });

  describe("Base Path Normalization", () => {
    it("normalizes base without leading slash", () => {
      router.usePlugin(hashPluginFactory({ base: "app" }, mockedBrowser));

      expect(router.buildUrl("home", {})).toBe("/app#/home");
    });

    it("normalizes base with trailing slash", () => {
      router.usePlugin(hashPluginFactory({ base: "/app/" }, mockedBrowser));

      expect(router.buildUrl("home", {})).toBe("/app#/home");
    });

    it("normalizes base with both issues", () => {
      router.usePlugin(hashPluginFactory({ base: "app/" }, mockedBrowser));

      expect(router.buildUrl("home", {})).toBe("/app#/home");
    });

    it("handles empty base", () => {
      router.usePlugin(hashPluginFactory({ base: "" }, mockedBrowser));

      expect(router.buildUrl("home", {})).toBe("#/home");
    });

    it("matches URL with base path", () => {
      router.usePlugin(hashPluginFactory({ base: "/app" }, mockedBrowser));

      const state = router.matchUrl("https://example.com/app#/users/list");

      expect(withoutMeta(state!)).toStrictEqual({
        name: "users.list",
        params: {},
        path: "/users/list",
      });
    });
  });

  describe("Start Interceptor", () => {
    it("router.start() extracts path from location.hash", async () => {
      globalThis.history.replaceState({}, "", "/#/home");
      router.usePlugin(hashPluginFactory({}, mockedBrowser));

      await router.start();

      expect(router.getState()?.name).toBe("home");
    });

    it("router.start() with explicit path uses that path", async () => {
      router.usePlugin(hashPluginFactory({}, mockedBrowser));

      await router.start("/users/list");

      expect(router.getState()?.name).toBe("users.list");
    });

    it("router.start() navigates to default when hash is empty", async () => {
      globalThis.history.replaceState({}, "", "/");
      router.usePlugin(hashPluginFactory({}, mockedBrowser));

      await router.start();

      expect(router.getState()).toBeDefined();
    });
  });

  describe("Router Lifecycle", () => {
    it("uses replaceState on first navigation (start)", async () => {
      router.usePlugin(hashPluginFactory({}, mockedBrowser));
      vi.spyOn(mockedBrowser, "replaceState");

      await router.start("/home");

      expect(mockedBrowser.replaceState).toHaveBeenCalledWith(
        expect.objectContaining({ name: "home" }),
        "#/home",
      );
    });

    it("uses replaceState with replace option", async () => {
      router.usePlugin(hashPluginFactory({}, mockedBrowser));
      await router.start("/home");
      vi.spyOn(mockedBrowser, "replaceState");

      await router.navigate("users.list", {}, { replace: true });

      expect(mockedBrowser.replaceState).toHaveBeenCalledWith(
        expect.objectContaining({ name: "users.list" }),
        "#/users/list",
      );
    });

    it("uses pushState for subsequent navigation", async () => {
      router.usePlugin(hashPluginFactory({}, mockedBrowser));
      await router.start("/home");
      vi.spyOn(mockedBrowser, "pushState");

      await router.navigate("users.list");

      expect(mockedBrowser.pushState).toHaveBeenCalledWith(
        expect.objectContaining({ name: "users.list" }),
        "#/users/list",
      );
    });

    it("uses pushState with replace: false explicitly", async () => {
      router.usePlugin(hashPluginFactory({}, mockedBrowser));
      await router.start("/home");
      vi.spyOn(mockedBrowser, "pushState");

      await router.navigate("users.list", {}, { replace: false });

      expect(mockedBrowser.pushState).toHaveBeenCalledWith(
        expect.objectContaining({ name: "users.list" }),
        "#/users/list",
      );
    });

    it("uses replaceState for reload of same state", async () => {
      router.usePlugin(hashPluginFactory({}, mockedBrowser));
      await router.start("/");
      vi.spyOn(mockedBrowser, "replaceState");

      await router.navigate("index", {}, { reload: true });

      expect(mockedBrowser.replaceState).toHaveBeenCalledWith(
        expect.objectContaining({ name: "index" }),
        "#/",
      );
    });

    it("uses pushState for reload of different state", async () => {
      router.usePlugin(hashPluginFactory({}, mockedBrowser));
      await router.start("/");
      await router.navigate("users.list");
      vi.spyOn(mockedBrowser, "pushState");

      await router.navigate("home", {}, { reload: true });

      expect(mockedBrowser.pushState).toHaveBeenCalledWith(
        expect.objectContaining({ name: "home" }),
        "#/home",
      );
    });

    it("includes base path in navigation URLs", async () => {
      router.usePlugin(hashPluginFactory({ base: "/app" }, mockedBrowser));
      await router.start("/home");
      vi.spyOn(mockedBrowser, "pushState");

      await router.navigate("users.list");

      expect(mockedBrowser.pushState).toHaveBeenCalledWith(
        expect.objectContaining({ name: "users.list" }),
        "/app#/users/list",
      );
    });
  });

  describe("Popstate Handling", () => {
    beforeEach(async () => {
      router.usePlugin(hashPluginFactory({}, mockedBrowser));
      await router.start();
    });

    it("navigates to route from valid state in event", async () => {
      const targetState: State = {
        name: "users.view",
        params: { id: "1" },
        path: "/users/view/1",
        meta: { id: 2, params: {} },
      };

      globalThis.dispatchEvent(
        new PopStateEvent("popstate", { state: targetState }),
      );

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(router.getState()?.name).toBe("users.view");
    });

    it("matches location hash when state is null", async () => {
      globalThis.history.replaceState({}, "", "/#/home");

      globalThis.dispatchEvent(new PopStateEvent("popstate", { state: null }));

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(router.getState()?.name).toBe("home");
    });

    it("navigates to default when hash does not match any route", async () => {
      globalThis.history.replaceState({}, "", "/#/nonexistent");
      const navigateSpy = vi.spyOn(router, "navigateToDefault");

      globalThis.dispatchEvent(new PopStateEvent("popstate", { state: null }));

      expect(navigateSpy).toHaveBeenCalled();
    });

    it("skips transition for equal states (RouterError is silenced)", async () => {
      const subscribeSpy = vi.fn();

      router.subscribe(subscribeSpy);
      const consoleSpy = vi.spyOn(console, "error");

      const currentState = router.getState();

      globalThis.dispatchEvent(
        new PopStateEvent("popstate", { state: currentState }),
      );

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(subscribeSpy).not.toHaveBeenCalled();
      expect(consoleSpy).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it("handles popstate with meta missing params field", async () => {
      globalThis.dispatchEvent(
        new PopStateEvent("popstate", {
          state: {
            name: "home",
            params: {},
            path: "/home",
            meta: { id: 5 },
          },
        }),
      );

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(router.getState()?.name).toBe("home");
    });
  });

  describe("Deferred Popstate", () => {
    beforeEach(async () => {
      router.usePlugin(hashPluginFactory({}, mockedBrowser));
      await router.start();
    });

    it("defers popstate events during active transition", async () => {
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(noop);

      const slowGuard = () => () =>
        new Promise<boolean>((resolve) => {
          setTimeout(() => {
            resolve(true);
          }, 100);
        });

      getLifecycleApi(router).addActivateGuard("users.view", slowGuard);
      getLifecycleApi(router).addActivateGuard("users.list", slowGuard);

      const state1: State = {
        name: "users.view",
        params: { id: "1" },
        path: "/users/view/1",
        meta: { id: 1, params: {} },
      };

      const state2: State = {
        name: "users.list",
        params: {},
        path: "/users/list",
        meta: { id: 2, params: {} },
      };

      globalThis.dispatchEvent(
        new PopStateEvent("popstate", { state: state1 }),
      );

      globalThis.dispatchEvent(
        new PopStateEvent("popstate", { state: state2 }),
      );

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Transition in progress"),
      );

      consoleSpy.mockRestore();
    });

    it("processes last deferred popstate after transition completes", async () => {
      type GuardResolver = (value: boolean) => void;
      let resolveGuard: GuardResolver | null = null;

      const transitionStates: { name: string }[] = [];

      router.subscribe(({ route }) => {
        transitionStates.push({ name: route.name });
      });

      const controllableGuard = () => () =>
        new Promise<boolean>((resolve) => {
          resolveGuard = resolve;
        });

      getLifecycleApi(router).addActivateGuard("users.view", controllableGuard);
      getLifecycleApi(router).addActivateGuard("users.list", controllableGuard);

      const state1: State = {
        name: "users.view",
        params: { id: "1" },
        path: "/users/view/1",
        meta: { id: 1, params: {} },
      };

      const state2: State = {
        name: "users.view",
        params: { id: "2" },
        path: "/users/view/2",
        meta: { id: 2, params: {} },
      };

      const state3: State = {
        name: "users.list",
        params: {},
        path: "/users/list",
        meta: { id: 3, params: {} },
      };

      globalThis.dispatchEvent(
        new PopStateEvent("popstate", { state: state1 }),
      );
      globalThis.dispatchEvent(
        new PopStateEvent("popstate", { state: state2 }),
      );
      globalThis.dispatchEvent(
        new PopStateEvent("popstate", { state: state3 }),
      );

      expect(resolveGuard).not.toBeNull();

      // eslint-disable-next-line vitest/no-conditional-in-test, @typescript-eslint/no-unnecessary-condition
      if (resolveGuard !== null) {
        const firstResolver = resolveGuard as GuardResolver;

        resolveGuard = null;
        firstResolver(true);
      }

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(resolveGuard).not.toBeNull();

      // eslint-disable-next-line vitest/no-conditional-in-test, @typescript-eslint/no-unnecessary-condition
      if (resolveGuard !== null) {
        const secondResolver = resolveGuard as GuardResolver;

        // eslint-disable-next-line no-useless-assignment
        resolveGuard = null;
        secondResolver(true);
      }

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(transitionStates.length).toBeGreaterThanOrEqual(2);

      const names = transitionStates.map((s) => s.name);

      expect(names).toContain("users.view");
      expect(names).toContain("users.list");
    });
  });

  describe("replaceHistoryState", () => {
    beforeEach(() => {
      router.usePlugin(hashPluginFactory({}, mockedBrowser));
    });

    it("replaces history with correct state and URL", () => {
      router.replaceHistoryState("users.view", { id: "123" }, "User View");

      expect(currentHistoryState).toBeDefined();
      expect(withoutMeta(currentHistoryState!)).toStrictEqual({
        name: "users.view",
        params: { id: "123" },
        path: "/users/view/123",
      });
    });

    it("works without optional params and title", () => {
      router.replaceHistoryState("home");

      expect(withoutMeta(currentHistoryState!)).toStrictEqual({
        name: "home",
        params: {},
        path: "/home",
      });
    });

    it("throws if route does not exist", () => {
      expect(() => {
        router.replaceHistoryState("definitely.nonexistent.route");
      }).toThrowError("[real-router] Cannot replace state");
    });

    it("uses hash URL format in replaceHistoryState", () => {
      const replaceStateSpy = vi.spyOn(mockedBrowser, "replaceState");

      router.replaceHistoryState("home");

      expect(replaceStateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ name: "home" }),
        "#/home",
      );
    });
  });

  describe("Plugin Lifecycle", () => {
    it("registers popstate listener on start", async () => {
      const addEventSpy = vi.spyOn(globalThis, "addEventListener");

      router.usePlugin(hashPluginFactory({}, mockedBrowser));
      await router.start();

      expect(addEventSpy).toHaveBeenCalledWith(
        "popstate",
        expect.any(Function),
      );

      addEventSpy.mockRestore();
    });

    it("removes popstate listener on stop", async () => {
      const removeEventSpy = vi.spyOn(globalThis, "removeEventListener");

      router.usePlugin(hashPluginFactory({}, mockedBrowser));
      await router.start();
      router.stop();

      expect(removeEventSpy).toHaveBeenCalledWith(
        "popstate",
        expect.any(Function),
      );

      removeEventSpy.mockRestore();
    });

    it("removes popstate listener on unsubscribe", async () => {
      const removeEventSpy = vi.spyOn(globalThis, "removeEventListener");

      unsubscribe = router.usePlugin(hashPluginFactory({}, mockedBrowser));
      await router.start();
      unsubscribe();

      expect(removeEventSpy).toHaveBeenCalled();

      removeEventSpy.mockRestore();
    });

    it("cleans up existing listener when factory is reused across routers", async () => {
      const removeEventSpy = vi.spyOn(globalThis, "removeEventListener");
      const sharedFactory = hashPluginFactory({}, mockedBrowser);

      const router1 = createRouter(routerConfig, { defaultRoute: "home" });
      const unsub1 = router1.usePlugin(sharedFactory);

      await router1.start();

      const router2 = createRouter(routerConfig, { defaultRoute: "home" });

      router2.usePlugin(sharedFactory);
      await router2.start();

      expect(removeEventSpy).toHaveBeenCalledWith(
        "popstate",
        expect.any(Function),
      );

      router1.stop();
      router2.stop();
      unsub1();
      removeEventSpy.mockRestore();
    });

    it("stops router properly", async () => {
      router.usePlugin(hashPluginFactory({}, mockedBrowser));
      await router.start();

      expect(() => router.stop()).not.toThrowError();
    });

    it("teardown removes extensions and listener", async () => {
      const removeEventSpy = vi.spyOn(globalThis, "removeEventListener");

      unsubscribe = router.usePlugin(hashPluginFactory({}, mockedBrowser));
      await router.start();
      unsubscribe();

      expect(removeEventSpy).toHaveBeenCalledWith(
        "popstate",
        expect.any(Function),
      );

      removeEventSpy.mockRestore();
    });
  });

  describe("Error Recovery", () => {
    beforeEach(async () => {
      router.usePlugin(hashPluginFactory({}, mockedBrowser));
      await router.start();
    });

    it("logs critical error when navigate throws non-RouterError", async () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(noop);

      vi.spyOn(router, "navigate").mockRejectedValue(
        new TypeError("Critical error"),
      );

      globalThis.dispatchEvent(new PopStateEvent("popstate", { state: null }));

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Critical error in onPopState"),
        expect.any(TypeError),
      );

      consoleSpy.mockRestore();
    });

    it("restores browser state after critical error", async () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(noop);
      const replaceStateSpy = vi.spyOn(mockedBrowser, "replaceState");

      await router.navigate("users.list");

      vi.spyOn(router, "navigate").mockRejectedValue(
        new TypeError("Critical navigate error"),
      );

      const validState: State = {
        name: "home",
        params: {},
        path: "/home",
        meta: { id: 2, params: {} },
      };

      globalThis.dispatchEvent(
        new PopStateEvent("popstate", { state: validState }),
      );

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Critical error"),
        expect.any(TypeError),
      );
      expect(replaceStateSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it("logs recovery failure when buildUrl throws during recovery", async () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(noop);

      await router.navigate("users.list");

      vi.spyOn(router, "navigate").mockRejectedValue(
        new TypeError("Critical navigate error"),
      );

      vi.spyOn(router, "buildUrl").mockImplementation(() => {
        throw new Error("Recovery error");
      });

      const validState: State = {
        name: "home",
        params: {},
        path: "/home",
        meta: { id: 2, params: {} },
      };

      globalThis.dispatchEvent(
        new PopStateEvent("popstate", { state: validState }),
      );

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Failed to recover"),
        expect.any(Error),
      );

      consoleSpy.mockRestore();
    });
  });

  describe("forceDeactivate option", () => {
    it("forceDeactivate: false respects canDeactivate guards", async () => {
      router = createRouter(routerConfig, {
        defaultRoute: "home",
        queryParamsMode: "default",
      });
      router.usePlugin(
        hashPluginFactory({ forceDeactivate: false }, mockedBrowser),
      );
      await router.start("/");

      getLifecycleApi(router).addDeactivateGuard("index", () => () => false);

      await expect(router.navigate("users.list", {}, {})).rejects.toMatchObject(
        {
          code: errorCodes.CANNOT_DEACTIVATE,
        },
      );

      expect(router.getState()?.name).toBe("index");
    });
  });

  describe("SSR Fallback Behavior", () => {
    it("plugin works in non-browser environment", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(noop);
      const originalWindow = globalThis.window;

      // @ts-expect-error -- simulating SSR
      delete globalThis.window;

      try {
        const ssrRouter = createRouter(routerConfig, { defaultRoute: "home" });

        ssrRouter.usePlugin(hashPluginFactory());

        await ssrRouter.start();

        expect(ssrRouter.getState()).toBeDefined();

        await ssrRouter.navigate("users.list");

        expect(ssrRouter.getState()?.name).toBe("users.list");

        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining("non-browser environment"),
        );

        ssrRouter.stop();
      } finally {
        globalThis.window = originalWindow;
        warnSpy.mockRestore();
      }
    });
  });

  describe("Popstate edge cases", () => {
    it("handles null state when no route matches and no default route", async () => {
      const noDefaultRouter = createRouter(
        [{ name: "home", path: "/home" }],
        {},
      );

      noDefaultRouter.usePlugin(hashPluginFactory({}, mockedBrowser));
      await noDefaultRouter.start("/home");

      globalThis.history.replaceState({}, "", "/#/nonexistent");

      globalThis.dispatchEvent(new PopStateEvent("popstate", { state: null }));

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(noDefaultRouter.getState()?.name).toBe("home");

      noDefaultRouter.stop();
    });

    it("handles invalid state structure in popstate gracefully", async () => {
      router.usePlugin(hashPluginFactory({}, mockedBrowser));
      await router.start();

      const maliciousState = {
        name: "home",
        params: {},
        meta: "invalid",
      };

      globalThis.dispatchEvent(
        new PopStateEvent("popstate", { state: maliciousState }),
      );

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(router.getState()).toBeDefined();
    });
  });
});
