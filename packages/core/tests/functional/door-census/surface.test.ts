import { describe, expect, it } from "vitest";

import { createRouter, getNavigator } from "@real-router/core";
import {
  getDependenciesApi,
  getLifecycleApi,
  getPluginApi,
  getRoutesApi,
} from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

import type { Router } from "@real-router/core/types";

/**
 * The composition of every surface a consumer can hold, derived from the LIVE
 * object (#2303).
 *
 * ⚑ **`getOwnPropertyNames`, never `Object.keys`.** Two other censuses already
 * derive composition — `handed-out-containers-1957` and `read-count-authority` —
 * and both read enumerable keys only. Measured: a non-enumerable member added to
 * `getPluginApi` leaves the whole core suite green, because nothing calls a
 * phantom. The gap is empty today, so their counts agree with these by
 * COMPOSITION rather than by construction.
 *
 * ⚠ **A symbol is what every earlier census missed.** `Router` carries exactly
 * one own symbol (#2294's brand) and no string census can see it — the parity
 * authority next door filters `typeof k === "string"` by construction.
 *
 * ⚠ **Accessors live one level DOWN, not on these surfaces.** All seven named
 * surfaces have zero; the two optional diagnostic sinks are accessors on
 * `port()`, which is why the second-level table below exists.
 */
