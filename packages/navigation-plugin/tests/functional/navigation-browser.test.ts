import { createRouter } from "@real-router/core";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { navigationPluginFactory } from "../../src/factory";
import { createNavigationBrowser } from "../../src/navigation-browser";
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
      traverseTo: vi.fn(),
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

    it("returns root when path equals base", () => {
      globalThis.history.pushState({}, "", "/app");
      browser = createNavigationBrowser("/app");

      expect(browser.getLocation()).toBe("/");
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
    it("calls nav.navigate with state and history push", () => {
      browser.navigate("/path", { state: { id: 1 }, history: "push" });

      expect(mockNav.navigate).toHaveBeenCalledWith("/path", {
        state: { id: 1 },
        history: "push",
      });
    });

    it("calls nav.navigate with history replace", () => {
      browser.navigate("/path", { state: null, history: "replace" });

      expect(mockNav.navigate).toHaveBeenCalledWith("/path", {
        state: null,
        history: "replace",
      });
    });
  });

  describe("replaceState", () => {
    it("calls nav.navigate with history:replace", () => {
      browser.replaceState({ foo: "bar" }, "/new-url");

      expect(mockNav.navigate).toHaveBeenCalledWith("/new-url", {
        state: { foo: "bar" },
        history: "replace",
      });
    });
  });

  describe("updateCurrentEntry", () => {
    it("delegates to nav.updateCurrentEntry", () => {
      browser.updateCurrentEntry({ state: { updated: true } });

      expect(mockNav.updateCurrentEntry).toHaveBeenCalledWith({
        state: { updated: true },
      });
    });
  });

  describe("traverseTo", () => {
    it("delegates to nav.traverseTo", () => {
      browser.traverseTo("key-42");

      expect(mockNav.traverseTo).toHaveBeenCalledWith("key-42");
    });
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
