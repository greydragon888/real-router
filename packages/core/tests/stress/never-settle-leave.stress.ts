import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { errorCodes, RouterError } from "@real-router/core";

import { createTestRouter } from "../helpers";

import type { Router } from "@real-router/core";

// A `subscribeLeave` listener that returns a Promise which NEVER settles must
// not be able to wedge the navigation pipeline forever. `settleLeavePromises`
// races `Promise.allSettled` against the navigation's abort signal (#663 /
// #673), so a superseding navigate — or `stop()` / `dispose()` — aborts the
// stuck leave phase and the blocked navigation rejects with TRANSITION_CANCELLED
// instead of hanging.
//
// DISCRIMINATING POWER: revert the abort-race (#673) and the never-settling
// promise leaves `allSettled` pending forever — the superseded navigation never
// rejects and the `await expect(prev).rejects…` assertions below hang until the
// per-test timeout, turning this suite into a hard FAIL. The assertions exercise
// the fix itself, not just happy-path throughput. (Probe-02 in the original
// audit confirmed the pre-fix behaviour: a navigation stayed pending forever,
// even after `dispose()`.)
//
// This is a liveness / throughput guard, NOT a heap-leak guard: the parked
// never-settling promises are unreferenced once their navigation is aborted and
// are reclaimed by GC regardless of whether the abort-race exists, so a heap
// snapshot here would be theatre (per the CLAUDE.md stress-discrimination rule).
describe("S30: never-settling subscribeLeave does not wedge the pipeline", () => {
  let router: Router;

  beforeEach(async () => {
    router = createTestRouter();
    await router.start("/home");
  });

  afterEach(() => {
    if (router.isActive()) {
      router.stop();
    }

    router.dispose();
  });

  it("S30.1: a superseding navigation releases a never-settling leave phase ×200", async () => {
    const N = 200;
    const targets = ["users", "orders"] as const;

    // One listener, registered once: every navigation's leave phase parks on a
    // promise that never settles.
    const unsub = router.subscribeLeave(() => new Promise<void>(() => {}));

    // Each navigation is superseded by the next; the superseded one must reject
    // via the abort-race rather than hang on the never-settling promise.
    let prev = router.navigate(targets[0]);

    for (let i = 1; i < N; i++) {
      // Let `prev` settle into its (never-resolving) leave phase before it is
      // superseded, so the abort-race — not a pre-leave cancel — is exercised.

      await Promise.resolve();

      const next = router.navigate(targets[i % targets.length]);

      await expect(prev).rejects.toMatchObject({
        code: errorCodes.TRANSITION_CANCELLED,
      });

      prev = next;
    }

    // The last navigation is still parked on the never-settling promise. Drop
    // the listener, then supersede once more so the final (now-unblocked)
    // navigation can commit.
    unsub();

    const final = router.navigate("settings.account");

    await expect(prev).rejects.toMatchObject({
      code: errorCodes.TRANSITION_CANCELLED,
    });

    await final;

    // Router fully usable: the final navigation committed and a fresh one works.
    expect(router.getState()?.name).toBe("settings.account");
    expect(router.isActive()).toBe(true);

    await router.navigate("home");

    expect(router.getState()?.name).toBe("home");
  }, 30_000);

  it("S30.2: stop() releases a navigation parked on a never-settling leave phase", async () => {
    const unsub = router.subscribeLeave(() => new Promise<void>(() => {}));

    const nav = router.navigate("users");

    // Let the navigation reach and park in its never-resolving leave phase.
    await Promise.resolve();

    // stop() aborts the in-flight navigation's controller; the abort-race must
    // reject the parked navigation rather than leave it pending forever.
    router.stop();

    await expect(nav).rejects.toMatchObject({
      code: errorCodes.TRANSITION_CANCELLED,
    });
    expect(router.isActive()).toBe(false);

    unsub();
  }, 30_000);

  it("S30.3: dispose() releases a navigation parked on a never-settling leave phase", async () => {
    router.subscribeLeave(() => new Promise<void>(() => {}));

    const nav = router.navigate("orders");

    await Promise.resolve();

    // dispose() must not leave the navigation pending forever (the original DoS:
    // probe-02 case C showed nav1 still pending after dispose, pre-#673).
    router.dispose();

    await expect(nav).rejects.toThrow(RouterError);
    expect(router.isActive()).toBe(false);
  }, 30_000);
});
