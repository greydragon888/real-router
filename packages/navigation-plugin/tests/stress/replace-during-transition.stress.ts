import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";

import { createStressRouter, waitForTransitions, noop } from "./helpers";

describe("N10: replaceHistoryState during active transition", () => {
  beforeAll(() => {
    vi.spyOn(console, "warn").mockImplementation(noop);
    vi.spyOn(console, "error").mockImplementation(noop);
  });

  afterAll(() => {
    (console.warn as unknown as { mockRestore?: () => void }).mockRestore?.();
    (console.error as unknown as { mockRestore?: () => void }).mockRestore?.();
  });

  it("N10.1: 50 cycles: navigate event + replaceHistoryState before transition completes", async () => {
    const { router, mockNav, unsubscribe } = createStressRouter();

    await router.start();

    for (let i = 0; i < 50; i++) {
      // Alternate between two routes
      const target = i % 2 === 0 ? "users.list" : "home";
      const other = i % 2 === 0 ? "home" : "users.list";

      await router.navigate(target);

      // Fire browser navigate event to a different route
      mockNav.navigate(`http://localhost${router.buildPath(other)}`);

      // Before the transition completes, call replaceHistoryState
      try {
        router.replaceHistoryState(target);
      } catch {
        // May throw during transition — that's acceptable
      }

      await waitForTransitions();

      // State must be consistent — name matches a known route
      const state = router.getState();

      expect(state).toBeDefined();
      expect(["home", "users.list", "index"]).toContain(state!.name);
    }

    // Entries should not grow unbounded
    const entries = mockNav.entries();

    expect(entries.length).toBeLessThan(200);

    router.stop();
    unsubscribe();
  });

  it("N10.2: rapid replaceHistoryState during programmatic navigation", async () => {
    const { router, unsubscribe } = createStressRouter();

    await router.start();

    for (let i = 0; i < 50; i++) {
      const navigatePromise = router.navigate("users.list");

      try {
        router.replaceHistoryState("home");
      } catch {
        // Acceptable during transition
      }

      await navigatePromise;
      await router.navigate("home");
    }

    const state = router.getState();

    expect(state).toBeDefined();
    expect(state!.name).toBe("home");

    router.stop();
    unsubscribe();
  });
});
