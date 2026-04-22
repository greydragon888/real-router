import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

import { createStressRouter, noop, settle } from "./helpers";

import type { State } from "@real-router/core";

function getHistoryIndex(router: {
  getState: () => State | undefined;
}): number | undefined {
  const memory = router.getState()?.context.memory as
    | { historyIndex: number }
    | undefined;

  return memory?.historyIndex;
}

describe("S5: roundtrip navigate → replace → back → forward at cap", () => {
  beforeAll(() => {
    vi.spyOn(console, "warn").mockImplementation(noop);
    vi.spyOn(console, "error").mockImplementation(noop);
  });

  afterAll(() => {
    (console.warn as unknown as { mockRestore?: () => void }).mockRestore?.();
    (console.error as unknown as { mockRestore?: () => void }).mockRestore?.();
  });

  it("S5.1: 100 roundtrips at maxHistoryLength=5 keep index within bounds", async () => {
    const { router, unsubscribe } = createStressRouter({
      maxHistoryLength: 5,
    });

    await router.start("/");

    // Fill the cap: home, users, user/1, settings, profile (5 entries).
    await router.navigate("users");
    await router.navigate("user", { id: "1" });
    await router.navigate("settings");
    await router.navigate("profile");

    for (let i = 0; i < 100; i++) {
      await router.navigate("user", { id: String(i) });
      await router.navigate("settings", {}, { replace: true });

      router.back();
      await settle();

      router.forward();
      await settle();

      // Index must stay in [0, maxHistoryLength - 1] — trimming is safe.
      const index = getHistoryIndex(router) ?? -1;

      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThanOrEqual(4);
    }

    unsubscribe();
  });

  it("S5.2: alternating navigate/replace never grows index beyond cap", async () => {
    const { router, unsubscribe } = createStressRouter({
      maxHistoryLength: 3,
    });

    await router.start("/");

    for (let i = 0; i < 200; i++) {
      await (i % 2 === 0
        ? router.navigate("user", { id: String(i) })
        : router.navigate("settings", {}, { replace: true }));

      const index = getHistoryIndex(router) ?? -1;

      expect(index).toBeLessThanOrEqual(2); // cap-1
    }

    unsubscribe();
  });
});
