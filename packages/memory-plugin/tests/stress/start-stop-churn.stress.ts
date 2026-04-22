import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

import { createStressRouter, noop, settle } from "./helpers";

describe("S2: rapid start/stop churn without navigation", () => {
  beforeAll(() => {
    vi.spyOn(console, "warn").mockImplementation(noop);
    vi.spyOn(console, "error").mockImplementation(noop);
  });

  afterAll(() => {
    (console.warn as unknown as { mockRestore?: () => void }).mockRestore?.();
    (console.error as unknown as { mockRestore?: () => void }).mockRestore?.();
  });

  it("S2.1: 1000 start/stop cycles leave the router in a clean state", async () => {
    const { router, unsubscribe } = createStressRouter();

    for (let i = 0; i < 1000; i++) {
      await router.start("/");
      router.stop();

      expect(router.canGoBack()).toBe(false);
      expect(router.canGoForward()).toBe(false);
    }

    await settle();
    unsubscribe();
  });

  it("S2.2: double stop() in the same cycle is a no-op", async () => {
    const { router, unsubscribe } = createStressRouter();

    await router.start("/");

    expect(() => {
      router.stop();
      router.stop();
    }).not.toThrow();

    unsubscribe();
  });

  it("S2.3: unsubscribe() called twice back-to-back does not throw", () => {
    const { unsubscribe } = createStressRouter();

    expect(() => {
      unsubscribe();
      unsubscribe();
    }).not.toThrow();
  });
});
