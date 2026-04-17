import { createRouter } from "@real-router/core";
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

import { memoryPluginFactory } from "@real-router/memory-plugin";

import { ROUTES, noop } from "./helpers";

describe("S6: factory reuse across many routers", () => {
  beforeAll(() => {
    vi.spyOn(console, "warn").mockImplementation(noop);
    vi.spyOn(console, "error").mockImplementation(noop);
  });

  afterAll(() => {
    (console.warn as unknown as { mockRestore?: () => void }).mockRestore?.();
    (console.error as unknown as { mockRestore?: () => void }).mockRestore?.();
  });

  it("S6.1: 100 routers sharing one factory each keep independent history", async () => {
    const factory = memoryPluginFactory({ maxHistoryLength: 5 });

    const cleanups: (() => void)[] = [];

    try {
      for (let i = 0; i < 100; i++) {
        const router = createRouter(ROUTES, { defaultRoute: "home" });
        const unsubscribe = router.usePlugin(factory);

        await router.start("/");
        await router.navigate("user", { id: String(i) });

        // Each router observes its own state, not a shared one.
        expect(router.getState()?.params.id).toBe(String(i));
        expect(router.canGoBack()).toBe(true);

        cleanups.push(() => {
          router.stop();
          unsubscribe();
        });
      }
    } finally {
      for (const cleanup of cleanups) {
        cleanup();
      }
    }
  });

  it("S6.2: teardown on one router does not affect another using the same factory", async () => {
    const factory = memoryPluginFactory();

    const a = createRouter(ROUTES, { defaultRoute: "home" });
    const b = createRouter(ROUTES, { defaultRoute: "home" });
    const unsubA = a.usePlugin(factory);
    const unsubB = b.usePlugin(factory);

    await a.start("/");
    await b.start("/");

    await a.navigate("users");
    await b.navigate("settings");

    unsubA();

    // A lost the extensions; B must still work.
    expect(typeof b.canGoBack).toBe("function");
    expect(b.canGoBack()).toBe(true);

    b.back();
    await new Promise<void>((r) => setTimeout(r, 0));

    expect(b.getState()?.name).toBe("home");

    a.stop();
    b.stop();
    unsubB();
  });
});
