import { describe, it, expect } from "vitest";

import { createRouter, errorCodes } from "@real-router/core";
import { getLifecycleApi, getPluginApi } from "@real-router/core/api";

import type { Router } from "@real-router/core";

/**
 * #1609 — a superseded navigation's REJECTING async guard must not report into
 * the live FSM.
 *
 * `finishAsyncNavigation` consults liveness only on the arm where the guard race
 * RESOLVES; a rejection throws straight past that check into the `catch`, which
 * used to `sendTransitionFail` for a navigation cancelled several microtasks
 * earlier. Two outcomes, both covered here: a spurious `TRANSITION_ERROR` for a
 * dead navigation (FSM in `READY`), and — because `TRANSITION_STARTED --FAIL-->
 * READY` is a real table edge — a **silent commit** with no `TRANSITION_SUCCESS`
 * and no subscriber notification when the superseding navigation is still in
 * flight.
 *
 * Same symptom as #1197 (two mutually exclusive terminal outcomes for one
 * navigation) on the arm that fix declared clean; it was clean only while the
 * abort won the race.
 */

const codeOf = (error: unknown): string | undefined =>
  (error as { code?: string }).code;

const tick = async (n: number): Promise<void> => {
  for (let i = 0; i < n; i++) {
    await Promise.resolve();
  }
};

interface Fixture {
  router: Router;
  log: string[];
  rejectGuardA: (reason: unknown) => void;
  resolveGuardB: (value: boolean) => void;
}

/**
 * `a` parks on a controllable guard; `b` optionally parks on one too, so the
 * stale FAIL can be aimed at an FSM sitting in either `READY` (outcome 1) or
 * `TRANSITION_STARTED` (outcome 2).
 */
function createFixture(options: { guardOnB: boolean }): Fixture {
  const log: string[] = [];

  const router = createRouter([
    { name: "home", path: "/" },
    { name: "a", path: "/a" },
    { name: "b", path: "/b" },
  ]);

  router.usePlugin(() => ({
    onTransitionStart: (to) => log.push(`START:${to.name}`),
    onTransitionSuccess: (to) => log.push(`SUCCESS:${to.name}`),
    onTransitionCancel: (to) => log.push(`CANCEL:${to?.name}`),
    onTransitionError: (to, _from, error) =>
      log.push(`ERROR:${to?.name}:${codeOf(error)}`),
  }));

  router.subscribe(({ route }) => log.push(`UI-render:${route.name}`));

  let rejectGuardA!: (reason: unknown) => void;
  const guardA = new Promise<boolean>((_resolve, reject) => {
    rejectGuardA = reject;
  });

  let resolveGuardB!: (value: boolean) => void;
  const guardB = new Promise<boolean>((resolve) => {
    resolveGuardB = resolve;
  });

  const lifecycle = getLifecycleApi(router);

  lifecycle.addActivateGuard("a", () => () => guardA);

  if (options.guardOnB) {
    lifecycle.addActivateGuard("b", () => () => guardB);
  }

  return { router, log, rejectGuardA, resolveGuardB };
}

