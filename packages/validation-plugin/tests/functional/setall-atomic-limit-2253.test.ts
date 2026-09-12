import { createRouter } from "@real-router/core";
import { getDependenciesApi } from "@real-router/core/api";
import { describe, it, expect } from "vitest";

import { validationPlugin } from "@real-router/validation-plugin";

import type { Router } from "@real-router/core";

/**
 * A refused `setAll` leaves the store untouched (#2253).
 *
 * The limit was checked from INSIDE the ingest loop, against the store's current
 * size, so the key that tripped it arrived after its predecessors had already
 * been written. A caller who catches the `RangeError` reads it as "nothing
 * happened" and is wrong, in the iteration order of their own object.
 *
 * ⚠ The fix is a PRE-FLIGHT in the plugin, not in core: every declared limit is
 * opt-in and bare core enforces none of them — `packages/validation-plugin/CLAUDE.md`
 * § "Every declared limit is OPT-IN" owns that decision. The shape mirrors
 * `RouteLifecycleNamespace.preflightHandlerLimit`, which solved the same
 * post-commit tear for the handler limit.
 */
const ROUTES = [{ name: "home", path: "/home" }];

type Deps = Record<string, unknown>;

function routerWithLimit(maxDependencies: number): Router<Deps> {
  const router = createRouter<Deps>(ROUTES, {
    limits: { maxDependencies },
  });

  router.usePlugin(validationPlugin());

  return router;
}

describe("setDependencies is atomic when the limit refuses it (#2253)", () => {
  it("writes nothing when the batch would exceed the limit", () => {
    const router = routerWithLimit(3);
    const deps = getDependenciesApi(router);

    expect(Object.keys(deps.getAll())).toStrictEqual([]);

    expect(() => {
      deps.setAll({ a: 1, b: 2, c: 3, d: 4, e: 5 });
    }).toThrow(RangeError);

    expect(Object.keys(deps.getAll())).toStrictEqual([]);
  });

  it("counts what the store already holds, not only the batch", () => {
    const router = routerWithLimit(3);
    const deps = getDependenciesApi(router);

    deps.setAll({ a: 1, b: 2 });

    expect(Object.keys(deps.getAll())).toStrictEqual(["a", "b"]);

    // Two held plus two new is four — over a limit of three.
    expect(() => {
      deps.setAll({ c: 3, d: 4 });
    }).toThrow(RangeError);

    expect(Object.keys(deps.getAll())).toStrictEqual(["a", "b"]);
  });

  it("names the limit, what is held and what the batch would add", () => {
    const router = routerWithLimit(3);
    const deps = getDependenciesApi(router);

    expect(() => {
      deps.setAll({ a: 1, b: 2, c: 3, d: 4, e: 5 });
    }).toThrow(/limit exceeded \(3\).*Current: 0.*adds 5/s);
  });

  // An overwrite does not grow the store, so a batch of only existing keys is
  // legal even when the store sits AT the limit — the ingest loop has always
  // agreed, since it only counts on the new-key branch.
  it("CONTROL — a batch of pure overwrites is allowed at the limit", () => {
    const router = routerWithLimit(3);
    const deps = getDependenciesApi(router);

    deps.setAll({ a: 1, b: 2, c: 3 });

    expect(() => {
      deps.setAll({ a: 10, b: 20, c: 30 });
    }).not.toThrow();

    expect(deps.getAll()).toStrictEqual({ a: 10, b: 20, c: 30 });
  });

  // CONTROL — without it every assertion above is satisfied by a door that
  // refuses every batch.
  it("CONTROL — a batch that fits still lands, whole", () => {
    const router = routerWithLimit(3);
    const deps = getDependenciesApi(router);

    deps.setAll({ a: 1, b: 2, c: 3 });

    expect(deps.getAll()).toStrictEqual({ a: 1, b: 2, c: 3 });
  });

  // CONTROL — `0` is the documented "no limit", and a pre-flight must not
  // reinvent a ceiling where the configuration removed one.
  it("CONTROL — maxDependencies 0 means no limit", () => {
    const router = routerWithLimit(0);
    const deps = getDependenciesApi(router);

    deps.setAll({ a: 1, b: 2, c: 3, d: 4, e: 5 });

    expect(Object.keys(deps.getAll())).toHaveLength(5);
  });

  // CONTROL — an application that declares no `limits` at all takes core's
  // default through the `??`, and a batch under it lands untouched by the
  // pre-flight.
  it("CONTROL — no `limits` option falls back to core's default", () => {
    const router = createRouter<Deps>(ROUTES);

    router.usePlugin(validationPlugin());

    const deps = getDependenciesApi(router);

    deps.setAll({ a: 1, b: 2, c: 3, d: 4, e: 5 });

    expect(Object.keys(deps.getAll())).toHaveLength(5);
  });

  // The single-key door keeps its own refusal, which fires against the store as
  // it stands — there is no batch to be atomic about.
  it("CONTROL — `set` still refuses at the limit, with its own message", () => {
    const router = routerWithLimit(3);
    const deps = getDependenciesApi(router);

    deps.setAll({ a: 1, b: 2, c: 3 });

    expect(() => {
      deps.set("d", 4);
    }).toThrow(
      /\[router\.setDependency\] Dependency limit exceeded \(3\)\. Current: 3\./,
    );
  });
});
