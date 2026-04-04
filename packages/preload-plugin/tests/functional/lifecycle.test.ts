import { createRouter } from "@real-router/core";
import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { preloadPluginFactory } from "../../src";
import {
  createAnchor,
  createTestRouter,
  fireMouseOver,
  fireTouchStart,
  setupMatchUrl,
  waitForTimer,
} from "../helpers/testUtils";

describe("preload-plugin — lifecycle", () => {
  let cleanup: (() => void) | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
    document.body.innerHTML = "";
    vi.useRealTimers();
  });

  it("does nothing before router.start() is called (listeners not active)", async () => {
    const preloadFn = vi.fn().mockResolvedValue(undefined);
    const { router } = createTestRouter([
      { name: "home", path: "/", preload: preloadFn },
    ]);

    setupMatchUrl(router);
    cleanup = router.usePlugin(preloadPluginFactory());

    const anchor = createAnchor("/");

    fireMouseOver(anchor);
    await waitForTimer(65);

    expect(preloadFn).not.toHaveBeenCalled();

    router.stop();
  });

  it("activates listeners after router.start()", async () => {
    const preloadFn = vi.fn().mockResolvedValue(undefined);
    const { router } = createTestRouter([
      { name: "home", path: "/", preload: preloadFn },
    ]);

    setupMatchUrl(router);
    cleanup = router.usePlugin(preloadPluginFactory());
    await router.start("/");

    const anchor = createAnchor("/");

    fireMouseOver(anchor);
    await waitForTimer(65);

    expect(preloadFn).toHaveBeenCalledTimes(1);

    router.stop();
  });

  it("removes listeners after router.stop()", async () => {
    const preloadFn = vi.fn().mockResolvedValue(undefined);
    const { router } = createTestRouter([
      { name: "home", path: "/", preload: preloadFn },
    ]);

    setupMatchUrl(router);
    cleanup = router.usePlugin(preloadPluginFactory());
    await router.start("/");
    router.stop();

    const anchor = createAnchor("/");

    fireMouseOver(anchor);
    await waitForTimer(65);

    expect(preloadFn).not.toHaveBeenCalled();
  });

  it("re-adds listeners after stop + start cycle", async () => {
    const preloadFn = vi.fn().mockResolvedValue(undefined);
    const { router } = createTestRouter([
      { name: "home", path: "/", preload: preloadFn },
    ]);

    setupMatchUrl(router);
    cleanup = router.usePlugin(preloadPluginFactory());
    await router.start("/");
    router.stop();
    await router.start("/");

    const anchor = createAnchor("/");

    fireMouseOver(anchor);
    await waitForTimer(65);

    expect(preloadFn).toHaveBeenCalledTimes(1);

    router.stop();
  });

  it("teardown removes listeners and router extension", () => {
    const { router } = createTestRouter([{ name: "home", path: "/" }]);

    setupMatchUrl(router);
    const unsubscribe = router.usePlugin(preloadPluginFactory());

    expect("getPreloadSettings" in router).toBe(true);

    unsubscribe();

    expect("getPreloadSettings" in router).toBe(false);
  });

  it("returns empty plugin object in SSR environment (no document)", async () => {
    vi.stubGlobal("document", undefined);

    const factory = preloadPluginFactory();
    const router = createRouter([{ name: "home", path: "/" }], {
      defaultRoute: "home",
    });
    const getDep = () => {
      throw new Error("no deps");
    };
    const plugin = factory(router, getDep as Parameters<typeof factory>[1]);

    expect(plugin).toStrictEqual({});

    vi.unstubAllGlobals();
  });

  it("getPreloadSettings() returns configured options", () => {
    const { router } = createTestRouter([{ name: "home", path: "/" }]);
    const unsubscribe = router.usePlugin(
      preloadPluginFactory({ delay: 150, networkAware: false }),
    );

    expect(router.getPreloadSettings()).toStrictEqual({
      delay: 150,
      networkAware: false,
    });

    unsubscribe();
  });

  it("gracefully does nothing without browser-plugin (matchUrl unavailable)", async () => {
    const preloadFn = vi.fn().mockResolvedValue(undefined);
    const { router } = createTestRouter([
      { name: "home", path: "/", preload: preloadFn },
    ]);

    cleanup = router.usePlugin(preloadPluginFactory());
    await router.start("/");

    const anchor = createAnchor("/");

    fireMouseOver(anchor);
    await waitForTimer(65);

    expect(preloadFn).not.toHaveBeenCalled();

    router.stop();
  });

  it("clears pending timers on stop (no timer leaks)", async () => {
    const preloadFn = vi.fn().mockResolvedValue(undefined);
    const { router } = createTestRouter([
      { name: "home", path: "/", preload: preloadFn },
    ]);

    setupMatchUrl(router);
    cleanup = router.usePlugin(preloadPluginFactory());
    await router.start("/");

    const hoverAnchor = createAnchor("/");

    fireMouseOver(hoverAnchor);

    const touchAnchor = createAnchor("/");

    fireTouchStart(touchAnchor);

    router.stop();

    await waitForTimer(200);

    expect(preloadFn).not.toHaveBeenCalled();
  });

  it("clears pending timers on teardown (no timer leaks)", async () => {
    const preloadFn = vi.fn().mockResolvedValue(undefined);
    const { router } = createTestRouter([
      { name: "home", path: "/", preload: preloadFn },
    ]);

    setupMatchUrl(router);
    const unsubscribe = router.usePlugin(preloadPluginFactory());

    await router.start("/");

    const anchor = createAnchor("/");

    fireMouseOver(anchor);

    unsubscribe();

    await waitForTimer(200);

    expect(preloadFn).not.toHaveBeenCalled();

    router.stop();
  });
});
