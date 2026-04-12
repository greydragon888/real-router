import { createRouter } from "@real-router/core";
import { describe, it, expect, vi } from "vitest";

import { navigationPluginFactory } from "../../src/factory";
import { routerConfig } from "../helpers/testUtils";

vi.mock(import("../../src/browser-env/index.js"), async (importOriginal) => {
  const actual = await importOriginal();

  return {
    ...actual,
    isBrowserEnvironment: () => false,
  };
});

describe("navigationPluginFactory — SSR environment", () => {
  it("uses SSR fallback when not in browser environment", () => {
    const factory = navigationPluginFactory();
    const router = createRouter(routerConfig);

    router.usePlugin(factory);

    expect(router.buildUrl("home")).toBe("/home");
    expect(router.matchUrl("/home")).toBeDefined();
    expect(router.matchUrl("/home")!.name).toBe("home");

    router.stop();
  });
});
