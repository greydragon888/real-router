import { createRouter } from "@real-router/core";
import { cloneRouter, getPluginApi, getRoutesApi } from "@real-router/core/api";
import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { validationPlugin } from "../../src";

import type { Router } from "@real-router/core";

/**
 * The undeclared-params-bag diagnostic (#1579 — the params half of #1553).
 *
 * A key the route declares NOWHERE — neither as a path slot (`/user/:id`) nor
 * with `?` — has no channel to belong to. Core keeps it in `state.params` on
 * purpose: it is app-level data, documented as such (wiki `Route.md`, "an
 * arbitrary default … is app-level data, not part of the URL"). What it is NOT
 * is part of the URL, so the state does not round-trip through its own
 * `state.path` — reopening the same link loses the key.
 *
 * ⚠ Core's behaviour is deliberately UNCHANGED. Dropping the key was the
 * original proposal and was rejected on measurement: it retires a shipped,
 * documented capability (the wiki documents it; suites across the monorepo
 * exercise it), and the "declared nowhere" predicate cannot tell that case
 * apart from a legitimate one — `navigate("users", { id })` on a parent route
 * whose CHILD declares `:id` looks identical to it. So this is a diagnostic,
 * never a gate: the asymmetry stops being a surprise without anything being
 * taken away.
 *
 * Same shape as the mode gate's diagnostic (#1575): core always behaves the
 * same, `validation-plugin` makes it visible, de-duplicated per route + key.
 */
const ROUTES = [
  { name: "h", path: "/h" },
  { name: "plain", path: "/plain" },
  { name: "slot", path: "/slot/:id" },
  { name: "dec", path: "/dec?a" },
];

let router: Router;
let warnSpy: ReturnType<typeof vi.spyOn>;

function mk(): Router {
  const instance = createRouter(ROUTES);

  instance.usePlugin(validationPlugin());

  return instance;
}

