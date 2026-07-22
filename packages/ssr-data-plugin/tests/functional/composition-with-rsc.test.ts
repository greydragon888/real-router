import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ssrDataPluginFactory } from "../../src";
import { createSsrLoaderPlugin } from "../../src/shared-ssr";

import type { Router, PluginFactory } from "@real-router/core";

/**
 * Smoke test for the canonical side-by-side composition of
 * `ssr-data-plugin` and `rsc-server-plugin`. The contract — distinct
 * namespaces, independent teardown, independent claim release — is
 * already pinned by invariants 14-15 inside `@real-router/rsc-server-plugin`'s
 * property tests; this file exercises the same composition from the
 * `ssr-data-plugin` side.
 *
 * `rsc-server-plugin` is structurally a thin adapter over the shared
 * `createSsrLoaderPlugin(loaders, { namespace: "rsc", ... })` — the same
 * factory `ssr-data-plugin` uses with `namespace: "data"`. We can NOT take a
 * workspace dependency on `@real-router/rsc-server-plugin` here (it would
 * introduce a turbo build cycle), so the test instantiates the same
 * underlying factory with `"rsc"` and verifies the composition contract.
 * Any divergence between the real `rscServerPluginFactory` and this proxy
 * would surface inside `shared/ssr/` — the only locus where they differ.
 */

// Plain "ReactNode-like" sentinel — we are testing plumbing, not React
// rendering. ssr-data-plugin never imports `react`, so we cast through
// `unknown`.
const rscNode = (
  kind: string,
  props: Record<string, unknown> = {},
): unknown => ({
  type: kind,
  props,
  key: null,
  $$typeof: Symbol.for("react.element"),
});

function rscServerPluginFactoryProxy(
  loaders: Record<string, () => () => unknown>,
): PluginFactory {
  // The real rscServerPluginFactory does additional validation that we
  // bypass here — that validation is the rsc-server-plugin package's
  // concern. Plumbing-wise the factory shape is identical.
  return createSsrLoaderPlugin<unknown>(loaders, {
    namespace: "rsc",
    modeNamespace: "ssrRscMode",
    errorPrefix: "[rsc-proxy]",
    allowedModes: ["full", "client-only"],
  });
}

const routes = [
  { name: "home", path: "/" },
  {
    name: "users",
    path: "/users",
    children: [{ name: "profile", path: "/:id" }],
  },
];

describe("@real-router/ssr-data-plugin — composition with rsc-server-plugin", () => {
  let router: Router;

  beforeEach(() => {
    router = createRouter(routes, { defaultRoute: "home" });
  });

  afterEach(() => {
    router.stop();
  });

  it("populates state.context.data and state.context.rsc independently for the same start()", async () => {
    router.usePlugin(
      ssrDataPluginFactory({
        "users.profile":
          () =>
          async ({ params }) => ({
            jsonId: params.id,
            source: "ssr-data",
          }),
      }),
      rscServerPluginFactoryProxy({
        "users.profile": () => () => rscNode("UserProfile", { userId: "42" }),
      }),
    );

    const state = await router.start("/users/42");

    expect(state.context.data).toStrictEqual({
      jsonId: "42",
      source: "ssr-data",
    });
    expect(state.context.rsc).toStrictEqual(
      rscNode("UserProfile", { userId: "42" }),
    );
  });

  it("teardown of ssr-data-plugin leaves rsc namespace claim intact", async () => {
    const unsubData = router.usePlugin(
      ssrDataPluginFactory({
        "users.profile":
          () =>
          async ({ params }) => ({ id: params.id }),
      }),
    );

    router.usePlugin(
      rscServerPluginFactoryProxy({
        "users.profile": () => () => rscNode("UserProfile"),
      }),
    );

    unsubData();

    const state = await router.start("/users/42");

    expect(state.context.data).toBeUndefined();
    expect(state.context.rsc).toStrictEqual(rscNode("UserProfile"));

    const api = getPluginApi(router);

    // Data namespaces freed; rsc namespaces still held.
    expect(() => api.claimContextNamespace("data")).not.toThrow();
    expect(() => api.claimContextNamespace("rsc")).toThrow();
  });

  it("teardown of rsc-proxy leaves ssr-data-plugin's claim intact", async () => {
    router.usePlugin(
      ssrDataPluginFactory({
        "users.profile":
          () =>
          async ({ params }) => ({ id: params.id }),
      }),
    );

    const unsubRsc = router.usePlugin(
      rscServerPluginFactoryProxy({
        "users.profile": () => () => rscNode("UserProfile"),
      }),
    );

    unsubRsc();

    const state = await router.start("/users/42");

    expect(state.context.rsc).toBeUndefined();
    expect(state.context.data).toStrictEqual({ id: "42" });

    const api = getPluginApi(router);

    expect(() => api.claimContextNamespace("rsc")).not.toThrow();
    expect(() => api.claimContextNamespace("data")).toThrow();
  });

  it("plugin registration order does not affect outcome", async () => {
    router.usePlugin(
      rscServerPluginFactoryProxy({
        "users.profile": () => () => rscNode("UserProfile"),
      }),
      ssrDataPluginFactory({
        "users.profile":
          () =>
          async ({ params }) => ({
            jsonId: params.id,
            source: "ssr-data",
          }),
      }),
    );

    const state = await router.start("/users/7");

    expect(state.context.data).toStrictEqual({
      jsonId: "7",
      source: "ssr-data",
    });
    expect(state.context.rsc).toStrictEqual(rscNode("UserProfile"));
  });
});
