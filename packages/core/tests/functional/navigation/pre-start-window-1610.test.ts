import { describe, it, expect } from "vitest";

import { createRouter, errorCodes } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

import type { Router, State } from "@real-router/core";

/**
 * #1610 — the pre-start window is guarded.
 *
 * Between entering `navigate()` and the transition being announced, user code
 * runs: the `forwardState` and `buildPath` interceptors and the route codecs,
 * all inside `buildNavigateState`. The reentrancy ban did not reach there —
 * `Router.#assertNotReentrant` keys off the emitter's dispatch depth, and an
 * interceptor runs BEFORE any emit — so a nested `navigate()` completed in full:
 * it committed a state that was overwritten a tick later (a phantom
 * `TRANSITION_SUCCESS`), and the outer transition reported departing from
 * wherever the nested one had left the router.
 *
 * This is the window between the two bans that DO exist: `REENTRANT_NAVIGATION`
 * (transition listeners) and `REENTRANT_TREE_MUTATION` (#1032,
 * `subscribeChanges` handlers).
 */

const codeOf = (error: unknown): string | undefined =>
  (error as { code?: string }).code;

interface Fixture {
  router: Router;
  log: string[];
  nested: () => { threw: string | undefined };
}

function createFixture(): Fixture {
  const log: string[] = [];

  const router = createRouter([
    { name: "home", path: "/" },
    { name: "a", path: "/a" },
    { name: "b", path: "/b" },
  ]);

  router.usePlugin(() => ({
    onTransitionStart: (to, from) =>
      log.push(`START to=${to.name} from=${from?.name}`),
    onTransitionSuccess: (to, from) =>
      log.push(`SUCCESS to=${to.name} from=${from?.name}`),
    onTransitionError: (to, _from, error) =>
      log.push(`ERROR to=${to?.name}:${codeOf(error)}`),
  }));

  // The try is for the SYNCHRONOUS throw the ban owes us, never for the
  // Promise — the `.catch()` handles that half.
  const nested = (): { threw: string | undefined } => {
    // eslint-disable-next-line sonarjs/no-try-promise -- the try captures the SYNC reentrancy throw; the rejection half is handled by .catch()
    try {
      router.navigate("b").catch(() => {
        /* fire-and-forget */
      });

      return { threw: undefined };
    } catch (error) {
      return { threw: codeOf(error) };
    }
  };

  return { router, log, nested };
}

