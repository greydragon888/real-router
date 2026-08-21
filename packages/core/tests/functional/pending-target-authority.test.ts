// Which surfaces see the PENDING target, and what it looks like when they do.
//
// The behavioural sibling of `state-freeze-authority.test.ts`: that one locks
// WHO may create and freeze a state, this one locks WHAT user code is handed
// before the commit. Both exist for the same reason — "deeply frozen" is a
// policy, not a call — but they fail on different changes: a sixth constructor
// trips the structural scan, a surface that starts handing over a writable
// channel trips this one.
//
// ⚑ The rule this file states, measured over every surface at once:
//
//   BEFORE the commit  shell WRITABLE · params frozen · search frozen
//                      · context writable · transition ABSENT
//   AFTER  the commit  shell frozen   · params frozen · search frozen
//                      · context writable · transition frozen
//
// The shell is writable on purpose — `materialize(skipFreeze)` defers it so
// `completeTransition` can attach `transition`, and `claimContextNamespace`
// needs `context` open (INVARIANTS "State immutability", carve-out row). What
// follows from that, and is the reason this file exists: a pre-commit surface
// can REPLACE a whole channel (`toState.params = …` succeeds, though
// `toState.params.k = …` throws), and whatever occupies the slot at commit time
// is what gets committed. That is a read-only contract on the caller's side,
// stated for `subscribeLeave`'s `nextRoute` since #1200 and true of every other
// pre-commit surface for exactly the same reason.
//
// ⚠ The split is not "before / after the commit" — it is WHO BUILT THE STATE.
// Everything the transition pipeline builds goes through
// `materialize({skipFreeze: true})` and is frozen later, at the commit; for
// those, `transition` is absent exactly while the shell is writable, because
// `completeTransition` attaches it and freezes in the same step. A state built
// BY HAND is frozen at its origin instead, and `navigateToNotFound`'s is handed
// to `canDeactivate` before any commit while already frozen and already
// carrying `transition`. An earlier revision of this banner said "before the
// commit the shell is writable" flatly, and that state is the counterexample —
// it has its own cell below.
//
// ⚠ Read-only by construction. An earlier version of this matrix mutated each
// state before measuring it, so the replaced bag rode into the commit and the
// committed row reported a writable `params` — the probe measuring its own
// damage. Nothing here writes to a state.

import { describe, expect, it } from "vitest";

import { createRouter } from "@real-router/core";
import { getPluginApi, getRoutesApi } from "@real-router/core/api";

import type { State } from "@real-router/core/types";

/** `shell=… params=… search=… ctx=… trans=…` for one state, or `ABSENT`. */
const shape = (state: unknown): string => {
  if (state === undefined || state === null) {
    return "ABSENT";
  }

  const st = state as Record<string, unknown>;
  const field = (key: string): string => {
    const value = st[key];

    if (value === undefined) {
      return "absent";
    }

    return Object.isFrozen(value) ? "frozen" : "WRITABLE";
  };

  return [
    `shell=${Object.isFrozen(st) ? "frozen" : "WRITABLE"}`,
    `params=${field("params")}`,
    `search=${field("search")}`,
    `ctx=${field("context")}`,
    `trans=${field("transition")}`,
  ].join(" ");
};

const PENDING =
  "shell=WRITABLE params=frozen search=frozen ctx=WRITABLE trans=absent";
const COMMITTED =
  "shell=frozen params=frozen search=frozen ctx=WRITABLE trans=frozen";

