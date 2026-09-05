// #1645 — the plugin's DEFAULT must let a `canDeactivate` guard speak on
// browser back/forward.
//
// #524 adjudicated this exact question and its reasoning was: "Flip default to
// `forceDeactivate: false`. Keep the option itself — a deliberate bypass is
// still a legitimate escape hatch. Just stop making it the default." It flipped
// `navigation-plugin` only, on the stated premise that the same user code
// "works" under `browser-plugin`.
//
// Measured on this branch before the fix, through the real popstate handler:
// with the shipped default the guard was called ZERO times on a back/forward to
// a matched URL and the router left the route. The premise was false, and it had
// been false since v0.1.0 — the default never changed. Nothing caught it because
// nothing pinned it: flipping the default broke nothing in this package's suite.
//
// The asymmetry #1645 reports is the symptom. Since #1643 the OTHER popstate arm
// (a URL that no longer matches any route) does consult the guard, so the two
// halves of one gesture disagreed under one option.

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

import { browserPluginFactory } from "@real-router/browser-plugin";

import { createMockedBrowser, routerConfig, noop } from "../helpers/testUtils";

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

  router.usePlugin(browserPluginFactory(options, mockedBrowser));
  await router.start("/users/view/42");
  getLifecycleApi(router).addDeactivateGuard("users.view", () => guard);

  return { router, guard };
}

/** Back/forward to a URL that still matches a route. */
async function backToMatched(): Promise<void> {
  globalThis.history.replaceState({}, "", "/home");
  globalThis.dispatchEvent(
    new PopStateEvent("popstate", {
      state: { name: "home", params: {}, path: "/home" },
    }),
  );
  await new Promise((resolve) => setTimeout(resolve, 20));
}

describe("browser-plugin — canDeactivate on back/forward (#1645)", () => {
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

    // Back to a URL that no longer matches any route.
    globalThis.history.replaceState({}, "", "/gone/for/good");
    globalThis.dispatchEvent(new PopStateEvent("popstate", { state: null }));
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(guard).toHaveBeenCalledTimes(1);
    expect(router.getState()?.name).toBe("users.view");

    router.stop();
  });
});
