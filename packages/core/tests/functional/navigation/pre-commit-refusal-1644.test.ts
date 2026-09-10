// #1644 — what `navigateToNotFound` and the system commit do BEFORE the start
// navigation has committed anything.
//
// The state-ownership slice replaced `navigateToNotFound`'s liveness gate
// (`!isActive()` → IDLE / DISPOSED) with the FSM table's `canSend(SYSTEM_COMMIT)`,
// which is true on `READY` alone. Two different questions — "is the router
// alive?" and "is the machine in the one phase that commits?" — ended up answered
// by one predicate carrying the liveness answer's error code.
//
// Measured against the pre-slice base `4c3b95424`, this file pins the three
// things that came out of it:
//
//   1. a commit from the start-interceptor window said DISPOSED on a live router;
//   2. a commit from a plugin `onStart` hook COMMITTED — and the boot overwrote
//      it a tick later, so subscribers saw a `TRANSITION_SUCCESS` for a state
//      that never survived (the #1610 phantom shape, on base too);
//   3. a commit from a guard of the start navigation is NOT a phantom — the
//      primitive aborts the in-flight navigation first, so its 404 stands. It
//      must keep working; the refusal below must not swallow it.

import { describe, expect, it, vi } from "vitest";

import { constants, createRouter, errorCodes } from "@real-router/core";
import {
  getLifecycleApi,
  getPluginApi,
  getRoutesApi,
} from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

import type { Router, State } from "@real-router/core";

/**
 * The error `run` throws SYNCHRONOUSLY, or `undefined`.
 *
 * ⚑ The distinction is the point: the window's bans throw on the call rather
 * than rejecting, so a `.catch()` never sees them and an `await` would measure
 * the wrong thing. Wrapping the call in a named helper also keeps the promise
 * out of the `try`, which is what `sonarjs/no-try-promise` is looking at.
 */
function syncThrow(run: () => void): unknown {
  try {
    run();

    return undefined;
  } catch (error) {
    return error;
  }
}

const codeOf = (error: unknown): string | undefined =>
  (error as { code?: string }).code;

const ROUTES = [
  { name: "a", path: "/a" },
  { name: "b", path: "/b" },
];

/** Every `TRANSITION_SUCCESS` the boot announces, in order. */
function recordCommits(router: Router): string[] {
  const seen: string[] = [];

  router.usePlugin(() => ({
    onTransitionSuccess: (toState: State) => {
      seen.push(`${toState.name}@${toState.path}`);
    },
  }));

  return seen;
}

