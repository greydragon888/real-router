import { createRouter } from "@real-router/core";
import { cloneRouter, getPluginApi } from "@real-router/core/api";
import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { validationPlugin } from "../../src";

import type { QueryParamsMode, Router } from "@real-router/core";

/**
 * The mode gate's opt-in diagnostic (#1575).
 *
 * Core's gate is always-on and SILENT: a query key the active `queryParamsMode`
 * will not print is dropped, so `state.search` never carries what `state.path`
 * cannot show. The drop is correct, but invisible — and the two ways to hit it
 * (an undeclared caller key, a `defaultSearch` for an undeclared key) look
 * nothing alike from outside. This plugin is what makes them visible.
 *
 * Warn, never throw: `queryParamsMode` is a serialization option, not an error
 * policy (RFC §4.7).
 */
const ROUTES = [
  { name: "h", path: "/h" },
  { name: "plain", path: "/plain" },
  { name: "dec", path: "/dec?a" },
  { name: "dead", path: "/dead", defaultSearch: { und: "U" } },
];

let router: Router;
let warnSpy: ReturnType<typeof vi.spyOn>;

function mk(mode: QueryParamsMode): Router {
  const instance = createRouter(ROUTES, { queryParamsMode: mode });

  instance.usePlugin(validationPlugin());

  return instance;
}

describe("validation-plugin — dropped query key diagnostic (#1575)", () => {
  beforeEach(() => {
    // No cache reset here, and that is the point of #1583: the de-dup lives on
    // the validator object, so every `mk()` starts with an empty one.
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
    router.stop();
  });

  it("warns when the caller's undeclared key is dropped under default", async () => {
    router = mk("default");
    await router.start("/h");

    const state = await router.navigate("plain", {}, { foo: "1" });

    expect(state.search).toStrictEqual({});
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]?.[0]).toContain('Query key "foo"');
    expect(warnSpy.mock.calls[0]?.[0]).toContain('route "plain"');
  });

  it("names the dead-config edge for a defaultSearch on an undeclared key", async () => {
    router = mk("default");
    await router.start("/h");

    await router.navigate("dead");

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]?.[0]).toContain('Query key "und"');
    expect(warnSpy.mock.calls[0]?.[0]).toContain("dead config");
  });

  it("stays silent for a DECLARED key — the discriminator", async () => {
    router = mk("default");
    await router.start("/h");

    const state = await router.navigate("dec", {}, { a: "1" });

    expect(state.search).toStrictEqual({ a: "1" });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("stays silent under loose, where nothing is dropped", async () => {
    router = mk("loose");
    await router.start("/h");

    const state = await router.navigate("plain", {}, { foo: "1" });

    expect(state.search).toStrictEqual({ foo: "1" });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("reports the same route+key once, however often the gate runs", async () => {
    router = mk("default");
    await router.start("/h");

    await router.navigate("plain", {}, { foo: "1" });
    await router.navigate("h");
    await router.navigate("plain", {}, { foo: "1" });

    // The gate runs on every navigation and every matchPath; without the de-dup
    // a revisited route would flood the console.
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("warns again for a SECOND router — the cache is per router, not per process (#1583)", async () => {
    // The de-dup exists so a revisited route does not flood the console. It was
    // keyed per PROCESS, so it silenced every router after the first: under SSR
    // or SSG the diagnostic fired for request #1 and never again for the life of
    // the process — the opposite of what a dev-time diagnostic should do.
    router = mk("default");
    await router.start("/h");
    await router.navigate("plain", {}, { foo: "1" });

    expect(warnSpy).toHaveBeenCalledTimes(1);

    const second = mk("default");

    await second.start("/h");
    await second.navigate("plain", {}, { foo: "1" });
    second.stop();

    expect(warnSpy).toHaveBeenCalledTimes(2);

    // …and a clone, which is what an SSR request scope actually uses.
    const clone = cloneRouter(router);

    clone.usePlugin(validationPlugin());
    await clone.start("/h");
    await clone.navigate("plain", {}, { foo: "1" });
    clone.stop();

    expect(warnSpy).toHaveBeenCalledTimes(3);
  });

  it("warns again after the plugin is torn down and re-registered (#1583)", () => {
    // `teardown()` nulls `ctx.validator`; the cache used to survive it, so
    // re-registering bought silence instead of a fresh start.
    //
    // Pre-start on purpose, and that is the reachable shape of this defect
    // rather than a convenience: the plugin REFUSES registration after
    // `start()` (`VALIDATION_PLUGIN_AFTER_START`), so a teardown/re-register
    // cycle can only happen before the router runs. The URL direction is the
    // producer that warns without a start.
    router = createRouter(ROUTES, { queryParamsMode: "default" });

    const un = router.usePlugin(validationPlugin());

    getPluginApi(router).matchPath("/plain?foo=1");

    expect(warnSpy).toHaveBeenCalledTimes(1);

    un();
    router.usePlugin(validationPlugin());

    getPluginApi(router).matchPath("/plain?foo=1");

    expect(warnSpy).toHaveBeenCalledTimes(2);
  });

  it("reports a different key on the same route separately", async () => {
    router = mk("default");
    await router.start("/h");

    await router.navigate("plain", {}, { foo: "1" });
    await router.navigate("h");
    await router.navigate("plain", {}, { bar: "2" });

    expect(warnSpy).toHaveBeenCalledTimes(2);
  });

  it("warns on the URL direction too", () => {
    router = mk("default");

    const state = getPluginApi(router).matchPath("/plain?foo=1");

    expect(state?.search).toStrictEqual({});
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("never throws — the mode is a serialization option, not an error policy", async () => {
    router = mk("strict");
    await router.start("/h");

    await expect(
      router.navigate("plain", {}, { foo: "1" }),
    ).resolves.toBeDefined();
  });
});
