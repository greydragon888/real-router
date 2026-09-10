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
//                      · context writable · transition frozen
//   AFTER  the commit  shell frozen   · params frozen · search frozen
//                      · context writable · transition frozen
//
// ⚑ The two rows differ in ONE cell, and that is the point (#1976). `transition`
// used to be the second difference — absent before, present after — so the only
// way to ask for a writable shell was to also be handed an object missing a
// field its own type declares required. It is attached at construction now,
// carrying `DEFAULT_TRANSITION` until `completeTransition` overwrites it, and
// the deferral means exactly what its name says: the FREEZE is deferred.
//
// The shell is writable on purpose — `materializePending` defers the freeze so
// `completeTransition` can overwrite `transition`, and `claimContextNamespace`
// needs `context` open (INVARIANTS "State immutability", carve-out row). What
// follows from that, and is the reason this file exists: a pre-commit surface
// can REPLACE a whole channel (`toState.params = …` succeeds, though
// `toState.params.k = …` throws), and whatever occupies the slot at commit time
// is what gets committed. That is a read-only contract on the caller's side,
// stated for `subscribeLeave`'s `nextRoute` since #1200 and true of every other
// pre-commit surface for exactly the same reason.
//
// ⚠ The split is not "before / after the commit" — it is whether the producer
// FROZE AT ITS ORIGIN. `materializePending` does not, and is frozen later at
// the commit; `materialize` and the hand-built `navigateToNotFound` do, and the
// latter is handed to `canDeactivate` pre-commit already frozen. An earlier
// revision said "before the commit the shell is writable" flatly, and that
// state is the counterexample — it has its own cell below.
//
// ⚠ `trans=` no longer discriminates between the two groups, and the rows are
// kept in the matrix anyway: a producer that starts omitting the field again
// reds every cell it feeds, which is the regression #1976 fixed.
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

/**
 * ⚠ The two banners are now the SAME string, and that is the point of #2144 —
 * every surface hands over a sealed shell, so the shape no longer says which
 * side of the commit a row is on. What this file measures therefore changed
 * with it: not "pending differs from committed", which is how it read while the
 * pending shell was writable, but "no surface, on either side, hands over
 * something a caller can assign to". The two names are kept because the ROWS
 * still divide into the two populations and the census below still enumerates
 * both; collapsing them into one constant would hide that a future change could
 * move one population without the other.
 */
const SEALED =
  "shell=frozen params=frozen search=frozen ctx=WRITABLE trans=frozen";
const PENDING = SEALED;
const COMMITTED = SEALED;

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

  it("CONTROL — `shape` reports each field and has not collapsed", () => {
    // Non-vacuity. Until #2144 this was carried by "the two banners differ in
    // the SHELL alone", and that argument is gone with the difference: every
    // surface is sealed, so agreement between the two populations is now the
    // RESULT rather than a smell. The property that has to be pinned instead is
    // that `shape` still DISCRIMINATES — fed a writable object it must not
    // print the sealed banner, or every row above would agree for the wrong
    // reason.
    const writable = {
      name: "x",
      params: {},
      search: {},
      path: "/x",
      context: {},
      transition: undefined,
    };

    expect(shape(writable)).not.toBe(SEALED);
    expect(shape(writable)).toContain("shell=WRITABLE");
    expect(shape(Object.freeze(writable))).toContain("shell=frozen");
    expect(SEALED).toContain("trans=frozen");

    expect(shape(undefined), "an absent state is not a shape").toBe("ABSENT");
    // No live surface produces this any more, and that is exactly why it is
    // measured synthetically: without it, `shape` could stop reporting absence
    // and every `trans=frozen` row above would agree for the wrong reason.
    expect(
      shape({ params: Object.freeze({}), search: {}, context: {} }),
      "each field is read independently, and absence is still reported",
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

  it("a pipeline state published through `materialize` is frozen pre-commit too", async () => {
    // The second exception, and the one that settles what the discriminator
    // actually is. `replace()`'s route-identity arm re-resolves the current URL
    // and hands the NEW route's `canActivate` the result — application code,
    // before anything is committed. That state came off the SAME pipeline as
    // every PENDING row above; it is frozen only because it came off
    // `materialize` rather than `materializePending`. So the split is neither
    // "before or after the commit" nor "who built it": it is whether the
    // producer FROZE AT ITS ORIGIN.
    //
    // ⚠ Stated that way and not as "which of the two pipeline terminals",
    // because there are FOUR pre-commit producers and only two of them are
    // pipeline terminals: `start()` reaches a guard through
    // `navigateToState(matchPath(...))`, so the state was published by
    // `materialize` — the FROZEN terminal — and then copied into a writable
    // shell by `NavigationNamespace.#copyChannels`, which is what the guard
    // actually sees. `navigateToNotFound` is the fourth, and it freezes.
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

  it("CONTROL — a pre-commit surface can no longer REPLACE a channel (#2144)", async () => {
    // The reason the rows above are a contract that HOLDS rather than one that
    // asks. Both writes are refused now: the bags were always frozen, and since
    // #2144 the shell carrying them is too, so the slot cannot be swapped
    // either. Kept in its own router so nothing else here measures damage.
    //
    // ⚠ Inverted, not deleted: the shape it pins is the one an unsealing
    // regression would restore, and deleting it would leave that silent.
    const router = createRouter([
      { name: "h", path: "/h" },
      { name: "a", path: "/a/:id" },
    ] as never);

    let byReference = "guard never ran";
    let bySlot = "guard never ran";

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

        try {
          toState.params = { swapped: "yes" };
          bySlot = "accepted";
        } catch {
          bySlot = "refused";
        }
      },
    }));

    await router.start("/h");
    await router.navigate("a", { id: "1" });

    expect(
      byReference,
      "a frozen bag refuses a write through the reference",
    ).toBe("refused");
    expect(bySlot, "and the sealed shell refuses the slot swap").toBe(
      "refused",
    );
    expect(
      Object.keys(router.getState()!.params),
      "so the commit publishes the pair core built",
    ).toStrictEqual(["id"]);

    router.dispose();
  });
});
