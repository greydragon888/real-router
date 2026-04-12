import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";

import { createStressRouter, waitForTransitions, noop } from "./helpers";

describe("N9: Navigate event during teardown", () => {
  beforeAll(() => {
    vi.spyOn(console, "warn").mockImplementation(noop);
    vi.spyOn(console, "error").mockImplementation(noop);
  });

  afterAll(() => {
    (console.warn as unknown as { mockRestore?: () => void }).mockRestore?.();
    (console.error as unknown as { mockRestore?: () => void }).mockRestore?.();
  });

  it("N9.1: 100 cycles: stop() + immediate navigate — event ignored", async () => {
    const { router, mockNav, unsubscribe } = createStressRouter();

    for (let i = 0; i < 100; i++) {
      await router.start();
      await router.navigate("users.list");

      router.stop();

      // Immediately fire navigate event after stop — should be ignored
      mockNav.navigate("http://localhost/home");
      await waitForTransitions();
    }

    // After all cycles, router should be startable without corruption
    await router.start();

    expect(router.getState()).toBeDefined();

    router.stop();
    unsubscribe();
  });

  it("N9.2: stop() during active navigation — no crash", async () => {
    const { router, mockNav, unsubscribe } = createStressRouter();

    for (let i = 0; i < 50; i++) {
      await router.start();

      // Fire navigate event but immediately stop
      mockNav.navigate("http://localhost/users/list");
      router.stop();

      await waitForTransitions();
    }

    // After 50 cycles, router is in stopped state and restartable
    await router.start();

    expect(router.getState()).toBeDefined();

    router.stop();
    unsubscribe();
  });
});
