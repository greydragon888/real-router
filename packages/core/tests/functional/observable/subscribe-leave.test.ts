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

  it("double-unsubscribe is a safe no-op (idempotency flag short-circuits the repeat call)", async () => {
    const router = createTestRouter();
    const onLeave = vi.fn();

    const unsubscribe = router.subscribeLeave(onLeave);

    unsubscribe();

    expect(() => {
      unsubscribe();
    }).not.toThrow(); // second call returns early via the `removed` flag

    await router.start("/home");
    await router.navigate("items", { id: "1" });

    expect(onLeave).not.toHaveBeenCalled(); // stayed unsubscribed

    router.stop();
  });

  it("unsubscribe after dispose() is a safe no-op (leave-listeners already cleared, idx === -1)", () => {
    const router = createTestRouter();
    const unsubscribe = router.subscribeLeave(vi.fn());

    router.dispose(); // clearAll() empties #leaveListeners

    // The listener is gone from the array, so the unsubscribe hits idx === -1.
    expect(() => {
      unsubscribe();
    }).not.toThrow();
  });

  it("double unsubscribe does NOT remove a duplicate registration of the same fn (#1349)", async () => {
    const router = createTestRouter();

    await router.start("/home");

    // The same fn registered twice (e.g. a shared handler used by two
    // components). The `Unsubscribe` contract is idempotent — calling the FIRST
    // unsubscribe twice must not touch the SECOND registration.
    let hits = 0;
    const shared = (): void => {
      hits++;
    };

    const unsub1 = router.subscribeLeave(shared);

    router.subscribeLeave(shared); // 2nd registration — its unsubscribe never called

    unsub1();
    unsub1(); // documented safe — must be a true no-op after the first call

    await router.navigate("items", { id: "1" }); // leaves "home"

    // The surviving 2nd registration must still fire.
    expect(hits).toBe(1);

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
