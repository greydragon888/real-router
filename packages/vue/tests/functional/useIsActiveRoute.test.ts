import { getRoutesApi } from "@real-router/core/api";
import { createActiveRouteSource } from "@real-router/sources";
import { mount, flushPromises } from "@vue/test-utils";
import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";
import { defineComponent, h } from "vue";

import { useIsActiveRoute } from "../../src/composables/useIsActiveRoute";
import { RouterProvider } from "../../src/RouterProvider";
import { createTestRouterWithADefaultRouter } from "../helpers";

import type { Router } from "@real-router/core";
import type { ShallowRef } from "vue";

function mountWithRouter(
  router: Router,
  composable: () => ShallowRef<boolean>,
) {
  let result: ShallowRef<boolean>;
  const App = defineComponent({
    setup() {
      result = composable();

      return () => h("div");
    },
  });

  const wrapper = mount(
    defineComponent({
      setup: () => () =>
        h(RouterProvider, { router }, { default: () => h(App) }),
    }),
  );

  return {
    get result() {
      return result!;
    },
    wrapper,
  };
}

describe("useIsActiveRoute", () => {
  let router: Router;

  beforeEach(async () => {
    router = createTestRouterWithADefaultRouter();
    await router.start("/users/123");
  });

  afterEach(() => {
    router.stop();
  });

  it("should check if route is active", () => {
    const { result } = mountWithRouter(router, () =>
      useIsActiveRoute("users.view", { id: "123" }),
    );

    expect(result.value).toBe(true);
  });

  it("a default useIsActiveRoute uses the shared name-selector fast path, NOT a per-instance createActiveRouteSource (#1250)", () => {
    // #1250 — a default-options call (no params, non-strict, ignoreQueryParams,
    // no hash) resolves active state through the per-router
    // `createActiveNameSelector` (ONE shared `router.subscribe` for any number
    // of distinct-name links) instead of a per-instance `createActiveRouteSource`.
    // Direct port of svelte (#1101) / angular (#1104) / react (#1248) / preact (#1249).
    //
    // Discriminator: the canonical undefined-params slow-path source is still
    // UNBUILT after the composable mounts → building it now is a cache MISS →
    // `router.isActiveRoute` is called (a pre-#1250 HIT would NOT re-run it).
    mountWithRouter(router, () => useIsActiveRoute("users"));

    const isActiveRouteSpy = vi.spyOn(router, "isActiveRoute");

    createActiveRouteSource(router, "users", undefined, undefined, {
      strict: false,
      ignoreQueryParams: true,
    });

    expect(isActiveRouteSpy).toHaveBeenCalled();
  });

  it("a hash-set check deviates from the fast-path defaults → hash-aware slow path (#532)", () => {
    // `hash` set → the fast-path condition (`hash === undefined`) is false, so
    // the hash-aware slow path builds `createActiveRouteSource` with the hash
    // keyed into its options. The test URL "/users/123" carries no hash, so a
    // hash-expecting check is inactive.
    const { result } = mountWithRouter(router, () =>
      useIsActiveRoute("users", undefined, { hash: "profile" }),
    );

    expect(result.value).toBe(false);
  });

  it("should handle non-strict mode", () => {
    const { result } = mountWithRouter(router, () =>
      useIsActiveRoute("users", {}, { strict: false }),
    );

    expect(result.value).toBe(true);
  });

  it("should handle strict mode", () => {
    const { result } = mountWithRouter(router, () =>
      useIsActiveRoute("users", {}, { strict: true }),
    );

    expect(result.value).toBe(false);
  });

  it("should update when route changes", async () => {
    const { result } = mountWithRouter(router, () =>
      useIsActiveRoute("users.view", { id: "123" }),
    );

    expect(result.value).toBe(true);

    await router.navigate("home");
    await flushPromises();

    expect(result.value).toBe(false);
  });

  it("should handle empty and undefined parameters", async () => {
    router.stop();
    await router.start("/users/list");

    const { result: emptyParams } = mountWithRouter(router, () =>
      useIsActiveRoute("users.list", {}),
    );

    expect(emptyParams.value).toBe(true);
  });

  it("should correctly check parent route with nested active route", async () => {
    getRoutesApi(router).add([
      {
        name: "settings",
        path: "/settings",
        children: [
          {
            name: "profile",
            path: "/profile",
            children: [{ name: "edit", path: "/edit" }],
          },
        ],
      },
    ]);

    await router.navigate("settings.profile.edit");
    await flushPromises();

    const { result: nonStrict } = mountWithRouter(router, () =>
      useIsActiveRoute("settings", {}, { strict: false }),
    );

    expect(nonStrict.value).toBe(true);

    const { result: strict } = mountWithRouter(router, () =>
      useIsActiveRoute("settings", {}, { strict: true }),
    );

    expect(strict.value).toBe(false);
  });

  it("ignoreQueryParams=true (default) — query params do not affect active state", async () => {
    router.stop();
    await router.start("/users/list?page=2");

    const { result } = mountWithRouter(router, () =>
      useIsActiveRoute("users.list", {}),
    );

    expect(result.value).toBe(true);
  });

  it("ignoreQueryParams=false — query param mismatch makes route inactive", async () => {
    router.stop();
    await router.start("/users/list?page=2");

    const { result } = mountWithRouter(router, () =>
      // ignoreQueryParams=false (query params affect active state);
      // strict omitted — defaults to false (non-exact).
      useIsActiveRoute(
        "users.list",
        { page: "3" },
        { ignoreQueryParams: false },
      ),
    );

    expect(result.value).toBe(false);
  });
});
