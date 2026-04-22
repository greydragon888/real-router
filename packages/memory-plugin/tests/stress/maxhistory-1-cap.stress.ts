import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

import { createStressRouter, noop } from "./helpers";

describe("S14: maxHistoryLength=1 — continuous trimming correctness", () => {
  beforeAll(() => {
    vi.spyOn(console, "warn").mockImplementation(noop);
    vi.spyOn(console, "error").mockImplementation(noop);
  });

  afterAll(() => {
    (console.warn as unknown as { mockRestore?: () => void }).mockRestore?.();
    (console.error as unknown as { mockRestore?: () => void }).mockRestore?.();
  });

  it("S14.1: 1000 successful pushes at maxHistoryLength=1 keep index at 0 and history length 1", async () => {
    const { router, unsubscribe } = createStressRouter({ maxHistoryLength: 1 });

    try {
      await router.start("/");

      for (let i = 0; i < 1000; i++) {
        await router.navigate("user", { id: String(i) });

        // After each trim: index must be 0, history length 1 → no back/forward.
        expect(router.canGoBack()).toBe(false);
        expect(router.canGoForward()).toBe(false);

        const memory = router.getState()?.context.memory as
          | { historyIndex: number }
          | undefined;

        expect(memory?.historyIndex).toBe(0);
      }

      // Final state matches the last push.
      expect(router.getState()?.name).toBe("user");
      expect(router.getState()?.params.id).toBe("999");
    } finally {
      router.stop();
      unsubscribe();
    }
  });

  it("S14.2: back()/forward() at maxHistoryLength=1 are always no-ops", async () => {
    const { router, unsubscribe } = createStressRouter({ maxHistoryLength: 1 });

    try {
      await router.start("/");
      await router.navigate("users");

      const stateBefore = router.getState();

      router.back();
      router.forward();
      router.go(-5);
      router.go(5);
      router.go(1);
      router.go(-1);

      await new Promise<void>((r) => setTimeout(r, 0));

      expect(router.getState()).toBe(stateBefore);
      expect(router.canGoBack()).toBe(false);
      expect(router.canGoForward()).toBe(false);
    } finally {
      router.stop();
      unsubscribe();
    }
  });

  it("S14.3: alternating push + replace at cap=1 — replace does not grow, push trims", async () => {
    const { router, unsubscribe } = createStressRouter({ maxHistoryLength: 1 });

    try {
      await router.start("/");

      for (let i = 0; i < 500; i++) {
        await (i % 2 === 0
          ? router.navigate("user", { id: String(i) })
          : router.navigate("settings", {}, { replace: true }));

        expect(router.canGoBack()).toBe(false);
        expect(router.canGoForward()).toBe(false);
      }
    } finally {
      router.stop();
      unsubscribe();
    }
  });
});
