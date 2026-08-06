// The external-signal bridge is registered when it can matter, and not before.
//
// The bridge routes an abort of the caller's `opts.signal` onto FSM `CANCEL`
// (#1684). It can only ever fire while application code is running between the
// announce and the commit, and there are exactly three things that put code
// there: a pre-commit listener (`onTransitionStart` / `onTransitionLeaveApprove`),
// the `subscribeLeave` dispatch, and a guard on the path. With none of them the
// navigation runs to completion without yielding, so the listener is attached
// and detached without ever having had a chance to fire — measured at ~350 ns
// per navigation, which was essentially the whole cost a signal added to an
// otherwise guard-free navigation.
//
// Two of the three are knowable before the announce; `hasGuards` is not, because
// a `TRANSITION_START` listener may still register one. Hence two moments: early
// when either of the first two holds, late — after the walk is planned — when
// only guards are left. The late moment is in time precisely because the first
// two were false, so nothing ran during the announce and no guard could have
// appeared.
//
// ⚠ The last case is the one that is easy to get wrong and impossible to see
// without asking for it. Deferring a registration is NOT the same as the window
// being empty: `addEventListener` never fires retroactively, so an abort that
// lands before the late moment reaches a listener that does not exist yet. The
// caller's signal is the application's object, and reading `opts` is itself a
// call into application code when it is Proxy-backed — a supported shape. Before
// the deferral carried its own already-aborted check, that produced no
// `TRANSITION_CANCEL` at all and left `isLeaveApproved()` stuck true: the #1684
// symptom, reintroduced.

import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { createRouter } from "@real-router/core";
import { getLifecycleApi } from "@real-router/core/api";

import type { Router } from "@real-router/core";

interface Spied {
  signal: AbortSignal;
  controller: AbortController;
  registrations: () => number;
  removals: () => number;
}

function spiedSignal(): Spied {
  const controller = new AbortController();
  const add = vi.spyOn(controller.signal, "addEventListener");
  const remove = vi.spyOn(controller.signal, "removeEventListener");

  return {
    controller,
    signal: controller.signal,
    registrations: () => add.mock.calls.length,
    removals: () => remove.mock.calls.length,
  };
}

/** `a` → `b`, with nothing in the band unless a case adds it. */
function bareRouter(): Router {
  return createRouter([
    { name: "a", path: "/a" },
    { name: "b", path: "/b" },
  ]);
}

describe("the external-signal bridge stands only when the band can abort (#1690)", () => {
  let router: Router | undefined;

  beforeEach(() => {
    router = undefined;
  });

  afterEach(() => {
    router?.dispose();
  });

  it("registers nothing when nothing in the band can abort", async () => {
    router = bareRouter();
    await router.start("/a");

    const spied = spiedSignal();
    const state = await router.navigate("b", undefined, undefined, {
      signal: spied.signal,
    });

    expect(state.name).toBe("b");
    expect(spied.registrations()).toBe(0);
    expect(spied.removals()).toBe(0);
    // The navigation is unaffected in every other respect.
    expect(spied.signal.aborted).toBe(false);
  });

  describe("…and each of the three things that CAN abort brings it back", () => {
    it("a guard on the path — registered late, after the walk is planned", async () => {
      router = bareRouter();
      getLifecycleApi(router).addActivateGuard("b", () => () => true);
      await router.start("/a");

      const spied = spiedSignal();

      await router.navigate("b", undefined, undefined, {
        signal: spied.signal,
      });

      expect(spied.registrations()).toBe(1);
      expect(spied.removals()).toBe(1);
    });

    it("a subscribeLeave listener — registered early", async () => {
      router = bareRouter();
      await router.start("/a");
      router.subscribeLeave(() => {
        /* its existence is the point */
      });

      const spied = spiedSignal();

      await router.navigate("b", undefined, undefined, {
        signal: spied.signal,
      });

      expect(spied.registrations()).toBe(1);
      expect(spied.removals()).toBe(1);
    });

    it("a pre-commit plugin hook — registered early", async () => {
      router = bareRouter();
      router.usePlugin(() => ({
        onTransitionStart: () => {
          /* its existence is the point */
        },
      }));
      await router.start("/a");

      const spied = spiedSignal();

      await router.navigate("b", undefined, undefined, {
        signal: spied.signal,
      });

      expect(spied.registrations()).toBe(1);
      expect(spied.removals()).toBe(1);
    });
  });

  it("the decision is per PATH, not per router — a guarded router still skips an unguarded route", async () => {
    // The reason the predicate reads `plan.hasGuards` and not "does this router
    // have any guards at all": the coarse question answers `true` for a router
    // with a single guard anywhere, which in a real application is most of them.
    router = createRouter([
      { name: "a", path: "/a" },
      { name: "b", path: "/b" },
      { name: "guarded", path: "/guarded" },
    ]);
    getLifecycleApi(router).addActivateGuard("guarded", () => () => true);
    await router.start("/a");

    const unguarded = spiedSignal();

    await router.navigate("b", undefined, undefined, {
      signal: unguarded.signal,
    });

    expect(unguarded.registrations()).toBe(0);

    const guarded = spiedSignal();

    await router.navigate("guarded", undefined, undefined, {
      signal: guarded.signal,
    });

    expect(guarded.registrations()).toBe(1);
    expect(guarded.removals()).toBe(1);
  });

  it("an abort landing BEFORE the late moment still reaches the machine", async () => {
    // The attack this design has to survive. `opts` may be Proxy-backed — a
    // supported shape — so reading it is a call into application code, and the
    // pipeline reads it after the entry pre-check. A getter that aborts there
    // fires no listener, because the bridge is not standing yet and
    // `addEventListener` does not fire retroactively.
    //
    // Without the deferral's own already-aborted check this row is the #1684
    // symptom: `navigate()` still rejects (the commit gate reads the signal off
    // the payload), but no `TRANSITION_CANCEL` is emitted and the band is left
    // in `LEAVE_APPROVED` with `isLeaveApproved()` lying.
    const cancels: string[] = [];

    router = bareRouter();
    getLifecycleApi(router).addActivateGuard("b", () => () => true);
    router.usePlugin(() => ({
      onTransitionCancel: () => {
        cancels.push("CANCEL");
      },
    }));
    await router.start("/a");

    const controller = new AbortController();
    let armed = true;
    const opts = new Proxy(
      { signal: controller.signal },
      {
        get(target, key, receiver) {
          if (key === "forceDeactivate" && armed) {
            armed = false;
            controller.abort(new Error("aborted from a Proxy getter"));
          }

          return Reflect.get(target, key, receiver);
        },
      },
    );

    await expect(
      router.navigate("b", undefined, undefined, opts),
    ).rejects.toMatchObject({ code: "CANCELLED" });

    expect(cancels).toStrictEqual(["CANCEL"]);
    expect(router.isLeaveApproved()).toBe(false);
  });
});
