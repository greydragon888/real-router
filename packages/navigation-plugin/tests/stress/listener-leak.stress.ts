import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";

import { createStressRouter, noop } from "./helpers";

describe("N12: Listener leak detection", () => {
  beforeAll(() => {
    vi.spyOn(console, "warn").mockImplementation(noop);
    vi.spyOn(console, "error").mockImplementation(noop);
  });

  afterAll(() => {
    (console.warn as unknown as { mockRestore?: () => void }).mockRestore?.();
    (console.error as unknown as { mockRestore?: () => void }).mockRestore?.();
  });

  it("N12.1: 10000 navigate cycles — only 1 active navigate listener", async () => {
    const { router, mockNav, browser, unsubscribe } = createStressRouter();

    const addListenerSpy = vi.spyOn(browser, "addNavigateListener");

    addListenerSpy.mockImplementation((fn) => {
      mockNav.addEventListener("navigate", fn as EventListener);

      return () => {
        mockNav.removeEventListener("navigate", fn as EventListener);
      };
    });

    await router.start();

    for (let i = 0; i < 10_000; i++) {
      await (i % 2 === 0
        ? router.navigate("users.list")
        : router.navigate("home"));
    }

    // After 10K navigations, addNavigateListener should have been called
    // exactly once (from onStart) — navigations don't add new listeners
    expect(addListenerSpy).toHaveBeenCalledTimes(1);

    router.stop();
    unsubscribe();
  });

  it("N12.2: 100 start/stop cycles — no listener accumulation", async () => {
    const { router, browser, unsubscribe } = createStressRouter();

    const addListenerSpy = vi.spyOn(browser, "addNavigateListener");

    for (let i = 0; i < 100; i++) {
      await router.start();
      router.stop();
    }

    // Each start adds 1 listener, each stop removes 1
    // addNavigateListener called 100 times (once per start)
    expect(addListenerSpy).toHaveBeenCalledTimes(100);

    unsubscribe();
  });
});
