import { describe, expect, it } from "vitest";

import { createRouter } from "@real-router/core";
import { getLifecycleApi, getPluginApi } from "@real-router/core/api";

import type { Router } from "@real-router/core";

/**
 * A navigation option the caller never supplied does not reach the navigation
 * (#2132).
 *
 * ⚑ **Every slot of `NavigationOptions` is read with a plain `[[Get]]`**, so an
 * ambient `Object.prototype.<slot>` answers all six of them — and it answers
 * them on core's OWN `EMPTY_OPTS` too, the frozen singleton substituted when the
 * caller passes nothing. There is no caller bag in that case, so "inherited
 * properties of a caller-supplied object are not supported input" (INVARIANTS,
 * Supported input shapes) does not reach it: core is reading an option off its
 * own object and acting on it.
 *
 * ⚠ **The cells are chosen so the SLOT's value changes the outcome**, because
 * five of the six change behaviour rather than success. A table asserting only
 * "the navigation resolves" is green on the defect for `reload`, `force`,
 * `replace` and `redirected` alike — measured — and would have pinned one slot
 * of six.
 *
 * ⚠ **`forceDeactivate` is the sharp one**: an ambient key makes core ignore a
 * route's own refusal to deactivate, turning `CANNOT_DEACTIVATE` into a
 * committed navigation.
 *
 * The control arm is inside every cell: the same scenario is run with a clean
 * prototype, and the two must agree. A fixture that stopped reaching the slot
 * would agree trivially — which is what the CONTROL cell below rules out.
 */
