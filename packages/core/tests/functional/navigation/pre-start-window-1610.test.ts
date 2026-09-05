import { describe, it, expect } from "vitest";

import { createRouter, errorCodes } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

import type { Router, State } from "@real-router/core";

/**
 * #1610 — the pre-start window is guarded.
 *
 * Between entering `navigate()` and the transition being announced, user code
 * runs: the `forwardState` interceptor, a route's dynamic `forwardTo` callback
 * and its `encodeParams` — all inside `buildNavigateState`.
 * Not `decodeParams`: that serves the URL→state direction and runs from
 * `matchPath`, which prepares no navigation (#1713). The reentrancy ban did not
 * reach there —
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
  nested: () => { threw: string | undefined; message?: string };
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
  const nested = (): { threw: string | undefined; message?: string } => {
    // eslint-disable-next-line sonarjs/no-try-promise -- the try captures the SYNC reentrancy throw; the rejection half is handled by .catch()
    try {
      router.navigate("b").catch(() => {
        /* fire-and-forget */
      });

      return { threw: undefined };
    } catch (error) {
      // #1665 — the message is part of the contract now, so it rides back with
      // the code; a caller that only looks at `threw` is unchanged.
      return { threw: codeOf(error), message: (error as Error).message };
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

  // #1665 — the message must describe THIS window, not the listener one. Both
  // windows throw the same code through the same guard, but a developer sitting
  // in an interceptor who is told "you are inside an event listener" reads the
  // error as spurious. Measured: the two halves are `isProcessing()` and
  // `isPreparing()`, and only the second has no emit on the stack at all.
  it("says what was violated and what to do instead — the PRE-START window", async () => {
    const { router, nested } = createFixture();

    await router.start("/");

    let outcome: { threw: string | undefined; message?: string } | undefined;
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

    expect(outcome?.message).toBeDefined();
    expect(outcome?.message).not.toBe(errorCodes.REENTRANT_NAVIGATION);
    expect(outcome?.message).toMatch(/interceptor/i);
    expect(outcome?.message).not.toMatch(/listener/i);
    expect(outcome?.message).toMatch(/queueMicrotask/);
  });

  it("enumerates every position the window runs, and only those (#1713)", async () => {
    const { router, nested } = createFixture();

    await router.start("/");

    let outcome: { threw: string | undefined; message?: string } | undefined;
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

    const message = outcome?.message ?? "";

    // The message is the INVENTORY of the window, so it is checked against what
    // the window actually runs rather than against itself. Every term below has
    // a behavioural test in this file driving the ban from that position.
    expect(message).toMatch(/forwardState/);
    expect(message).toMatch(/encodeParams/);
    expect(message).toMatch(/forwardTo/);
    expect(message).toMatch(/defaultRoute/);
    expect(message).toMatch(/defaultParams/);
    expect(message).toMatch(/defaultSearch/);

    // ...and NOT `decodeParams`: it serves the URL→state direction and runs from
    // `matchPath`, which prepares no navigation and is deliberately outside the
    // ban (see "still allows a navigation from matchPath's interceptors").
    // Measured: `navigate()` invokes the decoder zero times.
    expect(message).not.toMatch(/decodeParams/);
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

  // Named for the codec HALF that runs here: `encodeParams`. Its twin
  // `decodeParams` serves the URL→state direction from `matchPath` and is
  // deliberately outside the ban (#1713).
  it("refuses a nested navigate() driven from a route's encodeParams", async () => {
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

  it("refuses a nested navigate() driven from a dynamic forwardTo callback", async () => {
    const log: string[] = [];
    let armed = true;
    let outcome: { threw: string | undefined; message?: string } | undefined;

    let router!: Router;

    router = createRouter([
      { name: "home", path: "/" },
      {
        name: "a",
        path: "/a",
        forwardTo: () => {
          if (armed) {
            armed = false;

            // eslint-disable-next-line sonarjs/no-try-promise -- the try captures the SYNC reentrancy throw; the rejection half is handled by .catch()
            try {
              router.navigate("b").catch(() => {
                /* fire-and-forget */
              });
              outcome = { threw: undefined };
            } catch (error) {
              outcome = {
                threw: codeOf(error),
                message: (error as Error).message,
              };
            }
          }

          return "target";
        },
      },
      { name: "target", path: "/target" },
      { name: "b", path: "/b" },
    ]);

    router.usePlugin(() => ({
      onTransitionStart: (to, from) =>
        log.push(`START to=${to.name} from=${from?.name}`),
    }));

    await router.start("/");
    await router.navigate("a");

    expect(outcome?.threw).toBe(errorCodes.REENTRANT_NAVIGATION);

    // A `forwardTo` callback is route CONFIG — neither an interceptor, nor a
    // codec, nor an option callback — so an enumeration that omits it tells this
    // author about someone else's window (#1713).
    expect(outcome?.message).toMatch(/forwardTo/);

    expect(log).toContain("START to=target from=home");
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

    api.addInterceptor("forwardState", (next, name, params, search) => {
      if (name === "a" && armed) {
        armed = false;
        outcome = nested();
      }

      return next(name, params, search);
    });

    // `matchPath` runs the very same `forwardState` chain the cell above drives
    // the ban from, but it is a read-only query — no navigation is being
    // prepared, so the ban must not reach it.
    api.matchPath("/a");

    // Positive control: the interceptor RAN. Without it "no throw" is also what
    // a chain that never fired reports, and the cell would pass on a seam
    // `matchPath` does not run at all.
    expect(armed).toBe(false);
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

  // The test above is the window-1 half — `#navigate`'s marker, raised around
  // `buildNavigateState`. `#navigateToDefault` raises a SECOND one around
  // `resolveDefault()`, and the block below is its twin: nothing else asserts
  // that IT comes back down (#1650), and deleting its `finally` restore reds
  // cells in `navigateToDefault.test.ts` only incidentally.
  //
  // The `finally` is load-bearing exactly here: the `catch` RETURNS a rejected
  // promise, so a restore written as the next statement would never run. And a
  // leaked increment is permanent — `isPreparing()` stays true and every later
  // top-level navigate throws a false `REENTRANT_NAVIGATION` for the life of
  // the router, which is why the assertion below is a plain navigation.
  describe("the second pre-start window — resolveDefault (#1650)", () => {
    const cases = ["defaultRoute", "defaultParams", "defaultSearch"] as const;

    it.each(cases)(
      "clears the marker when the %s callback THROWS",
      async (which) => {
        let boom = true;

        const explode = (): never => {
          throw new Error(`${which} exploded`);
        };

        const router = createRouter(
          [
            { name: "home", path: "/" },
            { name: "a", path: "/a" },
          ],
          {
            defaultRoute:
              which === "defaultRoute" ? () => (boom ? explode() : "a") : "a",
            defaultParams:
              which === "defaultParams" ? () => (boom ? explode() : {}) : {},
            defaultSearch:
              which === "defaultSearch" ? () => (boom ? explode() : {}) : {},
          },
        );

        await router.start("/");

        await expect(router.navigateToDefault()).rejects.toThrow(
          `${which} exploded`,
        );

        boom = false;

        // A leaked marker makes this throw REENTRANT_NAVIGATION synchronously,
        // so the failure is loud and names itself.
        const state = await router.navigate("a");

        expect(state.name).toBe("a");
      },
    );

    it("clears the marker on the healthy path too", async () => {
      const router = createRouter(
        [
          { name: "home", path: "/" },
          { name: "a", path: "/a" },
        ],
        { defaultRoute: () => "a" },
      );

      await router.start("/");

      // POSITIVE CONTROL for the three cells above: without it they would all
      // still pass if `navigateToDefault` never reached the window at all.
      const first = await router.navigateToDefault();

      expect(first.name).toBe("a");

      const second = await router.navigate("home");

      expect(second.name).toBe("home");
    });
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
