import { createRouter } from "@real-router/core";
import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { createActiveRouteSource, createActiveSource } from "../../src";

import type { Router } from "@real-router/core";

// `createActiveSource` is the framework-agnostic fast/slow active-source builder
// shared by every adapter's `<Link>` (#1416 promoted it here from the per-adapter
// copies so the fast/slow decision cannot drift).
//
// Discriminator for "fast path was taken": a fast-path source is backed by the
// shared `createActiveNameSelector` and never builds the per-link
// `createActiveRouteSource`, so the canonical slow-path source for the same
// arguments is still UNBUILT — asking for it is a cache MISS that runs
// `router.isActiveRoute` once. A slow-path `createActiveSource` builds that exact
// source, so the same later call is a cache HIT (no `isActiveRoute`).
describe("createActiveSource", () => {
  const routes = [
    { name: "home", path: "/" },
    {
      name: "users",
      path: "/users",
      children: [
        { name: "list", path: "/list" },
        { name: "view", path: "/:id" },
      ],
    },
  ];

  let router: Router;

  beforeEach(async () => {
    router = createRouter(routes);
    await router.start("/");
  });

  afterEach(() => {
    router.stop();
  });

  it("default options + non-empty routeName → shared selector fast path (no per-link source)", () => {
    const source = createActiveSource(
      router,
      "home",
      undefined,
      undefined,
      false,
      true,
      undefined,
    );

    // Fast path reflects the current active state via the selector.
    expect(source.getSnapshot()).toBe(true);

    // The canonical slow-path source was NOT built → cache MISS runs isActiveRoute.
    const spy = vi.spyOn(router, "isActiveRoute");

    createActiveRouteSource(router, "home", undefined, undefined, {
      strict: false,
      ignoreQueryParams: true,
    });

    expect(spy).toHaveBeenCalled();

    spy.mockRestore();
  });

  it("fast path is non-strict (descendant match) and name-only", () => {
    // "users" is not active at "/" — the fast path reflects that by name.
    const source = createActiveSource(
      router,
      "users",
      undefined,
      undefined,
      false,
      true,
      undefined,
    );

    expect(source.getSnapshot()).toBe(false);
  });

  it("custom params → slow path (per-link createActiveRouteSource)", () => {
    createActiveSource(
      router,
      "home",
      { id: "1" },
      undefined,
      false,
      true,
      undefined,
    );

    // The slow path built the source → asking for the identical source is a HIT.
    const spy = vi.spyOn(router, "isActiveRoute");

    createActiveRouteSource(router, "home", { id: "1" }, undefined, {
      strict: false,
      ignoreQueryParams: true,
    });

    expect(spy).not.toHaveBeenCalled();

    spy.mockRestore();
  });

  it("activeStrict → slow path", () => {
    createActiveSource(
      router,
      "home",
      undefined,
      undefined,
      true,
      true,
      undefined,
    );

    const spy = vi.spyOn(router, "isActiveRoute");

    createActiveRouteSource(router, "home", undefined, undefined, {
      strict: true,
      ignoreQueryParams: true,
    });

    expect(spy).not.toHaveBeenCalled();

    spy.mockRestore();
  });

  it("ignoreQueryParams=false → slow path", () => {
    createActiveSource(
      router,
      "home",
      undefined,
      undefined,
      false,
      false,
      undefined,
    );

    const spy = vi.spyOn(router, "isActiveRoute");

    createActiveRouteSource(router, "home", undefined, undefined, {
      strict: false,
      ignoreQueryParams: false,
    });

    expect(spy).not.toHaveBeenCalled();

    spy.mockRestore();
  });

  it("routeSearch → slow path (name-only selector is search-blind, #1548)", () => {
    // A query channel forces the slow path exactly as a custom hash does — the
    // per-router name selector can't answer a query-scoped active check.
    createActiveSource(
      router,
      "home",
      undefined,
      { q: "1" },
      false,
      true,
      undefined,
    );

    // The slow path built the source (keyed with the search channel) → asking
    // for the identical source is a cache HIT, not a fresh isActiveRoute run.
    const spy = vi.spyOn(router, "isActiveRoute");

    createActiveRouteSource(
      router,
      "home",
      undefined,
      { q: "1" },
      {
        strict: false,
        ignoreQueryParams: true,
      },
    );

    expect(spy).not.toHaveBeenCalled();

    spy.mockRestore();
  });

  it("hash-aware (#532) → slow path", () => {
    createActiveSource(
      router,
      "home",
      undefined,
      undefined,
      false,
      true,
      "frag",
    );

    const spy = vi.spyOn(router, "isActiveRoute");

    createActiveRouteSource(router, "home", undefined, undefined, {
      strict: false,
      ignoreQueryParams: true,
      hash: "frag",
    });

    expect(spy).not.toHaveBeenCalled();

    spy.mockRestore();
  });

  it("empty routeName → slow path (misuse, not fast-pathed)", () => {
    // routeName="" is a misuse (no href, console.error). It must NOT take the
    // fast path — the selector reports root-active `true` for "", whereas the
    // slow path's isActiveRoute("") is false. Keeping "" on the slow path
    // preserves that behaviour.
    createActiveSource(
      router,
      "",
      undefined,
      undefined,
      false,
      true,
      undefined,
    );

    const spy = vi.spyOn(router, "isActiveRoute");

    createActiveRouteSource(router, "", undefined, undefined, {
      strict: false,
      ignoreQueryParams: true,
    });

    expect(spy).not.toHaveBeenCalled();

    spy.mockRestore();
  });

  it("paramless link to a param route is name-only active while a param instance is active (#1416)", async () => {
    // A paramless `createActiveSource(router, "users.view")` takes the FAST path
    // (name-only). While `users.view` is active with a concrete `{ id }`, the
    // selector reports `isActive("users.view") === true` by NAME — it ignores the
    // params. Every adapter Link is name-only for a paramless link.
    await router.navigate("users.view", { id: "5" });

    const source = createActiveSource(
      router,
      "users.view",
      undefined,
      undefined,
      false,
      true,
      undefined,
    );

    expect(source.getSnapshot()).toBe(true);
  });

  it("fast-path source updates on navigation (reactive)", async () => {
    const source = createActiveSource(
      router,
      "users",
      undefined,
      undefined,
      false,
      true,
      undefined,
    );

    let notified = 0;
    const unsub = source.subscribe(() => {
      notified++;
    });

    expect(source.getSnapshot()).toBe(false);

    await router.navigate("users.list");

    expect(notified).toBeGreaterThan(0);
    expect(source.getSnapshot()).toBe(true);

    unsub();
  });

  it("fast-path source destroy() is a no-op and unsubscribe is idempotent-safe", () => {
    const source = createActiveSource(
      router,
      "home",
      undefined,
      undefined,
      false,
      true,
      undefined,
    );
    const unsub = source.subscribe(() => {});

    // The shared selector survives destroy() (per-router cached).
    expect(() => {
      source.destroy();
      unsub();
    }).not.toThrow();

    // Snapshot still readable after teardown.
    expect(source.getSnapshot()).toBe(true);
  });
});
