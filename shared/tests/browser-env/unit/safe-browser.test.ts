import { describe, it, expect, vi, afterEach } from "vitest";

import { createSafeBrowser } from "../../../browser-env";

describe("createSafeBrowser", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns the real History API surface in a browser environment", () => {
    const browser = createSafeBrowser(() => "/loc", "test-ctx");

    browser.replaceState({ marker: true }, "/safe-browser-test");

    expect(history.state).toStrictEqual({ marker: true });
    expect(globalThis.location.pathname).toBe("/safe-browser-test");
    expect(browser.getLocation()).toBe("/loc");

    history.replaceState(null, "", "/");
  });

  it("returns the warn-once SSR fallback outside a browser environment", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    vi.stubGlobal("window", undefined);

    const browser = createSafeBrowser(() => "/loc", "test-ctx");

    // getLocation is overridden: warns once and yields "" (not the getter).
    expect(browser.getLocation()).toBe("");
    expect(browser.getLocation()).toBe("");
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]?.[0]).toContain('context: "test-ctx"');

    // The remaining methods come from the history fallback browser, which
    // owns its own warn-once gate — first use warns a second time.
    expect(browser.getHash()).toBe("");
    expect(warnSpy).toHaveBeenCalledTimes(2);
  });
});
