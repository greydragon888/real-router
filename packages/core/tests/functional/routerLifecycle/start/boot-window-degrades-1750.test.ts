import { describe, it, expect } from "vitest";

import { constants, createRouter, errorCodes, events } from "@real-router/core";
import { getPluginApi, getRoutesApi } from "@real-router/core/api";

import type { Router, RouterError, State } from "@real-router/core";

/**
 * `start()` has two windows in which it is in flight and `isTransitioning()` is
 * `false`, so no route-CRUD gate fires (#1750):
 *
 * 1. **`STARTING`** — inside an async `start` interceptor, before `next(path)`.
 * 2. **`READY`, before the boot commit** — from a plugin's `onStart`.
 *
 * A destructive mutation lands in both. The owner's decision is **degrade, not
 * gate**: the mutation applies and the boot reports the consequence through the
 * channel the caller already handles — under `allowNotFound` that is the
 * router's own `UNKNOWN_ROUTE`, exactly as when a user opens a URL that matches
 * nothing, and exactly what `replace()` already does on a RUNNING router when it
 * drops the route the user is on (#950 / #1201).
 *
 * ⚑ The two windows disagreed, and only one of them was wrong. `matchPath` runs
 * BEFORE `completeStart()`, so a wipe in window 1 leaves no match and the
 * `allowNotFound` branch takes over — that arm has always degraded. Window 2
 * opens at `completeStart()`, i.e. AFTER the match, so `matchedState` survives
 * as a stale object and `navigateToState` fails on it with nothing to catch the
 * failure. `allowNotFound` never got a say.
 *
 * ⚠ These are written as a COMPARISON between the windows rather than as an
 * expected value. The comparison holds whatever the not-found state is named
 * and would have survived the other two variants of the fork; an equality
 * against `UNKNOWN_ROUTE` pins today's spelling instead of the rule.
 */
