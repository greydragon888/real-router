import { describe, it, expect, vi } from "vitest";

import { navigationPluginFactory } from "../../src/factory";

vi.mock(import("browser-env"), async (importOriginal) => {
  const actual = await importOriginal();

  return {
    ...actual,
    isBrowserEnvironment: () => false,
  };
});

describe("navigationPluginFactory — SSR environment", () => {
  it("uses SSR fallback when not in browser environment", () => {
    const factory = navigationPluginFactory();

    expect(typeof factory).toBe("function");
  });
});
