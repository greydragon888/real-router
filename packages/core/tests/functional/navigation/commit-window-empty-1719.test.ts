import { describe, it, expect } from "vitest";

import { createRouter, errorCodes } from "@real-router/core";

import type { NavigationOptions, Router, State } from "@real-router/core";

/**
 * #1719 — `completeTransition` reads NO field of the caller's `opts`, so the
 * window between the commit ask and the send is empty structurally.
 *
 * The ask is a snapshot: `completeTransition` asks the table once and then fires
 * unconditionally, because the send's return value cannot serve as a verdict
 * (the `COMPLETE` action emits `TRANSITION_SUCCESS` synchronously and a
 * `subscribe` listener may legitimately `replace()` from there). Everything
 * rests on the window being inert.
 *
 * ⚠ **This file replaces `commit-ask-snapshot-1649.test.ts`, whose subject no
 * longer exists.** That file pinned an ORDERING rule: `buildTransitionMeta` read
 * `opts.reload` / `opts.replace` / `opts.redirected` off the CALLER's object —
 * accessor- and Proxy-backed `opts` being supported input — so it was the one
 * step in the function that ran application code, and it was hoisted ABOVE the
 * ask so that a getter calling `stop()` / `dispose()` could still be SEEN by the
 * verdict. The three flags are snapshotted at the entry now, so there is no
 * application code in the function to order anything against, and the rule has
 * no subject. What replaces it is a stronger property, and a killable one:
 * COUNT the caller's getter invocations and require zero below the announce.
 *
 * ⚠ **"Empty" is exact, and narrower than "no application code runs here".** The
 * ANNOUNCE below the verdict runs plenty — `TRANSITION_SUCCESS` goes
 * synchronously into every plugin hook and every `router.subscribe` listener,
 * and the `ROUTE_NOT_FOUND` arm does the same through `sendTransitionFail`. Both
 * stand BELOW the verdict and were never what the rule was about. The claim
 * pinned here is: between the ask and the send there is bookkeeping and nothing
 * else.
 */

interface Reads {
  replace: number;
  reload: number;
  force: number;
  redirected: number;
  signal: number;
  forceDeactivate: number;
}

function countingOpts(): { opts: NavigationOptions; reads: () => number } {
  const reads: Reads = {
    replace: 0,
    reload: 0,
    force: 0,
    redirected: 0,
    signal: 0,
    forceDeactivate: 0,
  };

  const opts = {
    get replace(): undefined {
      reads.replace++;

      return;
    },
    get reload(): undefined {
      reads.reload++;

      return;
    },
    get force(): undefined {
      reads.force++;

      return;
    },
    get redirected(): undefined {
      reads.redirected++;

      return;
    },
    get signal(): undefined {
      reads.signal++;

      return;
    },
    get forceDeactivate(): undefined {
      reads.forceDeactivate++;

      return;
    },
  } as NavigationOptions;

  return {
    opts,
    reads: () =>
      reads.replace +
      reads.reload +
      reads.force +
      reads.redirected +
      reads.signal +
      reads.forceDeactivate,
  };
}

function createFixture(): { router: Router; events: string[] } {
  const events: string[] = [];
  const router = createRouter([
    { name: "home", path: "/" },
    { name: "b", path: "/b" },
  ]);

  router.usePlugin(() => ({
    onTransitionSuccess: (toState?: State) => {
      events.push(`SUCCESS:${toState?.name}`);
    },
  }));

  return { router, events };
}

/**
 * Navigates with an `opts` whose `redirected` getter runs `hostile`.
 * `redirected` is the lever because it has exactly ONE reader in the whole
 * package, so the getter cannot fire anywhere else and mislabel where the
 * damage happened. Since #1719 that reader is the ENTRY, not the commit.
 */
