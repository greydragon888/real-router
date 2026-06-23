import { describe, it, expect, vi } from "vitest";

import { errorCodes } from "@real-router/core";

import { createTestRouter } from "../../helpers";

/**
 * `subscribeLeave` coverage — audit 2026-06-23.
 *
 * The former suite built a bare `EventBusNamespace` and hand-drove the FSM,
 * duplicating ~90% of `async-leave-listeners`, `leave-signal-cancellation`,
 * `leave-approve-integration` and `events-transition-leave-approve` (which drive
 * the same machinery through real navigations).
 *
 * The full functional suite (minus this file) leaves exactly four
 * `awaitLeaveListeners` branches uncovered; all four are reachable through the
 * PUBLIC pipeline (`router.subscribeLeave()` + navigate) and are pinned below.
 */
describe("subscribeLeave — branch coverage via the public pipeline", () => {
  it("does NOT fire leave listeners on the first navigation (fromState === undefined)", async () => {
    const router = createTestRouter();
    const onLeave = vi.fn();

    router.subscribeLeave(onLeave);

    await router.start("/home"); // first navigation: fromState is undefined

    expect(onLeave).not.toHaveBeenCalled();

    await router.navigate("items", { id: "1" }); // now fromState === "home"

    expect(onLeave).toHaveBeenCalledTimes(1);

    router.stop();
  });

  it("double-unsubscribe is a safe no-op (listener already removed, idx === -1)", async () => {
    const router = createTestRouter();
    const onLeave = vi.fn();

    const unsubscribe = router.subscribeLeave(onLeave);

    unsubscribe();

    expect(() => {
      unsubscribe();
    }).not.toThrow(); // second call hits the idx === -1 path

    await router.start("/home");
    await router.navigate("items", { id: "1" });

    expect(onLeave).not.toHaveBeenCalled(); // stayed unsubscribed

    router.stop();
  });

  it("first sync-throwing leave listener wins; later sync throws are discarded", async () => {
    const router = createTestRouter();

    await router.start("/home");
    router.subscribeLeave(() => {
      throw new Error("FIRST");
    });
    router.subscribeLeave(() => {
      throw new Error("SECOND");
    });

    const error = await router.navigate("items", { id: "1" }).then(
      () => undefined,
      (error_: unknown) => error_ as { message?: string },
    );

    // first error propagates; the second is swallowed (firstSyncError !== undefined)
    expect(error?.message).toContain("FIRST");

    router.stop();
  });

  it("rejects on the already-aborted signal when a leave listener stops the router mid-dispatch", async () => {
    const router = createTestRouter();

    await router.start("/home");

    // An async listener keeps a pending promise so the awaited settle path is
    // taken; a later SYNC listener stops the router in the SAME synchronous
    // dispatch, which aborts the navigation's internal signal before the promises
    // are settled — so the settle is entered with an already-aborted signal (the
    // on-entry guard, unreachable by an external `opts.signal` which does not
    // propagate to the internal controller synchronously).
    router.subscribeLeave(async () => {});
    router.subscribeLeave(() => {
      router.stop();
    });

    const error = await router.navigate("items", { id: "1" }).then(
      () => undefined,
      (error_: unknown) => error_ as { code?: string },
    );

    expect(error?.code).toBe(errorCodes.TRANSITION_CANCELLED);
  });
});
