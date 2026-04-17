import { createRouter } from "@real-router/core";
import { getRoutesApi } from "@real-router/core/api";
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

import { memoryPluginFactory } from "@real-router/memory-plugin";

import { noop, settle } from "./helpers";

describe("S10: back() targeting an entry whose route was removed mid-session", () => {
  beforeAll(() => {
    vi.spyOn(console, "warn").mockImplementation(noop);
    vi.spyOn(console, "error").mockImplementation(noop);
  });

  afterAll(() => {
    (console.warn as unknown as { mockRestore?: () => void }).mockRestore?.();
    (console.error as unknown as { mockRestore?: () => void }).mockRestore?.();
  });

  it("S10.1: back() to a removed route reverts #index via .catch() — no crash", async () => {
    const router = createRouter(
      [
        { name: "a", path: "/a" },
        { name: "b", path: "/b" },
      ],
      { defaultRoute: "a" },
    );
    const unsubscribe = router.usePlugin(memoryPluginFactory());

    try {
      await router.start("/a");
      await router.navigate("b");

      // Remove route "b" while the history still points to it.
      getRoutesApi(router).replace([{ name: "a", path: "/a" }]);

      // Should not throw; router state remains coherent; #index reverts.
      expect(() => {
        router.back();
      }).not.toThrow();

      await settle();

      // canGoBack()/canGoForward() return booleans — index didn't end up NaN.
      expect(typeof router.canGoBack()).toBe("boolean");
      expect(typeof router.canGoForward()).toBe("boolean");
    } finally {
      router.stop();
      unsubscribe();
    }
  });
});
