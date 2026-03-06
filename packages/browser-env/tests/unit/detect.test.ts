import { describe, it, expect, vi, afterEach } from "vitest";

import { isBrowserEnvironment } from "../../src/detect";

describe("isBrowserEnvironment", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns true in jsdom environment", () => {
    expect(isBrowserEnvironment()).toBe(true);
  });

  it("returns false when window is undefined", () => {
    vi.stubGlobal("window", undefined);

    expect(isBrowserEnvironment()).toBe(false);
  });

  it("returns false when history is falsy", () => {
    vi.stubGlobal("history", undefined);

    expect(isBrowserEnvironment()).toBe(false);
  });
});
