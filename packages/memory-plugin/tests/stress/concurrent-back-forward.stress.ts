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

    // Router must be in a valid state — one of the five pushed routes.
    const finalName = router.getState()?.name;

    expect(["home", "users", "user", "settings", "profile"]).toContain(
      finalName ?? "",
    );

    // canGoBack/canGoForward must be bools reflecting a valid index position.
    expect(typeof router.canGoBack()).toBe("boolean");
    expect(typeof router.canGoForward()).toBe("boolean");

    router.stop();
  });

  it("S4.2: rapid go(+/-N) does not crash", async () => {
    const { router } = createStressRouter();

    await router.start("/");

    for (let i = 0; i < 10; i++) {
      await router.navigate("user", { id: String(i) });
    }

    expect(() => {
      for (let i = 0; i < 200; i++) {
        router.go((i % 7) - 3);
      }
    }).not.toThrow();

    await settle();

    router.stop();
  });
});