describe("who sees the pending target (#1792)", () => {
  /** Resolved by the test body, so the cancel window needs no wall-clock. */
  const slowGuard: { release: () => void } = { release: () => undefined };

  const table: Record<string, string> = {};
  const seen: Record<string, string | undefined> = {};
  /** First sighting only — a surface that fires twice must not flip the row. */
  const record = (where: string, state: unknown): void => {
    table[where] ??= shape(state);
  };

  /**
   * A `fromState`-shaped slot, labelled by whether there IS one.
   *
   * ⚠ Without this every such row pins the FIRST transition, where the answer is
   * `ABSENT` — so the ordinary arc, the one that actually hands a committed state
   * to application code, is never measured. `record`'s first-sighting rule and a
   * degenerate first navigation combine into a row that looks like coverage.
   */
  const recordFrom = (where: string, state: unknown): void => {
    record(state === undefined ? `${where} (none yet)` : where, state);
  };

  const mk = (): ReturnType<typeof createRouter> =>
    createRouter([
      { name: "h", path: "/h" },
      {
        name: "a",
        path: "/a/:id?tab",
        canDeactivate: () => (toState: State, fromState: State | undefined) => {
          record("route canDeactivate · toState", toState);
          recordFrom("route canDeactivate · fromState", fromState);

          return true;
        },
      },
      {
        name: "guarded",
        path: "/guarded",
        canActivate: () => (toState: State, fromState: State | undefined) => {
          record("route canActivate · toState", toState);
          recordFrom("route canActivate · fromState", fromState);

          return true;
        },
      },
      {
        name: "predicate",
        path: "/predicate",
        canActivate: () => (toState: State) => {
          record("route canActivate via canNavigateTo · toState", toState);

          return true;
        },
      },
      {
        name: "refused",
        path: "/refused",
        canActivate: () => (toState: State) => {
          record("route canActivate (rejecting) · toState", toState);

          return false;
        },
      },
      {
        name: "slow",
        path: "/slow",
        canActivate: () => async () => {
          await new Promise<void>((resolve) => {
            slowGuard.release = resolve;
          });

          return true;
        },
      },
    ] as never);

  it("the whole matrix, in one assertion", async () => {
    const router = mk();
    const api = getPluginApi(router);

    router.usePlugin(() => ({
      onTransitionStart: (toState: unknown, fromState: unknown) => {
        record("plugin onTransitionStart · toState", toState);
        recordFrom("plugin onTransitionStart · fromState", fromState);
      },
      onTransitionLeaveApprove: (toState: unknown, fromState: unknown) => {
        record("plugin onTransitionLeaveApprove · toState", toState);
        recordFrom("plugin onTransitionLeaveApprove · fromState", fromState);
      },
      onTransitionCancel: (toState: unknown, fromState: unknown) => {
        record("plugin onTransitionCancel · toState", toState);
        recordFrom("plugin onTransitionCancel · fromState", fromState);
      },
      onTransitionError: (toState: unknown, fromState: unknown) => {
        record("plugin onTransitionError · toState", toState);
        recordFrom("plugin onTransitionError · fromState", fromState);
      },
      onTransitionSuccess: (toState: unknown, fromState: unknown) => {
        record("plugin onTransitionSuccess · toState", toState);
        recordFrom("plugin onTransitionSuccess · fromState", fromState);
      },
    }));

    api.addEventListener("$$start", (toState) => {
      record("event $$start · toState", toState);
    });
    api.addEventListener("$$leaveApprove", (toState, fromState) => {
      record("event $$leaveApprove · toState", toState);
      recordFrom("event $$leaveApprove · fromState", fromState);
    });
    api.addEventListener("$$cancel", (toState, fromState) => {
      record("event $$cancel · toState", toState);
      recordFrom("event $$cancel · fromState", fromState);
    });
    api.addEventListener("$$error", (toState, fromState) => {
      record("event $$error · toState", toState);
      recordFrom("event $$error · fromState", fromState);
    });
    api.addEventListener("$$success", (toState, fromState) => {
      record("event $$success · toState", toState);
      recordFrom("event $$success · fromState", fromState);
    });

    router.subscribeLeave((payload) => {
      record("subscribeLeave · nextRoute", payload.nextRoute);
      record("subscribeLeave · route", payload.route);
    });
    router.subscribe((payload) => {
      record("subscribe · route", payload.route);
      recordFrom("subscribe · previousRoute", payload.previousRoute);
    });

    await router.start("/h");
    await router.navigate("a", { id: "1" }, { tab: "t" });
    await router.navigate("guarded").catch(() => undefined);
    await router.navigate("refused").catch(() => undefined);

    // ⚠ `canNavigateTo` runs the activation guards WITHOUT navigating, and it is
    // on the render path — every `<Link>` in six adapters calls it. So it hands
    // the pending target to application code more often than any door here, and
    // an earlier revision of this file did not measure it at all.
    await Promise.resolve(router.canNavigateTo("predicate")).catch(
      () => undefined,
    );

    // Cancel: park a navigation inside its activation guard, supersede it, then
    // release the guard. No timers — the ordering is caused, not awaited.
    const superseded = router.navigate("slow").catch(() => undefined);

    await router.navigate("h").catch(() => undefined);

    slowGuard.release();
    await superseded;

    record("router.getState()", router.getState());

    expect(table).toStrictEqual({
      // ── BEFORE the commit: the pending target, read-only by contract ──────
      "plugin onTransitionStart · toState": PENDING,
      "plugin onTransitionLeaveApprove · toState": PENDING,
      "plugin onTransitionCancel · toState": PENDING,
      "plugin onTransitionError · toState": PENDING,
      "event $$start · toState": PENDING,
      "event $$leaveApprove · toState": PENDING,
      "event $$cancel · toState": PENDING,
      "event $$error · toState": PENDING,
      "route canActivate · toState": PENDING,
      "route canActivate (rejecting) · toState": PENDING,
      "route canDeactivate · toState": PENDING,
      "route canActivate via canNavigateTo · toState": PENDING,
      "subscribeLeave · nextRoute": PENDING,

      // ── AFTER the commit: the published state ─────────────────────────────
      "plugin onTransitionSuccess · toState": COMMITTED,
      "event $$success · toState": COMMITTED,
      "subscribe · route": COMMITTED,
      "subscribeLeave · route": COMMITTED,
      "router.getState()": COMMITTED,

      // ── the `fromState` half, which is always a state already committed ───
      // Every one of these used to be missing, and the four that CAN start
      // absent used to be pinned that way — see `recordFrom`.
      "plugin onTransitionStart · fromState": COMMITTED,
      "plugin onTransitionLeaveApprove · fromState": COMMITTED,
      "plugin onTransitionCancel · fromState": COMMITTED,
      "plugin onTransitionError · fromState": COMMITTED,
      "plugin onTransitionSuccess · fromState": COMMITTED,
      "event $$leaveApprove · fromState": COMMITTED,
      "event $$cancel · fromState": COMMITTED,
      "event $$error · fromState": COMMITTED,
      "event $$success · fromState": COMMITTED,
      "route canActivate · fromState": COMMITTED,
      "route canDeactivate · fromState": COMMITTED,
      "subscribe · previousRoute": COMMITTED,

      // ── and the degenerate arc, kept as its own rows rather than as the
      //    answer for the surfaces above ──────────────────────────────────────
      "plugin onTransitionStart · fromState (none yet)": "ABSENT",
      "plugin onTransitionLeaveApprove · fromState (none yet)": "ABSENT",
      "plugin onTransitionSuccess · fromState (none yet)": "ABSENT",
      "event $$leaveApprove · fromState (none yet)": "ABSENT",
      "event $$success · fromState (none yet)": "ABSENT",
      "subscribe · previousRoute (none yet)": "ABSENT",
    });

    router.dispose();
  });

  it("CONTROL — the two shapes really differ, and `shape` reports each field", () => {
    // Non-vacuity: if `shape` collapsed to a constant, or the two banners drifted
    // into being the same string, every row above would agree for the wrong
    // reason. This also pins the discriminator: `trans` is the field that moves
    // together with the shell.
    expect(PENDING).not.toBe(COMMITTED);
    expect(PENDING).toContain("shell=WRITABLE");
    expect(PENDING).toContain("trans=absent");
    expect(COMMITTED).toContain("shell=frozen");
    expect(COMMITTED).toContain("trans=frozen");

    expect(shape(undefined), "an absent state is not a shape").toBe("ABSENT");
    expect(
      shape({ params: Object.freeze({}), search: {}, context: {} }),
      "each field is read independently",
    ).toBe(
      "shell=WRITABLE params=frozen search=WRITABLE ctx=WRITABLE trans=absent",
    );
  });

  it("a hand-built state is frozen at its origin, pre-commit or not", async () => {
    // The exception the banner names, measured rather than asserted.
    // `navigateToNotFound` does not go through the pipeline — it builds the
    // `UNKNOWN_ROUTE` state itself and freezes it immediately — so the guard it
    // consults sees a FROZEN shell WITH `transition`, before anything is
    // committed. Same phase as the twelve above, opposite shape, and the reason
    // is the producer rather than the moment.
    const router = createRouter(
      [
        { name: "h", path: "/h" },
        {
          name: "d",
          path: "/d",
          canDeactivate: () => (toState: State) => {
            seen.shape = shape(toState);
            seen.name = toState.name;

            return true;
          },
        },
      ] as never,
      { allowNotFound: true },
    );

    await router.start("/h");
    await router.navigate("d");

    router.navigateToNotFound("/nope");

    expect(
      seen.shape,
      "frozen at its origin, transition already attached",
    ).toBe(COMMITTED);
    expect(
      seen.name,
      "and it is the not-found target, not the committed one",
    ).toBe("@@router/UNKNOWN_ROUTE");

    router.dispose();
  });

  it("a pipeline state published WITHOUT skipFreeze is frozen pre-commit too", async () => {
    // The second exception, and the one that settles what the discriminator
    // actually is. `replace()`'s route-identity arm re-resolves the current URL
    // and hands the NEW route's `canActivate` the result — application code,
    // before anything is committed. That state came off the SAME pipeline as
    // every PENDING row above; it is frozen only because `materialize` was
    // called without `skipFreeze`. So the split is neither "before or after the
    // commit" nor "who built it": it is that one flag.
    const router = createRouter([
      { name: "home", path: "/home" },
      { name: "x", path: "/a" },
    ] as never);

    await router.start("/a");

    let seenShape = "guard never ran";
    let committedAtThatMoment = "";
    let slotReplaceable: boolean | string = "not tried";

    getRoutesApi(router).replace([
      { name: "home", path: "/home" },
      {
        name: "y",
        path: "/a",
        canActivate: () => (toState: State) => {
          seenShape = shape(toState);
          committedAtThatMoment = router.getState()!.name;
          try {
            (toState as unknown as Record<string, unknown>).params = {};
            slotReplaceable = true;
          } catch {
            slotReplaceable = false;
          }

          return true;
        },
      },
    ] as never);

    expect(seenShape, "frozen, with transition attached").toBe(COMMITTED);
    expect(committedAtThatMoment, "and nothing was committed yet").toBe("x");
    expect(
      slotReplaceable,
      "so the contract is enforced here, not just stated",
    ).toBe(false);
    expect(
      router.getState()!.name,
      "the revalidation did land afterwards",
    ).toBe("y");

    router.dispose();
  });

  it("CONTROL — a pre-commit surface can REPLACE a channel, which is why the contract is read-only", async () => {
    // The reason the rows above are a contract and not a curiosity. Mutating a
    // bag by reference is refused (the bags are frozen); replacing the whole
    // slot is not (the shell is not), and the replacement is what gets
    // committed. Kept in its own router so nothing else here measures damage.
    const router = createRouter([
      { name: "h", path: "/h" },
      { name: "a", path: "/a/:id" },
    ] as never);

    let byReference = "guard never ran";

    router.usePlugin(() => ({
      onTransitionStart: (toState: { params: Record<string, unknown> }) => {
        if (toState.params.id === undefined) {
          return;
        }

        try {
          toState.params.injected = "x";
          byReference = "accepted";
        } catch {
          byReference = "refused";
        }

        toState.params = { swapped: "yes" };
      },
    }));

    await router.start("/h");
    await router.navigate("a", { id: "1" });

    expect(
      byReference,
      "a frozen bag refuses a write through the reference",
    ).toBe("refused");
    expect(
      Object.keys(router.getState()!.params),
      "but the replaced slot is what the commit publishes",
    ).toStrictEqual(["swapped"]);

    router.dispose();
  });
});
