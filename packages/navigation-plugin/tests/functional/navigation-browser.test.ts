import { createRouter } from "@real-router/core";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { navigationPluginFactory } from "../../src/factory";
import {
  createNavigationBrowser,
  PLUGIN_SYNC_INFO,
} from "../../src/navigation-browser";
import { routerConfig } from "../helpers/testUtils";

import type { NavigationBrowser } from "../../src/types";

describe("createNavigationBrowser", () => {
  let mockNav: {
    navigate: ReturnType<typeof vi.fn>;
    updateCurrentEntry: ReturnType<typeof vi.fn>;
    traverseTo: ReturnType<typeof vi.fn>;
    addEventListener: ReturnType<typeof vi.fn>;
    removeEventListener: ReturnType<typeof vi.fn>;
    entries: ReturnType<typeof vi.fn>;
    currentEntry: NavigationHistoryEntry | null;
  };
  let browser: NavigationBrowser;

  beforeEach(() => {
    mockNav = {
      navigate: vi.fn(),
      updateCurrentEntry: vi.fn(),
      traverseTo: vi.fn(() => ({
        committed: Promise.resolve(),
        finished: Promise.resolve(),
      })),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      entries: vi.fn(() => []),
      currentEntry: null,
    };
    (globalThis as unknown as Record<string, unknown>).navigation = mockNav;
    globalThis.history.pushState({}, "", "/");
    browser = createNavigationBrowser("");
  });

  afterEach(() => {
    delete (globalThis as unknown as Record<string, unknown>).navigation;
    globalThis.history.pushState({}, "", "/");
  });

  describe("getLocation", () => {
    it("returns pathname and search from globalThis.location", () => {
      globalThis.history.pushState({}, "", "/users?page=2");
      browser = createNavigationBrowser("");

      expect(browser.getLocation()).toBe("/users?page=2");
    });

    it("strips base from pathname", () => {
      globalThis.history.pushState({}, "", "/app/users");
      browser = createNavigationBrowser("/app");

      expect(browser.getLocation()).toBe("/users");
    });

    // #1920. This is the plugin's reload path — `createStartInterceptor` reads
    // `getLocation()` when `start()` is given no argument — and it composes
    // `safelyEncodePath` UNCACHED, unlike browser-plugin's memoized wrapper. A
    // reserved character in a param travels as %2F, which the old
    // `encodeURI(decodeURI(p))` doubled into %252F.
    it("keeps an escaped reserved character in the pathname", () => {
      globalThis.history.pushState({}, "", "/files/a%2Fb");
      browser = createNavigationBrowser("");

      expect(browser.getLocation()).toBe("/files/a%2Fb");
    });

    it("keeps it while also stripping base, and still encodes what is raw", () => {
      globalThis.history.pushState({}, "", "/app/files/a%2Fb");
      browser = createNavigationBrowser("/app");

      expect(browser.getLocation()).toBe("/files/a%2Fb");
    });

    it("returns root when path equals base", () => {
      globalThis.history.pushState({}, "", "/app");
      browser = createNavigationBrowser("/app");

      expect(browser.getLocation()).toBe("/");
    });

    // Base-stripping precision — re-expresses the former direct `extractPath`
    // unit tests (removed from url.test.ts as browser-env white-box) through the
    // real browser wrapper, which calls `extractPath(location.pathname, base)`.
    it("returns the original pathname when base is set but does not match", () => {
      globalThis.history.pushState({}, "", "/users");
      browser = createNavigationBrowser("/app");

      expect(browser.getLocation()).toBe("/users");
    });

    it("does not strip a base that is only a partial segment match", () => {
      globalThis.history.pushState({}, "", "/application/users");
      browser = createNavigationBrowser("/app");

      expect(browser.getLocation()).toBe("/application/users");
    });

    it("does not strip when base is a prefix of the first segment", () => {
      globalThis.history.pushState({}, "", "/app-v2/users");
      browser = createNavigationBrowser("/app");

      expect(browser.getLocation()).toBe("/app-v2/users");
    });
  });

  describe("getHash", () => {
    it("returns location.hash", () => {
      globalThis.history.pushState({}, "", "/path#section");
      browser = createNavigationBrowser("");

      expect(browser.getHash()).toBe("#section");
    });

    it("returns empty string when no hash", () => {
      expect(browser.getHash()).toBe("");
    });
  });

  describe("navigate", () => {
    it("calls nav.navigate with state, history push, and PLUGIN_SYNC_INFO", () => {
      browser.navigate("/path", { state: { id: 1 }, history: "push" });

      expect(mockNav.navigate).toHaveBeenCalledWith("/path", {
        state: { id: 1 },
        history: "push",
        info: PLUGIN_SYNC_INFO,
      });
    });

    it("calls nav.navigate with history replace and PLUGIN_SYNC_INFO", () => {
      browser.navigate("/path", { state: null, history: "replace" });

      expect(mockNav.navigate).toHaveBeenCalledWith("/path", {
        state: null,
        history: "replace",
        info: PLUGIN_SYNC_INFO,
      });
    });
  });

  describe("replaceState", () => {
    it("calls nav.navigate with history:replace and PLUGIN_SYNC_INFO", () => {
      browser.replaceState({ foo: "bar" }, "/new-url");

      expect(mockNav.navigate).toHaveBeenCalledWith("/new-url", {
        state: { foo: "bar" },
        history: "replace",
        info: PLUGIN_SYNC_INFO,
      });
    });
  });

  describe("a write that did not happen (#2877)", () => {
    it("leaves the rejection of committed for the browser to report", async () => {
      const committed = Promise.reject(new DOMException("", "AbortError"));
      const caught = vi.spyOn(committed, "catch");
      const chained = vi.spyOn(committed, "then");

      mockNav.navigate.mockReturnValue({
        committed,
        finished: Promise.resolve(),
      });
      browser.navigate("/path", { state: {}, history: "push" });

      expect(mockNav.navigate).toHaveBeenCalledTimes(1);
      expect(caught).not.toHaveBeenCalled();
      expect(chained).not.toHaveBeenCalled();

      await expect(committed).rejects.toThrow();
    });
  });

  describe("updateCurrentEntry", () => {
    it("delegates to nav.updateCurrentEntry without info (no navigate event fired)", () => {
      browser.updateCurrentEntry({ state: { updated: true } });

      // updateCurrentEntry fires currententrychange, not navigate — no
      // sync-info tagging needed.
      expect(mockNav.updateCurrentEntry).toHaveBeenCalledWith({
        state: { updated: true },
      });
    });
  });

  describe("traverseTo", () => {
    it("delegates to nav.traverseTo with PLUGIN_SYNC_INFO", () => {
      browser.traverseTo("key-42");

      expect(mockNav.traverseTo).toHaveBeenCalledWith("key-42", {
        info: PLUGIN_SYNC_INFO,
      });
    });
  });

  describe("while a traversal travels (#2879)", () => {
    const ENTRY = {
      key: "key-1",
      id: "id-1",
      index: 1,
      url: "http://localhost:3000/landing",
    };
    const landing = (
      committed = new Promise<NavigationHistoryEntry>(() => undefined),
    ) => {
      mockNav.entries.mockReturnValue([ENTRY]);
      mockNav.traverseTo.mockReturnValue({
        committed,
        finished: Promise.resolve(),
      });
      browser.traverseTo(ENTRY.key);
    };

    afterEach(() => {
      vi.useRealTimers();
    });

    it("currentEntry answers the entry it goes to", () => {
      landing();

      expect(browser.currentEntry).toStrictEqual(ENTRY);
    });

    it("currentEntry carries the absolute URL of a held write", () => {
      landing();
      browser.navigate("/written", { state: {}, history: "replace" });

      expect(mockNav.navigate).not.toHaveBeenCalled();
      expect(browser.currentEntry?.url).toBe(
        new URL("/written", globalThis.location.href).href,
      );
    });

    it("a held update keeps the state it was called with, whatever its writer does to the buffer", async () => {
      const buffer = { name: "home" };

      landing(Promise.resolve({} as NavigationHistoryEntry));
      browser.updateCurrentEntry({ state: buffer });
      buffer.name = "about";
      await Promise.resolve();

      expect(mockNav.updateCurrentEntry).toHaveBeenCalledWith({
        state: { name: "home" },
      });
    });

    it("removing the listener ends the wait: currentEntry is the live entry, and no write runs", () => {
      vi.useFakeTimers();

      const live = {} as NavigationHistoryEntry;
      const remove = browser.addNavigateListener(() => undefined);

      mockNav.currentEntry = live;
      landing();
      browser.navigate("/written", { state: {}, history: "replace" });
      remove();
      vi.advanceTimersByTime(5000);

      expect(browser.currentEntry).toBe(live);
      expect(mockNav.navigate).not.toHaveBeenCalled();
    });

    it("an unknown key: takes both rejections, which the browser marks unhandled, and the writes run", async () => {
      const error = new DOMException("", "InvalidStateError");
      const committed = Promise.reject(error);
      const finished = Promise.reject(error);
      const thenSpy = vi.spyOn(committed, "then");
      const catchSpy = vi.spyOn(finished, "catch");

      mockNav.traverseTo.mockReturnValue({ committed, finished });
      browser.traverseTo("unknown");

      expect(thenSpy).toHaveBeenCalledTimes(1);
      expect(catchSpy).toHaveBeenCalledTimes(1);

      await expect(committed).rejects.toThrow();
      await expect(finished).rejects.toThrow();

      browser.navigate("/written", { state: {}, history: "replace" });

      expect(mockNav.navigate).toHaveBeenCalledTimes(1);
    });

    it.each([
      ["nothing", undefined],
      ["no promises", {}],
    ])(
      "CONTROL — a double whose traverseTo returns %s: the writes run at once",
      (_label, result) => {
        const live = {} as NavigationHistoryEntry;

        mockNav.currentEntry = live;
        mockNav.entries.mockReturnValue([ENTRY]);
        mockNav.traverseTo.mockReturnValue(result);

        expect(() => {
          browser.traverseTo(ENTRY.key);
        }).not.toThrow();

        browser.navigate("/written", { state: {}, history: "replace" });

        expect(mockNav.navigate).toHaveBeenCalledTimes(1);
        expect(browser.currentEntry).toBe(live);
      },
    );
  });

  describe("entries", () => {
    it("delegates to nav.entries", () => {
      const mockEntries = [
        { url: "http://localhost/" } as NavigationHistoryEntry,
      ];

      mockNav.entries.mockReturnValue(mockEntries);

      expect(browser.entries()).toBe(mockEntries);
    });
  });

  describe("currentEntry", () => {
    it("returns nav.currentEntry via getter", () => {
      const entry = { url: "http://localhost/" } as NavigationHistoryEntry;

      mockNav.currentEntry = entry;
      browser = createNavigationBrowser("");

      expect(browser.currentEntry).toBe(entry);
    });

    it("returns null when nav.currentEntry is null", () => {
      expect(browser.currentEntry).toBeNull();
    });
  });

  describe("getActivationType", () => {
    it("returns nav.activation.navigationType when activation is set", () => {
      (mockNav as unknown as { activation: NavigationActivation }).activation =
        {
          entry: { url: "http://localhost/" } as NavigationHistoryEntry,
          from: null,
          navigationType: "reload",
        };
      browser = createNavigationBrowser("");

      expect(browser.getActivationType()).toBe("reload");
    });

    it("returns undefined when nav.activation is null (older browser)", () => {
      (mockNav as unknown as { activation: null }).activation = null;
      browser = createNavigationBrowser("");

      expect(browser.getActivationType()).toBeUndefined();
    });

    it("returns undefined when nav.activation is missing (no support)", () => {
      // Pre-Chrome-123 browsers expose `navigation` without `activation`.
      expect(browser.getActivationType()).toBeUndefined();
    });

    it("returns 'push' for push activation type", () => {
      (mockNav as unknown as { activation: NavigationActivation }).activation =
        {
          entry: { url: "http://localhost/users" } as NavigationHistoryEntry,
          from: { url: "http://localhost/" } as NavigationHistoryEntry,
          navigationType: "push",
        };
      browser = createNavigationBrowser("");

      expect(browser.getActivationType()).toBe("push");
    });

    it("returns 'replace' for replace activation type", () => {
      (mockNav as unknown as { activation: NavigationActivation }).activation =
        {
          entry: { url: "http://localhost/" } as NavigationHistoryEntry,
          from: { url: "http://localhost/" } as NavigationHistoryEntry,
          navigationType: "replace",
        };
      browser = createNavigationBrowser("");

      expect(browser.getActivationType()).toBe("replace");
    });

    it("returns 'traverse' for traverse activation type", () => {
      (mockNav as unknown as { activation: NavigationActivation }).activation =
        {
          entry: { url: "http://localhost/" } as NavigationHistoryEntry,
          from: { url: "http://localhost/users" } as NavigationHistoryEntry,
          navigationType: "traverse",
        };
      browser = createNavigationBrowser("");

      expect(browser.getActivationType()).toBe("traverse");
    });
  });

  describe("addNavigateListener", () => {
    it("registers listener and returns cleanup function", () => {
      const handler = vi.fn();
      const cleanup = browser.addNavigateListener(handler);

      expect(mockNav.addEventListener).toHaveBeenCalledWith(
        "navigate",
        expect.any(Function),
      );

      cleanup();

      expect(mockNav.removeEventListener).toHaveBeenCalledWith(
        "navigate",
        expect.any(Function),
      );
    });

    it("uses same handler reference for add and remove", () => {
      const cleanup = browser.addNavigateListener(vi.fn());

      cleanup();

      const addedFn = (
        mockNav.addEventListener.mock.calls[0] as [string, Function]
      )[1];
      const removedFn = (
        mockNav.removeEventListener.mock.calls[0] as [string, Function]
      )[1];

      expect(addedFn).toBe(removedFn);
    });

    it("forwards events to the callback", () => {
      let capturedListener: ((evt: NavigateEvent) => void) | undefined;

      mockNav.addEventListener.mockImplementation(
        (_type: string, fn: (evt: NavigateEvent) => void) => {
          capturedListener = fn;
        },
      );

      browser = createNavigationBrowser("");
      const callback = vi.fn();

      browser.addNavigateListener(callback);

      const fakeEvent = { type: "navigate" } as NavigateEvent;

      capturedListener!(fakeEvent);

      expect(callback).toHaveBeenCalledWith(fakeEvent);
    });
  });
});

describe("navigationPluginFactory — Navigation API available", () => {
  beforeEach(() => {
    (globalThis as unknown as Record<string, unknown>).navigation = {
      navigate: vi.fn(),
      updateCurrentEntry: vi.fn(),
      traverseTo: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      entries: vi.fn(() => []),
      currentEntry: null,
    };
  });

  afterEach(() => {
    delete (globalThis as unknown as Record<string, unknown>).navigation;
  });

  it("creates plugin without explicit browser when Navigation API exists", () => {
    const factory = navigationPluginFactory();
    const router = createRouter(routerConfig);

    router.usePlugin(factory);

    expect(router.buildUrl("home")).toBe("/home");

    router.stop();
  });
});
