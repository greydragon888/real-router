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

    it.each(["external", "stop"] as const)(
      "and it sees an ABORTED signal on the guard-free arc too, cancelled by %s (#1697)",
      async (source) => {
        // The arc with no guards but with leave listeners allocated its
        // controller AFTER the announce, so a cancel fired from inside
        // `onTransitionLeaveApprove` had nothing to abort and the listener was
        // handed a live signal for a dead navigation. That is the flag both
        // `guardLeaveListener` (arm 2, behind `useRouteExit` in six adapters)
        // and `dom-utils/view-transitions` key their skip on — with it false,
        // every exit handler ran for a departure that never happened.
        const trace: string[] = [];
        const external = new AbortController();
        let armed = false;
        const router = createRouter([
          { name: "a", path: "/a" },
          { name: "b", path: "/b" },
        ]);

        router.usePlugin(() => ({
          onTransitionLeaveApprove: () => {
            trace.push("leaveApprove");

            if (!armed) {
              return;
            }

            if (source === "external") {
              external.abort(new Error("cancelled by the caller"));
            } else {
              router.stop();
            }
          },
          onTransitionCancel: () => {
            trace.push("CANCEL");
          },
        }));

        await router.start("/a");
        trace.length = 0;
        armed = true;

        router.subscribeLeave((leave: LeaveState) => {
          trace.push(`subscribeLeave:${String(leave.signal.aborted)}`);
        });

        await expect(
          router.navigate("b", undefined, undefined, {
            signal: external.signal,
          }),
        ).rejects.toMatchObject({ code: "CANCELLED" });

        expect(trace).toStrictEqual([
          "leaveApprove",
          "CANCEL",
          "subscribeLeave:true",
        ]);

        router.dispose();
      },
    );

    it("a listener registered from INSIDE the announce sees an aborted signal too — the cell #1697 left open, closed by #1706", async () => {
      // ⚑ This asserted the OPPOSITE — `lateListener:false` — and was pinned as
      // a boundary on record: the pre-announce gate cannot count a listener
      // that does not exist yet, and allocating for one that may never appear
      // is the trade разрез А exists to avoid.
      //
      // Both halves of that reasoning were about ALLOCATION, and #1706 removed
      // the need for any: the cancel is RECORDED on the navigation
      // (`cancelReason`), and the controller this listener's own registration
      // triggers is born aborted from that record. Nothing is allocated for a
      // listener that never appears — разрез А and the born-dead arcs still
      // count zero controllers — so the trade the boundary protected is intact
      // and the cell is simply no longer open.
      const trace: string[] = [];
      const external = new AbortController();
      let armed = false;
      const router = createRouter([
        { name: "a", path: "/a" },
        { name: "b", path: "/b" },
      ]);

      router.usePlugin(() => ({
        onTransitionLeaveApprove: () => {
          if (!armed) {
            return;
          }

          router.subscribeLeave((leave: LeaveState) => {
            trace.push(`lateListener:${String(leave.signal.aborted)}`);
          });
          external.abort(new Error("cancelled by the caller"));
        },
        onTransitionCancel: () => {
          trace.push("CANCEL");
        },
      }));

      await router.start("/a");
      trace.length = 0;
      armed = true;

      await expect(
        router.navigate("b", undefined, undefined, {
          signal: external.signal,
        }),
      ).rejects.toMatchObject({ code: "CANCELLED" });

      expect(trace).toStrictEqual(["CANCEL", "lateListener:true"]);

      router.dispose();
    });
  });
});

/**
 * The window the fence could not see into — before the controller exists
 * (#1706).
 *
 * The fence above reads `!controller.signal.aborted`, which is the ONLY term
 * that discriminates an external `opts.signal`. But the controller is allocated
 * lazily, in the guard fork, AFTER `bridgeLateIfOnlyGuardsCanAbort` — and that
 * function sends `CANCEL` itself when the caller's signal was aborted during
 * the announce window. So the machine announced `TRANSITION_CANCEL`, the abort
 * had no controller to land on, and the one opened moments later was born
 * unaborted: all three terms true, and the walk asked every guard of a
 * navigation everyone had been told was over.
 *
 * Reachable through an accessor- or Proxy-backed `opts` (a supported input —
 * `navigate/edge-cases-proxy`), whose `forceDeactivate` getter is read between
 * the entry pre-check and the announce.
 *
 * ⚠ **Counting, not tracing.** The verdict a guard returns is discarded here
 * either way (`mayCommit` refuses the commit off `opts.signal`), so the outcome
 * is identical whether or not the guards run — which is exactly why 4016 tests
 * stayed green with this open. Only the invocation count discriminates, and it
 * is the RFC's own §7.2 acceptance metric.
 */
describe("#1706 — a CANCEL that lands before the controller exists still stops the walk", () => {
  interface Run {
    readonly cancels: number;
    readonly guards: string[];
    readonly aborted: (boolean | undefined)[];
  }

  async function run(): Promise<Run> {
    const guards: string[] = [];
    const aborted: (boolean | undefined)[] = [];
    let cancels = 0;

    const router = createRouter([
      { name: "a", path: "/a" },
      { name: "b", path: "/b" },
    ]);

    const lifecycle = getLifecycleApi(router);

    lifecycle.addDeactivateGuard("a", () => (_to, _from, signal) => {
      guards.push("canDeactivate:a");
      aborted.push(signal?.aborted);

      return true;
    });
    lifecycle.addActivateGuard("b", () => (_to, _from, signal) => {
      guards.push("canActivate:b");
      aborted.push(signal?.aborted);

      return true;
    });

    router.usePlugin(() => ({
      onTransitionCancel: () => {
        cancels += 1;
      },
    }));

    await router.start("/a");

    // Armed only now: `start()` runs a navigation of its own, and an abort
    // spent on that one would never reach the measured navigation.
    let armed = false;
    const external = new AbortController();

    const opts = new Proxy(
      { signal: external.signal },
      {
        get(target, property, receiver) {
          if (property === "forceDeactivate" && armed) {
            external.abort(new Error("cancelled by the app"));
          }

          return Reflect.get(target, property, receiver);
        },
      },
    );

    armed = true;

    await expect(
      router.navigate("b", undefined, undefined, opts),
    ).rejects.toMatchObject({ code: "CANCELLED" });

    router.dispose();

    return { cancels, guards, aborted };
  }

  it("announces the cancel and asks ZERO guards — the discriminating count", async () => {
    const result = await run();

    // POSITIVE CONTROL: the cancel really did happen in the measured window.
    // Without it a zero guard count would pass for the wrong reason — e.g. if
    // the navigation stopped reaching the walk at all.
    expect(result.cancels).toBe(1);

    // THE assertion. Before #1706 this was
    // `["canDeactivate:a", "canActivate:b"]` with `[false, false]`: the
    // controller opened after the cancel was born unaborted, so the fence read
    // the navigation as live.
    expect(result.guards).toStrictEqual([]);
    expect(result.aborted).toStrictEqual([]);
  });
});
