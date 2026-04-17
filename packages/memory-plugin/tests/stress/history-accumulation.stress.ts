import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

import { createStressRouter, noop } from "./helpers";

describe("S1: history accumulation under load", () => {
  beforeAll(() => {
    vi.spyOn(console, "warn").mockImplementation(noop);
    vi.spyOn(console, "error").mockImplementation(noop);
  });

  afterAll(() => {
    (console.warn as unknown as { mockRestore?: () => void }).mockRestore?.();
    (console.error as unknown as { mockRestore?: () => void }).mockRestore?.();
  });

  it("S1.1: 10 000 push navigations are trimmed by maxHistoryLength", async () => {
    const { router } = createStressRouter({ maxHistoryLength: 100 });

    await router.start("/");

    for (let i = 0; i < 10_000; i++) {
      await router.navigate("user", { id: String(i) });
    }

    // Walk back as far as possible — should cap at 99 (maxHistory - 1).
    let backCount = 0;

    while (router.canGoBack() && backCount < 200) {
      router.back();
      await new Promise<void>((r) => setTimeout(r, 0));
      backCount++;
    }

    // After trimming to 100 entries the oldest reachable is at index 0,
    // so we can go back at most 99 times from index 99.
    expect(backCount).toBeLessThanOrEqual(99);
    expect(backCount).toBeGreaterThan(0);

    router.stop();
  });

  it("S1.2: unlimited (maxHistoryLength=0) retains all 1000 entries", async () => {
    const { router } = createStressRouter({ maxHistoryLength: 0 });

    await router.start("/");

    for (let i = 0; i < 1000; i++) {
      await router.navigate("user", { id: String(i) });
    }

    let backCount = 0;

    while (router.canGoBack() && backCount < 1500) {
      router.back();
      await new Promise<void>((r) => setTimeout(r, 0));
      backCount++;
    }

    // 1000 pushes after start → 1001 entries, current at index 1000,
    // so we can go back exactly 1000 times.
    expect(backCount).toBe(1000);

    router.stop();
  });
});
