import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

import { createStressRouter, noop, settle } from "./helpers";

describe("S4: concurrent back()/forward()", () => {
  beforeAll(() => {
    vi.spyOn(console, "warn").mockImplementation(noop);
    vi.spyOn(console, "error").mockImplementation(noop);
  });

  afterAll(() => {
    (console.warn as unknown as { mockRestore?: () => void }).mockRestore?.();
    (console.error as unknown as { mockRestore?: () => void }).mockRestore?.();
  });

  it("S4.1: 100 interleaved back()/forward() calls leave index in valid range", async () => {
    const { router } = createStressRouter();

    await router.start("/");

    // Build history: home → users → user/1 → settings → profile (5 entries)
    await router.navigate("users");
    await router.navigate("user", { id: "1" });
    await router.navigate("settings");
    await router.navigate("profile");

    for (let i = 0; i < 100; i++) {
      if (i % 2 === 0) {
        router.back();
      } else {
        router.forward();
      }
    }

    // Let every scheduled navigation settle.
    await settle();
    await settle();

    // History has 5 entries; final index must be valid (0..4). We can't predict
    // the exact landing slot under concurrent back/forward because core cancels
    // in-flight navigations — but the index MUST be a valid position, and from
    // any valid position in a 5-entry history at least one of back/forward is
    // possible.
    const finalName = router.getState()?.name;

    expect(["home", "users", "user", "settings", "profile"]).toContain(
      finalName ?? "",
    );
    expect(router.canGoBack() || router.canGoForward()).toBe(true);

    const memory = router.getState()?.context.memory as
      | { historyIndex: number }
      | undefined;

    expect(memory?.historyIndex).toBeGreaterThanOrEqual(0);
    expect(memory?.historyIndex).toBeLessThanOrEqual(4);

    router.stop();
  });

  it("S4.2: rapid go(+/-N) does not crash and leaves index in valid range", async () => {
    const { router } = createStressRouter();

    await router.start("/");

    for (let i = 0; i < 10; i++) {
      await router.navigate("user", { id: String(i) });
    }

    // History has 11 entries after 10 pushes (start adds "home"). max index = 10.
    expect(() => {
      for (let i = 0; i < 200; i++) {
        router.go((i % 7) - 3);
      }
    }).not.toThrow();

    await settle();

    const memory = router.getState()?.context.memory as
      | { historyIndex: number }
      | undefined;

    expect(memory?.historyIndex).toBeGreaterThanOrEqual(0);
    expect(memory?.historyIndex).toBeLessThanOrEqual(10);

    router.stop();
  });
});