describe("the boot window degrades rather than failing the start (#1750)", () => {
  const ROUTES = [
    { name: "a", path: "/a" },
    { name: "b", path: "/b" },
  ];

  interface Outcome {
    settled: string;
    name: string | undefined;
    path: string | undefined;
    events: string[];
  }

  /** The three destructive ops, all of which land in these windows ungated. */
  const OPS = {
    clear: (router: Router) => {
      getRoutesApi(router).clear();
    },
    replace: (router: Router) => {
      getRoutesApi(router).replace([{ name: "z", path: "/z" }]);
    },
    remove: (router: Router) => {
      getRoutesApi(router).remove("a");
    },
  };

  type Window = "interceptor" | "onStart" | "$start listener";

  /** Mutates the tree from the named window, then reports how `start()` settled. */
  const bootWith = async (
    window: Window,
    op: keyof typeof OPS,
    allowNotFound: boolean,
  ): Promise<Outcome> => {
    const router: Router = createRouter(ROUTES, { allowNotFound });
    const seen: string[] = [];

    router.usePlugin(() => ({
      onTransitionSuccess: (to) => seen.push(`success:${to.name}`),
      onTransitionError: (_to, _from, error) =>
        seen.push(`error:${error.code}`),
    }));

    let fired = false;
    const wipe = (): void => {
      if (!fired) {
        fired = true;
        OPS[op](router);
      }
    };

    if (window === "interceptor") {
      getPluginApi(router).addInterceptor("start", async (next, path) => {
        wipe();

        return next(path);
      });
    } else if (window === "onStart") {
      router.usePlugin(() => ({ onStart: wipe }));
    } else {
      // The raw listener arm of the same dispatch — a plugin hook is sugar over
      // it, and a defect that reaches one must reach the other.
      getPluginApi(router).addEventListener(events.ROUTER_START, wipe);
    }

    let settled: Outcome["settled"] = "resolved";

    try {
      await router.start("/a");
    } catch (error) {
      settled = (error as RouterError).code;
    }

    const state: State | undefined = router.getState();

    router.dispose();

    return { settled, name: state?.name, path: state?.path, events: seen };
  };

  /** The outcome without its event stream — the two are asserted separately. */
  const settlement = ({
    events: _events,
    ...rest
  }: Outcome): Omit<Outcome, "events"> => rest;

  describe.each(["clear", "replace", "remove"] as (keyof typeof OPS)[])(
    "%s",
    (op) => {
      it(`${op}(): every window SETTLES alike, with allowNotFound on`, async () => {
        const baseline = await bootWith("interceptor", op, true);
        const inOnStart = await bootWith("onStart", op, true);
        const inListener = await bootWith("$start listener", op, true);

        // The CLASS: the arm that has always degraded is the reference, and both
        // arms in front of the transition must match it. `onStart` is the one the
        // fix changes; the raw `$start` listener is the same dispatch reached
        // without the plugin sugar, and a defect in one must show in the other.
        expect(settlement(inOnStart)).toStrictEqual(settlement(baseline));
        expect(settlement(inListener)).toStrictEqual(settlement(baseline));

        // Names what they landed on, so a change that degrades ALL arms into
        // something else fails here instead of passing a comparison of three
        // equally broken outcomes.
        expect(settlement(baseline)).toStrictEqual({
          settled: "resolved",
          name: constants.UNKNOWN_ROUTE,
          path: "/a",
        });

        // ⚠ The STATE settles alike; the EVENT STREAM does NOT, and the
        // difference is asserted rather than smoothed over — it was found by
        // adding events to the comparison, and the first reading of it was
        // wrong in both directions before it was measured per window.
        //
        // Window 1 has no match to commit — `matchPath` runs after the
        // interceptor — so nothing fails and only the success fires. Windows 2
        // and 3 commit a stale match first, so the failure is ANNOUNCED before
        // the recovery: a plugin logging `onTransitionError` sees a
        // `ROUTE_NOT_FOUND` the router then recovered from. Suppressing it means
        // reaching inside the navigation pipeline, a wider change than this fix,
        // so it is pinned as a known boundary instead of left to drift.
        expect(baseline.events).toStrictEqual([
          `success:${constants.UNKNOWN_ROUTE}`,
        ]);
        expect(inOnStart.events).toStrictEqual([
          `error:${errorCodes.ROUTE_NOT_FOUND}`,
          `success:${constants.UNKNOWN_ROUTE}`,
        ]);
        expect(inListener.events).toStrictEqual(inOnStart.events);
      });

      it(`CONTROL — ${op}() without allowNotFound rejects, and alike`, async () => {
        const baseline = await bootWith("interceptor", op, false);

        const inOnStart = await bootWith("onStart", op, false);

        expect(settlement(inOnStart)).toStrictEqual(settlement(baseline));
        expect(baseline.settled).toBe(errorCodes.ROUTE_NOT_FOUND);
        expect(baseline.name).toBeUndefined();
      });
    },
  );

  it("the 404 keeps the URL the caller started with, not the rebuilt one", async () => {
    // ⚠ `startPath` and `matchedState.path` are NOT the same string whenever the
    // match rebuilds the path — a `forwardTo`, a `defaultParams` fill. Measured:
    // `start("/old")` matches `neu` at `/new`. The fallback must keep `/old`,
    // the URL the user actually came with, and that is also what the no-match
    // branch beside it uses. Every other cell here uses a path where the two
    // coincide, so without this one a "simplification" to the stale state's path
    // would pass the whole file.
    const router = createRouter(
      [
        { name: "old", path: "/old", forwardTo: "neu" },
        { name: "neu", path: "/new" },
      ],
      { allowNotFound: true },
    );
    let fired = false;

    router.usePlugin(() => ({
      onStart: () => {
        if (!fired) {
          fired = true;
          getRoutesApi(router).clear();
        }
      },
    }));

    await router.start("/old");

    expect(router.getState()?.name).toBe(constants.UNKNOWN_ROUTE);
    expect(router.getState()?.path).toBe("/old");

    router.dispose();
  });

  it("a boot the window BLOCKS with a guard still rejects — the catch is narrow", async () => {
    // ⚠ The other half of the narrowing. Widening the catch to every error would
    // turn an application's own refusal into a silent 404, and nothing else in
    // this file would notice.
    const router = createRouter([{ name: "a", path: "/a" }], {
      allowNotFound: true,
    });
    let fired = false;

    router.usePlugin(() => ({
      onStart: () => {
        if (!fired) {
          fired = true;
          getRoutesApi(router).replace([
            { name: "a", path: "/a", canActivate: () => () => false },
          ]);
        }
      },
    }));

    let settled = "resolved";

    try {
      await router.start("/a");
    } catch (error) {
      settled = (error as RouterError).code;
    }

    expect(settled).toBe(errorCodes.CANNOT_ACTIVATE);
    expect(router.getState()).toBeUndefined();

    router.dispose();
  });

  it("CONTROL — an untouched boot is unaffected by the fallback", async () => {
    const router = createRouter(ROUTES, { allowNotFound: true });

    await router.start("/a");

    expect(router.getState()?.name).toBe("a");

    router.dispose();
  });
});
