import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { preloadPluginFactory } from "../../src";
import {
  createAnchor,
  createTestRouter,
  fireMouseOver,
  setupMatchUrl,
  waitForTimer,
} from "../helpers/testUtils";

describe("preload-plugin — getPreloadedState cache", () => {
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

  it("registers getPreloadedState extension on router", () => {
    const { router } = createTestRouter([{ name: "home", path: "/" }]);

    cleanup = router.usePlugin(preloadPluginFactory());

    expect(typeof router.getPreloadedState).toBe("function");
  });

  it("removes getPreloadedState extension on teardown", () => {
    const { router } = createTestRouter([{ name: "home", path: "/" }]);
    const unsubscribe = router.usePlugin(preloadPluginFactory());

    unsubscribe();

    expect(router.getPreloadedState).toBeUndefined();
  });

  it("returns undefined when no anchor was hovered", () => {
    const { router } = createTestRouter([{ name: "home", path: "/" }]);

    cleanup = router.usePlugin(preloadPluginFactory());

    expect(router.getPreloadedState?.("http://localhost/")).toBeUndefined();
  });

  it("caches resolved State on hover and exposes it via getPreloadedState", async () => {
    const preloadFn = vi.fn().mockResolvedValue(undefined);
    const { router } = createTestRouter([
      { name: "home", path: "/" },
      { name: "about", path: "/about", preload: () => preloadFn },
    ]);

    setupMatchUrl(router);
    cleanup = router.usePlugin(preloadPluginFactory());
    await router.start("/");

    const anchor = createAnchor("/about");

    fireMouseOver(anchor);
    await waitForTimer(65);

    const cached = router.getPreloadedState?.(anchor.href);

    expect(cached).toBeDefined();
    expect(cached?.name).toBe("about");
  });

  it("populates cache even when route has no preload factory", async () => {
    const { router } = createTestRouter([
      { name: "home", path: "/" },
      { name: "about", path: "/about" },
    ]);

    setupMatchUrl(router);
    cleanup = router.usePlugin(preloadPluginFactory());
    await router.start("/");

    const anchor = createAnchor("/about");

    fireMouseOver(anchor);
    await waitForTimer(0);

    const cached = router.getPreloadedState?.(anchor.href);

    expect(cached?.name).toBe("about");
  });

  it("does not populate cache when matchUrl returns undefined", async () => {
    const { router } = createTestRouter([{ name: "home", path: "/" }]);

    setupMatchUrl(router);
    cleanup = router.usePlugin(preloadPluginFactory());
    await router.start("/");

    const anchor = createAnchor("/unknown");

    fireMouseOver(anchor);
    await waitForTimer(65);

    expect(router.getPreloadedState?.(anchor.href)).toBeUndefined();
  });

  it("single-use semantics — second read returns undefined", async () => {
    const { router } = createTestRouter([
      { name: "home", path: "/" },
      { name: "about", path: "/about" },
    ]);

    setupMatchUrl(router);
    cleanup = router.usePlugin(preloadPluginFactory());
    await router.start("/");

    const anchor = createAnchor("/about");

    fireMouseOver(anchor);
    await waitForTimer(0);

    const first = router.getPreloadedState?.(anchor.href);
    const second = router.getPreloadedState?.(anchor.href);

    expect(first?.name).toBe("about");
    expect(second).toBeUndefined();
  });

  it("re-hovering after consume re-populates cache", async () => {
    const { router } = createTestRouter([
      { name: "home", path: "/" },
      { name: "about", path: "/about" },
    ]);

    setupMatchUrl(router);
    cleanup = router.usePlugin(preloadPluginFactory());
    await router.start("/");

    const anchor = createAnchor("/about");

    fireMouseOver(anchor);
    await waitForTimer(0);

    router.getPreloadedState?.(anchor.href);

    const other = createAnchor("/");

    fireMouseOver(other);
    fireMouseOver(anchor);
    await waitForTimer(0);

    expect(router.getPreloadedState?.(anchor.href)?.name).toBe("about");
  });

  it("evicts oldest entry past 32-item bound (insertion-order)", async () => {
    const routes = [
      { name: "home", path: "/" },
      ...Array.from({ length: 33 }, (_, i) => ({
        name: `r${i}`,
        path: `/r/${i}`,
      })),
    ];
    const { router } = createTestRouter(routes);

    setupMatchUrl(router);
    cleanup = router.usePlugin(preloadPluginFactory());
    await router.start("/");

    const anchors = Array.from({ length: 33 }, (_, i) =>
      createAnchor(`/r/${i}`),
    );

    for (const anchor of anchors) {
      fireMouseOver(anchor);
      await waitForTimer(0);

      const otherDiv = document.createElement("div");

      document.body.append(otherDiv);
      fireMouseOver(otherDiv);
    }

    expect(router.getPreloadedState?.(anchors[0].href)).toBeUndefined();
    expect(router.getPreloadedState?.(anchors[1].href)?.name).toBe("r1");
    expect(router.getPreloadedState?.(anchors[32].href)?.name).toBe("r32");
  });

  it("re-hovering same href refreshes recency (not evicted by overflow)", async () => {
    const routes = [
      { name: "home", path: "/" },
      ...Array.from({ length: 33 }, (_, i) => ({
        name: `r${i}`,
        path: `/r/${i}`,
      })),
    ];
    const { router } = createTestRouter(routes);

    setupMatchUrl(router);
    cleanup = router.usePlugin(preloadPluginFactory());
    await router.start("/");

    const firstAnchor = createAnchor("/r/0");

    fireMouseOver(firstAnchor);
    await waitForTimer(0);

    for (let i = 1; i < 32; i++) {
      const div = document.createElement("div");

      document.body.append(div);
      fireMouseOver(div);

      const a = createAnchor(`/r/${i}`);

      fireMouseOver(a);
      await waitForTimer(0);
    }

    const refreshDiv = document.createElement("div");

    document.body.append(refreshDiv);
    fireMouseOver(refreshDiv);
    fireMouseOver(firstAnchor);
    await waitForTimer(0);

    const evictDiv = document.createElement("div");

    document.body.append(evictDiv);
    fireMouseOver(evictDiv);

    const overflowAnchor = createAnchor("/r/32");

    fireMouseOver(overflowAnchor);
    await waitForTimer(0);

    expect(router.getPreloadedState?.(firstAnchor.href)?.name).toBe("r0");
  });

  it("clears cache on router.stop()", async () => {
    const { router } = createTestRouter([
      { name: "home", path: "/" },
      { name: "about", path: "/about" },
    ]);

    setupMatchUrl(router);
    cleanup = router.usePlugin(preloadPluginFactory());
    await router.start("/");

    const anchor = createAnchor("/about");

    fireMouseOver(anchor);
    await waitForTimer(0);

    router.stop();

    expect(router.getPreloadedState?.(anchor.href)).toBeUndefined();
  });
});
