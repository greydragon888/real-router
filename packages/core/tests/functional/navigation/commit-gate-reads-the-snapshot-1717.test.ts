import { describe, it, expect } from "vitest";

import { createRouter } from "@real-router/core";
import { getLifecycleApi } from "@real-router/core/api";

import type { NavigationOptions, Router, State } from "@real-router/core";

/**
 * #1717 — the commit gate asks the navigation's OWN snapshot of the caller's
 * signal, never the caller's object a second time.
 *
 * `NavigationOptions` is accessor- and Proxy-backed by contract (a supported
 * input, pinned by `navigate/edge-cases-proxy.test.ts`), so **every read of
 * `opts.signal` is a call into application code** and two reads may hand back
 * two different objects. `beginTransition` snapshots the signal once and stores
 * it on the plan (`NavigationContext.externalSignal`, #1690), and the plan IS
 * the `COMPLETE` payload — so the snapshot is already in the gate's hand.
 *
 * ⚠ **The gate is evaluated TWICE per commit, which is what makes the re-read
 * more than a curiosity.** `canCommitTransition` is `canSend(COMPLETE)` and
 * `sendTransitionDone` is `send(COMPLETE)`, and `FSM` runs the edge's `when` in
 * both — with the destructive post-leave `clearCanDeactivate` loop standing
 * between them. Reading the caller's object there gives the two evaluations two
 * different answers, and the failure mode differs by WHICH one flips:
 *
 * - flip at the ASK — the permit is refused, `navigate()` rejects
 *   `TRANSITION_CANCELLED`, and because a `when` refusal does not move the
 *   machine, no `TRANSITION_CANCEL` is emitted either: the band sits in
 *   `LEAVE_APPROVED` with `isLeaveApproved()` lying and `clear()` / `replace()`
 *   silent no-ops until the next navigation (the #1684 / #1704 window);
 * - flip at the SEND — the permit was already granted, so `completeTransition`
 *   runs to its end and RETURNS the state while the `COMPLETE` edge was a table
 *   no-op. `navigate()` resolves a state nobody committed, `getState()`
 *   disagrees, and no subscriber was notified. That is the phantom resolve
 *   #1649's ordering rule exists to prevent, reached through a window the rule
 *   does not cover: it hoists the meta above the ask, and this read is below it.
 *
 * The caller's own signal is never aborted in any case here — nothing cancelled
 * these navigations.
 */

/** Hands back a scripted signal per read, so a read INDEX can be targeted. */
function scriptedOpts(script: (read: number) => AbortSignal | undefined): {
  opts: NavigationOptions;
  reads: () => number;
} {
  let reads = 0;

  return {
    opts: {
      get signal(): AbortSignal | undefined {
        reads += 1;

        return script(reads);
      },
    },
    reads: () => reads,
  };
}

interface Fixture {
  router: Router;
  successes: State[];
  cancels: number;
}

async function startedRouter(): Promise<Fixture> {
  const router = createRouter([
    { name: "home", path: "/" },
    { name: "b", path: "/b" },
  ]);

  const successes: State[] = [];
  let cancels = 0;

  router.usePlugin(() => ({
    onTransitionSuccess: (toState: State) => {
      successes.push(toState);
    },
    onTransitionCancel: () => {
      cancels += 1;
    },
  }));

  await router.start("/");

  successes.length = 0;

  return {
    router,
    successes,
    get cancels(): number {
      return cancels;
    },
  };
}

