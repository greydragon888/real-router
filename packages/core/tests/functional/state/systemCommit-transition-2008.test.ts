import { describe, expect, it } from "vitest";

import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

import type { Router, State } from "@real-router/core/types";

/**
 * `systemCommit` reads the caller's `toState.transition` ONCE (#2008).
 *
 * The door copies the State it is handed because `getInternals` is published, so
 * `toState` may be an application's own object. The field is spread in
 * conditionally so that an absent one stays absent — and that conditional was
 * two reads: the `!== undefined` test, then the value inside the spread.
 *
 * ⚑ The second answer is the one that commits, so a drifting accessor put the
 * shared `EMPTY_PARAMS` singleton into `transition` — a type that declares
 * `phase`, `reason` and `segments` as REQUIRED — and `getState().transition`
 * became the same object as another state's `getState().params`. That is the
 * exact outcome the conditional spread exists to prevent, quoted in its own
 * docblock.
 */
describe("systemCommit reads toState.transition once (#2008)", () => {
  const mk = (): Router => {
    const router = createRouter([
      { name: "h", path: "/h" },
      { name: "u", path: "/u/:id" },
    ]);

    void router.start("/h");

    return router;
  };

  /**
   * A foreign State whose `transition` answers `real` first and `second` after.
   * `"__stable__"` makes it answer `real` every time — the control.
   */
  const foreign = (
    base: State,
    second: unknown,
  ): { state: State; reads: () => number } => {
    let reads = 0;
    const real = base.transition;
    const state: Record<string, unknown> = {
      name: base.name,
      params: base.params,
      search: base.search,
      path: base.path,
      context: {},
    };

    Object.defineProperty(state, "transition", {
      enumerable: true,
      configurable: true,
      get(): unknown {
        reads += 1;

        if (second === "__stable__") {
          return real;
        }

        return reads <= 1 ? real : second;
      },
    });

    return { state: state as unknown as State, reads: () => reads };
  };

  /** `reads · what landed in the committed transition`. */
  const observe = (second: unknown): string => {
    const router = mk();
    const target = getPluginApi(router).makeState("u", { id: "7" });
    // A state with NO path params, so its `params` IS the shared empty
    // singleton — the object a drifting read used to commit AS the transition.
    const emptyParams = getPluginApi(router).makeState("h", {}).params;
    const { state, reads } = foreign(target, second);

    getInternals(router).systemCommit(state, router.getState(), {});

    const committed = router.getState()!.transition as unknown as
      Record<string, unknown> | undefined;

    let landed = "absent";

    if ((committed as unknown) === (emptyParams as unknown)) {
      landed = "THE EMPTY-PARAMS SINGLETON";
    } else if (committed?.phase !== undefined) {
      landed = "a well-formed meta";
    } else if (committed !== undefined) {
      landed = `something else: ${JSON.stringify(committed)}`;
    }

    router.dispose();

    return `${reads()} read · ${landed}`;
  };

  it("commits what the first read answered, whatever the second says", () => {
    const table = {
      "drifts to undefined": observe(undefined),
      "drifts to {}": observe({}),
      "CONTROL — stable accessor": observe("__stable__"),
    };

    expect(table).toStrictEqual({
      "drifts to undefined": "1 read · a well-formed meta",
      "drifts to {}": "1 read · a well-formed meta",
      "CONTROL — stable accessor": "1 read · a well-formed meta",
    });
  });

  it("CONTROL — a State with NO transition still commits without one", () => {
    // The conditional spread's own reason: absence must stay absence, rather
    // than becoming the adoption's empty answer.
    const router = mk();
    const target = getPluginApi(router).makeState("u", { id: "7" });
    const withoutTransition = {
      name: target.name,
      params: target.params,
      search: target.search,
      path: target.path,
      context: {},
    } as unknown as State;

    getInternals(router).systemCommit(withoutTransition, router.getState(), {});

    expect(
      Object.hasOwn(router.getState()!, "transition"),
      "absence stays absence",
    ).toBe(false);

    router.dispose();
  });
});
