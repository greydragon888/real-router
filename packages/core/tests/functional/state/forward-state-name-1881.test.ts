import { describe, expect, it } from "vitest";

import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

/**
 * `forwardState` and `buildNavigationState` resolve a route NAME, and a
 * non-string is not one (#1881).
 *
 * `forwardState` is the laundering step: it is a resolver, not a builder, so it
 * has no closed failure mode of its own — what it did was turn the caller's
 * object into a plain STRING, which is exactly why the existence check
 * downstream (a `Map`, so SameValueZero) never saw the object and
 * `buildNavigationState` returned a valid state through the `forwardTo` arm.
 */
const ROUTES = [
  { name: "home", path: "/home", defaultParams: { via: "a" } },
  { name: "fwd", path: "/fwd", forwardTo: "home" },
  { name: "plain", path: "/plain" },
];

const counting = (answer: string) => {
  let reads = 0;

  return {
    bag: {
      toString: () => {
        reads += 1;

        return answer;
      },
    },
    get reads(): number {
      return reads;
    },
  };
};

describe("forwardState refuses to resolve a non-string name (#1881)", () => {
  it("hands the name back untouched instead of laundering it into a string", () => {
    const probe = counting("fwd");
    const router = createRouter(ROUTES, {});
    const api = getPluginApi(router);

    // CONTROL first: the string form still resolves the forward.
    expect(api.forwardState("fwd", {}).name).toBe("home");

    const result = api.forwardState(probe.bag as never, {});

    expect(result.name).toBe(probe.bag);
    // ⚑ The SHAPE of the refusal, not just its name. A mutant returning the raw
    // `search` argument instead of the resolved one survives every other
    // assertion here — the declared type says `search: S`, and handing back
    // `undefined` would break it silently for any consumer that spreads it.
    expect(result.params).toStrictEqual({});
    expect(result.search).toStrictEqual({});
    expect(probe.reads).toBe(0);

    router.dispose();
  });

  it("buildNavigationState reads the name ZERO times — it fails closed either way", () => {
    // ⚑ The title names the READ COUNT deliberately. Deleting this gate leaves
    // the answer `undefined` regardless, because the `forwardState` gate above
    // is a common backstop and the downstream Map lookup misses either way.
    // Only the counter discriminates, and the two coercions it saves are the
    // whole reason a second gate exists.
    const probe = counting("fwd");
    const router = createRouter(ROUTES, {});
    const api = getPluginApi(router);

    // CONTROL first: the string form still builds through the forward.
    expect(api.buildNavigationState("fwd", {})?.name).toBe("home");

    expect(api.buildNavigationState(probe.bag as never, {})).toBeUndefined();
    expect(probe.reads).toBe(0);

    router.dispose();
  });
});
