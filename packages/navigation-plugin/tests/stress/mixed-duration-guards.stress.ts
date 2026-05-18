import { getLifecycleApi } from "@real-router/core/api";
import {
  describe,
  it,
  expect,
  afterEach,
  beforeAll,
  afterAll,
  vi,
} from "vitest";

import { createStressRouter, waitForTransitions, noop } from "./helpers";

import type { Router, Unsubscribe } from "@real-router/core";

let router: Router;
let unsubscribe: Unsubscribe;

/**
 * N22 — Mixed-duration async guards. The 2026-05-18 audit (§7.2) flagged
 * that N1.2 exercises async guards but with a SINGLE timeout (100ms). Race
 * conditions in `#capturedMeta` / `#pendingTraverseKey` only show up when
 * a slow guard is cancelled by a fast one — i.e., when the cancel/start
 * order interleaves across different timescales. This file simulates that.
 *
 * Scenario: install three guards with timeouts 5ms / 50ms / 500ms on three
 * different routes, then fire navigations to them in a tight loop. The order
 * of resolution diverges from the order of dispatch — long-running cancels
 * leak `#capturedMeta` into subsequent transitions if the cleanup hooks
 * don't fire correctly.
 */

describe("N22 — Mixed-duration async guards", () => {
  beforeAll(() => {
    vi.spyOn(console, "warn").mockImplementation(noop);
    vi.spyOn(console, "error").mockImplementation(noop);
  });

  afterEach(() => {
    router.stop();
    unsubscribe();
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  it("N22.1: guards with 5ms/50ms/500ms timeouts — no stale meta after slow-cancels-fast", async () => {
    const result = createStressRouter();

    router = result.router;
    unsubscribe = result.unsubscribe;

    await router.start();

    const lifecycle = getLifecycleApi(router);
    const guardFor = (delay: number) => () => () =>
      new Promise<boolean>((resolve) => {
        setTimeout(() => {
          resolve(true);
        }, delay);
      });

    lifecycle.addActivateGuard("home", guardFor(500));
    lifecycle.addActivateGuard("users.list", guardFor(50));
    lifecycle.addActivateGuard("users.view", guardFor(5));

    // Drive 60 transitions across the three routes in rotation. With timeouts
    // 500/50/5, the dispatch order (home, users.list, users.view, ...) is
    // never the resolve order — each home transition gets superseded by the
    // next two, then re-fired, etc. This is the storm-of-cancels pattern.
    const promises: Promise<unknown>[] = [];

    const routes = ["home", "users.list", "users.view"] as const;

    for (let i = 0; i < 60; i++) {
      const route = routes[i % 3];
      const params = route === "users.view" ? { id: String(i) } : {};

      promises.push(router.navigate(route, params).catch(noop));
    }

    await Promise.allSettled(promises);
    await waitForTransitions(700);

    // Final navigate to a known-clean route resolves the storm. If
    // #capturedMeta leaked from a cancelled slow guard, the meta for this
    // navigation would carry a stale `direction` or `navigationType`.
    const finalState = await router.navigate("home").catch(noop);

    expect(finalState).toBeDefined();

    // Stronger end-state check: router.getState().name must equal "home"
    // (not stuck on a mid-storm intermediate route). The earlier version
    // checked only `meta.navigationType` which can be "push" even if the
    // navigation never reached "home" — a regression where the slow guard
    // never resolved would leave router on whatever the storm landed on,
    // but `await router.navigate("home")` would still resolve via the
    // success path. Pinning `state.name === "home"` closes that gap.
    const currentState = router.getState();

    expect(currentState).toBeDefined();
    expect(currentState!.name).toBe("home");
    expect(currentState!.params).toStrictEqual({});

    const meta = currentState!.context.navigation;

    expect(meta).toBeDefined();
    // Programmatic navigate(name) — push, direction forward, no leak from
    // earlier cancelled traverses (which would set direction "back").
    expect(meta!.navigationType).toBe("push");
    expect(meta!.direction).toBe("forward");
    expect(meta!.userInitiated).toBe(false);
  });

  it("N22.2: interleaved fast/slow navigations — final state is the last completed, no stuck transitions", async () => {
    const result = createStressRouter();

    router = result.router;
    unsubscribe = result.unsubscribe;

    await router.start();

    const lifecycle = getLifecycleApi(router);

    // Deterministic mixed delays — cycle through five buckets covering both
    // fast (1ms) and slow (50ms) extremes so dispatch order and resolution
    // order are guaranteed to differ without depending on Math.random()
    // (sonarjs/pseudo-random).
    const delays = [1, 7, 17, 31, 49] as const;
    let delayIdx = 0;

    lifecycle.addActivateGuard(
      "users.view",
      () => () =>
        new Promise<boolean>((resolve) => {
          const delay = delays[delayIdx % delays.length];

          delayIdx++;
          setTimeout(() => {
            resolve(true);
          }, delay);
        }),
    );

    for (let i = 0; i < 100; i++) {
      router.navigate("users.view", { id: String(i) }).catch(noop);
    }

    await waitForTransitions(200);

    // After the storm, the router must be on `users.view` with SOME id —
    // not stuck on "index" (last-resolved-wins regression) and not stuck on
    // any specific id (race).
    const state = router.getState();

    expect(state?.name).toBe("users.view");
    expect(typeof state?.params.id).toBe("string");
  });

  it("N22.3: 30 long-running guards superseded by short-running guards — router not stuck on first slow promise", async () => {
    // Pins a specific failure mode: a regression that awaited the first
    // navigate promise inside onTransitionSuccess (instead of trusting the
    // core's cancel propagation) would keep `router.getState()` frozen at
    // "index" while the slow guard resolved.
    const result = createStressRouter();

    router = result.router;
    unsubscribe = result.unsubscribe;

    await router.start();

    const lifecycle = getLifecycleApi(router);

    lifecycle.addActivateGuard(
      "home",
      () => () =>
        new Promise<boolean>((resolve) => {
          setTimeout(() => {
            resolve(true);
          }, 500);
        }),
    );
    lifecycle.addActivateGuard(
      "users.list",
      () => () =>
        new Promise<boolean>((resolve) => {
          setTimeout(() => {
            resolve(true);
          }, 5);
        }),
    );

    // 30 alternations: slow guard, then fast guard. The slow one is
    // cancelled by the fast one 30 times. The fast one should win every
    // time — final state must be `users.list`.
    for (let i = 0; i < 30; i++) {
      router.navigate("home").catch(noop);
      router.navigate("users.list").catch(noop);
    }

    await waitForTransitions(700);

    expect(router.getState()?.name).toBe("users.list");
  });
});