describe("#1644 — nothing commits before the start navigation does", () => {
  it("refuses from an async start interceptor, and says NOT_STARTED rather than DISPOSED", async () => {
    const router = createRouter(ROUTES, { allowNotFound: true });
    let caught: unknown;
    let aliveAtCall: boolean | undefined;

    getPluginApi(router).addInterceptor("start", async (next, path) => {
      aliveAtCall = router.isActive();

      try {
        router.navigateToNotFound("/inside-start");
      } catch (error: unknown) {
        caught = error;
      }

      return next(path);
    });

    await router.start("/a");

    // The router is very much not disposed — that was the whole defect.
    expect(aliveAtCall).toBe(true);
    expect(codeOf(caught)).toBe(errorCodes.ROUTER_NOT_STARTED);
    // #1647 — the sentence that used to come from a predicate on the facade now
    // comes from `#refuseSystemCommit`, which already knew the phase. The bare
    // code would read as "you forgot to call start()" to a caller INSIDE
    // `start()`, which is why it is worth naming at all.
    expect((caught as Error).message).toMatch(/before the start navigation/);
    expect(router.getState()?.name).toBe("a");

    router.dispose();
  });

  // The navigate family in the SAME window, and the reason the message had to
  // move rather than be deleted (#1647): a start interceptor runs OUTSIDE any
  // emit, so the reentrancy ban cannot see it and the refusal falls to the
  // table — which answers `NOT_STARTED` to a caller who is demonstrably inside
  // `start()`. The phase is known at the refusal site, so it is named there.
  it.each([
    ["navigate", (r: Router) => r.navigate("b")],
    ["navigateToDefault", (r: Router) => r.navigateToDefault()],
    [
      "navigateToState",
      (r: Router) => {
        const api = getPluginApi(r);

        return api.navigateToState(api.makeState("b"));
      },
    ],
  ])(
    "refuses %s from a start interceptor and names the boot window",
    async (_label, drive) => {
      const router = createRouter(ROUTES, { defaultRoute: "b" });
      const announced: string[] = [];
      let caught: unknown;

      router.subscribe(({ route }) => announced.push(route.name));

      getPluginApi(router).addInterceptor("start", async (next, path) => {
        await drive(router).catch((error: unknown) => {
          caught = error;
        });

        return next(path);
      });

      await router.start("/a");

      expect(codeOf(caught)).toBe(errorCodes.ROUTER_NOT_STARTED);
      expect((caught as Error).message).toMatch(/before the start navigation/);
      // Same discriminator as the hook table: one commit, the boot's own.
      expect(announced).toStrictEqual(["a"]);
      expect(router.getState()?.name).toBe("a");

      router.dispose();
    },
  );

  it("an ordinary never-started router keeps the PLAIN refusal, not the boot-window one", async () => {
    // The discriminating half of the relocation (#1647): the message is chosen
    // by `isStarting()`, so it must not leak onto a router that simply has not
    // been started. This is the case the facade predicate's third term bought,
    // and it survives the move.
    const router = createRouter(ROUTES);
    let caught: unknown;

    await router.navigate("b").catch((error: unknown) => {
      caught = error;
    });

    expect(codeOf(caught)).toBe(errorCodes.ROUTER_NOT_STARTED);
    expect((caught as Error).message).not.toMatch(
      /before the start navigation/,
    );

    router.dispose();
  });

  it("says the same PLAIN thing on the SYSTEM_COMMIT twin (navigateToNotFound)", () => {
    // The sibling above goes through `NavigationNamespace`; this one through
    // `EventBusNamespace.#refuseSystemCommit`, which picks its phase from the
    // same two predicates. A never-started router is neither transitioning nor
    // starting, so it gets the plain sentence — the third arm of that choice.
    //
    // Through the INTERNALS door deliberately: the facade's own `!isActive()`
    // check fires first and never reaches the table (see the note on
    // `navigateToNotFound`'s liveness gate).
    //
    // ⚑ It needs its own test since #1649: the arm used to be reached only
    // incidentally, by a `replace()` whose guard factory STOPPED the router
    // mid-swap. That factory no longer runs there, so the only cover for the
    // plain phase went with the scenario it was a side effect of.
    const router = createRouter(ROUTES, { allowNotFound: true });
    let caught: unknown;

    try {
      getInternals(router).navigateToNotFound("/nope");
    } catch (error: unknown) {
      caught = error;
    }

    expect(codeOf(caught)).toBe(errorCodes.ROUTER_NOT_STARTED);
    expect((caught as Error).message).not.toMatch(/in flight/);
    expect((caught as Error).message).not.toMatch(
      /before the start navigation/,
    );

    router.dispose();
  });

  it("refuses from a plugin onStart hook — and the boot announces exactly ONE commit", async () => {
    const router = createRouter(ROUTES, { allowNotFound: true });
    const commits = recordCommits(router);
    let caught: unknown;

    router.usePlugin(() => ({
      onStart: () => {
        try {
          router.navigateToNotFound("/from-on-start");
        } catch (error: unknown) {
          caught = error;
        }
      },
    }));

    await router.start("/a");

    // ⚑ #1647 — the CODE changed here and the outcome did not. `onStart` runs
    // inside the `$start` dispatch now, so the reentrancy ban answers first,
    // one layer above the phase question this file is otherwise about. The
    // ledger below is the assertion that matters and it is untouched.
    expect(codeOf(caught)).toBe(errorCodes.REENTRANT_NAVIGATION);
    // Before the fix this was ["@@router/UNKNOWN_ROUTE@/from-on-start", "a@/a"]:
    // a phantom success for a state the boot immediately overwrote.
    expect(commits).toStrictEqual(["a@/a"]);
    expect(router.getState()?.name).toBe("a");

    router.dispose();
  });

  it("still commits from a guard of the start navigation — that one is not a phantom", async () => {
    const router = createRouter(
      [
        {
          name: "a",
          path: "/a",
          canActivate: () => (): boolean => {
            router.navigateToNotFound("/from-guard");

            return true;
          },
        },
      ],
      { allowNotFound: true },
    );
    const commits = recordCommits(router);

    // The start navigation is aborted by the primitive, so its own commit never
    // lands and the 404 is the final word — one commit, not two.
    await expect(router.start("/a")).rejects.toMatchObject({
      code: errorCodes.TRANSITION_CANCELLED,
    });

    expect(router.getState()?.name).toBe(constants.UNKNOWN_ROUTE);
    expect(commits).toStrictEqual([`${constants.UNKNOWN_ROUTE}@/from-guard`]);

    router.dispose();
  });

  it("commits normally once the start navigation has landed — the control", async () => {
    const router = createRouter(ROUTES, { allowNotFound: true });

    await router.start("/a");

    const commits = recordCommits(router);

    expect(router.navigateToNotFound("/gone").name).toBe(
      constants.UNKNOWN_ROUTE,
    );
    expect(commits).toStrictEqual([`${constants.UNKNOWN_ROUTE}@/gone`]);

    router.dispose();
  });
});

