// A cancelled navigation stops asking guards — for EVERY cancellation source.
//
// The liveness fence at the head of `runStep` used to ask two questions:
// "am I still the navigation in flight" and "is the router active". Three of
// the four cancellation sources fail one of them, so the walk stopped. The
// fourth — an external `opts.signal` aborted mid-flight — fails NEITHER:
// `CANCEL` deliberately carries no `update`, so `ctx.inflight` still names this
// navigation on the way out (#1671), and it lands the machine in `READY`, which
// is active. So the pipeline kept asking application guards for a decision it
// had already announced (`TRANSITION_CANCEL`) it would not use.
//
// The table below is the CLASS, not the one cell: the three external abort
// points that exist (a guard, a plugin's leave-approve hook, a leave listener),
// the parked async arc, and the two sources that were already stopped as
// controls. Without the fence's third term the four external rows go red and
// the controls stay green — which is the whole point of listing them together.
//
// ⚠ What this does NOT assert, deliberately: that `subscribeLeave` stops
// firing. A leave listener is documented to fire when the FSM enters
// `LEAVE_APPROVED` and to receive a signal that aborts on cancellation
// (INVARIANTS `subscribeLeave` 8 / 9) — being called with `aborted === true`
// IS its contract. The last case pins that boundary from the other side, so a
// later "let's fence the leave dispatch too" reads as the contract change it
// would be, rather than as finishing this fix.

import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { createRouter } from "@real-router/core";
import { getLifecycleApi } from "@real-router/core/api";

import type { LeaveState, Router } from "@real-router/core";

/** Where the abort is fired from — the whole reachable set. */
type AbortPoint =
  | "canDeactivate"
  | "onTransitionLeaveApprove"
  | "subscribeLeave"
  | "asyncCanActivate";

interface Harness {
  router: Router;
  /** Guards and listeners that ran, in order. */
  trace: string[];
  navigate: () => Promise<unknown>;
}

/**
 * `a` → `b.c`, with a guard on the route being left and on BOTH activated
 * segments. Two activate segments matter: the fence is evaluated between them,
 * so an abort inside the first one has a later step to be caught by.
 */
function makeHarness(fire: (h: { abort: () => void }) => AbortPoint): Harness {
  const trace: string[] = [];
  const external = new AbortController();
  let armed = false;
  const abort = (): void => {
    if (armed) {
      external.abort(new Error("cancelled by the caller"));
    }
  };
  const point = fire({ abort });

  const router = createRouter([
    { name: "a", path: "/a" },
    { name: "b", path: "/b", children: [{ name: "c", path: "/c" }] },
  ]);
  const lifecycle = getLifecycleApi(router);

  lifecycle.addDeactivateGuard("a", () => () => {
    trace.push("canDeactivate:a");

    if (point === "canDeactivate") {
      abort();
    }

    return true;
  });

  lifecycle.addActivateGuard("b", () => () => {
    trace.push("canActivate:b");

    if (point === "asyncCanActivate") {
      return (async () => {
        await Promise.resolve();
        abort();

        return true;
      })();
    }

    return true;
  });

  lifecycle.addActivateGuard("b.c", () => () => {
    trace.push("canActivate:b.c");

    return true;
  });

  router.usePlugin(() => ({
    onTransitionLeaveApprove: () => {
      trace.push("leaveApprove");

      if (point === "onTransitionLeaveApprove") {
        abort();
      }
    },
    onTransitionCancel: () => {
      trace.push("CANCEL");
    },
  }));

  return {
    router,
    trace,
    navigate: async () => {
      await router.start("/a");
      trace.length = 0;
      // Plugin hooks fire during `start()` too — arming only afterwards keeps
      // the abort inside the measured navigation. Without it the boot
      // navigation carries the abort and the measured one is refused by the
      // already-aborted pre-check, with an empty trace that looks like a pass.
      armed = true;

      router.subscribeLeave((leave: LeaveState) => {
        trace.push(`subscribeLeave:${String(leave.signal.aborted)}`);

        if (point === "subscribeLeave") {
          abort();
        }
      });

      return router.navigate("b.c", undefined, undefined, {
        signal: external.signal,
      });
    },
  };
}

/** Guards that ran after the router announced the navigation cancelled. */
function guardsAfterCancel(trace: string[]): string[] {
  const cancelAt = trace.indexOf("CANCEL");

  return cancelAt === -1
    ? []
    : trace.slice(cancelAt + 1).filter((entry) => entry.startsWith("can"));
}

