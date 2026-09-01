/**
 * The SSR mode marker is published on every navigation, not only by `start()`
 * (#1915).
 *
 * ⚑ `getSsrDataMode`'s `?? "full"` fallback is documented as "the route has no
 * plugin entry". Without a marker on the navigate path it also answered for
 * routes that HAVE an entry, so a route declared `ssr: false` reported `"full"`
 * — the opposite of what it declares, and the documented client-side branch
 * (`if mode === "client-only", fetch it yourself`) never fired.
 */

import { createRouter } from "@real-router/core";
import { describe, expect, it } from "vitest";

import { getSsrDataMode, ssrDataPluginFactory } from "../../src";

const routes = [
  { name: "home", path: "/" },
  { name: "admin", path: "/admin" },
];

describe("the SSR mode marker on the navigate path (#1915)", () => {
  it("answers the same for a route whether it was started or navigated to", async () => {
    const router = createRouter(routes);

    router.usePlugin(
      ssrDataPluginFactory({
        home: () => async () => "h",
        admin: { ssr: false, loader: () => async () => "a" },
      }),
    );

    await router.start("/admin");
    const afterStart = getSsrDataMode(router.getState()!);

    await router.navigate("home");
    await router.navigate("admin");
    const afterNavigate = getSsrDataMode(router.getState()!);

    expect(afterNavigate).toBe(afterStart);
    expect(afterNavigate).toBe("client-only");
  });

  it("resolves the function form on each navigation", async () => {
    const seen: string[] = [];
    const router = createRouter(routes);

    router.usePlugin(
      ssrDataPluginFactory({
        home: () => async () => "h",
        admin: {
          ssr: (state) => {
            seen.push(state.name);

            return "data-only";
          },
          loader: () => async () => "a",
        },
      }),
    );

    await router.start("/");
    await router.navigate("admin");

    expect(seen).toStrictEqual(["admin"]);
    expect(getSsrDataMode(router.getState()!)).toBe("data-only");
  });

  it("CONTROL — a route with no plugin entry still falls back to `full`", async () => {
    const router = createRouter(routes);

    router.usePlugin(
      ssrDataPluginFactory({
        admin: { ssr: false, loader: () => async () => "a" },
      }),
    );

    await router.start("/admin");
    await router.navigate("home");

    const state = router.getState()!;

    expect(Object.hasOwn(state.context, "ssrDataMode")).toBe(false);
    expect(getSsrDataMode(state)).toBe("full");
  });
});
