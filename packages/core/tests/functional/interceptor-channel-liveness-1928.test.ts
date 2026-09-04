// #1928 — the bag an interceptor is handed is LIVE, on every route shape.
//
// `addInterceptor` is a plugin right: core hands the interceptor the real path
// bag, not a copy and not a frozen view — and it must do so UNIFORMLY, never
// deciding by a property of the ROUTE the plugin never sees. That uniformity is
// what #1928 reported missing, and it is a claim about the seam that exists,
// not about the one it was reported on.
//
// The resolution is symmetry towards LIVE, not towards frozen: the published
// state's `params` is frozen by `materialize` at the publication boundary
// (#1598), so a freeze before the chain would only make the interceptor weaker
// with nothing gained downstream.
//
// ⚠ Both halves are asserted together on purpose. "The interceptor sees a live
// bag" is only safe while "the committed state is still frozen" holds — drop the
// second and this file would green a fix that simply stopped freezing.
import { describe, expect, it } from "vitest";

import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

import { installSpyValidator } from "../helpers/spyValidator";

import type { Params } from "@real-router/core/types";

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
    "forwardState",
    (next, name, params, search) => {
      frozenAtInterceptor.set(name, Object.isFrozen(params));

      return next(name, params, search);
    },
  );

  return { router, frozenAtInterceptor };
}

describe("#1928 — the interceptor's params bag", () => {
  it("is live on EVERY route shape, not only the fast-path one", async () => {
    const { router, frozenAtInterceptor } = routerWithProbe();

    await router.start("/plain/0");

    for (const route of ROUTES) {
      await router.navigate(route.name, { id: "7" });
    }

    for (const route of ROUTES) {
      expect(
        frozenAtInterceptor.get(route.name),
        `route "${route.name}" handed the interceptor a frozen bag`,
      ).toBe(false);
    }
  });

  it("covers EVERY producer that reaches the seam, not just navigate", async () => {
    // The issue's radius is producers × route shapes, and the cell above walks
    // one shape axis only. ⚠ `makeState` is deliberately absent: it reaches no
    // seam at all — `seam-coverage-authority-1938` owns that row — so a probe
    // for it here would assert an interceptor that never runs.
    const router = createRouter([
      { name: "plain", path: "/plain/:id" },
      { name: "wdefault", path: "/wd/:id", defaultParams: { id: "1" } },
    ]);
    const frozen: Record<string, boolean[]> = {};
    let current = "";

    getPluginApi(router).addInterceptor(
      "forwardState",
      (next, name, params, search) => {
        frozen[current] ??= [];
        frozen[current].push(Object.isFrozen(params));

        return next(name, params, search);
      },
    );

    await router.start("/plain/0");

    // ⚠ Boot runs the seam too (the URL→State door), so its rows would land in
    // an unnamed bucket and inflate the closed count below.
    for (const key of Object.keys(frozen)) {
      delete frozen[key];
    }

    const api = getPluginApi(router);

    for (const route of ["plain", "wdefault"]) {
      current = `navigate:${route}`;
      await router.navigate(route, { id: "7" });
      current = `buildPath:${route}`;
      router.buildPath(route, { id: "7" });
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

    // The enumeration is CLOSED: four producers × two route shapes, and a
    // producer added later without a row here would leave the count short.
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

  it("REPORTS a key the chain adds — the seam is ABOVE the diagnostics", async () => {
    // The positive form of what #1928 reported. The defect was a chain running
    // BELOW the print, so a key it added was invisible to the one layer whose
    // job is to report it — measured then with the real plugin installed, ZERO
    // warnings for a state that contradicted its own path. With no seam below
    // the merge (#1938) the order is fixed by construction, and this is the
    // cell that fails if a seam is ever added there again.
    const { router } = routerWithProbe();
    const validator = installSpyValidator(router);

    getPluginApi(router).addInterceptor(
      "forwardState",
      (next, name, params, search) => {
        const result = next(name, params, search);

        if (name === "plain") {
          (result.params as Record<string, unknown>).leaked = "LATE";
        }

        return result;
      },
    );

    await router.start("/plain/0");
    await router.navigate("plain", { id: "9" });

    expect(validator.state.reportUndeclaredParamKey).toHaveBeenCalledWith(
      "plain",
      "leaked",
    );

    // The key is KEPT, not stripped — an undeclared path param rides
    // `state.params` without printing, exactly as it does from any caller.
    // REPORTING is the guarantee here; removal is not, and asserting it would
    // pin a behaviour core does not have.
    const state = router.getState();

    expect(state?.path).toBe("/plain/9");
    expect(Object.hasOwn(state?.params ?? {}, "leaked")).toBe(true);
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