describe("#1644 — the system commit reports the reason it refused", () => {
  it("still says DISPOSED on a disposed router (#1186 / #1627)", async () => {
    const router = createRouter(ROUTES, { allowNotFound: true });

    await router.start("/a");
    router.dispose();

    expect(() => router.navigateToNotFound("/gone")).toThrow(
      expect.objectContaining({ code: errorCodes.ROUTER_DISPOSED }),
    );
  });

  /**
   * ⚑ INVERTED by #1759, and the permission it pinned is the thing that
   * changed. This cell read "a `subscribeChanges` handler MAY start a
   * navigation — only route-CRUD is banned there", and that permission produced
   * the defect: with an async guard the navigation parked, the revalidation was
   * refused for want of a `SYSTEM_COMMIT` edge, and when the navigation then
   * FAILED nothing ever revalidated — leaving the router on a route the batch
   * had dropped. #1610 bans the identical phantom-commit shape in the
   * neighbouring window, so the two decisions disagreed; this settles it the
   * way #1610 already had.
   *
   * ⚠ The REFUSAL half of #1644 is untouched and still right — the commit door
   * cannot take a `SYSTEM_COMMIT` edge mid-transition, and it must not say the
   * router is disposed. What changed is that the window no longer lets a
   * navigation start there, so that refusal is reached by other means rather
   * than by this one.
   */
  it("refuses the navigation itself, rather than the commit that followed it", async () => {
    const router = createRouter(ROUTES);

    await router.start("/a");

    getLifecycleApi(router).addActivateGuard(
      "b",
      () => () => new Promise<boolean>(() => undefined),
    );

    const routes = getRoutesApi(router);
    let refusal: unknown;

    routes.subscribeChanges(() => {
      refusal = syncThrow(() => {
        void router.navigate("b");
      });
    });

    routes.replace([...ROUTES, { name: "c", path: "/c" }]);

    expect(codeOf(refusal)).toBe(errorCodes.REENTRANT_NAVIGATION);
    expect(codeOf(refusal)).not.toBe(errorCodes.ROUTER_DISPOSED);
    expect(router.isActive()).toBe(true);

    // And the revalidation ran, because nothing deferred it: the committed
    // state is one the new tree holds.
    expect(getRoutesApi(router).has(String(router.getState()?.name))).toBe(
      true,
    );

    router.dispose();
  });

  it("names the WINDOW in its message, since no code says 'inside replace()'", async () => {
    // The same reason #1644 gave for its own text, applied to the door that now
    // speaks first: the code names a rule, and the remedy follows from nothing.
    const router = createRouter(ROUTES);

    await router.start("/a");

    getLifecycleApi(router).addActivateGuard(
      "b",
      () => () => new Promise<boolean>(() => undefined),
    );

    const routes = getRoutesApi(router);
    const spy = vi.fn();
    let message = "";

    routes.subscribeChanges(() => {
      spy();

      const refused = syncThrow(() => {
        void router.navigate("b");
      });

      message = (refused as Error | undefined)?.message ?? "";
    });

    routes.replace([...ROUTES, { name: "c", path: "/c" }]);

    expect(spy).toHaveBeenCalled();
    expect(message).toMatch(/revalidation/i);
    expect(message).toMatch(/queueMicrotask/);

    router.dispose();
  });

  /**
   * ⚑ The mid-transition refusal kept its only remaining caller, and it is not
   * application code (#1758 / #1759). The window now refuses a navigation
   * started from `replace()`'s revalidation, which was how this branch used to
   * be reached; what still reaches it is a PLUGIN calling `systemCommit`
   * through `getInternals` while a transition is in flight — a published door
   * four first-party packages already use.
   *
   * ⚠ Measured before writing it: `navigateToNotFound` from a guard does NOT
   * reach it, because `commitNotFound` supersedes the in-flight navigation
   * first, so `isTransitioning()` is false by the time the ask happens.
   */
  it("refuses a plugin's systemCommit while a transition is in flight", async () => {
    const router = createRouter(ROUTES);

    await router.start("/a");

    let caught: unknown;

    getLifecycleApi(router).addActivateGuard("b", () => () => {
      const ctx = getInternals(router);

      caught = syncThrow(() => {
        ctx.systemCommit(
          {
            name: "a",
            params: {},
            search: {},
            path: "/a",
            context: {},
          } as unknown as State,
          router.getState(),
          { replace: true },
        );
      });

      return true;
    });

    await router.navigate("b").catch(() => undefined);

    expect(codeOf(caught)).not.toBe(errorCodes.ROUTER_DISPOSED);
    expect((caught as Error).message).toMatch(/transition is in flight/u);
    expect(router.isActive()).toBe(true);

    router.dispose();
  });
});
