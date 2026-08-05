import { describe, it, expect } from "vitest";

import { createRouter, errorCodes } from "@real-router/core";

import type { NavigationOptions, Router, State } from "@real-router/core";

/**
 * #1649 — the commit ask is a SNAPSHOT, so nothing that can move the router may
 * run below it.
 *
 * `completeTransition` asks the table once and then fires unconditionally: the
 * send's return value cannot be used as a verdict, because the `COMPLETE`
 * action emits `TRANSITION_SUCCESS` synchronously and a `subscribe` listener
 * may legitimately `replace()` from there (the note beside `sendTransitionDone`
 * says so). Everything therefore rests on the window between the ask and the
 * send being inert.
 *
 * `buildTransitionMeta` is the one thing in that function which touches
 * application code: it reads `opts.reload` / `opts.replace` / `opts.redirected`
 * off the CALLER'S options object, and accessor- and Proxy-backed `opts` are
 * supported input (`navigate/edge-cases-proxy.test.ts` pins three shapes). With
 * the meta built BELOW the ask, a getter that tore the router down invalidated
 * a verdict already given — `COMPLETE` found no edge, the send was a silent
 * no-op, and `navigate()` still resolved the state it had built. That is the
 * phantom resolve the #1649 write-up forbids in §8.1: the caller is told it is
 * on the new route, no `TRANSITION_SUCCESS` reaches anyone, and `getState()`
 * disagrees.
 *
 * These tests pin the ORDER by its consequence. Moving `buildTransitionMeta` +
 * `Object.freeze(toState)` back below `deps.canCommitTransition` flips the two
 * teardown cases from `rejected` to `resolved` and reds them; the benign case
 * is the positive control that keeps the mutation honest — it must stay green
 * either way, so a red here means the reorder broke navigation rather than the
 * window.
 */

interface Outcome {
  outcome: string;
  state: string | undefined;
  isActive: boolean;
  events: string[];
  optionReads: number;
}

function createFixture(): {
  router: Router;
  events: string[];
} {
  const events: string[] = [];
  const router = createRouter([
    { name: "home", path: "/" },
    { name: "b", path: "/b" },
  ]);

  router.usePlugin(() => ({
    onTransitionSuccess: (toState?: State) =>
      events.push(`SUCCESS:${toState?.name}`),
  }));

  return { router, events };
}

/**
 * Navigates with an `opts` whose `redirected` getter runs `duringMetaBuild`.
 * `redirected` is the lever because it has exactly ONE reader in the whole
 * package — `buildTransitionMeta` — so the getter cannot fire anywhere else in
 * the pipeline and mislabel where the damage happened.
 */
async function navigateWithHostileOption(
  duringMetaBuild: (router: Router) => void,
): Promise<Outcome> {
  const { router, events } = createFixture();

  await router.start("/");
  events.length = 0;

  let optionReads = 0;
  const opts = {
    get redirected(): undefined {
      optionReads++;
      duringMetaBuild(router);

      return;
    },
  } as NavigationOptions;

  const outcome = await router.navigate("b", {}, undefined, opts).then(
    (state) => `resolved:${state.name}`,
    (error: unknown) => `rejected:${(error as { code?: string }).code}`,
  );

  return {
    outcome,
    state: router.getState()?.name,
    isActive: router.isActive(),
    events: [...events],
    optionReads,
  };
}