describe("validation-plugin — undeclared params-bag key diagnostic (#1579)", () => {
  beforeEach(() => {
    // No cache reset here (#1583): the de-dup belongs to the validator object,
    // so each router built below starts with an empty one.
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
    router.stop();
  });

  it("warns that an undeclared key will not reach the URL", async () => {
    router = mk();
    await router.start("/h");

    const state = await router.navigate("plain", { foo: "1" });

    // Behaviour is UNCHANGED — the key still lives in state.params.
    expect(state.params).toStrictEqual({ foo: "1" });
    expect(state.path).toBe("/plain");

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining(`"foo"`));
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining(`"plain"`));
  });

  it("stays silent for a key the route declares — in EITHER channel", async () => {
    router = mk();
    await router.start("/h");

    // A path slot…
    await router.navigate("slot", { id: "7" });
    // …and a query declaration.
    await router.navigate("dec", {}, { a: "1" });

    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("de-duplicates per route + key", async () => {
    router = mk();
    await router.start("/h");

    await router.navigate("plain", { foo: "1" });
    await router.navigate("h");
    await router.navigate("plain", { foo: "2" }, undefined, { reload: true });

    // Same route + key twice → one warning. Without the de-dup a revisited
    // route floods the console.
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("warns again for a SECOND router — the cache is per router, not per process (#1583)", async () => {
    // Same shape as the mode gate's cache (#1575), same defect: keyed per
    // PROCESS, it silenced every router after the first. Under SSR the
    // diagnostic fired once and then never again for the life of the process.
    router = mk();
    await router.start("/h");
    await router.navigate("plain", { foo: "1" });

    expect(warnSpy).toHaveBeenCalledTimes(1);

    const second = mk();

    await second.start("/h");
    await second.navigate("plain", { foo: "1" });
    second.stop();

    expect(warnSpy).toHaveBeenCalledTimes(2);

    const clone = cloneRouter(router);

    clone.usePlugin(validationPlugin());
    await clone.start("/h");
    await clone.navigate("plain", { foo: "1" });
    clone.stop();

    expect(warnSpy).toHaveBeenCalledTimes(3);
  });

  it("warns again after the plugin is torn down and re-registered (#1583)", () => {
    // Pre-start, like the mode gate's twin: the plugin refuses registration
    // after `start()`, so this is the only shape a teardown/re-register cycle
    // can take. `buildNavigationState` is one of the two committing producers
    // that opt into this diagnostic, and it runs before the router starts.
    router = createRouter(ROUTES);

    const un = router.usePlugin(validationPlugin());

    getPluginApi(router).buildNavigationState("plain", { foo: "1" });

    expect(warnSpy).toHaveBeenCalledTimes(1);

    un();
    router.usePlugin(validationPlugin());

    getPluginApi(router).buildNavigationState("plain", { foo: "1" });

    expect(warnSpy).toHaveBeenCalledTimes(2);
  });

  it("says nothing about the params when the ROUTE does not exist (#1584)", async () => {
    // The diagnostic asks "is this key declared anywhere on this route". For a
    // route that does not exist the honest answer is that the question does not
    // apply — but `queryNames` and `pathNames` both answered `[]`, which is
    // indistinguishable from a real route that declares nothing, so EVERY key
    // in the bag was reported as "declared nowhere on route X".
    //
    // Wrong in the most misleading direction: it blames the params for a typo
    // in the ROUTE name. The return values were always right — this entry point
    // answers `undefined`, `navigate` rejects ROUTE_NOT_FOUND — only the
    // diagnostic lied.
    router = mk();
    await router.start("/h");

    const built = getPluginApi(router).buildNavigationState("plainn", {
      foo: "1",
      bar: "2",
    });

    expect(built).toBeUndefined();
    expect(warnSpy).not.toHaveBeenCalled();

    await expect(router.navigate("plainn", { foo: "1" })).rejects.toMatchObject(
      {
        code: "ROUTE_NOT_FOUND",
      },
    );
    expect(warnSpy).not.toHaveBeenCalled();

    // Discrimination: the SAME key on a route that DOES exist still warns —
    // otherwise "never warn" would pass this block.
    await router.navigate("plain", { foo: "1" });

    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("does not burn a de-dup slot on a route that does not exist (#1584)", async () => {
    // Second-order, and reachable within one router: each bogus report took a
    // slot in the per-route+key cache, so the genuine warning for that pair was
    // suppressed once the name became real.
    router = mk();
    await router.start("/h");

    await router.navigate("later", { foo: "1" }).catch(() => undefined);

    // Split by MOMENT, not by count: a bare `toHaveBeenCalledTimes(1)` at the
    // end passes on the bug too (one bogus warning and a suppressed genuine one
    // total the same as no bogus warning and a genuine one). The discriminating
    // fact is that nothing is said while the route does not exist.
    expect(warnSpy).not.toHaveBeenCalled();

    getRoutesApi(router).add({ name: "later", path: "/later" });
    await router.navigate("later", { foo: "1" });

    // …and the genuine warning still fires, i.e. no de-dup slot was burnt.
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining(`"later"`));
  });

  it("stays silent on every PREDICATE, including canNavigateTo", async () => {
    router = mk();
    await router.start("/h");

    // The render path must not warn once per <Link>. `canNavigateTo` is the
    // trap here: it RESOLVES forwardTo, so it shares the compositional form with
    // `navigate` — a form-based test caught it and warned (measured). The
    // diagnostic is therefore opted into explicitly by the committing producers,
    // not inferred from the form.
    router.canNavigateTo("plain", { foo: "1" });
    router.buildPath("plain", { foo: "1" });
    router.isActiveRoute("plain", { foo: "1" });
    getPluginApi(router).makeState("plain", { foo: "1" });

    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("stays silent on the URL direction (matchPath)", async () => {
    router = mk();
    await router.start("/h");

    // An undeclared key arriving from a URL lands in the QUERY channel, where
    // the mode gate (#1575) already owns the decision — this diagnostic is about
    // the params bag only, so it must not double-report.
    getPluginApi(router).matchPath("/plain?foo=1");

    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("says nothing when the plugin is absent (core stays silent)", async () => {
    router = createRouter(ROUTES);
    await router.start("/h");

    const state = await router.navigate("plain", { foo: "1" });

    expect(state.params).toStrictEqual({ foo: "1" });
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
