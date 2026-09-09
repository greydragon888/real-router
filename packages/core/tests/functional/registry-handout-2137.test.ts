import { beforeEach, describe, expect, it } from "vitest";

import { createRouter } from "@real-router/core";
import { getRoutesApi } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

import type { Router } from "@real-router/core/types";

/**
 * The query- and path-name registries are CORE's objects, cached per route in
 * the routes store — and `queryParamsFor` returns the cache entry itself. Four
 * doors hand the same arrays out, so a caller that mutates one is editing the
 * table the channel guard and the mode gate consult on every navigation.
 *
 * ⚠ **The mode decides whether any of it is observable, and the default hides
 * it.** `queryParamsMode` defaults to `"loose"`, which admits an undeclared
 * query key regardless of the registry — so every cell below that reads
 * `state.search` runs under `"strict"`, and the `loose` control records why a
 * probe written without the mode axis measures nothing. Measured on `master`
 * `2f9908945`, one push of an undeclared name:
 *
 * | mode | `state.search` with the push | without it |
 * | --- | --- | --- |
 * | `strict` / `default` | `{"tab":"x","nope":"z"}` | `{"tab":"x"}` |
 * | `loose` (the default) | `{"tab":"x","nope":"z"}` | `{"tab":"x","nope":"z"}` |
 */
describe("the name registries are core's own, and handed out sealed (#2137)", () => {
  let router: Router;

  const ROUTES = [{ name: "q", path: "/q/:id?tab" }];

  function queryReg(r: Router): readonly string[] {
    return getInternals(r).getQueryParams("q");
  }

  function portOf(r: Router) {
    return getInternals(r).port();
  }

  beforeEach(() => {
    router = createRouter(ROUTES, { queryParamsMode: "strict" });
  });

  it("every door hands back a frozen array, and the two query doors hand back the same one", async () => {
    await router.start("/q/1");

    const fromInternals = queryReg(router);
    const port = portOf(router);
    const fromPort = port.queryNames("q");
    const pathNames = port.pathNames("q");
    const declared = getInternals(router)
      .routeGetStore()
      .matcher.getDeclaredQueryParams("q");

    expect(fromInternals, "present").toBeDefined();
    expect(Object.isFrozen(fromInternals), "getQueryParams frozen").toBe(true);
    expect(Object.isFrozen(fromPort), "port.queryNames frozen").toBe(true);

    expect(pathNames, "present").toBeDefined();
    expect(Object.isFrozen(pathNames), "port.pathNames frozen").toBe(true);

    expect(declared, "present").toBeDefined();
    expect(
      Object.isFrozen(declared),
      "matcher.getDeclaredQueryParams frozen",
    ).toBe(true);

    // Not a defect — the two query doors are one cache entry by design, and
    // sealing it is what makes sharing safe rather than something to undo.
    expect(fromInternals, "one cache entry, two doors").toBe(fromPort);
  });

  it("a push into the query registry cannot make an undeclared key declared", async () => {
    await router.start("/q/1");

    const reg = queryReg(router) as string[];

    expect(() => reg.push("nope"), "the write is refused").toThrow(TypeError);

    const state = getInternals(router).makeState(
      "q",
      { id: "1" },
      { tab: "x", nope: "z" },
      "/q/1",
    );

    expect(state.search, "the undeclared key stays out").toStrictEqual({
      tab: "x",
    });
    expect(queryReg(router), "the registry is unchanged").toStrictEqual([
      "tab",
    ]);
  });

  it("emptying the query registry cannot drop a declared key from state or URL", async () => {
    await router.start("/q/1");

    const reg = queryReg(router) as string[];

    expect(() => {
      reg.length = 0;
    }, "the write is refused").toThrow(TypeError);

    const state = getInternals(router).makeState(
      "q",
      { id: "1" },
      { tab: "x" },
      "/q/1",
    );

    expect(state.search, "the declared key survives").toStrictEqual({
      tab: "x",
    });
    expect(
      router.buildPath("q", { id: "1" }, { tab: "x" }),
      "and still prints",
    ).toBe("/q/1?tab=x");
  });

  it("a push into pathNames cannot evict a declared query name — the cold-cache order too", async () => {
    // ⚠ The ORDER is the whole cell. `queryParamsFor` computes
    // `declared.filter(p => !urlParams.includes(p))` ONCE and caches it, so a
    // push into the path-name registry only reaches that subtraction while the
    // query cache is still cold. Warm it first and the same push is inert —
    // which is how this half of the defect reads as absent when probed after a
    // navigation.
    const reg = portOf(router).pathNames("q") as string[];

    expect(() => reg.push("tab"), "the write is refused").toThrow(TypeError);

    await router.start("/q/1");

    expect(queryReg(router), "the query name is still declared").toStrictEqual([
      "tab",
    ]);
    expect(
      router.buildPath("q", { id: "1" }, { tab: "x" }),
      "and still prints",
    ).toBe("/q/1?tab=x");
  });

  it("the cached registry is a plain Array, whatever constructor the source carries", async () => {
    // `Array.prototype.filter` performs ArraySpeciesCreate on its RECEIVER, so
    // a `constructor` planted on the matcher's declared list decides the class
    // of the object core caches and then reads on every navigation. ⚠ NOT via
    // `includes` — the channel guard iterates (`for (const key of queryNames)`),
    // so what a subclass would intercept is the iterator and `length`, and the
    // `includes` core does call is the subtraction inside `queryParamsFor`.
    class Sneaky extends Array<string> {
      override includes(): boolean {
        return true;
      }
    }

    const declared = getInternals(router)
      .routeGetStore()
      .matcher.getDeclaredQueryParams("q");

    expect(declared, "present").toBeDefined();

    // ⚠ Asserted as a THROW, not swallowed. An earlier form of this cell wrapped
    // the plant in `try/catch` and then checked the built class — which passes
    // whether the plant was refused OR the build simply happens not to use
    // species, so it discriminated nothing. Measured: it stayed green with the
    // source freeze reverted AND with the species-free build reverted.
    expect(() => {
      Object.defineProperty(declared as object, "constructor", {
        value: Sneaky,
        configurable: true,
      });
    }, "the plant is refused by the sealed source").toThrow(TypeError);

    const built = queryReg(router);

    expect(built, "present").toBeDefined();
    expect(built instanceof Sneaky, "not the caller's class").toBe(false);
    expect(Object.getPrototypeOf(built), "core's own Array prototype").toBe(
      Array.prototype,
    );
  });

  it("CONTROL — loose admits an undeclared key with no registry write at all", async () => {
    // The reason every cell above pins `strict`: under the DEFAULT mode the
    // undeclared key is admitted anyway, so a probe that omits the mode axis
    // measures the mode and reports it as the defect.
    const loose = createRouter(ROUTES, { queryParamsMode: "loose" });

    await loose.start("/q/1");

    const state = getInternals(loose).makeState(
      "q",
      { id: "1" },
      { tab: "x", nope: "z" },
      "/q/1",
    );

    expect(state.search, "loose admits it untouched").toStrictEqual({
      tab: "x",
      nope: "z",
    });

    loose.stop();
  });

  it("CONTROL — a route-table change rebuilds the registries, and they stay frozen", async () => {
    await router.start("/q/1");

    getRoutesApi(router).add([{ name: "z", path: "/z" }]);

    const rebuilt = queryReg(router);

    expect(rebuilt, "present").toBeDefined();
    expect(rebuilt, "same declarations").toStrictEqual(["tab"]);
    expect(Object.isFrozen(rebuilt), "the fresh entry is frozen too").toBe(
      true,
    );
  });
});