describe("surface census (#2303)", () => {
  const ROUTES = [{ name: "a", path: "/a?q" }];
  const make = (): Router => createRouter(ROUTES);

  const names = (o: object): string[] =>
    Object.getOwnPropertyNames(o).toSorted((x, y) => x.localeCompare(y));

  const accessorNames = (o: object): string[] =>
    Object.getOwnPropertyNames(o)
      .filter((k) => Object.getOwnPropertyDescriptor(o, k)?.get !== undefined)
      .toSorted((x, y) => x.localeCompare(y));

  const INTERNALS = [
    "addEventListener",
    "buildPathResolved",
    "buildStateResolved",
    "contextClaimRecords",
    "dependenciesGetStore",
    "emitTransitionError",
    "forwardState",
    "getAdoptedOrigins",
    "getCloneState",
    "getDeclaredQueryNames",
    "getMetaForState",
    "getOptions",
    "getRootPath",
    "getStateName",
    "getTree",
    "interceptors",
    "isDisposed",
    "isTransitioning",
    "logger",
    "makeState",
    "matchPath",
    "navigateToNotFound",
    "navigateToState",
    "port",
    "revalidateToNotFound",
    "routeGetStore",
    "routerExtensions",
    "setRootPath",
    "start",
    "systemCommit",
    "treeChanged",
    "validator",
  ];

  const PLUGIN_API = [
    "addEventListener",
    "addInterceptor",
    "buildNavigationState",
    "buildPathResolved",
    "claimContextNamespace",
    "emitTransitionError",
    "extendRouter",
    "forwardState",
    "getAdoptedOrigins",
    "getDeclaredQueryNames",
    "getDependencyKeys",
    "getExternalGuardNames",
    "getForwardMap",
    "getOptions",
    "getResolvedLimits",
    "getRootPath",
    "getRouteConfig",
    "getTree",
    "getUrlParams",
    "logger",
    "makeState",
    "matchPath",
    "navigateToState",
    "setRootPath",
  ];

  const FACADE = [
    "areStatesEqual",
    "buildPath",
    "canNavigateTo",
    "dispose",
    "getPreviousState",
    "getState",
    "isActive",
    "isActiveRoute",
    "isLeaveApproved",
    "navigate",
    "navigateToDefault",
    "navigateToNotFound",
    "shouldUpdateNode",
    "start",
    "stop",
    "subscribe",
    "subscribeLeave",
    "usePlugin",
  ];

  it("composition — every member of every surface, by own NAME", () => {
    const r = make();

    expect(names(getInternals(r) as unknown as object)).toStrictEqual(
      INTERNALS,
    );
    expect(names(getPluginApi(r) as unknown as object)).toStrictEqual(
      PLUGIN_API,
    );
    expect(names(getRoutesApi(r) as unknown as object)).toStrictEqual([
      "add",
      "clear",
      "get",
      "has",
      "remove",
      "replace",
      "subscribeChanges",
      "update",
    ]);
    expect(names(getNavigator(r) as unknown as object)).toStrictEqual([
      "canNavigateTo",
      "getState",
      "isActiveRoute",
      "isLeaveApproved",
      "navigate",
      "subscribe",
      "subscribeLeave",
    ]);
    expect(names(getDependenciesApi(r) as unknown as object)).toStrictEqual([
      "get",
      "getAll",
      "has",
      "remove",
      "reset",
      "set",
      "setAll",
    ]);
    expect(names(getLifecycleApi(r) as unknown as object)).toStrictEqual([
      "addActivateGuard",
      "addDeactivateGuard",
      "removeActivateGuard",
      "removeDeactivateGuard",
    ]);

    expect(names(r as unknown as object)).toStrictEqual(FACADE);
    expect(
      names(Object.getPrototypeOf(r) as object),
      "the prototype carries the same doors plus `constructor`",
    ).toStrictEqual(
      ["constructor", ...FACADE].toSorted((x, y) => x.localeCompare(y)),
    );
  });

  it("the facade's own SYMBOL — the member no string census can see (#2294)", () => {
    const r = make();

    expect(Object.getOwnPropertySymbols(r as unknown as object)).toHaveLength(
      1,
    );

    for (const surface of [
      getInternals(r),
      getPluginApi(r),
      getRoutesApi(r),
      getNavigator(r),
      getDependenciesApi(r),
      getLifecycleApi(r),
    ]) {
      expect(
        Object.getOwnPropertySymbols(surface as unknown as object),
      ).toHaveLength(0);
    }
  });

  it("cached ⟹ frozen, and the two uncached factories are neither", () => {
    const r = make();

    const table = [
      { name: "getInternals", o: getInternals(r), again: getInternals(r) },
      { name: "getPluginApi", o: getPluginApi(r), again: getPluginApi(r) },
      { name: "getRoutesApi", o: getRoutesApi(r), again: getRoutesApi(r) },
      { name: "getNavigator", o: getNavigator(r), again: getNavigator(r) },
      {
        name: "getDependenciesApi",
        o: getDependenciesApi(r),
        again: getDependenciesApi(r),
      },
      {
        name: "getLifecycleApi",
        o: getLifecycleApi(r),
        again: getLifecycleApi(r),
      },
    ].map((row) => ({
      name: row.name,
      cached: row.o === row.again,
      frozen: Object.isFrozen(row.o as unknown as object),
      sealed: Object.isSealed(row.o as unknown as object),
    }));

    // ⚠ `getInternals` is the one cached-but-unfrozen surface, and that is the
    // `LIVE_BY_CONTRACT` carve-out `factory-surface-freeze-authority-1805` owns:
    // the handle exists to hand out core's live stores. (`handed-out-containers-1957`
    // was named here and does not carry the carve-out at all.)
    expect(table).toStrictEqual([
      { name: "getInternals", cached: true, frozen: false, sealed: false },
      { name: "getPluginApi", cached: true, frozen: true, sealed: true },
      { name: "getRoutesApi", cached: true, frozen: true, sealed: true },
      { name: "getNavigator", cached: true, frozen: true, sealed: true },
      {
        name: "getDependenciesApi",
        cached: false,
        frozen: false,
        sealed: false,
      },
      { name: "getLifecycleApi", cached: false, frozen: false, sealed: false },
    ]);
  });

  it("no named surface carries an accessor — they live one level down", () => {
    const r = make();
    const i = getInternals(r);

    for (const surface of [
      i,
      getPluginApi(r),
      getRoutesApi(r),
      getNavigator(r),
      getDependenciesApi(r),
      getLifecycleApi(r),
      r,
    ]) {
      expect(accessorNames(surface as unknown as object)).toStrictEqual([]);
    }

    expect(
      accessorNames(i.port() as unknown as object),
      "the opt-in diagnostic sinks — absent for REAL in bare core (#1584)",
    ).toStrictEqual(["reportDroppedQueryKey", "reportUndeclaredParamKey"]);
    expect(accessorNames(i.routeGetStore() as unknown as object)).toStrictEqual(
      ["definitions"],
    );
  });

  it("what the members HAND BACK — the second level", () => {
    const r = make();
    const i = getInternals(r);

    // ⚑ CACHED is measured, not asserted in prose. The freeze rule is
    // "cached ⟹ frozen" (#1805), so the row that carries the verdict must carry
    // the term it turns on: two calls, one `===`. Without it the `getCloneState`
    // comment below was the only thing standing between "unfrozen by design"
    // and "unfrozen by oversight", and a comment is not a measurement (#2343).
    const row = (take: () => object) => {
      const first = take();

      return {
        n: Object.getOwnPropertyNames(first).length,
        frozen: Object.isFrozen(first),
        cached: first === take(),
      };
    };

    expect({
      port: row(() => i.port() as unknown as object),
      routeGetStore: row(() => i.routeGetStore() as unknown as object),
      dependenciesGetStore: row(
        () => i.dependenciesGetStore() as unknown as object,
      ),
      getTree: row(() => i.getTree() as object),
      getOptions: row(() => i.getOptions() as unknown as object),
      // ⚠ A fresh literal per call, so a freeze here would certify nothing
      // (#2195) — the one row that is unfrozen by design rather than by oversight.
      // `cached: false` below is what makes that sentence checkable.
      getCloneState: row(() => i.getCloneState() as unknown as object),
    }).toStrictEqual({
      port: { n: 10, frozen: false, cached: true },
      routeGetStore: { n: 16, frozen: false, cached: true },
      dependenciesGetStore: { n: 2, frozen: false, cached: true },
      getTree: { n: 9, frozen: true, cached: true },
      getOptions: { n: 10, frozen: true, cached: true },
      getCloneState: { n: 6, frozen: false, cached: false },
    });
  });

  it("composition across the lifecycle — and a plugin MOVES the facade's", async () => {
    const started = make();

    await started.start("/a");

    const disposed = make();

    disposed.dispose();

    const extended = make();

    getPluginApi(extended).extendRouter({ mine: () => 1 });

    const own = (r: Router) => Object.getOwnPropertyNames(r).length;

    // ⚑ `extendRouter` writes onto the live router by contract (#2243), so the
    // facade's composition is NOT invariant — which is the same reason #2259
    // gave for refusing a tier whose contract depends on the plugins loaded.
    expect({
      unstarted: own(make()),
      started: own(started),
      disposed: own(disposed),
      extended: own(extended),
    }).toStrictEqual({
      unstarted: 18,
      started: 18,
      disposed: 18,
      extended: 19,
    });

    // `dispose()` rewrites members in place rather than removing them, which is
    // why freezing the facade is structurally unavailable.
    expect(
      Object.getOwnPropertyNames(getInternals(disposed) as object),
    ).toHaveLength(INTERNALS.length);

    started.stop();
  });
});
