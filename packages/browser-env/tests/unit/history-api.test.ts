import { describe, it, expect, vi, beforeEach } from "vitest";

import {
  pushState,
  replaceState,
  addPopstateListener,
  getHash,
} from "../../src/history-api";

describe("history-api", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("pushState delegates to globalThis.history.pushState", () => {
    const spy = vi.spyOn(globalThis.history, "pushState");
    const state = { name: "home", params: {}, path: "/" };

    pushState(state, "/");

    expect(spy).toHaveBeenCalledWith(state, "", "/");
  });

  it("replaceState delegates to globalThis.history.replaceState", () => {
    const spy = vi.spyOn(globalThis.history, "replaceState");
    const state = { name: "home", params: {}, path: "/" };

    replaceState(state, "/");

    expect(spy).toHaveBeenCalledWith(state, "", "/");
  });

  it("addPopstateListener registers and returns cleanup", () => {
    const addSpy = vi.spyOn(globalThis, "addEventListener");
    const removeSpy = vi.spyOn(globalThis, "removeEventListener");
    const fn = vi.fn();
    const cleanup = addPopstateListener(fn);

    expect(addSpy).toHaveBeenCalledWith("popstate", fn);

    cleanup();

    expect(removeSpy).toHaveBeenCalledWith("popstate", fn);
  });

  it("getHash returns globalThis.location.hash", () => {
    expect(getHash()).toBe(globalThis.location.hash);
  });
});
