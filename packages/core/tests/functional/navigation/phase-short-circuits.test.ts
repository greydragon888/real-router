import { describe, it, expect, afterEach } from "vitest";

import { createRouter, UNKNOWN_ROUTE } from "@real-router/core";
import { getLifecycleApi, getPluginApi } from "@real-router/core/api";

import type { Router, State } from "@real-router/core";

/**
 * The per-phase short-circuit in `runPhase`, both halves.
 *
 * Neither half was reachable from the tier before this file, and the reason is
 * the same for both: a phase whose short-circuit is false also disarms
 * `planPhases`' `hasGuards`, so the navigation takes разрез А
 * (`completeImmediate`) and the guard walk never runs at all. Instrumented over
 * the whole tier, the short-circuit fired 29 times and every one of them had an
 * EMPTY segment list — i.e. the `return` it took was indistinguishable from the
 * loop it skipped. Deleting the short-circuit outright reds nothing.
 *
 * The two cells below are the ones where it decides. Each needs a SECOND guard,
 * on the other phase, to keep the pipeline alive while the phase under test is
 * skipped — that is what the assertion on the other guard's count is for: it
 * proves the walk actually ran.
 */

describe("per-phase short-circuits (runPhase)", () => {
  let router: Router | undefined;

  afterEach(() => {
    router?.dispose();
    router = undefined;
  });

  it("forceDeactivate skips the deactivate phase even when the guard walk runs", async () => {
    router = createRouter([
      { name: "home", path: "/home" },
      { name: "admin", path: "/admin" },
    ]);

    const lifecycle = getLifecycleApi(router);
    let deactivateAsks = 0;
    let activateAsks = 0;

    lifecycle.addDeactivateGuard("home", () => () => {
      deactivateAsks++;

      return false;
    });

    // THE second guard: it makes `hasGuards` true, so the navigation runs the
    // walk instead of разрез А, and the short-circuit is the only thing left
    // between `forceDeactivate` and the refusing guard above.
    lifecycle.addActivateGuard("admin", () => () => {
      activateAsks++;

      return true;
    });

    await router.start("/home");

    await expect(
      router.navigate("admin", {}, undefined, { forceDeactivate: true }),
    ).resolves.toMatchObject({ name: "admin" });

    expect(deactivateAsks).toBe(0);
    // The control: the walk did run — without this the test would pass on a
    // navigation that never reached `runPhase`.
    expect(activateAsks).toBe(1);
  });

  it("a navigation INTO UNKNOWN_ROUTE skips the activate phase", async () => {
    router = createRouter([{ name: "home", path: "/home" }]);

    const lifecycle = getLifecycleApi(router);
    let deactivateAsks = 0;
    let unknownActivateAsks = 0;

    // The control guard, and the reason the walk runs at all.
    lifecycle.addDeactivateGuard("home", () => () => {
      deactivateAsks++;

      return true;
    });

    // Bare core registers a guard for a name it does not have (the existence
    // check is the validation plugin's), which is what makes the skip
    // OBSERVABLE: with the term gone this guard is asked.
    lifecycle.addActivateGuard(UNKNOWN_ROUTE, () => () => {
      unknownActivateAsks++;

      return true;
    });

    await router.start("/home");

    // `navigateToState` is the door URL plugins use, and it lets UNKNOWN_ROUTE
    // through on purpose (the `hasRoute` refusal beside it excludes that one
    // name), so this is the arc that reaches `runPhase` with nothing to
    // activate but a non-empty `toActivate`.
    const committed = await getPluginApi(router).navigateToState({
      name: UNKNOWN_ROUTE,
      params: {},
      search: {},
      path: "/nope",
    } as State);

    expect(committed.name).toBe(UNKNOWN_ROUTE);
    expect(unknownActivateAsks).toBe(0);
    expect(deactivateAsks).toBe(1);
  });
});
