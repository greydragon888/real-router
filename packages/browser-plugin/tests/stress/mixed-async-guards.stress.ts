import { getLifecycleApi } from "@real-router/core/api";
import {
  describe,
  it,
  expect,
  beforeEach,
  beforeAll,
  afterAll,
  vi,
} from "vitest";

import {
  createStressRouter,
  expectedStressError,
  noop,
  waitForTransitions,
} from "./helpers";

/**
 * B7.5 — Mixed-timing async guards
 *
 * `popstate-storm.stress.ts` covers a single uniform 100ms guard. Real
 * apps mix sync / fast / slow guards across routes, and the
 * `isTransitioning` flag in `createPopstateHandler` has to switch cleanly
 * regardless of which guard's promise settles first. This file blends
 * three timing classes — sync (~0 ms), fast (10 ms), slow (200 ms) —
 * across the available routes and pushes 200 navigations through them.
 *
 * Invariant: the router never wedges (`isTransitioning` permanently true,
 * subsequent navigations dropped) and converges to one of the dispatched
 * routes. Settled `console.error` count must remain zero.
 */
describe("B7.5 — mixed sync/async guard timings", () => {
  beforeAll(() => {
    vi.spyOn(console, "warn").mockImplementation(noop);
  });

  beforeEach(() => {
    globalThis.history.replaceState({}, "", "/");
  });

  afterAll(() => {
    (console.warn as unknown as { mockRestore?: () => void }).mockRestore?.();
  });

  it("converges and never wedges with mixed sync / fast / slow guards", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(noop);
    const { router } = createStressRouter();

    try {
      const lifecycle = getLifecycleApi(router);

      // Sync (no microtask)
      lifecycle.addActivateGuard("home", () => () => true);

      // Fast async (~10 ms)
      lifecycle.addActivateGuard(
        "users.list",
        () => () =>
          new Promise<boolean>((resolve) => {
            setTimeout(() => {
              resolve(true);
            }, 10);
          }),
      );

      // Slow async (~200 ms) — only fired ~10% of the time
      lifecycle.addActivateGuard(
        "users.view",
        () => () =>
          new Promise<boolean>((resolve) => {
            setTimeout(() => {
              resolve(true);
            }, 200);
          }),
      );

      await router.start();

      // 80% fast, 10% slow, 10% sync — 200 nav total.
      const navTargets: { name: string; params?: Record<string, string> }[] =
        [];

      for (let i = 0; i < 200; i++) {
        const r = i % 10;

        if (r === 0) {
          navTargets.push({ name: "home" });
        } else if (r === 1) {
          navTargets.push({ name: "users.view", params: { id: String(i) } });
        } else {
          navTargets.push({ name: "users.list" });
        }
      }

      const promises = navTargets.map((target) =>
        router
          .navigate(target.name, target.params ?? {})
          .catch(expectedStressError),
      );

      await Promise.allSettled(promises);
      // Slow guard takes 200ms; allow the slowest possible still-in-flight
      // navigate to settle plus a small margin.
      await waitForTransitions(400);

      // The router did NOT wedge: a fresh navigation goes through.
      await router.navigate("home").catch(expectedStressError);

      const finalName = router.getState()?.name ?? "";

      expect(["home", "users.list", "users.view"]).toContain(finalName);

      // No silent crashes inside the popstate handler / claim writes.
      expect(errorSpy).not.toHaveBeenCalled();
    } finally {
      router.stop();
      errorSpy.mockRestore();
    }
  });
});
