import { createRouter } from "@real-router/core";
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";

import { navigationPluginFactory } from "@real-router/navigation-plugin";

import {
  createStressRouter,
  noop,
  routeConfig,
  waitForTransitions,
} from "./helpers";
import { MockNavigation } from "../helpers/mockNavigation";
import { createMockNavigationBrowser } from "../helpers/testUtils";

describe("N12: Listener leak detection", () => {
  beforeAll(() => {
    vi.spyOn(console, "warn").mockImplementation(noop);
    vi.spyOn(console, "error").mockImplementation(noop);
  });

  afterAll(() => {
    (console.warn as unknown as { mockRestore?: () => void }).mockRestore?.();
    (console.error as unknown as { mockRestore?: () => void }).mockRestore?.();
  });

  it("N12.1: 10000 navigate cycles — only 1 active navigate listener", async () => {
    const { router, mockNav, browser, unsubscribe } = createStressRouter();

    const addListenerSpy = vi.spyOn(browser, "addNavigateListener");

    addListenerSpy.mockImplementation((fn) => {
      mockNav.addEventListener("navigate", fn);

      return () => {
        mockNav.removeEventListener("navigate", fn);
      };
    });

    await router.start();

    for (let i = 0; i < 10_000; i++) {
      await (i % 2 === 0
        ? router.navigate("users.list")
        : router.navigate("home"));
    }

    // After 10K navigations, addNavigateListener should have been called
    // exactly once (from onStart) — navigations don't add new listeners
    expect(addListenerSpy).toHaveBeenCalledTimes(1);

    router.stop();
    unsubscribe();
  });

  it("N12.2: 100 start/stop cycles — no listener accumulation", async () => {
    const { router, browser, unsubscribe } = createStressRouter();

    const addListenerSpy = vi.spyOn(browser, "addNavigateListener");

    for (let i = 0; i < 100; i++) {
      await router.start();
      router.stop();
    }

    // Each start adds 1 listener, each stop removes 1
    // addNavigateListener called 100 times (once per start)
    expect(addListenerSpy).toHaveBeenCalledTimes(100);

    unsubscribe();
  });

  /**
   * N12.3 — Factory pool: concurrently-live routers (last-wins navigate) — #758.
   *
   * `NavigationSharedState` is allocated once per `navigationPluginFactory(...)`
   * call and shared across every router that consumes that factory. Each
   * `onStart` removes the previous instance's navigate listener before
   * installing its own (a single global `window.navigation`), so when two
   * routers from the same factory are live at the same time only the
   * LAST-started one receives `navigate` events; the earlier one silently
   * desyncs. This is documented design (invariant E4). N12.1/N12.2 assert
   * net-zero listeners but never check which router an event reaches — this
   * locks the last-wins contract.
   */
  it("N12.3: factory pool — only the last concurrently-live router receives navigate events", async () => {
    const mockNav = new MockNavigation("http://localhost/");
    const browser = createMockNavigationBrowser(mockNav);
    const factory = navigationPluginFactory({}, browser);

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
    // r2.start() removes r1's navigate listener and installs its own (last-wins).
    await r2.start();

    const r1Before = r1.getState()?.name;

    // A user-initiated navigate (untagged — not PLUGIN_SYNC_INFO).
    mockNav.navigate("http://localhost/users/view/5");
    await waitForTransitions();

    // Only the last-started router reacts; the earlier one silently desyncs.
    expect(r2.getState()?.name).toBe("users.view");
    expect(r2.getState()?.params).toMatchObject({ id: "5" });
    expect(r1.getState()?.name).toBe(r1Before);

    unsub1();
    r1.stop();
    unsub2();
    r2.stop();
  });
});
