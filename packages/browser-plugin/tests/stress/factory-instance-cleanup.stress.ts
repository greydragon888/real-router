import { createRouter } from "@real-router/core";
import {
  describe,
  it,
  expect,
  beforeEach,
  beforeAll,
  afterAll,
  vi,
} from "vitest";

import { browserPluginFactory } from "@real-router/browser-plugin";

import {
  noop,
  routeConfig,
  expectedStressError,
  waitForTransitions,
} from "./helpers";
import { createSafeBrowser } from "../../src/browser-env";

import type { Browser } from "../../src/browser-env";

/**
 * B7.4 — Factory-pool instance cleanup
 *
 * `browserPluginFactory()` allocates a single `SharedFactoryState` object
 * (with `removePopStateListener`) per factory call. That state is shared
 * across every router that consumes the same factory. After the LAST
 * router that used the factory disposes, the popstate listener must be
 * unregistered — otherwise a long-running app using a factory pool will
 * leak listeners.
 *
 * `B5.3` (in `plugin-lifecycle-churn.stress.ts`) covers 20 routers from
 * one factory. This file scales to 100 and adds a behavioral check: after
 * every router disposes, dispatching a popstate must not trigger any
 * listener (because all of them were removed during teardown).
 */
describe("B7.4 — factory pool: 100 routers, all disposed", () => {
  beforeAll(() => {
    vi.spyOn(console, "warn").mockImplementation(noop);
    vi.spyOn(console, "error").mockImplementation(noop);
  });

  beforeEach(() => {
    globalThis.history.replaceState({}, "", "/");
  });

  afterAll(() => {
    (console.warn as unknown as { mockRestore?: () => void }).mockRestore?.();
    (console.error as unknown as { mockRestore?: () => void }).mockRestore?.();
  });

  it("removes the shared popstate listener after every router from one factory disposes", async () => {
    const safeBrowser = createSafeBrowser(
      () => globalThis.location.pathname + globalThis.location.search,
      "browser-plugin-pool",
    );
    const browser: Browser = {
      ...safeBrowser,
      pushState: (state: unknown, url: string) => {
        safeBrowser.pushState(state, url);
      },
      replaceState: (state: unknown, url: string) => {
        safeBrowser.replaceState(state, url);
      },
    };

    // Track addEventListener / removeEventListener("popstate", ...) calls
    // on the real window. The factory must net-zero them across the lifetime
    // of all consumers.
    const addSpy = vi.spyOn(globalThis, "addEventListener");
    const removeSpy = vi.spyOn(globalThis, "removeEventListener");

    try {
      const factory = browserPluginFactory({}, browser);
      const unsubs: (() => void)[] = [];

      for (let i = 0; i < 100; i++) {
        const router = createRouter(routeConfig, {
          defaultRoute: "home",
          allowNotFound: true,
        });
        const unsub = router.usePlugin(factory);

        await router.start();
        await router.navigate("users.list").catch(expectedStressError);

        unsubs.push(() => {
          unsub();
          router.stop();
        });
      }

      // Tear down all 100 in reverse order — exercises the shared
      // `removePopStateListener` slot getting reset/reused per onStart.
      while (unsubs.length > 0) {
        unsubs.pop()?.();
      }

      const popstateAdds = addSpy.mock.calls.filter(
        ([type]) => type === "popstate",
      ).length;
      const popstateRemoves = removeSpy.mock.calls.filter(
        ([type]) => type === "popstate",
      ).length;

      // Net-zero invariant: every listener that was added was removed.
      // (Equality, not >=, would be too strict — `createPopstateLifecycle`
      // intentionally re-registers per onStart, so adds/removes both grow.)
      expect(popstateAdds).toBeGreaterThan(0);
      expect(popstateRemoves).toBeGreaterThanOrEqual(popstateAdds);
    } finally {
      addSpy.mockRestore();
      removeSpy.mockRestore();
    }
  });
});

/**
 * B7.5 — Factory pool: concurrently-live routers (last-wins popstate)
 *
 * `SharedFactoryState` is allocated once per `browserPluginFactory(...)` call
 * and shared across every router that consumes that factory. Each `onStart`
 * removes the previous instance's popstate listener before installing its own
 * — so when two routers from the same factory are live **at the same time**,
 * only the LAST-started one tracks `popstate`; the earlier one silently
 * desyncs from the URL.
 *
 * This is documented design (the factory-pool pattern assumes routers are
 * created/destroyed sequentially). B7.4 above only asserts net-zero listeners
 * — it never checks *which* router a popstate reaches. This test locks the
 * last-wins contract so a regression where the expected (last) router stops
 * tracking would be caught (#758).
 */
describe("B7.5 — factory pool: only the last concurrently-live router tracks popstate", () => {
  beforeAll(() => {
    vi.spyOn(console, "warn").mockImplementation(noop);
    vi.spyOn(console, "error").mockImplementation(noop);
  });

  beforeEach(() => {
    globalThis.history.replaceState({}, "", "/");
  });

  afterAll(() => {
    (console.warn as unknown as { mockRestore?: () => void }).mockRestore?.();
    (console.error as unknown as { mockRestore?: () => void }).mockRestore?.();
  });

  it("routes a popstate to the last-started router; the earlier one does not react", async () => {
    const safeBrowser = createSafeBrowser(
      () => globalThis.location.pathname + globalThis.location.search,
      "browser-plugin-pool",
    );
    const browser: Browser = {
      ...safeBrowser,
      pushState: (state: unknown, url: string) => {
        safeBrowser.pushState(state, url);
      },
      replaceState: (state: unknown, url: string) => {
        safeBrowser.replaceState(state, url);
      },
    };

    const factory = browserPluginFactory({}, browser);

    const r1 = createRouter(routeConfig, {
      defaultRoute: "home",
      allowNotFound: true,
    });
    const r2 = createRouter(routeConfig, {
      defaultRoute: "home",
      allowNotFound: true,
    });
    const unsub1 = r1.usePlugin(factory);
    const unsub2 = r2.usePlugin(factory);

    await r1.start();
    // r2.start() removes r1's popstate listener and installs its own (last-wins).
    await r2.start();

    // Browser sits on a back/forward entry for /users/view/5.
    const entry = {
      name: "users.view",
      params: { id: "5" },
      path: "/users/view/5",
    };

    globalThis.history.replaceState(entry, "", "/users/view/5");
    globalThis.dispatchEvent(new PopStateEvent("popstate", { state: entry }));

    await waitForTransitions();

    // Only the last-started router reacts; the earlier one silently desyncs.
    expect(r2.getState()?.name).toBe("users.view");
    expect(r2.getState()?.params).toMatchObject({ id: "5" });
    expect(r1.getState()?.name).toBe("index");

    unsub1();
    r1.stop();
    unsub2();
    r2.stop();
  });
});
