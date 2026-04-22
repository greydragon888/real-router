import { createRouter } from "@real-router/core";
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

import { memoryPluginFactory } from "@real-router/memory-plugin";

import { createStressRouter, noop, settle } from "./helpers";

import type { Route } from "@real-router/core";

describe("S12: navigate() in flight + replace navigate() overlap", () => {
  beforeAll(() => {
    vi.spyOn(console, "warn").mockImplementation(noop);
    vi.spyOn(console, "error").mockImplementation(noop);
  });

  afterAll(() => {
    (console.warn as unknown as { mockRestore?: () => void }).mockRestore?.();
    (console.error as unknown as { mockRestore?: () => void }).mockRestore?.();
  });

  it("S12.1: navigate(A-async-guard) then navigate(B, replace:true) — second supersedes first", async () => {
    // Async guard forces a real overlap — core's sync-optimistic fast path
    // would otherwise complete the first navigate before the second starts.
    const routes: Route[] = [
      { name: "home", path: "/" },
      {
        name: "slow",
        path: "/slow",
        canActivate: () => () =>
          new Promise<boolean>((r) => {
            setTimeout(() => {
              r(true);
            }, 50);
          }),
      },
      { name: "users", path: "/users" },
      { name: "settings", path: "/settings" },
    ];

    const router = createRouter(routes, { defaultRoute: "home" });
    const unsubscribe = router.usePlugin(memoryPluginFactory());

    try {
      await router.start("/");
      await router.navigate("users");

      // History: [home, users], index=1, state=users.
      const p1 = router.navigate("slow").catch((error: unknown) => {
        if ((error as { code?: string }).code !== "TRANSITION_CANCELLED") {
          throw error;
        }
      });

      // Kick p2 on next microtask so p1's guard is already running.
      await Promise.resolve();

      const p2 = router
        .navigate("settings", {}, { replace: true })
        .catch((error: unknown) => {
          if ((error as { code?: string }).code !== "TRANSITION_CANCELLED") {
            throw error;
          }
        });

      await Promise.allSettled([p1, p2]);
      await settle();

      // p1 was cancelled mid-guard. p2 replaced current entry.
      // History must be [home, settings], state=settings.
      expect(router.getState()?.name).toBe("settings");
      expect(router.canGoBack()).toBe(true);
      expect(router.canGoForward()).toBe(false);

      router.back();
      await settle();

      expect(router.getState()?.name).toBe("home");
      expect(router.canGoBack()).toBe(false);
    } finally {
      router.stop();
      unsubscribe();
    }
  });

  it("S12.2: 50 alternating navigate + replace — history size stays bounded by pushes", async () => {
    const { router, unsubscribe } = createStressRouter({ maxHistoryLength: 0 });

    try {
      await router.start("/");

      let pushCount = 1; // includes "home" from start()
      const promises: Promise<unknown>[] = [];

      for (let i = 0; i < 50; i++) {
        const p =
          i % 2 === 0
            ? router
                .navigate("user", { id: String(i) })
                .then(() => (pushCount += 1))
                .catch((error: unknown) => {
                  if (
                    (error as { code?: string }).code !== "TRANSITION_CANCELLED"
                  ) {
                    throw error;
                  }
                })
            : router
                .navigate("settings", {}, { replace: true })
                .catch((error: unknown) => {
                  if (
                    (error as { code?: string }).code !== "TRANSITION_CANCELLED"
                  ) {
                    throw error;
                  }
                });

        promises.push(p);
      }

      await Promise.allSettled(promises);
      await settle();

      // Router must still be responsive — canGoBack must match the
      // live `#index > 0` invariant rather than just "returns a boolean".
      const memory = router.getState()?.context.memory as
        | { historyIndex: number }
        | undefined;

      expect(memory).toBeDefined();
      expect(router.canGoBack()).toBe((memory?.historyIndex ?? -1) > 0);

      // historyIndex must be non-negative and ≤ pushCount (pushCount is upper
      // bound — replace doesn't grow the stack, cancelled navigations don't either).
      expect(memory?.historyIndex).toBeGreaterThanOrEqual(0);
      expect(memory?.historyIndex).toBeLessThanOrEqual(pushCount);
    } finally {
      router.stop();
      unsubscribe();
    }
  });
});
