import { createRouter } from "@real-router/core";
import { getRoutesApi } from "@real-router/core/api";
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
      { name: "home", path: "/", preload: () => preloadFn },
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
      { name: "home", path: "/", preload: () => preloadFn },
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
      { name: "home", path: "/", preload: () => preloadFn },
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
      { name: "home", path: "/", preload: () => preloadFn },
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

  it("coerces negative delay to 0", () => {
    const { router } = createTestRouter([{ name: "home", path: "/" }]);
    const unsubscribe = router.usePlugin(preloadPluginFactory({ delay: -100 }));

    expect(router.getPreloadSettings()).toStrictEqual({
      delay: 0,
      networkAware: true,
    });

    unsubscribe();
  });

  it("coerces NaN delay to 0", () => {
    const { router } = createTestRouter([{ name: "home", path: "/" }]);
    const unsubscribe = router.usePlugin(
      preloadPluginFactory({ delay: Number.NaN }),
    );

    expect(router.getPreloadSettings()).toStrictEqual({
      delay: 0,
      networkAware: true,
    });

    unsubscribe();
  });

  it("coerces Infinity delay to 0", () => {
    const { router } = createTestRouter([{ name: "home", path: "/" }]);
    const unsubscribe = router.usePlugin(
      preloadPluginFactory({ delay: Infinity }),
    );

    expect(router.getPreloadSettings()).toStrictEqual({
      delay: 0,
      networkAware: true,
    });

    unsubscribe();
  });

  it("gracefully does nothing without browser-plugin (matchUrl unavailable)", async () => {
    const preloadFn = vi.fn().mockResolvedValue(undefined);
    const { router } = createTestRouter([
      { name: "home", path: "/", preload: () => preloadFn },
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
      { name: "home", path: "/", preload: () => preloadFn },
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
      { name: "home", path: "/", preload: () => preloadFn },
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

  it("invalidates compiled preload cache after replaceRoutes()", async () => {
    const preloadV1 = vi.fn().mockResolvedValue("v1");
    const preloadV2 = vi.fn().mockResolvedValue("v2");

    const { router } = createTestRouter([
      { name: "home", path: "/", preload: () => preloadV1 },
    ]);

    setupMatchUrl(router);
    cleanup = router.usePlugin(preloadPluginFactory());
    await router.start("/");

    const anchor = createAnchor("/");

    // First hover: V1 factory compiled and cached
    fireMouseOver(anchor);
    await waitForTimer(65);

    expect(preloadV1).toHaveBeenCalledTimes(1);
    expect(preloadV2).not.toHaveBeenCalled();

    // Move away to reset currentAnchor
    const div = document.createElement("div");

    document.body.append(div);
    fireMouseOver(div);

    // Replace routes with new preload factory
    const routesApi = getRoutesApi(router);

    routesApi.replace([{ name: "home", path: "/", preload: () => preloadV2 }]);

    // Re-hover: should use V2 (cache invalidated by factory reference change)
    fireMouseOver(anchor);
    await waitForTimer(65);

    expect(preloadV1).toHaveBeenCalledTimes(1);
    expect(preloadV2).toHaveBeenCalledTimes(1);

    router.stop();
  });
});
