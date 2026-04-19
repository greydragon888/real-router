import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { getPluginApi } from "@real-router/core/api";

import { createTestRouter, pickRouteIdentity } from "../../../helpers";

import type { Params, Router } from "@real-router/core";

let router: Router;

describe("router.navigate() - query params", () => {
  beforeEach(async () => {
    router = createTestRouter();

    await router.start("/home");
  });

  afterEach(() => {
    router.stop();

    vi.clearAllMocks();
  });

  it("should append query parameters to path", async () => {
    await router.navigate("users.view", { id: 123, q: "search", page: "2" });

    const state = router.getState();

    expect(pickRouteIdentity(state)).toMatchObject({
      name: "users.view",
      path: "/users/view/123?q=search&page=2",
    });
    expect(state?.params).toStrictEqual({
      id: 123,
      q: "search",
      page: "2",
    });
  });

  it("should encode query parameters correctly", async () => {
    const state = await router.navigate("users.view", {
      id: 42,
      q: "a b",
      tag: "x/y",
    });

    expect(state?.path).toBe("/users/view/42?q=a%20b&tag=x%2Fy");
    expect(state?.params).toStrictEqual({ id: 42, q: "a b", tag: "x/y" });
  });

  it("should handle empty query params correctly", async () => {
    await router.navigate("users.view", { id: 42 });

    expect(router.getState()?.path).toBe("/users/view/42");
  });
});

// ===========================================================================
// Contract: `undefined` values in params
//
// These tests lock the public contract of `@real-router/core`:
// - `router.navigate(name, { x: undefined })` must produce a URL without `x`
// - `router.buildPath(name, { x: undefined })` must produce a URL without `x`
// - `state.params` must not contain undefined keys after navigation
// - Plugin interceptors that introduce undefined must NOT leak into URL/state
// - The contract is enforced at the core boundary, independent of the query
//   string engine (defence against engine regression)
// ===========================================================================

describe("router.navigate() / router.buildPath() — undefined params contract", () => {
  beforeEach(async () => {
    router = createTestRouter();

    await router.start("/home");
  });

  afterEach(() => {
    router.stop();

    vi.clearAllMocks();
  });

  it("navigate() strips undefined query params from URL", async () => {
    await router.navigate("users.view", {
      id: 42,
      q: "search",
      sort: undefined,
    });

    expect(router.getState()?.path).toBe("/users/view/42?q=search");
  });

  it("navigate() strips all undefined values, leaving only defined", async () => {
    await router.navigate("users.view", {
      id: 42,
      q: undefined,
      sort: undefined,
      page: "2",
    });

    expect(router.getState()?.path).toBe("/users/view/42?page=2");
  });

  it("navigate() preserves falsy-but-defined query values", async () => {
    await router.navigate("users.view", {
      id: 42,
      zero: 0,
      empty: "",
      falseFlag: false,
    });

    const state = router.getState()!;

    expect(state.params).toStrictEqual({
      id: 42,
      zero: 0,
      empty: "",
      falseFlag: false,
    });
  });

  it("navigate() strips undefined from state.params (in key)", async () => {
    await router.navigate("users.view", { id: 42, sort: undefined });

    const state = router.getState()!;

    expect("sort" in state.params).toBe(false);
    expect(state.params).toStrictEqual({ id: 42 });
  });

  it("buildPath() strips undefined from produced URL", () => {
    const url = router.buildPath("users.view", {
      id: 42,
      q: "search",
      sort: undefined,
    });

    expect(url).toBe("/users/view/42?q=search");
  });

  it("buildPath() and navigate() produce identical URLs for same params", async () => {
    const params: Params = { id: 42, q: "search", sort: undefined, page: "2" };

    const built = router.buildPath("users.view", params);

    await router.navigate("users.view", params);

    expect(router.getState()?.path).toBe(built);
  });

  it("navigate() is a no-op structurally when params are all undefined", async () => {
    await router.navigate("users.view", {
      id: 42,
      a: undefined,
      b: undefined,
    });

    expect(router.getState()?.path).toBe("/users/view/42");
  });

  // -------------------------------------------------------------------------
  // Core-ownership regression guard
  //
  // Prove that core itself strips undefined BEFORE handing params to the query
  // string engine. If a future change to search-params removes the
  // undefined-strip in `build()`, this test still passes because core
  // normalizes first.
  //
  // We spy via the `buildPath` interceptor — the call inside the interceptor
  // sees exactly what the engine would receive.
  // -------------------------------------------------------------------------
  it("CORE OWNERSHIP: normalizes params before they reach the query engine", async () => {
    let capturedParams: Params | undefined;

    const api = getPluginApi(router);
    const unsubscribe = api.addInterceptor(
      "buildPath",
      (next, name: string, params?: Params) => {
        capturedParams = params;

        return next(name, params);
      },
    );

    await router.navigate("users.view", {
      id: 42,
      q: "search",
      sort: undefined,
    });

    expect(capturedParams).toBeDefined();
    expect("sort" in capturedParams!).toBe(false);
    expect(capturedParams).toStrictEqual({ id: 42, q: "search" });

    unsubscribe();
  });

  it("CORE OWNERSHIP: normalizes after plugin interceptor adds undefined to forwardState", async () => {
    const api = getPluginApi(router);
    const unsubscribe = api.addInterceptor(
      "forwardState",
      (next, name: string, params: Params) => {
        const result = next(name, params);

        // Plugin returns a value containing undefined — must be scrubbed
        // before it reaches URL/state.
        return {
          ...result,
          params: { ...result.params, injected: undefined },
        };
      },
    );

    await router.navigate("users.view", { id: 42 });

    const state = router.getState()!;

    expect("injected" in state.params).toBe(false);
    expect(state.path).toBe("/users/view/42");

    unsubscribe();
  });

  it("CORE OWNERSHIP: buildPath facade normalizes user input at API boundary", () => {
    let capturedParams: Params | undefined;

    const api = getPluginApi(router);
    const unsubscribe = api.addInterceptor(
      "buildPath",
      (next, name: string, params?: Params) => {
        capturedParams = params;

        return next(name, params);
      },
    );

    router.buildPath("users.view", {
      id: 42,
      garbage: undefined,
    });

    expect(capturedParams).toStrictEqual({ id: 42 });
    expect("garbage" in capturedParams!).toBe(false);

    unsubscribe();
  });
});