describe("#1609 — a superseded navigation's rejecting async guard", () => {
  it("outcome 1: emits no TRANSITION_ERROR for a navigation cancelled before the rejection landed", async () => {
    const { router, log, rejectGuardA } = createFixture({ guardOnB: false });

    await router.start("/");

    const first = router.navigate("a");

    await tick(8);

    rejectGuardA(new Error("boom"));
    // The window: the rejection is queued but not yet observed by
    // `finishAsyncNavigation` when the superseding navigation begins.
    await tick(1);

    const second = router.navigate("b");

    await expect(first).rejects.toBeDefined();

    await second;
    await tick(30);

    expect(log).toStrictEqual([
      "START:home",
      "SUCCESS:home",
      "UI-render:home",
      "START:a",
      "CANCEL:a",
      "START:b",
      "SUCCESS:b",
      "UI-render:b",
    ]);
  });

  it("outcome 1: rejects the superseded navigation as CANCELLED, not as the stale guard verdict", async () => {
    const { router, rejectGuardA } = createFixture({ guardOnB: false });

    await router.start("/");

    const first = router.navigate("a");

    await tick(8);

    rejectGuardA(new Error("boom"));
    await tick(1);

    const second = router.navigate("b");

    const code = await first.then(
      () => undefined,
      (error: unknown) => codeOf(error),
    );

    expect(code).toBe(errorCodes.TRANSITION_CANCELLED);

    await second;
  });

  it("outcome 2: the superseding navigation still emits TRANSITION_SUCCESS and notifies subscribers", async () => {
    const { router, log, rejectGuardA, resolveGuardB } = createFixture({
      guardOnB: true,
    });

    await router.start("/");

    const first = router.navigate("a");

    await tick(8);

    rejectGuardA(new Error("boom"));
    await tick(1);

    const second = router.navigate("b");

    await expect(first).rejects.toBeDefined();

    await tick(4);

    // `b` is still parked on its own guard — this is where the stale FAIL used
    // to move the FSM `TRANSITION_STARTED --> READY` out from under it, turning
    // `b`'s later `COMPLETE` into a table no-op.
    resolveGuardB(true);

    await second;
    await tick(30);

    expect(router.getState()?.name).toBe("b");
    expect(log).toContain("SUCCESS:b");
    expect(log).toContain("UI-render:b");
  });

  it("the report window cannot reopen — no terminal event for the dead navigation at any microtask delay", async () => {
    for (const delay of [0, 1, 2, 3, 4, 5]) {
      const { router, log, rejectGuardA } = createFixture({ guardOnB: false });

      await router.start("/");

      const first = router.navigate("a");

      await tick(8);

      rejectGuardA(new Error("boom"));
      await tick(delay);

      const second = router.navigate("b");

      await expect(first).rejects.toBeDefined();

      await second;
      await tick(30);

      const startOfB = log.indexOf("START:b");
      const terminalOfA = log.findIndex((entry) => entry.startsWith("ERROR:a"));

      // Either `a` failed on its own before `b` began (delay >= 3 — healthy,
      // reported), or it was cancelled and reports nothing. It must never
      // report AFTER `b` took over.
      expect(
        terminalOfA === -1 || terminalOfA < startOfB,
        `delay=${delay}: ${log.join(" ")}`,
      ).toBe(true);
    }
  });

  it("still reports a genuine guard rejection when the navigation is the one in flight", async () => {
    const { router, log, rejectGuardA } = createFixture({ guardOnB: false });

    await router.start("/");

    const first = router.navigate("a");

    await tick(8);

    rejectGuardA(new Error("boom"));

    const code = await first.then(
      () => undefined,
      (error: unknown) => codeOf(error),
    );

    expect(code).toBe(errorCodes.CANNOT_ACTIVATE);
    expect(log).toContain(`ERROR:a:${errorCodes.CANNOT_ACTIVATE}`);
  });

  it("does not re-wrap an outcome that already is a cancellation (#1197 keeps its reason)", async () => {
    const router = createRouter([
      { name: "home", path: "/" },
      { name: "a", path: "/a" },
    ]);

    router.subscribeLeave(
      () => new Promise<void>((resolve) => setTimeout(resolve, 50)),
    );

    await router.start("/");

    const controller = new AbortController();
    const nav = router.navigate("a", {}, undefined, {
      signal: controller.signal,
    });

    await new Promise((resolve) => setTimeout(resolve, 5));
    controller.abort(new Error("user-cancelled"));

    const error = await nav.then(
      () => undefined,
      (error_: unknown) => error_ as { code?: string; reason?: unknown },
    );

    expect(error?.code).toBe(errorCodes.TRANSITION_CANCELLED);
    // #1197 canonicalizes the leave abort into a `TRANSITION_CANCELLED` that
    // already carries the external reason. Canonicalizing it a SECOND time
    // would bury that reason one level deeper.
    expect((error?.reason as Error | undefined)?.message).toBe(
      "user-cancelled",
    );
  });
});

