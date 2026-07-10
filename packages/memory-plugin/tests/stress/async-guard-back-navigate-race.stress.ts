import { getLifecycleApi } from "@real-router/core/api";
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

import { createStressRouter, noop, settle } from "./helpers";

// #1235 — the async-guard residual of #807 (#1234). #807's stress (S11) only
// covered the SYNC same-tick race; the residual lives in the async-`canActivate`
// window: the restore `navigateToState` is in flight (guard pending) and a
// concurrent `navigate()` cancels it and commits first. Timing-based flag
// consumption then swallows that navigate as a phantom history-restore. This
// stress interleaves the async race many times and asserts the stack never
// wedges (`#navigatingFromHistory` stuck true → pushes silently skipped) nor
// desyncs (`#index` reverted out of bounds by the cancelled #go's `.catch`).
describe("S12: async-guard back()/go() in flight + concurrent navigate() race (#1234 / #1235)", () => {
  beforeAll(() => {
    vi.spyOn(console, "warn").mockImplementation(noop);
    vi.spyOn(console, "error").mockImplementation(noop);
  });

  afterAll(() => {
    (console.warn as unknown as { mockRestore?: () => void }).mockRestore?.();
    (console.error as unknown as { mockRestore?: () => void }).mockRestore?.();
  });

  it("S12.1: async canActivate on the back target — concurrent navigate is recorded, not swallowed", async () => {
    const { router, unsubscribe } = createStressRouter();

    try {
      await router.start("/");
      await router.navigate("users");
      await router.navigate("settings"); // [home, users, settings] index 2

      // Async guard on the back() target keeps the restore navigateToState in
      // flight — the window #807's sync fix does not cover.
      getLifecycleApi(router).addActivateGuard(
        "users",
        () => () =>
          new Promise((resolve) =>
            setTimeout(() => {
              resolve(true);
            }, 15),
          ),
      );

      router.back(); // → users, in flight (15ms guard)
      await router.navigate("profile").catch((error: unknown) => {
        if ((error as { code?: string }).code !== "TRANSITION_CANCELLED") {
          throw error;
        }
      });

      await settle();

      // The four-way assertion that discriminates the corrupt stack (name +
      // canGoBack alone do not): the concurrent navigate must be a fresh push,
      // NOT the cancelled back's phantom restore.
      expect(router.getState()?.name).toBe("profile");
      expect(router.getState()?.context.memory).toStrictEqual({
        direction: "navigate",
        historyIndex: 2,
      });
      expect(router.canGoForward()).toBe(false);
    } finally {
      router.stop();
      unsubscribe();
    }
  });

  it("S12.2: 40 interleaved async-guard back()/go(-2) + navigate() cycles keep the stack unwedged and in bounds", async () => {
    const { router, unsubscribe } = createStressRouter();
    const ignored = new Set([
      "TRANSITION_CANCELLED",
      "SAME_STATES",
      "ROUTE_NOT_FOUND",
    ]);

    try {
      await router.start("/");
      await router.navigate("users");
      await router.navigate("settings");
      await router.navigate("profile"); // depth 3

      getLifecycleApi(router).addActivateGuard(
        "users",
        () => () =>
          new Promise((resolve) =>
            setTimeout(() => {
              resolve(true);
            }, 10),
          ),
      );

      const targets = ["users", "settings", "profile", "user"];

      for (let i = 0; i < 40; i++) {
        // Varying-depth back that may land on the async-guarded "users".
        if (i % 3 === 0) {
          router.go(-2);
        } else {
          router.back();
        }

        const target = targets[i % targets.length];
        const params = target === "user" ? { id: String(i) } : {};

        await router.navigate(target, params).catch((error: unknown) => {
          const code = (error as { code?: string }).code;

          if (code === undefined || !ignored.has(code)) {
            throw error;
          }
        });

        await settle();

        // Invariant per cycle: #index stays in bounds (a real historyIndex ≥ 0),
        // never reverted past the array by the cancelled #go's .catch.
        const mem = (
          router.getState()?.context as
            { memory?: { historyIndex: number } } | undefined
        )?.memory;

        expect(typeof mem?.historyIndex).toBe("number");
        expect(mem?.historyIndex).toBeGreaterThanOrEqual(0);
      }

      // Final invariant: a plain navigate records normally — the flag never
      // leaked to a stuck `true` (which would silently skip the push).
      await router.navigate("home");

      const finalMem = (
        router.getState()?.context as
          { memory?: { direction: string; historyIndex: number } } | undefined
      )?.memory;

      expect(router.getState()?.name).toBe("home");
      expect(finalMem?.direction).toBe("navigate");
      expect(finalMem?.historyIndex).toBeGreaterThanOrEqual(0);
    } finally {
      router.stop();
      unsubscribe();
    }
  });
});
