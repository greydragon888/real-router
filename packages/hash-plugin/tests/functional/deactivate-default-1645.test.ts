// #1645 — the plugin's DEFAULT must let a `canDeactivate` guard speak on
// browser back/forward. Sibling of the browser-plugin file of the same name;
// both plugins share the popstate handler but each ships its own default, and
// each shipped `true` since its first release.
//
// #524 decided this question ("stop making the bypass the default, keep the
// option") and flipped `navigation-plugin` only, believing the other two already
// behaved that way. Measured here before the fix: on a back/forward to a matched
// URL the guard was called ZERO times and the router left the route.

import { createRouter } from "@real-router/core";
import { getLifecycleApi } from "@real-router/core/api";
import {
  describe,
  beforeAll,
  beforeEach,
  afterAll,
  it,
  expect,
  vi,
} from "vitest";

import { hashPluginFactory } from "@real-router/hash-plugin";

import { noop, routerConfig, createMockedBrowser } from "../helpers/testUtils";

import type { Browser } from "../../src/browser-env";
import type { Router } from "@real-router/core";

let mockedBrowser: Browser;

/** A router parked on `users.view` with a refusing `canDeactivate`. */
async function onGuardedRoute(options: Record<string, unknown>): Promise<{
  router: Router;
  guard: ReturnType<typeof vi.fn>;
}> {
  const router = createRouter(routerConfig, {
    defaultRoute: "home",
    allowNotFound: true,
  });
  const guard = vi.fn(() => false);

  router.usePlugin(hashPluginFactory(options, mockedBrowser));
  await router.start("/users/view/42");
  getLifecycleApi(router).addDeactivateGuard("users.view", () => guard);

  return { router, guard };
}

/** Back/forward to a hash URL that still matches a route. */
async function backToMatched(): Promise<void> {
  globalThis.history.replaceState({}, "", "/#/home");
  globalThis.dispatchEvent(new PopStateEvent("popstate", { state: null }));
  await new Promise((resolve) => setTimeout(resolve, 20));
}

describe("hash-plugin — canDeactivate on back/forward (#1645)", () => {
  beforeAll(() => {
    vi.spyOn(console, "error").mockImplementation(noop);
  });

  beforeEach(() => {
    mockedBrowser = createMockedBrowser(noop);
    globalThis.history.replaceState({}, "", "/");
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  it("asks the guard by DEFAULT and holds the route when it refuses", async () => {
    const { router, guard } = await onGuardedRoute({});

    await backToMatched();

    expect(guard).toHaveBeenCalledTimes(1);
    expect(router.getState()?.name).toBe("users.view");

    router.stop();
  });

  it("still bypasses it on explicit forceDeactivate: true — the escape hatch survives", async () => {
    const { router, guard } = await onGuardedRoute({ forceDeactivate: true });

    await backToMatched();

    expect(guard).not.toHaveBeenCalled();
    expect(router.getState()?.name).toBe("home");

    router.stop();
  });

  it("agrees with the not-found arm, which has consulted the guard since #1643", async () => {
    const { router, guard } = await onGuardedRoute({});

    globalThis.history.replaceState({}, "", "/#/gone-for-good");
    globalThis.dispatchEvent(new PopStateEvent("popstate", { state: null }));
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(guard).toHaveBeenCalledTimes(1);
    expect(router.getState()?.name).toBe("users.view");

    router.stop();
  });
});