/**
 * #1609 sibling — the SAME async arc, reached by the two cancellation sources
 * the block above does not use.
 *
 * They need cases of their own because of WHAT stops them. A superseded
 * navigation used to fail two terms at once — identity and the abort — so no
 * supersede case could tell them apart. An external `opts.signal` and a
 * `stop()` fail only the abort: `CANCEL` carries no `update`, so `ctx.inflight`
 * still names the navigation (#1671). That asymmetry is why these arcs earned
 * their own block, and since #1734 the fence keeps the abort term alone.
 *
 * ⚑ **Measured, and the measurement is why this block exists (#1734).** Dropping
 * the abort term from `finishAsyncNavigation`'s fence left the whole 4075-test
 * tier green. Not because the fence did not matter — dropping all of its terms
 * at once reds 3 + 3 — but because every arc the suite exercised was covered
 * twice over. These two were the cell covered once, and only by a term #1734
 * then removed as unreachable (`deps.isActive()`, false here because `stop()`
 * lands the machine in `IDLE`). Without them the removal would have silently
 * left the arc with no pin at all.
 *
 * ⚠ The identity term gets no such case, and that is structural rather than a
 * gap left open: it would need a navigation that is no longer `ctx.inflight`
 * while its controller is NOT aborted, and every source that takes the slot away
 * cancels on the way. Instrumented over the functional and property tiers: 317
 * refusals, the abort term true in all 317.
 */
describe("#1609 — a cancelled navigation's rejecting async guard, by source", () => {
  interface SignalFixture {
    router: Router;
    log: string[];
    rejectGuard: (reason: unknown) => void;
    external: AbortController;
  }

  const setup = (): SignalFixture => {
    const log: string[] = [];

    const router = createRouter([
      { name: "home", path: "/" },
      { name: "a", path: "/a" },
    ]);

    router.usePlugin(() => ({
      onTransitionCancel: (to) => log.push(`CANCEL:${to?.name}`),
      onTransitionError: (to, _from, error) =>
        log.push(`ERROR:${to?.name}:${codeOf(error)}`),
    }));

    let rejectGuard!: (reason: unknown) => void;
    const guard = new Promise<boolean>((_resolve, reject) => {
      rejectGuard = reject;
    });

    getLifecycleApi(router).addActivateGuard("a", () => () => guard);

    return { router, log, rejectGuard, external: new AbortController() };
  };

  /**
   * The window is the one the block above established: the rejection is queued
   * but not yet observed by `finishAsyncNavigation` when the cancel lands, so
   * the race REJECTS and the verdict reaches the `catch` — the arm where
   * liveness decides whether it is a report or a cancellation.
   */
  const runInWindow = async (
    fixture: SignalFixture,
    cancel: () => void,
  ): Promise<string | undefined> => {
    const { router, rejectGuard, external } = fixture;

    await router.start("/");
    fixture.log.length = 0;

    const nav = router.navigate("a", {}, undefined, {
      signal: external.signal,
    });

    await tick(8);

    rejectGuard(new Error("boom"));
    await tick(1);

    cancel();

    const code = await nav.then(
      () => undefined,
      (error: unknown) => codeOf(error),
    );

    await tick(30);

    return code;
  };

  it("an external opts.signal: rejects as CANCELLED, not with the stale guard verdict", async () => {
    const fixture = setup();

    const code = await runInWindow(fixture, () => {
      fixture.external.abort(new Error("user-cancelled"));
    });

    expect(code).toBe(errorCodes.TRANSITION_CANCELLED);
    expect(fixture.log).toStrictEqual(["CANCEL:a"]);
  });

  it("stop(): rejects as CANCELLED, not with the stale guard verdict", async () => {
    const fixture = setup();

    const code = await runInWindow(fixture, () => {
      fixture.router.stop();
    });

    expect(code).toBe(errorCodes.TRANSITION_CANCELLED);
    expect(fixture.log).toStrictEqual(["CANCEL:a"]);
  });

  /**
   * POSITIVE CONTROL — both cases above assert that a guard verdict is NOT
   * reported, which is what a fixture whose guard never rejects would also
   * satisfy. This one runs the identical window with nothing cancelling, and
   * requires the verdict to arrive.
   */
  it("POSITIVE CONTROL — uncancelled, the same rejection IS reported", async () => {
    const fixture = setup();

    const code = await runInWindow(fixture, () => undefined);

    expect(code).toBe(errorCodes.CANNOT_ACTIVATE);
    expect(fixture.log).toStrictEqual([
      `ERROR:a:${errorCodes.CANNOT_ACTIVATE}`,
    ]);
  });
});

