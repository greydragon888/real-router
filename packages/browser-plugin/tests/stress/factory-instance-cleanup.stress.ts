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

import { noop, routeConfig, expectedStressError } from "./helpers";
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
