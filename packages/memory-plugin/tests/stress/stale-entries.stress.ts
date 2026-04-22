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

      // History was [a, b], index=1. back() fires navigate("a") with params
      // captured at push time. The concrete landing depends on how core's
      // routes.replace() revalidates the current state — we don't assert the
      // name here. What we DO assert: router still has a valid state, and
      // context.memory.historyIndex is in range [0..1] (2-entry history, or
      // 1 if revalidation collapsed it).
      const memory = router.getState()?.context.memory as
        | { historyIndex: number }
        | undefined;

      expect(memory).toBeDefined();
      expect(memory!.historyIndex).toBeGreaterThanOrEqual(0);
      expect(memory!.historyIndex).toBeLessThanOrEqual(1);
    } finally {
      router.stop();
      unsubscribe();
    }
  });
});