describe("#1717 — the commit gate consults the plan's snapshot, not the caller's object", () => {
  it("commits when a stranger signal arrives at the ASK (third read)", async () => {
    const { router, successes } = await startedRouter();
    const live = new AbortController();
    const stranger = new AbortController();

    stranger.abort();

    // Reads 1-2 are the entry's own (`abortPreviousNavigation`, the snapshot).
    // Read 3 is the gate's ask.
    const { opts } = scriptedOpts((read) =>
      read < 3 ? live.signal : stranger.signal,
    );

    const state = await router.navigate("b", {}, undefined, opts);

    expect(state.name).toBe("b");
    expect(router.getState()?.name).toBe("b");
    expect(successes.map((s) => s.name)).toStrictEqual(["b"]);
    // The band settled, so `isLeaveApproved()` tells the truth and the
    // structural mutators are not silently disarmed.
    expect(router.isLeaveApproved()).toBe(false);
    // Nobody cancelled anything — the caller's own signal never aborted.
    expect(live.signal.aborted).toBe(false);
  });

  it("does not resolve a state nobody committed when a stranger arrives at the SEND (fourth read)", async () => {
    const { router, successes } = await startedRouter();
    const live = new AbortController();
    const stranger = new AbortController();

    stranger.abort();

    // Read 3 is the ask, read 4 the send's own evaluation of the same `when`.
    const { opts } = scriptedOpts((read) =>
      read < 4 ? live.signal : stranger.signal,
    );

    const state = await router.navigate("b", {}, undefined, opts);

    // The implication that must never break: a resolved navigation IS a
    // committed one, and one every subscriber heard about.
    expect(router.getState()?.name).toBe(state.name);
    expect(successes.map((s) => s.name)).toStrictEqual(["b"]);
    expect(router.isLeaveApproved()).toBe(false);
    expect(live.signal.aborted).toBe(false);
  });

  it("strips the caller's signal from the announcement when a later read hands back undefined", async () => {
    const router = createRouter([
      { name: "home", path: "/" },
      { name: "b", path: "/b" },
    ]);

    let announced: NavigationOptions | undefined;

    router.usePlugin(() => ({
      onTransitionSuccess: (_t: State, _f, opts?: NavigationOptions) => {
        announced = opts;
      },
    }));

    await router.start("/");

    const live = new AbortController();
    // The mirror direction: the stranger read says "this navigation carries no
    // signal at all", which flips the announcement's strip branch the other way.
    const { opts } = scriptedOpts((read) =>
      read < 3 ? live.signal : undefined,
    );

    await router.navigate("b", {}, undefined, opts);

    // The caller's object itself must never reach a plugin — the announcement
    // hands out a copy without the signal, whatever a later read claims.
    expect(announced).not.toBe(opts);
    expect(Object.hasOwn(announced!, "signal")).toBe(false);
  });

  it("reads the caller's opts.signal exactly once below the announce — the strip, and nothing else", async () => {
    const router = createRouter([
      { name: "home", path: "/" },
      { name: "b", path: "/b" },
    ]);

    const live = new AbortController();
    const { opts, reads } = scriptedOpts(() => live.signal);

    let readsAtAnnounce = 0;

    router.usePlugin(() => ({
      onTransitionStart: () => {
        readsAtAnnounce = reads();
      },
    }));

    await router.start("/");

    await router.navigate("b", {}, undefined, opts);

    // Counted rather than traced: the navigation's OUTCOME does not
    // discriminate a gate reading the snapshot from one re-reading an object
    // that happens to agree — the same shape as `controller-allocation.test.ts`.
    //
    // ⚑ **ONE read above the announce, and that is the entry snapshot itself.**
    // It used to be two, because `abortPreviousNavigation` asked the caller's
    // object a second time to decide whether to refuse without announcing — and
    // that second read is what made the refusal depend on WHICH `opts` field a
    // getter happened to abort on: four of the five took the silent path, one
    // reached the announce. The pre-check now consults the entry snapshot, so
    // the rule is one sentence — refuse silently only when the signal was
    // already dead when the router received it.
    //
    // ⚑ **And ZERO below it since #1962** — this line used to expect one. The
    // announcement's own `stripSignal` spread was that read: it stood in the
    // announce, where application code already runs, and was defended on that
    // ground. The entry door removed the need for it — `payload.opts` is core's
    // own frozen record on every arc, so the announcement has nothing left to
    // strip and asks the caller's object nothing at all. The gate, both of its
    // evaluations and the announcement now all read core's own data.
    expect(readsAtAnnounce).toBe(1);
    expect(reads() - readsAtAnnounce).toBe(0);
  });

  /**
   * The same rule one frame away: `finishAsyncNavigation`'s pre-check.
   *
   * Before racing the guard against the abort it asks whether the caller's
   * signal is already aborted — and it asks `nav.externalSignal`, the snapshot,
   * for the same reason the gate does. Re-reading `nav.opts.signal` there would
   * put the question to whatever the getter hands back on that read, and a
   * Proxy that answers with a DIFFERENT, already-aborted signal would cancel a
   * navigation nothing had cancelled.
   *
   * Measured: swapping the snapshot for a re-read leaves the whole tier green,
   * because every other case hands back the same object twice. This is the cell
   * where the two answers differ.
   */
  it("the async pre-check asks the snapshot, not a second read of the caller's object", async () => {
    const router = createRouter([
      { name: "home", path: "/" },
      { name: "b", path: "/b" },
    ]);

    // Async guard: the navigation parks, so it settles through
    // `finishAsyncNavigation` rather than the synchronous arc.
    getLifecycleApi(router).addActivateGuard("b", () => async () => {
      await Promise.resolve();

      return true;
    });

    await router.start("/");

    const live = new AbortController();
    const stranger = new AbortController();

    stranger.abort(new Error("a signal this navigation never carried"));

    // Read 1 — the real signal, which is what the navigation snapshots. Every
    // later read hands back the stranger, already dead.
    const { opts } = scriptedOpts((read) =>
      read === 1 ? live.signal : stranger.signal,
    );

    // THE assertion: the navigation commits. It carries a live signal, and the
    // stranger is not its business — a pre-check reading it would reject
    // `TRANSITION_CANCELLED` instead.
    await expect(
      router.navigate("b", {}, undefined, opts),
    ).resolves.toMatchObject({ name: "b" });
    expect(live.signal.aborted).toBe(false);
  });
});
