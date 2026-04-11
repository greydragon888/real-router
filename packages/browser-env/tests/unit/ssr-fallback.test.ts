import { describe, it, expect, vi, beforeEach } from "vitest";

import {
  createWarnOnce,
  createHistoryFallbackBrowser,
} from "../../src/ssr-fallback";

describe("createWarnOnce", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("warns on first call only", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const warnOnce = createWarnOnce("test-context");

    warnOnce("pushState");
    warnOnce("replaceState");

    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("includes method name in warning message", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const warnOnce = createWarnOnce("test-context");

    warnOnce("pushState");

    expect(warnSpy.mock.calls[0][0]).toContain("pushState");
  });

  it("includes context string in warning message", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const warnOnce = createWarnOnce("my-plugin");

    warnOnce("pushState");

    expect(warnSpy.mock.calls[0][0]).toContain("my-plugin");
  });
});

describe("createHistoryFallbackBrowser", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("pushState is no-op", () => {
    const browser = createHistoryFallbackBrowser("ctx");

    expect(() => {
      browser.pushState(
        { name: "a", params: {}, path: "/a", context: {} },
        "/a",
      );
    }).not.toThrow();
  });

  it("replaceState is no-op", () => {
    const browser = createHistoryFallbackBrowser("ctx");

    expect(() => {
      browser.replaceState(
        { name: "a", params: {}, path: "/a", context: {} },
        "/a",
      );
    }).not.toThrow();
  });

  it("addPopstateListener returns cleanup function", () => {
    const browser = createHistoryFallbackBrowser("ctx");
    const cleanup = browser.addPopstateListener(vi.fn());

    expect(typeof cleanup).toBe("function");
    expect(() => {
      cleanup();
    }).not.toThrow();
  });

  it("getHash returns empty string", () => {
    const browser = createHistoryFallbackBrowser("ctx");

    expect(browser.getHash()).toBe("");
  });

  it("only warns once across multiple method calls", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const browser = createHistoryFallbackBrowser("ctx");

    browser.pushState({ name: "a", params: {}, path: "/a", context: {} }, "/a");
    browser.replaceState(
      { name: "a", params: {}, path: "/a", context: {} },
      "/a",
    );

    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("pushState completes without side effects", () => {
    const browser = createHistoryFallbackBrowser("ctx");

    // Call pushState and verify it does nothing (no history change)
    browser.pushState({ name: "a", params: {}, path: "/a", context: {} }, "/a");

    // In SSR fallback, pushState is a no-op — no state change observable
    expect(browser.getHash()).toBe("");
  });

  it("replaceState completes without side effects", () => {
    const browser = createHistoryFallbackBrowser("ctx");

    // Call replaceState and verify it does nothing (no history change)
    browser.replaceState(
      { name: "a", params: {}, path: "/a", context: {} },
      "/a",
    );

    // In SSR fallback, replaceState is a no-op — no state change observable
    expect(browser.getHash()).toBe("");
  });

  it("getHash always returns empty string regardless of calls", () => {
    const browser = createHistoryFallbackBrowser("ctx");

    expect(browser.getHash()).toBe("");
    expect(browser.getHash()).toBe("");
  });

  it("addPopstateListener cleanup function is a no-op", () => {
    const browser = createHistoryFallbackBrowser("ctx");
    const listener = vi.fn();
    const cleanup = browser.addPopstateListener(listener);

    cleanup();
    cleanup(); // calling twice should not throw

    expect(listener).not.toHaveBeenCalled();
  });
});