describe("#1610 — the pre-start window", () => {
  it("refuses a nested navigate() driven from a forwardState interceptor", async () => {
    const { router, nested } = createFixture();

    await router.start("/");

    let outcome: { threw: string | undefined } | undefined;
    let armed = true;

    getPluginApi(router).addInterceptor(
      "forwardState",
      (next, name, params) => {
        if (name === "a" && armed) {
          armed = false;
          outcome = nested();
        }

        return next(name, params);
      },
    );

    await router.navigate("a");

    expect(outcome?.threw).toBe(errorCodes.REENTRANT_NAVIGATION);
  });

  it("keeps the outer transition departing from the state committed at call time", async () => {
    const { router, log, nested } = createFixture();

    await router.start("/");
    log.length = 0;

    let armed = true;

    getPluginApi(router).addInterceptor(
      "forwardState",
      (next, name, params) => {
        if (name === "a" && armed) {
          armed = false;
          nested();
        }

        return next(name, params);
      },
    );

    const stateAtCallTime = router.getState()?.name;

    await router.navigate("a");

    expect(stateAtCallTime).toBe("home");
    // No nested START/SUCCESS pair, and the outer departs from `home` — not
    // from wherever a nested navigation had left the router.
    expect(log).toStrictEqual([
      "START to=a from=home",
      "SUCCESS to=a from=home",
    ]);
  });

  it("refuses a nested navigate() driven from a buildPath interceptor", async () => {
    const { router, nested } = createFixture();

    await router.start("/");

    let outcome: { threw: string | undefined } | undefined;
    let armed = true;

    getPluginApi(router).addInterceptor("buildPath", (next, ...args) => {
      if (args[0] === "a" && armed) {
        armed = false;
        outcome = nested();
      }

      return next(...args);
    });

    await router.navigate("a");

    expect(outcome?.threw).toBe(errorCodes.REENTRANT_NAVIGATION);
  });

  it("refuses a nested navigate() driven from a route codec", async () => {
    const log: string[] = [];
    let armed = true;
    let outcome: { threw: string | undefined } | undefined;

    let router!: Router;

    router = createRouter([
      { name: "home", path: "/" },
      {
        name: "a",
        path: "/a",
        encodeParams: (bag) => {
          if (armed) {
            armed = false;

            // eslint-disable-next-line sonarjs/no-try-promise -- the try captures the SYNC reentrancy throw; the rejection half is handled by .catch()
            try {
              router.navigate("b").catch(() => {
                /* fire-and-forget */
              });
              outcome = { threw: undefined };
            } catch (error) {
              outcome = { threw: codeOf(error) };
            }
          }

          return bag;
        },
      },
      { name: "b", path: "/b" },
    ]);

    router.usePlugin(() => ({
      onTransitionStart: (to, from) =>
        log.push(`START to=${to.name} from=${from?.name}`),
    }));

    await router.start("/");
    await router.navigate("a");

    expect(outcome?.threw).toBe(errorCodes.REENTRANT_NAVIGATION);
    expect(log).toContain("START to=a from=home");
  });

  it("refuses a nested navigate() driven from a defaultRoute callback", async () => {
    // `navigateToDefault` resolves `defaultRoute` / `defaultParams` /
    // `defaultSearch` — any of which may be a dependency-resolved callback —
    // before it has a route name to navigate to. Same pre-start window, a
    // different entry point.
    const log: string[] = [];
    let armed = true;
    let threw: string | undefined;
    let router!: Router;

    router = createRouter(
      [
        { name: "home", path: "/" },
        { name: "d", path: "/d" },
        { name: "b", path: "/b" },
      ],
      {
        defaultRoute: () => {
          if (armed) {
            armed = false;

            // eslint-disable-next-line sonarjs/no-try-promise -- the try captures the SYNC reentrancy throw; the rejection half is handled by .catch()
            try {
              router.navigate("b").catch(() => {
                /* fire-and-forget */
              });
            } catch (error) {
              threw = codeOf(error);
            }
          }

          return "d";
        },
      },
    );

    router.usePlugin(() => ({
      onTransitionStart: (to, from) =>
        log.push(`START to=${to.name} from=${from?.name}`),
    }));

    await router.start("/");
    log.length = 0;

    await router.navigateToDefault();

    expect(threw).toBe(errorCodes.REENTRANT_NAVIGATION);
    expect(log).toStrictEqual(["START to=d from=home"]);
  });

  it("still allows a navigation from matchPath's interceptors — a query prepares nothing", async () => {
    const { router, nested } = createFixture();

    await router.start("/");

    let outcome: { threw: string | undefined } | undefined;
    let armed = true;

    const api = getPluginApi(router);

    api.addInterceptor("buildPath", (next, ...args) => {
      if (args[0] === "a" && armed) {
        armed = false;
        outcome = nested();
      }

      return next(...args);
    });

    // `matchPath` runs the very same `buildPath` chain, but it is a read-only
    // query — no navigation is being prepared, so the ban must not reach it.
    api.matchPath("/a");

    expect(outcome?.threw).toBeUndefined();
  });

  it("clears the marker on an early refusal, so the next navigation still works", async () => {
    const router = createRouter([
      { name: "home", path: "/" },
      { name: "a", path: "/a" },
    ]);

    await router.start("/");

    // ROUTE_NOT_FOUND leaves `buildNavigateState` without a state at all — an
    // exit path that must still lower the marker, or the router deadlocks
    // itself on every later call.
    await expect(router.navigate("missing")).rejects.toMatchObject({
      code: errorCodes.ROUTE_NOT_FOUND,
    });

    // SAME_STATES — the other early refusal in that window.
    await expect(router.navigate("home")).rejects.toMatchObject({
      code: errorCodes.SAME_STATES,
    });

    const state: State = await router.navigate("a");

    expect(state.name).toBe("a");
  });

  it("clears the marker when the pre-start user code THROWS", async () => {
    let boom = true;

    const router = createRouter([
      { name: "home", path: "/" },
      {
        name: "a",
        path: "/a",
        encodeParams: (bag) => {
          if (boom) {
            throw new Error("codec exploded");
          }

          return bag;
        },
      },
    ]);

    await router.start("/");

    await expect(router.navigate("a")).rejects.toThrow("codec exploded");

    boom = false;

    const state = await router.navigate("a");

    expect(state.name).toBe("a");
  });

  it("still allows the guard-redirect — a guard runs after the announce, not before it", async () => {
    let router!: Router;
    let threw: string | undefined;

    // The classic guard-redirect: the guard navigates elsewhere and returns
    // `false`. A guard runs AFTER `TRANSITION_START`, so it is outside the
    // pre-start window and must stay allowed — the ban must not widen into it.
    router = createRouter([
      { name: "home", path: "/" },
      {
        name: "a",
        path: "/a",
        canActivate: () => () => {
          // eslint-disable-next-line sonarjs/no-try-promise -- the try captures the SYNC reentrancy throw; the rejection half is handled by .catch()
          try {
            router.navigate("b").catch(() => {
              /* fire-and-forget */
            });
          } catch (error) {
            threw = codeOf(error);
          }

          return false;
        },
      },
      { name: "b", path: "/b" },
    ]);

    await router.start("/");

    await expect(router.navigate("a")).rejects.toBeDefined();

    await new Promise((resolve) => {
      setTimeout(resolve, 5);
    });

    expect(threw).toBeUndefined();
    expect(router.getState()?.name).toBe("b");
  });
});
