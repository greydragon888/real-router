import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { errorCodes, RouterError } from "@real-router/core";
import { getLifecycleApi } from "@real-router/core/api";

import { createTestRouter } from "../helpers";

import type { Router } from "@real-router/core";

// A non-cooperative `canActivate` guard that returns a Promise which NEVER
// settles and ignores its `signal` must not be able to wedge the navigation
// pipeline forever. `#finishAsyncNavigation` races the guard completion against
// the navigation's abort signal (#1018), so a superseding navigate — or
// `stop()` / `dispose()` — rejects the stuck navigation with TRANSITION_CANCELLED
// instead of hanging on the never-settling guard.
//
// DISCRIMINATING POWER: revert the abort-race (#1018) and the never-settling
// guard leaves `await guardCompletion` pending forever — the superseded /
// stopped / disposed navigation never rejects and the `await expect(...).rejects`
// assertions below hang until the per-test timeout, turning this suite into a
// hard FAIL. The assertions exercise the fix itself, not just happy-path
// throughput. This is the guard-path counterpart of `never-settle-leave.stress.ts`
// (the leave path was already protected by #663/#673; the guard path was not).
//
// This is a liveness / throughput guard, NOT a heap-leak guard: the parked
// never-settling guard promises are unreferenced once their navigation is
// aborted and are reclaimed by GC regardless of whether the abort-race exists,
// so a heap snapshot here would be theatre (per the CLAUDE.md
// stress-discrimination rule).
describe("S31: never-settling canActivate guard does not wedge the pipeline", () => {
  let router: Router;

  beforeEach(async () => {
    router = createTestRouter();
    // Both targets park forever in their activation guard (never settles,
    // ignores signal).
    const lifecycle = getLifecycleApi(router);

    lifecycle.addActivateGuard(
      "users",
      () => () => new Promise<boolean>(() => {}),
    );
    lifecycle.addActivateGuard(
      "orders",
      () => () => new Promise<boolean>(() => {}),
    );

    await router.start("/home");
  });

  afterEach(() => {
    if (router.isActive()) {
      router.stop();
    }

    router.dispose();
  });

  it("S31.1: a superseding navigation releases a navigation parked on a never-settling guard ×200", async () => {
    const N = 200;
    const targets = ["users", "orders"] as const;

    // Each navigation parks in its never-settling activation guard; the next
    // navigation supersedes it, so the superseded one must reject via the
    // abort-race rather than hang.
    let prev = router.navigate(targets[0]);

    for (let i = 1; i < N; i++) {
      // Let `prev` reach its (never-resolving) guard await before it is
      // superseded, so the abort-race — not a pre-guard cancel — is exercised.

      await Promise.resolve();

      const next = router.navigate(targets[i % targets.length]);

      await expect(prev).rejects.toMatchObject({
        code: errorCodes.TRANSITION_CANCELLED,
      });

      prev = next;
    }

    // The last navigation is still parked. Navigate to a guard-free route so the
    // final (superseding) navigation can commit.
    const final = router.navigate("settings.account");

    await expect(prev).rejects.toMatchObject({
      code: errorCodes.TRANSITION_CANCELLED,
    });

    await final;

    // Router fully usable: the final navigation committed and a fresh one works.
    expect(router.getState()?.name).toBe("settings.account");
    expect(router.isActive()).toBe(true);

    await router.navigate("settings.privacy");

    expect(router.getState()?.name).toBe("settings.privacy");
  }, 30_000);

  it("S31.2: stop() releases a navigation parked on a never-settling guard", async () => {
    const nav = router.navigate("users");

    // Let the navigation reach and park in its never-resolving guard await.
    await Promise.resolve();

    // stop() aborts the in-flight navigation's controller; the abort-race must
    // reject the parked navigation rather than leave it pending forever.
    router.stop();

    await expect(nav).rejects.toMatchObject({
      code: errorCodes.TRANSITION_CANCELLED,
    });
    expect(router.isActive()).toBe(false);
  }, 30_000);

  it("S31.3: dispose() releases a navigation parked on a never-settling guard", async () => {
    const nav = router.navigate("orders");

    await Promise.resolve();

    // dispose() must not leave the navigation pending forever (the guard-path
    // analogue of the leave-path DoS fixed in #663/#673).
    router.dispose();

    await expect(nav).rejects.toThrow(RouterError);
    expect(router.isActive()).toBe(false);
  }, 30_000);
});
