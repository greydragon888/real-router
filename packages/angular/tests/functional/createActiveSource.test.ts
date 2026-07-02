import { createRouter } from "@real-router/core";
import { createActiveRouteSource } from "@real-router/sources";
import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { createActiveSource } from "../../src/internal/createActiveSource";

import type { Router } from "@real-router/core";

// `createActiveSource` is the fast/slow active-source selector shared by
// `RealLink` and `RealLinkActive` (#1103). It takes the router explicitly (no
// injection context), so it is directly unit-testable — which matters because
// JIT TestBed cannot bind non-default signal inputs to the directives, so the
// fast path (non-empty routeName, default options) is otherwise unreachable in
// unit tests (the documented ~97% JIT ceiling). These tests pin the path
// decision + the fast-path reactive contract without AOT.
//
// Discriminator for "fast path was taken": a fast-path source is backed by the
// shared `createActiveNameSelector` and never builds the per-link
// `createActiveRouteSource`, so the canonical slow-path source for the same
// arguments is still UNBUILT — asking for it is a cache MISS that runs
// `router.isActiveRoute` once. A slow-path `createActiveSource` builds that
// exact source, so the same later call is a cache HIT (no `isActiveRoute`).
describe("createActiveSource", () => {
  const routes = [
    { name: "home", path: "/" },
    {
      name: "users",
      path: "/users",
      children: [{ name: "list", path: "/list" }],
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
      false,
      true,
      undefined,
    );

    // Fast path reflects the current active state via the selector.
    expect(source.getSnapshot()).toBe(true);

    // The canonical slow-path source was NOT built → cache MISS runs isActiveRoute.
    const spy = vi.spyOn(router, "isActiveRoute");

    createActiveRouteSource(router, "home", undefined, {
      strict: false,
      ignoreQueryParams: true,
    });

    expect(spy).toHaveBeenCalled();

    spy.mockRestore();
  });

  it("fast path is non-strict (descendant match) and name-only", () => {
    // "users" is active as an ancestor of the current route once navigated.
    const source = createActiveSource(
      router,
      "users",
      undefined,
      false,
      true,
      undefined,
    );

    expect(source.getSnapshot()).toBe(false);
  });

  it("custom params → slow path (per-link createActiveRouteSource)", () => {
    createActiveSource(router, "home", { id: "1" }, false, true, undefined);

    // The slow path built the source → asking for the identical source is a HIT.
    const spy = vi.spyOn(router, "isActiveRoute");

    createActiveRouteSource(
      router,
      "home",
      { id: "1" },
      {
        strict: false,
        ignoreQueryParams: true,
      },
    );

    expect(spy).not.toHaveBeenCalled();

    spy.mockRestore();
  });

  it("activeStrict → slow path", () => {
    createActiveSource(router, "home", undefined, true, true, undefined);

    const spy = vi.spyOn(router, "isActiveRoute");

    createActiveRouteSource(router, "home", undefined, {
      strict: true,
      ignoreQueryParams: true,
    });

    expect(spy).not.toHaveBeenCalled();

    spy.mockRestore();
  });

  it("ignoreQueryParams=false → slow path", () => {
    createActiveSource(router, "home", undefined, false, false, undefined);

    const spy = vi.spyOn(router, "isActiveRoute");

    createActiveRouteSource(router, "home", undefined, {
      strict: false,
      ignoreQueryParams: false,
    });

    expect(spy).not.toHaveBeenCalled();

    spy.mockRestore();
  });

  it("hash-aware (#532) → slow path", () => {
    createActiveSource(router, "home", undefined, false, true, "frag");

    const spy = vi.spyOn(router, "isActiveRoute");

    createActiveRouteSource(router, "home", undefined, {
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
    // preserves that behaviour (and matches every JIT directive test).
    createActiveSource(router, "", undefined, false, true, undefined);

    const spy = vi.spyOn(router, "isActiveRoute");

    createActiveRouteSource(router, "", undefined, {
      strict: false,
      ignoreQueryParams: true,
    });

    expect(spy).not.toHaveBeenCalled();

    spy.mockRestore();
  });

  it("fast-path source updates on navigation (reactive)", async () => {
    const source = createActiveSource(
      router,
      "users",
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
