// #1928 — the bag a `buildPath` interceptor is handed is LIVE, on every route.
//
// `addInterceptor` is a plugin right: core hands the interceptor the real path
// bag, not a copy and not a frozen view. What #1928 reported is that it did so
// INCONSISTENTLY — a route with no defaults and no declared query param took
// `canonicalize`'s fast path and got an unfrozen bag, while any other route got
// one frozen by the merge's owned branch (`mergeWithDefault`, since split). Same plugin, two behaviours,
// decided by a property of the ROUTE the plugin never sees.
//
// The resolution is symmetry towards LIVE, not towards frozen: the published
// state's `params` is frozen by `materialize` at the publication boundary
// (#1598), so the merge-time freeze bought nothing a consumer can observe and
// only produced the split. Freezing before the chain instead would have made the
// interceptor weaker on the arc where it works today.
//
// ⚠ Both halves are asserted together on purpose. "The interceptor sees a live
// bag" is only safe while "the committed state is still frozen" holds — drop the
// second and this file would green a fix that simply stopped freezing.
import { describe, expect, it } from "vitest";

import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

import { installSpyValidator } from "../helpers/spyValidator";

import type { Params, SearchParams } from "@real-router/core/types";

/** Every shape that decides which branch of `canonicalize` a route takes. */
const ROUTES = [
  { name: "plain", path: "/plain/:id" },
  { name: "wdefault", path: "/wd/:id", defaultParams: { id: "1" } },
  { name: "qdeclared", path: "/q/:id?tag" },
  { name: "wsdefault", path: "/ws/:id?tag", defaultSearch: { tag: "d" } },
] as const;

function routerWithProbe(): {
  router: ReturnType<typeof createRouter>;
  frozenAtInterceptor: Map<string, boolean>;
} {
  const router = createRouter(ROUTES.map((r) => ({ ...r })));
  const frozenAtInterceptor = new Map<string, boolean>();

  getPluginApi(router).addInterceptor(
    "buildPath",
    (
      next: (n: string, p?: Params, s?: SearchParams) => string,
      name: string,
      params?: Params,
      search?: SearchParams,
    ) => {
      frozenAtInterceptor.set(name, Object.isFrozen(params));

      return next(name, params, search);
    },
  );

  return { router, frozenAtInterceptor };
}

