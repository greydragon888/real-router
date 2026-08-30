// #1977 — the guard-origin parameter is REQUIRED, so every caller commits to a
// lane. The clear side already states this rule for itself ("there is no
// origin-blind default, so every caller commits to a lane and a new call site
// cannot silently clear both", `clearCanActivate`'s docblock); the add side
// carried the opposite — a default set to the MINORITY polarity, so three of
// four in-repo callers had to remember `true`.
//
// Measured before the fix: a definition-lane registration that omits the
// argument files the guard in the EXTERNAL map, where `clearDefinitionGuards()`
// does not reach it — `replace()` then keeps a guard belonging to a tree that no
// longer exists (1 surviving guard against 0 for the same call WITH the
// argument).
//
// The pin is type-level because the fix is: re-adding `= false` makes the
// two-argument call below compile, which turns the directive into an unused one
// and reds `type-check`. There is no runtime half — both lanes already behave
// correctly once a caller names one.

import { describe, expect, it } from "vitest";

import { createRouter } from "@real-router/core";
import { getInternals } from "@real-router/core/validation";

describe("core/route-lifecycle/guard origin is required (#1977)", () => {
  it("refuses a registration that does not name its lane", () => {
    const router = createRouter([{ name: "a", path: "/a" }]);

    const ns = getInternals(router).routeGetStore().lifecycleNamespace!;

    // @ts-expect-error -- the origin argument is required (#1977)
    ns.addCanActivate("a", () => () => true);
    // @ts-expect-error -- the origin argument is required (#1977)
    ns.addCanDeactivate("a", () => () => true);

    // Naming the lane compiles, and both lanes stay reachable.
    ns.addCanActivate("a", () => () => true, true);
    ns.addCanDeactivate("a", () => () => true, false);

    expect(ns.getHandlerCount("activate")).toBe(1);
  });
});