async function navigateWithHostileOption(
  hostile: (router: Router) => void,
): Promise<{
  outcome: string;
  state: string | undefined;
  events: string[];
  optionReads: number;
}> {
  const { router, events } = createFixture();

  await router.start("/");
  events.length = 0;

  let optionReads = 0;
  const opts = {
    get redirected(): undefined {
      optionReads++;
      hostile(router);

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
    events: [...events],
    optionReads,
  };
}

describe("#1719 — the commit reads nothing off the caller's options", () => {
  it("reads no opts field below the announce", async () => {
    const { router } = createFixture();

    await router.start("/");

    const { opts, reads } = countingOpts();

    let readsAtAnnounce = -1;

    router.usePlugin(() => ({
      onTransitionStart: () => {
        readsAtAnnounce = reads();
      },
    }));

    await router.navigate("b", {}, undefined, opts);

    // Reachability control: the getters really ran, so the zero below is about
    // the window and not about an `opts` nobody looked at.
    expect(readsAtAnnounce).toBeGreaterThan(0);

    // The property. Every read the router performs stands ABOVE the announce —
    // the prologue's (`forceReplaceFromUnknown`, `isSameNavigation`) and the
    // entry's own snapshot. Counted rather than traced, because the navigation's
    // OUTCOME is identical either way: a getter that merely returns a value
    // yields the same commit wherever it is read from.
    //
    // Mutationally validated: putting `buildTransitionMeta` back on `opts` makes
    // this three (`reload` / `replace` / `redirected`, read inside the commit).
    expect(reads() - readsAtAnnounce).toBe(0);
  });

  /**
   * The other half of the same contract, and the reason the snapshot is a
   * SNAPSHOT rather than a replacement: the router reads nothing off `opts`, and
   * it hands `opts` ITSELF on.
   *
   * Keys core never declared are shipped API — `NavigationOptions` is an
   * augmentation target, and `memory-plugin` round-trips a `source` marker
   * through `navigate(...)` to `onTransitionSuccess` to recognise its own
   * restore commit ("matched by identity, not by timing", its comment says).
   * Flattening the options into an internal record with a fixed field set would
   * drop that SILENTLY — the plugin's condition would simply stop matching —
   * which is why only the router's own READS were snapshotted.
   *
   * ⚠ This existed only incidentally before, inside
   * `navigateToDefault.test.ts › should parse single options object argument`,
   * which passes `{ replace: true, silent: false }` and asserts the whole
   * object: `silent` is the undeclared key doing the work, and nothing in the
   * test's name says so. The first tidy-up would have rewritten it.
   */
  it("hands plugins the caller's own options, undeclared keys and all — minus the signal", async () => {
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

    const external = new AbortController();
    // `source` is not in core's lexical declaration of `NavigationOptions` —
    // that is the point of the case, so the cast is the contract, not a repair.
    const opts = {
      replace: true,
      source: "MEMORY_RESTORE",
      signal: external.signal,
    } as NavigationOptions;

    await router.navigate("b", {}, undefined, opts);

    expect((announced as { source?: string } | undefined)?.source).toBe(
      "MEMORY_RESTORE",
    );
    expect(announced?.replace).toBe(true);
    // The one field that is an INPUT to the navigation rather than part of what
    // was committed. Its removal is why the object is a copy at all.
    expect(Object.hasOwn(announced!, "signal")).toBe(false);
    expect(external.signal.aborted).toBe(false);
  });

  it("POSITIVE CONTROL — a getter's value still reaches the transition meta", async () => {
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
    // Snapshotting must not drop the value the getter supplies — the meta is
    // built from it exactly as before, only read earlier.
    expect(state.transition?.replace).toBe(true);
    expect(router.getState()?.name).toBe("b");
    expect(events).toStrictEqual(["SUCCESS:b"]);
  });

  /**
   * The snapshot is PACKED — two bits per flag in one slot — so "absent" and
   * "explicitly false" stop being distinguished by the language and start being
   * distinguished by an encoding. That is the one property the packing could
   * quietly lose, and the meta's contract depends on it: `state.transition`
   * omits a flag the caller never named and carries `false` for one they set to
   * `false`.
   */
  it("keeps an absent flag and an explicitly false one apart", async () => {
    const { router } = createFixture();

    await router.start("/");

    const explicit = await router.navigate("b", {}, undefined, {
      reload: false,
      replace: false,
      redirected: false,
    });

    expect(explicit.transition?.reload).toBe(false);
    expect(explicit.transition?.replace).toBe(false);
    expect(explicit.transition?.redirected).toBe(false);

    // Control — named none of them, so the meta carries none of them. Without
    // this the assertions above would pass on an encoding that reported `false`
    // for everything.
    const absent = await router.navigate("home");

    expect(absent.transition?.reload).toBeUndefined();
    expect(absent.transition?.replace).toBeUndefined();
    expect(absent.transition?.redirected).toBeUndefined();
  });

  /**
   * The teardown arcs, kept for their ENTRY POINT rather than for the ordering
   * they used to pin. A getter that tears the router down is one more door into
   * the born-dead arc (`born-dead-navigation-1648.test.ts` holds the class
   * through interceptors and codecs): the getter now runs at the head of
   * `beginTransition`, so `NAVIGATE` finds a machine in `IDLE` / `DISPOSED`, the
   * send is a table no-op and the navigation never existed. What must never
   * change is the OUTCOME — no phantom resolve, nothing announced.
   */
  it("an opts getter that stops the router commits nothing and announces nothing", async () => {
    const result = await navigateWithHostileOption((router) => {
      router.stop();
    });

    expect(result.optionReads).toBe(1);
    expect(result.outcome).toBe(`rejected:${errorCodes.TRANSITION_CANCELLED}`);
    expect(result.state).toBeUndefined();
    expect(result.events).toStrictEqual([]);
  });

  it("an opts getter that disposes the router commits nothing and announces nothing", async () => {
    const result = await navigateWithHostileOption((router) => {
      router.dispose();
    });

    expect(result.optionReads).toBe(1);
    expect(result.outcome).toBe(`rejected:${errorCodes.TRANSITION_CANCELLED}`);
    expect(result.state).toBeUndefined();
    expect(result.events).toStrictEqual([]);
  });

  /**
   * The supersede arc, and the one place where snapshotting the flags CHANGED
   * an outcome rather than only a timing — named here so the next reader sees a
   * decision instead of an accident.
   *
   * A navigation started from an `opts` getter used to run in the middle of the
   * commit, i.e. AFTER the outer navigation had walked its guards, so it
   * superseded the navigation whose options it belonged to: the outer one was
   * refused by the table (`payload === ctx.inflight`) and the nested one won.
   * The getter now runs before the outer navigation is announced, so the nested
   * one is simply an EARLIER navigation — and `abortPreviousNavigation`, the
   * next statement, supersedes it like any other. The outer navigation wins.
   *
   * Both orders are internally consistent; this one is the rule the rest of the
   * pipeline already follows ("the newest navigation wins"), whereas the old one
   * let a value read inside a commit reach back and cancel that commit.
   */
  it("a navigation started from an opts getter is superseded by the navigation whose opts it is", async () => {
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
      onTransitionSuccess: (toState?: State) => {
        events.push(`SUCCESS:${toState?.name}`);
      },
    }));

    await router.start("/");
    events.length = 0;

    let nested = "pending";
    const opts = {
      get redirected(): undefined {
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

    expect(outcome).toBe("resolved:b");
    expect(router.getState()?.name).toBe("b");
    expect(events).toStrictEqual(["SUCCESS:b"]);

    // The nested one was cancelled by the navigation that read the getter, and
    // releasing its parked guard afterwards changes nothing — a cancelled
    // navigation does not come back.
    releaseGuard(true);
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    expect(nested).toBe(`rejected:${errorCodes.TRANSITION_CANCELLED}`);
    expect(router.getState()?.name).toBe("b");
    expect(events).toStrictEqual(["SUCCESS:b"]);
  });
});