describe("#1928 — the buildPath interceptor's bag", () => {
  it("is live on EVERY route shape, not only the fast-path one", async () => {
    const { router, frozenAtInterceptor } = routerWithProbe();

    await router.start("/plain/0");

    for (const route of ROUTES) {
      await router.navigate(route.name, { id: "7" });
    }

    // The whole defect: this map used to read
    // `plain=false, wdefault=true, qdeclared=true, wsdefault=true`.
    for (const route of ROUTES) {
      expect(
        frozenAtInterceptor.get(route.name),
        `route "${route.name}" handed the interceptor a frozen bag`,
      ).toBe(false);
    }
  });

  it("covers all FOUR producers the issue enumerates, not just navigate", async () => {
    // Vector 6 — the issue's own radius table names four producers × two route
    // shapes, and the cell above walks one of them. Measured against the issue:
    // pre-fix, `buildNavigationState` was frozen on BOTH shapes while the other
    // three were frozen only WITH a default, so a test built on `navigate` alone
    // would have said nothing about the row that behaved differently.
    //
    // ⚠ `makeState` must be called WITHOUT the third argument: `{}` is neither
    // `undefined` nor the EMPTY_SEARCH singleton, so an empty literal sends the
    // call down the slow path and the probe stops measuring the arm it names. A
    // first version of this cell passed `{}` and reported the one row of the
    // issue's table it could not reproduce.
    const router = createRouter([
      { name: "plain", path: "/plain/:id" },
      { name: "wdefault", path: "/wd/:id", defaultParams: { id: "1" } },
    ]);
    const frozen: Record<string, boolean[]> = {};
    let current = "";

    getPluginApi(router).addInterceptor(
      "buildPath",
      (
        next: (n: string, p?: Params, s?: SearchParams) => string,
        name: string,
        params?: Params,
        search?: SearchParams,
      ) => {
        frozen[current] ??= [];
        frozen[current].push(Object.isFrozen(params));

        return next(name, params, search);
      },
    );

    await router.start("/plain/0");

    const api = getPluginApi(router);

    for (const route of ["plain", "wdefault"]) {
      current = `navigate:${route}`;
      await router.navigate(route, { id: "7" });
      current = `makeState:${route}`;
      api.makeState(route, { id: "7" });
      current = `canNavigateTo:${route}`;
      router.canNavigateTo(route, { id: "7" });
      current = `buildNavigationState:${route}`;
      api.buildNavigationState(route, { id: "7" });
    }

    for (const [cell, values] of Object.entries(frozen)) {
      expect(values.length, `${cell} — interceptor never ran`).toBeGreaterThan(
        0,
      );
      expect(
        values,
        `${cell} handed the interceptor a frozen bag`,
      ).toStrictEqual(values.map(() => false));
    }

    // The enumeration is CLOSED: eight cells, and a producer added later without
    // a row here would leave the count short.
    expect(Object.keys(frozen)).toHaveLength(8);
  });

  it("still publishes a FROZEN params bag on every route shape", async () => {
    // The control for the assertion above. `materialize` owns this freeze, and
    // it must not travel with the merge-time one that was removed.
    const { router } = routerWithProbe();

    await router.start("/plain/0");

    for (const route of ROUTES) {
      await router.navigate(route.name, { id: "8" });

      expect(
        Object.isFrozen(router.getState()?.params),
        `route "${route.name}" published a writable params bag`,
      ).toBe(true);
    }
  });

  it("does not let an interceptor write reach the committed state unseen", async () => {
    // The reported symptom, kept as a behavioural row: a write inside the chain
    // lands in `state.params` AFTER the URL was printed from it, so the state
    // contradicts its own path. Core does not stop it — that is the plugin's
    // business (`decodeParams` precedent) — but the divergence must be REACHABLE
    // for the reporter that `@real-router/validation-plugin` installs.
    const { router } = routerWithProbe();

    getPluginApi(router).addInterceptor(
      "buildPath",
      (
        next: (n: string, p?: Params, s?: SearchParams) => string,
        name: string,
        params?: Params,
        search?: SearchParams,
      ) => {
        const url = next(name, params, search);

        if (name === "plain" && params) {
          (params as Record<string, unknown>).leaked = "LATE";
        }

        return url;
      },
    );

    await router.start("/plain/0");
    await router.navigate("plain", { id: "9" });

    const state = router.getState();

    expect(state?.path).toBe("/plain/9");
    expect(Object.hasOwn(state?.params ?? {}, "leaked")).toBe(true);
  });

  it("REPORTS the key the chain added, once a validator is listening", async () => {
    // Part three of the resolution, and the half that makes "the plugin's
    // responsibility" honest: `canonicalize` diagnoses the CALLER's keys before
    // the chain runs, so a key written after `next` was invisible to the one
    // layer whose job is to report it — measured with the real plugin
    // installed, ZERO warnings for a state that contradicts its own path.
    const { router } = routerWithProbe();
    const validator = installSpyValidator(router);

    getPluginApi(router).addInterceptor(
      "buildPath",
      (
        next: (n: string, p?: Params, s?: SearchParams) => string,
        name: string,
        params?: Params,
        search?: SearchParams,
      ) => {
        const url = next(name, params, search);

        if (name === "plain" && params) {
          (params as Record<string, unknown>).leaked = "LATE";
        }

        return url;
      },
    );

    await router.start("/plain/0");
    await router.navigate("plain", { id: "9" });

    expect(validator.state.reportUndeclaredParamKey).toHaveBeenCalledWith(
      "plain",
      "leaked",
    );
  });

  it("asks NOTHING extra when the chain leaves the bag alone", async () => {
    // The control for the row above, and the reason the growth test exists at
    // all: the second look must not double the sink's call count on an ordinary
    // navigation — `producer-agreement-phase2` pins that count, and an
    // unconditional re-walk would have reported every key twice.
    const { router } = routerWithProbe();
    const validator = installSpyValidator(router);

    await router.start("/plain/0");
    await router.navigate("plain", { id: "9", undeclared: "x" } as Params);

    expect(validator.state.reportUndeclaredParamKey).toHaveBeenCalledTimes(1);
  });
});