describe("#1649 — application code in `opts` accessors runs ABOVE the commit ask", () => {
  it("refuses the commit when an opts getter stops the router", async () => {
    const result = await navigateWithHostileOption((router) => {
      router.stop();
    });

    // Reachability: the getter really ran, so a green assertion below is about
    // the ordering and not about a probe that never arrived.
    expect(result.optionReads).toBe(1);

    expect(result.outcome).toBe(`rejected:${errorCodes.TRANSITION_CANCELLED}`);
    expect(result.state).toBeUndefined();
    expect(result.isActive).toBe(false);
    // The load-bearing half: no phantom. Nothing was announced, and the caller
    // was not told it had arrived.
    expect(result.events).toStrictEqual([]);
  });

  it("refuses the commit when an opts getter disposes the router", async () => {
    const result = await navigateWithHostileOption((router) => {
      router.dispose();
    });

    expect(result.optionReads).toBe(1);

    expect(result.outcome).toBe(`rejected:${errorCodes.TRANSITION_CANCELLED}`);
    expect(result.state).toBeUndefined();
    expect(result.events).toStrictEqual([]);
  });

  /**
   * The third consequence of the same rule, and the one that pins a clause of
   * `mayCommit` rather than the ordering itself.
   *
   * `mayCommit` refuses a payload that is not the navigation in flight
   * (`payload === ctx.inflight`). Reaching that clause needs a superseding
   * navigation that is PARKED in `LEAVE_APPROVED` when the outer one asks — a
   * supersede that has moved on leaves the machine in `TRANSITION_STARTED`,
   * where `COMPLETE` has no edge at all and the refusal comes from the table's
   * shape instead of from the predicate. The scenario used to live in the #1611
   * regression file (`does not commit over a nested navigation that has NOT
   * finished yet`, #1626), which retired with the guard-factory window it was
   * built on; nothing replaced it, so the clause had no killing test until this
   * one. Mutationally validated: dropping `payload === ctx.inflight` makes the
   * outer navigation resolve `b`, commit over the parked one, emit
   * `SUCCESS:b` for a navigation that was already CANCELLED, and reject the
   * nested one that was still legitimately in flight.
   */
  it("refuses the commit when an opts getter supersedes the navigation", async () => {
    const events: string[] = [];
    let releaseGuard!: (allowed: boolean) => void;
    const parkedGuard = new Promise<boolean>((resolve) => {
      releaseGuard = resolve;
    });

    const router = createRouter([
      { name: "home", path: "/" },
      { name: "b", path: "/b" },
      { name: "c", path: "/c", canActivate: () => () => parkedGuard },
    ]);

    router.usePlugin(() => ({
      onTransitionSuccess: (toState?: State) =>
        events.push(`SUCCESS:${toState?.name}`),
    }));

    await router.start("/");
    events.length = 0;

    let nested = "pending";
    const opts = {
      get redirected(): undefined {
        // Parks in LEAVE_APPROVED on `c`'s async activation guard, so the
        // machine still HAS a `COMPLETE` edge when the outer navigation asks —
        // and the payload it presents is no longer the one in flight.
        router.navigate("c").then(
          (state) => (nested = `resolved:${state.name}`),
          (error: unknown) =>
            (nested = `rejected:${(error as { code?: string }).code}`),
        );

        return;
      },
    } as NavigationOptions;

    const outcome = await router.navigate("b", {}, undefined, opts).then(
      (state) => `resolved:${state.name}`,
      (error: unknown) => `rejected:${(error as { code?: string }).code}`,
    );

    expect(outcome).toBe(`rejected:${errorCodes.TRANSITION_CANCELLED}`);
    // The superseded navigation committed nothing, so the parked one still owns
    // the router.
    expect(router.getState()?.name).toBe("home");
    expect(events).toStrictEqual([]);

    releaseGuard(true);
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    // ...and it is allowed to finish, with its own announcement.
    expect(nested).toBe("resolved:c");
    expect(router.getState()?.name).toBe("c");
    expect(events).toStrictEqual(["SUCCESS:c"]);
  });

  it("POSITIVE CONTROL — a side-effect-free getter still commits and is honoured", async () => {
    const { router, events } = createFixture();

    await router.start("/");
    events.length = 0;

    let optionReads = 0;
    const opts = {
      get replace(): boolean {
        optionReads++;

        return true;
      },
    } as NavigationOptions;

    const state = await router.navigate("b", {}, undefined, opts);

    expect(optionReads).toBeGreaterThan(0);
    expect(state.name).toBe("b");
    // Hoisting must not drop the value the getter supplies — the meta is built
    // from it exactly as before, only earlier.
    expect(state.transition?.replace).toBe(true);
    expect(router.getState()?.name).toBe("b");
    expect(events).toStrictEqual(["SUCCESS:b"]);
  });
});
