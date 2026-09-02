import { describe, expect, it } from "vitest";

import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

import type { Route } from "@real-router/core/types";

/**
 * The `forwardTo` seam hands core's own bag onward (#1848).
 *
 * On a hop carrying no defaults `mergeDefined(undefined, bag)` hands the bag
 * back by reference, so without a guard the seam leaks the caller's object to
 * `canonicalize`, which reads it again. The read COUNT is pinned by the
 * forwarding rows in `read-count-authority.test.ts`.
 *
 * ⚑ This file pins the OTHER half, and it exists because mutation said the
 * count alone does not: removing the `normalizeChannel` wrapper leaves every
 * count at 1 and the whole suite green, because what that wrapper buys is not a
 * count — it is that the seam keeps handing on a bag with the same SHAPE it
 * always had. `forwardState` is a public interception point and
 * `@real-router/persistent-params-plugin` sits on it.
 */
describe("the forwardTo seam's output keeps its shape (#1848)", () => {
  const ROUTES = (): Route[] => [
    { name: "u", path: "/u/:id?tab" },
    { name: "src", path: "/src/:id?tab", forwardTo: "u" },
    { name: "elsewhere", path: "/elsewhere" },
  ];

  it("an undefined-valued key never reaches a forwardState interceptor", async () => {
    // Required to stay: the seam's own `normalizeChannel` removes these keys on
    // the way through, so an interceptor never sees them. Measured by mutation —
    // dropping that call reds this cell.
    const router = createRouter(ROUTES());
    const seen: { params: string[]; search: string[] }[] = [];

    getPluginApi(router).addInterceptor(
      "forwardState",
      (next, name, params, search) => {
        const resolved = next(name, params, search);

        seen.push({
          params: Object.keys(resolved.params ?? {}),
          search: Object.keys(resolved.search ?? {}),
        });

        return resolved;
      },
    );

    await router.start("/elsewhere");
    await router.navigate(
      "src",
      { id: "7", dropMe: undefined } as never,
      { tab: "x", alsoDrop: undefined } as never,
    );

    const atTheHop = seen.at(-1);

    expect(atTheHop?.params).toStrictEqual(["id"]);
    expect(atTheHop?.search).toStrictEqual(["tab"]);

    router.dispose();
  });

  it("the seam does not hand back the caller's own object", async () => {
    // The leak stated directly rather than through a read count: whatever the
    // interceptor receives must not BE the object the caller passed.
    const router = createRouter(ROUTES());
    const callerParams = { id: "7" };
    const callerSearch = { tab: "x" };
    let sameParams = false;
    let sameSearch = false;

    getPluginApi(router).addInterceptor(
      "forwardState",
      (next, name, params, search) => {
        const resolved = next(name, params, search);

        sameParams ||= resolved.params === (callerParams as never);
        sameSearch ||= resolved.search === (callerSearch as never);

        return resolved;
      },
    );

    await router.start("/elsewhere");
    await router.navigate("src", callerParams as never, callerSearch as never);

    expect(sameParams, "the params bag must be core's own").toBe(false);
    expect(sameSearch, "the search bag must be core's own").toBe(false);

    router.dispose();
  });

  it("CONTROL — the committed state and the URL are what they always were", async () => {
    const router = createRouter(ROUTES());

    await router.start("/elsewhere");

    const state = await router.navigate(
      "src",
      { id: "7", dropMe: undefined } as never,
      { tab: "x", alsoDrop: undefined } as never,
    );

    expect(state.name).toBe("u");
    expect(state.params).toStrictEqual({ id: "7" });
    expect(state.search).toStrictEqual({ tab: "x" });
    expect(state.path).toBe("/u/7?tab=x");

    router.dispose();
  });
});