describe("a cancelled navigation stops asking guards (#1687)", () => {
  let harness: Harness | undefined;

  beforeEach(() => {
    harness = undefined;
  });

  afterEach(() => {
    harness?.router.dispose();
  });

  describe("external opts.signal — the source the fence was blind to", () => {
    const POINTS: AbortPoint[] = [
      "canDeactivate",
      "onTransitionLeaveApprove",
      "subscribeLeave",
      "asyncCanActivate",
    ];

    it.each(POINTS)(
      "aborted from %s: no guard runs after CANCEL",
      async (point) => {
        harness = makeHarness(() => point);

        await expect(harness.navigate()).rejects.toMatchObject({
          code: "CANCELLED",
        });

        expect(harness.trace).toContain("CANCEL");
        expect(guardsAfterCancel(harness.trace)).toStrictEqual([]);
      },
    );

    it("the abort really did land mid-walk — the walk had somewhere left to go", async () => {
      // Positive control for the table above. Without it every row would also
      // pass on a navigation that never reached a guard at all, which is what
      // an arming bug produces.
      harness = makeHarness(() => "canDeactivate");

      await expect(harness.navigate()).rejects.toMatchObject({
        code: "CANCELLED",
      });

      expect(harness.trace).toStrictEqual(["canDeactivate:a", "CANCEL"]);
    });
  });

  describe("the sources that were already stopped — controls", () => {
    it("stop() from a guard: the walk stops on isActive(), as before", async () => {
      const trace: string[] = [];
      const router = createRouter([
        { name: "a", path: "/a" },
        { name: "b", path: "/b" },
      ]);
      const lifecycle = getLifecycleApi(router);

      lifecycle.addDeactivateGuard("a", () => () => {
        trace.push("canDeactivate:a");
        router.stop();

        return true;
      });
      lifecycle.addActivateGuard("b", () => () => {
        trace.push("canActivate:b");

        return true;
      });
      router.usePlugin(() => ({
        onTransitionCancel: () => {
          trace.push("CANCEL");
        },
      }));

      await router.start("/a");
      trace.length = 0;

      await expect(router.navigate("b")).rejects.toMatchObject({
        code: "CANCELLED",
      });

      expect(guardsAfterCancel(trace)).toStrictEqual([]);

      router.dispose();
    });

    it("supersede: the walk stops on the identity term, as before", async () => {
      const trace: string[] = [];
      const router = createRouter([
        { name: "a", path: "/a" },
        { name: "b", path: "/b" },
        { name: "d", path: "/d" },
      ]);
      const lifecycle = getLifecycleApi(router);
      let release: (() => void) | undefined;

      // The first navigation has to still be IN FLIGHT for the second to
      // supersede it — with only synchronous guards it commits before the
      // second call is made, and the "control" silently tests nothing.
      lifecycle.addDeactivateGuard(
        "a",
        () => () =>
          new Promise<boolean>((resolve) => {
            trace.push("canDeactivate:a");
            release = () => {
              resolve(true);
            };
          }),
      );
      lifecycle.addActivateGuard("b", () => () => {
        trace.push("canActivate:b");

        return true;
      });

      await router.start("/a");
      trace.length = 0;

      const superseded = router.navigate("b");

      await Promise.resolve();

      const survivor = router.navigate("d");

      release?.();

      await expect(superseded).rejects.toMatchObject({ code: "CANCELLED" });
      await expect(survivor).resolves.toMatchObject({ name: "d" });
      expect(trace).not.toContain("canActivate:b");

      router.dispose();
    });
  });

  describe("the boundary the fix deliberately does not cross", () => {
    it("subscribeLeave still fires after CANCEL, with an aborted signal", async () => {
      // INVARIANTS `subscribeLeave` 8/9: the listener fires once per approved
      // leave and its signal aborts on cancellation. Fencing the dispatch too
      // would retire that — a contract change, not part of this fix.
      harness = makeHarness(() => "onTransitionLeaveApprove");

      await expect(harness.navigate()).rejects.toMatchObject({
        code: "CANCELLED",
      });

      expect(harness.trace).toStrictEqual([
        "canDeactivate:a",
        "leaveApprove",
        "CANCEL",
        "subscribeLeave:true",
      ]);
    });
  });
});