/**
 * #1609 sibling — the SYNCHRONOUS arc (`handleNavigateError`) carries the same
 * defect, reached without any async guard: a `subscribeLeave` listener that
 * tears the navigation down and then throws. The throw is reported for a
 * navigation the listener itself already cancelled.
 *
 * It asks whether the FSM still holds this transition rather than reading
 * `controller.signal.aborted`, and that is a deliberate difference of QUESTION,
 * not of availability: "has the machine left my transition" is the precondition
 * for sending `FAIL`. (It was also once a fact this arc could not read — the
 * guard-free leave arc kept its controller local and released it before the
 * error arrived — but since #1684 the controller is a field of the plan, so the
 * asymmetry now stands on its own merit.)
 */
describe("#1609 — a torn-down navigation's synchronous throw", () => {
  const setup = (): { router: Router; log: string[] } => {
    const log: string[] = [];

    const router = createRouter([
      { name: "home", path: "/" },
      { name: "a", path: "/a" },
      { name: "b", path: "/b" },
    ]);

    router.usePlugin(() => ({
      onTransitionStart: (to) => log.push(`START:${to.name}`),
      onTransitionSuccess: (to) => log.push(`SUCCESS:${to.name}`),
      onTransitionCancel: (to) => log.push(`CANCEL:${to?.name}`),
      onTransitionError: (to, _from, error) =>
        log.push(`ERROR:${to?.name}:${codeOf(error)}`),
    }));

    return { router, log };
  };

  it("emits no TRANSITION_ERROR when a leave listener stopped and restarted the router before throwing", async () => {
    const { router, log } = setup();

    await router.start("/");

    router.subscribeLeave(() => {
      router.stop();
      void router.start("/b").then(
        () => log.push("start-ok"),
        () => log.push("start-rejected"),
      );

      throw new Error("sync-leave-boom");
    });

    const code = await router.navigate("a").then(
      () => undefined,
      (error: unknown) => codeOf(error),
    );

    await tick(30);

    expect(code).toBe(errorCodes.TRANSITION_CANCELLED);
    expect(log).toContain("start-ok");
    expect(log.some((entry) => entry.startsWith("ERROR:a"))).toBe(false);
  });

  it("does not kill a restart still parked in an async start interceptor", async () => {
    const { router, log } = setup();

    let release!: () => void;
    const parked = new Promise<void>((resolve) => {
      release = resolve;
    });
    let park = false;

    getPluginApi(router).addInterceptor("start", async (next, path) => {
      if (park) {
        await parked;
      }

      return next(path);
    });

    await router.start("/");
    park = true;

    router.subscribeLeave(() => {
      router.stop();
      void router.start("/b").then(
        () => log.push("start-ok"),
        () => log.push("start-rejected"),
      );

      throw new Error("sync-leave-boom");
    });

    await expect(router.navigate("a")).rejects.toBeDefined();

    // The stale FAIL used to land here, while the FSM sat in `STARTING` —
    // `STARTING --FAIL--> IDLE` cancelled the restart before it could commit.
    release();
    await tick(30);

    expect(log).toContain("start-ok");
    expect(router.getState()?.name).toBe("b");
    expect(router.isActive()).toBe(true);
  });

  it("still reports a leave listener's throw when the navigation is the one in flight", async () => {
    const { router, log } = setup();

    await router.start("/");

    router.subscribeLeave(() => {
      throw new Error("sync-leave-boom");
    });

    const outcome = await router.navigate("a").then(
      () => undefined,
      (error: unknown) => (error as Error).message,
    );

    // The documented contract: a sync leave throw rejects with that ORIGINAL
    // error and emits TRANSITION_ERROR. Untouched — only a torn-down
    // navigation is silenced.
    expect(outcome).toBe("sync-leave-boom");
    expect(log).toContain("ERROR:a:undefined");
  });
});