describe("an ambient Object.prototype slot is not a navigation option (#2132)", () => {
  const ROUTES = [
    { name: "a", path: "/a" },
    { name: "g", path: "/g" },
  ];

  const proto = Object.prototype as unknown as Record<string, unknown>;

  /** Runs `scenario` with `Object.prototype[slot]` set, and always cleans up. */
  const under = async (
    slot: string | undefined,
    value: unknown,
    scenario: Scenario,
    opts: object | undefined,
  ): Promise<string> => {
    // ⚠ Built BEFORE the pollution: an ambient `signal` cancels `start()`, so a
    // router constructed under it never reaches the scenario.
    const router = createRouter(ROUTES as never);

    if (slot !== undefined) {
      proto[slot] = value;
    }

    try {
      return await scenario(router, opts);
    } catch (error) {
      return `throws:${(error as Error).message}`;
    } finally {
      if (slot !== undefined) {
        delete proto[slot];
      }

      router.dispose();
    }
  };

  const settle = async (promise: Promise<unknown>): Promise<string> =>
    promise
      .then((state) => `ok:${(state as { name: string }).name}`)
      .catch((error: unknown) => `refused:${(error as Error).message}`);

  /** Navigating to the route already committed — refused unless reload/force. */
  const sameRouteTwice = async (
    router: Router,
    opts: object | undefined,
  ): Promise<string> => {
    await router.start("/a");
    await router.navigate("g");

    return settle(router.navigate("g", {}, {}, opts as never));
  };

  /** A deactivate guard that says no — honoured unless forceDeactivate. */
  const refusedDeactivate = async (
    router: Router,
    opts: object | undefined,
  ): Promise<string> => {
    await router.start("/a");
    getLifecycleApi(router).addDeactivateGuard("a", () => () => false);

    return settle(router.navigate("g", {}, {}, opts as never));
  };

  /**
   * What the committed state records about how it got there.
   *
   * ⚑ `state.transition` is where both flags land — `completeTransition` writes
   * them onto the meta — and `state.meta` does not exist at all. A cell reading
   * the latter compares `null` with `null` and passes on the defect.
   *
   * ⚠ Read with `hasOwn`, because the pollution is STILL INSTALLED while this
   * runs: a plain `transition.replace` answers the very key under test and the
   * cell then reports the fixture's own read as core's behaviour. Measured —
   * that spelling made both flags look defective while nothing had been written.
   */
  const commitMeta = async (
    router: Router,
    opts: object | undefined,
  ): Promise<string> => {
    await router.start("/a");

    const state = (await router.navigate(
      "g",
      {},
      {},
      opts as never,
    )) as unknown as { transition?: Record<string, unknown> };
    const meta = state.transition ?? {};

    return JSON.stringify({
      replace: Object.hasOwn(meta, "replace") ? meta.replace : null,
      redirected: Object.hasOwn(meta, "redirected") ? meta.redirected : null,
    });
  };

  /** Start alone, which is where an ambient signal lands. */
  const justStart = async (router: Router): Promise<string> =>
    settle(router.start("/a"));

  type Scenario = (router: Router, opts: object | undefined) => Promise<string>;

  const CELLS: readonly (readonly [string, unknown, Scenario])[] = [
    ["signal", (): AbortSignal => AbortSignal.abort(), justStart],
    ["reload", true, sameRouteTwice],
    ["force", true, sameRouteTwice],
    ["forceDeactivate", true, refusedDeactivate],
    ["replace", true, commitMeta],
    ["redirected", true, commitMeta],
  ];

  it("no slot of NavigationOptions answers from the prototype", async () => {
    // ⚠ BOTH arms of the entry, because they take different paths and a table
    // running one is green on half the defect. With no options the facade
    // substitutes core's own `EMPTY_OPTS` and `adoptNavigationOptions` hands it
    // straight back by identity; with an empty bag the copy is built instead,
    // and the five flags are read back off THAT object. Measured — a table on
    // the first arm alone left the copy's own prototype unpinned.
    const table: Record<string, Record<string, string>> = {};

    for (const [arm, opts] of [
      ["no options", undefined],
      ["empty bag", {}],
    ] as const) {
      for (const [slot, value, scenario] of CELLS) {
        const clean = await under(undefined, undefined, scenario, opts);
        const polluted = await under(
          slot,
          typeof value === "function" ? (value as () => unknown)() : value,
          scenario,
          opts,
        );

        table[arm] = { ...table[arm], [slot]: `${clean} | ${polluted}` };
      }
    }

    const EXPECTED = {
      signal: "ok:a | ok:a",
      reload: "refused:SAME_STATES | refused:SAME_STATES",
      force: "refused:SAME_STATES | refused:SAME_STATES",
      forceDeactivate: "refused:CANNOT_DEACTIVATE | refused:CANNOT_DEACTIVATE",
      replace:
        '{"replace":null,"redirected":null} | {"replace":null,"redirected":null}',
      redirected:
        '{"replace":null,"redirected":null} | {"replace":null,"redirected":null}',
    };

    expect(table).toStrictEqual({
      "no options": EXPECTED,
      "empty bag": EXPECTED,
    });
  });

  it("the options bag core hands to plugins carries NO prototype", async () => {
    // ⚑ This is what the fix TAKES, and it is observable rather than internal:
    // the bag delivered with `$$success` is `Object.create(null)`-based, so
    // `options.hasOwnProperty(...)` throws and `toStrictEqual({...})` against an
    // object literal fails on the prototype alone. Six assertions in
    // `state-object-scenarios` were spelled that way and now spread first.
    //
    // ⚠ Pinned so the class stays closed BY CONSTRUCTION. A `hasOwn` gate at
    // each read protects only the reads that exist today; a sixth read added
    // later would reintroduce the defect against a green suite.
    const router = createRouter(ROUTES as never);
    const seen: (object | undefined)[] = [];

    getPluginApi(router).addEventListener(
      "$$success",
      (_toState: unknown, _fromState: unknown, options: object | undefined) => {
        seen.push(options);
      },
    );

    await router.start("/a");
    await router.navigate("g", {}, {}, { replace: true });

    expect(seen.length).toBeGreaterThan(0);
    expect(
      seen.map((options) =>
        options === undefined
          ? "undefined"
          : String(Object.getPrototypeOf(options)),
      ),
    ).toStrictEqual(seen.map(() => "null"));

    router.dispose();
  });

  it("CONTROL — each cell's scenario is sensitive to its slot when the caller PASSES it", async () => {
    // ⚑ Without this, the table above passes on a fixture that stopped reaching
    // the slot at all: every cell would agree at its clean value. Passing the
    // same value as a real option must move every cell.
    const passed: Record<string, string> = {};
    const router = (): Router => createRouter(ROUTES as never);

    {
      const instance = router();

      await instance.start("/a");
      await instance.navigate("g");
      passed.reload = await settle(
        instance.navigate("g", {}, {}, { reload: true }),
      );
      instance.dispose();
    }
    {
      const instance = router();

      await instance.start("/a");
      getLifecycleApi(instance).addDeactivateGuard("a", () => () => false);
      passed.forceDeactivate = await settle(
        instance.navigate("g", {}, {}, { forceDeactivate: true }),
      );
      instance.dispose();
    }
    {
      const instance = router();

      await instance.start("/a");

      const state = (await instance.navigate(
        "g",
        {},
        {},
        {
          replace: true,
        },
      )) as unknown as { transition?: Record<string, unknown> };
      const meta = state.transition ?? {};

      passed.replace = JSON.stringify(
        Object.hasOwn(meta, "replace") ? meta.replace : null,
      );
      instance.dispose();
    }

    expect(passed).toStrictEqual({
      reload: "ok:g",
      forceDeactivate: "ok:g",
      replace: "true",
    });
  });
});
