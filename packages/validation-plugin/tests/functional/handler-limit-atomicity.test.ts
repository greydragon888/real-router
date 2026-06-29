import { createRouter } from "@real-router/core";
import { getLifecycleApi, getRoutesApi } from "@real-router/core/api";
import { afterEach, describe, expect, it } from "vitest";

import { validationPlugin } from "@real-router/validation-plugin";

import type { Router } from "@real-router/core";

// #1046 — prepare-then-commit pre-screens the compile guard-throw (#956) but not
// the #961 handler-limit RangeError, so add/replace/update TEAR post-commit when
// the validation-plugin is installed AND the per-type handler count is at
// `maxLifecycleHandlers` AND the op adds a NEW guard slot. These tests assert the
// op throws WITHOUT a partial mutation (atomicity #951/#956/#698).

let router: Router | undefined;

/**
 * Router at the activate-handler limit (2) via EXTERNAL guards — external guards
 * survive `replace()`'s `clearDefinitionGuards()`, so the at-limit precondition
 * holds for replace too (a definition guard would be cleared, dropping the count).
 */
function atLimitRouter(): Router {
  const r = createRouter(
    [
      { name: "home", path: "/home" },
      { name: "keep", path: "/keep" },
      { name: "about", path: "/about" },
      { name: "target", path: "/target" },
    ],
    { limits: { maxLifecycleHandlers: 2 } },
  );

  r.usePlugin(validationPlugin());
  const lifecycle = getLifecycleApi(r);

  lifecycle.addActivateGuard("home", () => () => true);
  lifecycle.addActivateGuard("keep", () => () => true);

  return r;
}

describe("#1046 handler-limit prepare-then-commit atomicity", () => {
  afterEach(() => {
    router?.stop();
    router = undefined;
  });

  it("update: at-limit + new guard slot throws WITHOUT committing forwardTo", () => {
    router = atLimitRouter();
    const routes = getRoutesApi(router);

    expect(() => {
      routes.update("target", {
        forwardTo: "about",
        canActivate: () => () => true,
      });
    }).toThrow(RangeError);

    // #951: "nothing below throws" — forwardTo must NOT be committed on throw.
    expect(routes.get("target")?.forwardTo).toBeUndefined();
  });

  it("add: at-limit + new guard slot throws WITHOUT adding any route", () => {
    router = atLimitRouter();
    const routes = getRoutesApi(router);

    expect(() => {
      routes.add([
        { name: "x", path: "/x", canActivate: () => () => true },
        { name: "y", path: "/y" },
      ]);
    }).toThrow(RangeError);

    // #956: no partial guard registration after tree swap — nothing added.
    expect(routes.has("x")).toBe(false);
    expect(routes.has("y")).toBe(false);
  });

  it("replace: at-limit + new guard slot throws WITHOUT destroying the old tree", () => {
    router = atLimitRouter();
    const routes = getRoutesApi(router);

    expect(() => {
      routes.replace([
        { name: "x", path: "/x", canActivate: () => () => true },
        { name: "y", path: "/y" },
      ]);
    }).toThrow(RangeError);

    // #698: old tree must survive a failed replace.
    expect(routes.has("home")).toBe(true);
    expect(routes.has("keep")).toBe(true);
    expect(routes.has("about")).toBe(true);
    expect(routes.has("x")).toBe(false);
  });

  it("update: overwriting an existing guard AT the limit does NOT throw (not a new slot)", () => {
    // g1/g2 hold definition guards → count is at the limit (2). Overwriting g1's
    // guard adds no new slot, so the pre-flight must allow it (a mis-projected
    // count would falsely reject the overwrite).
    router = createRouter(
      [
        { name: "g1", path: "/g1", canActivate: () => () => true },
        { name: "g2", path: "/g2", canActivate: () => () => true },
        { name: "about", path: "/about" },
      ],
      { limits: { maxLifecycleHandlers: 2 } },
    );
    router.usePlugin(validationPlugin());
    const routes = getRoutesApi(router);

    expect(() => {
      routes.update("g1", {
        forwardTo: "about",
        canActivate: () => () => true,
      });
    }).not.toThrow();
    expect(routes.get("g1")?.forwardTo).toBe("about");
  });
});
