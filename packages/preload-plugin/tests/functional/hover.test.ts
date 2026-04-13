import { createRouter } from "@real-router/core";
import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { preloadPluginFactory } from "../../src";
import {
  createAnchor,
  createTestRouter,
  fireMouseOver,
  setupMatchUrl,
  waitForTimer,
} from "../helpers/testUtils";

describe("preload-plugin — hover", () => {
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

  it("triggers preload after delay on hover over matching anchor", async () => {
    const preloadFn = vi.fn().mockResolvedValue(undefined);
    const { router } = createTestRouter([
      { name: "home", path: "/", preload: () => preloadFn },
      { name: "about", path: "/about" },
    ]);

    setupMatchUrl(router);
    cleanup = router.usePlugin(preloadPluginFactory());
    await router.start("/");

    const anchor = createAnchor("/");

    fireMouseOver(anchor);

    expect(preloadFn).not.toHaveBeenCalled();

    await waitForTimer(65);

    expect(preloadFn).toHaveBeenCalledExactlyOnceWith({});

    router.stop();
  });

  it("does not trigger preload when route has no preload function", async () => {
    const { router } = createTestRouter([
      { name: "home", path: "/" },
      { name: "about", path: "/about" },
    ]);

    setupMatchUrl(router);
    cleanup = router.usePlugin(preloadPluginFactory());
    await router.start("/");

    const anchor = createAnchor("/");

    const consoleSpy = vi.spyOn(console, "error");

    fireMouseOver(anchor);
    await waitForTimer(65);

    // No preload function on route — should not error
    expect(consoleSpy).not.toHaveBeenCalled();

    consoleSpy.mockRestore();
    router.stop();
  });

  it("does not trigger preload when href does not match any route", async () => {
    const preloadFn = vi.fn().mockResolvedValue(undefined);
    const { router } = createTestRouter([
      { name: "home", path: "/", preload: () => preloadFn },
    ]);

    setupMatchUrl(router);
    cleanup = router.usePlugin(preloadPluginFactory());
    await router.start("/");

    const anchor = createAnchor("https://external.example.com/page");

    fireMouseOver(anchor);
    await waitForTimer(65);

    expect(preloadFn).not.toHaveBeenCalled();

    router.stop();
  });

  it("cancels preload when mouse leaves before delay expires", async () => {
    const preloadFn = vi.fn().mockResolvedValue(undefined);
    const { router } = createTestRouter([
      { name: "home", path: "/", preload: () => preloadFn },
    ]);

    setupMatchUrl(router);
    cleanup = router.usePlugin(preloadPluginFactory());
    await router.start("/");

    const anchor = createAnchor("/");
    const div = document.createElement("div");

    document.body.append(div);

    fireMouseOver(anchor);

    fireMouseOver(div);

    await waitForTimer(65);

    expect(preloadFn).not.toHaveBeenCalled();

    router.stop();
  });

  it("cancels anchor A preload and starts anchor B preload on hover change", async () => {
    const preloadA = vi.fn().mockResolvedValue(undefined);
    const preloadB = vi.fn().mockResolvedValue(undefined);
    const { router } = createTestRouter([
      { name: "home", path: "/", preload: () => preloadA },
      { name: "about", path: "/about", preload: () => preloadB },
    ]);

    setupMatchUrl(router);
    cleanup = router.usePlugin(preloadPluginFactory());
    await router.start("/");

    const anchorA = createAnchor("/");
    const anchorB = createAnchor("/about");

    fireMouseOver(anchorA);
    fireMouseOver(anchorB);

    await waitForTimer(65);

    expect(preloadA).not.toHaveBeenCalled();
    expect(preloadB).toHaveBeenCalledTimes(1);

    router.stop();
  });

  it("does not restart timer when hovering the same anchor twice", async () => {
    const preloadFn = vi.fn().mockResolvedValue(undefined);
    const { router } = createTestRouter([
      { name: "home", path: "/", preload: () => preloadFn },
    ]);

    setupMatchUrl(router);
    cleanup = router.usePlugin(preloadPluginFactory());
    await router.start("/");

    const anchor = createAnchor("/");

    fireMouseOver(anchor);
    await waitForTimer(30);
    fireMouseOver(anchor);
    await waitForTimer(65);

    expect(preloadFn).toHaveBeenCalledTimes(1);

    router.stop();
  });

  it("does not trigger preload when hovering a non-anchor element", async () => {
    const preloadFn = vi.fn().mockResolvedValue(undefined);
    const { router } = createTestRouter([
      { name: "home", path: "/", preload: () => preloadFn },
    ]);

    setupMatchUrl(router);
    cleanup = router.usePlugin(preloadPluginFactory());
    await router.start("/");

    const div = document.createElement("div");

    document.body.append(div);
    fireMouseOver(div);
    await waitForTimer(65);

    expect(preloadFn).not.toHaveBeenCalled();

    router.stop();
  });

  it("silently catches errors thrown by preload function", async () => {
    const preloadFn = vi.fn().mockRejectedValue(new Error("preload error"));
    const { router } = createTestRouter([
      { name: "home", path: "/", preload: () => preloadFn },
    ]);

    setupMatchUrl(router);
    cleanup = router.usePlugin(preloadPluginFactory());
    await router.start("/");

    const anchor = createAnchor("/");
    const consoleSpy = vi.spyOn(console, "error");

    fireMouseOver(anchor);
    await waitForTimer(65);

    expect(preloadFn).toHaveBeenCalledTimes(1);
    expect(consoleSpy).not.toHaveBeenCalled();

    consoleSpy.mockRestore();
    router.stop();
  });

  it("supports custom delay option", async () => {
    const preloadFn = vi.fn().mockResolvedValue(undefined);
    const { router } = createTestRouter([
      { name: "home", path: "/", preload: () => preloadFn },
    ]);

    setupMatchUrl(router);
    cleanup = router.usePlugin(preloadPluginFactory({ delay: 200 }));
    await router.start("/");

    const anchor = createAnchor("/");

    fireMouseOver(anchor);

    await waitForTimer(199);

    expect(preloadFn).not.toHaveBeenCalled();

    await waitForTimer(1);

    expect(preloadFn).toHaveBeenCalledTimes(1);

    router.stop();
  });

  it("passes route params to preload function", async () => {
    const preloadFn = vi.fn().mockResolvedValue(undefined);
    const { router } = createTestRouter([
      { name: "home", path: "/" },
      {
        name: "users",
        path: "/users",
        children: [{ name: "view", path: "/:id", preload: () => preloadFn }],
      },
    ]);

    setupMatchUrl(router);
    cleanup = router.usePlugin(preloadPluginFactory());
    await router.start("/");

    const anchor = createAnchor("/users/42");

    fireMouseOver(anchor);
    await waitForTimer(65);

    expect(preloadFn).toHaveBeenCalledWith({ id: "42" });

    router.stop();
  });

  it("handles hover on document where target has no closest method", async () => {
    const preloadFn = vi.fn().mockResolvedValue(undefined);
    const { router } = createTestRouter([
      { name: "home", path: "/", preload: () => preloadFn },
    ]);

    setupMatchUrl(router);
    cleanup = router.usePlugin(preloadPluginFactory());
    await router.start("/");

    document.dispatchEvent(new MouseEvent("mouseover", { bubbles: false }));
    await waitForTimer(65);

    expect(preloadFn).not.toHaveBeenCalled();

    router.stop();
  });

  it("clears pending timer when target has no closest method during active hover", async () => {
    const preloadFn = vi.fn().mockResolvedValue(undefined);
    const { router } = createTestRouter([
      { name: "home", path: "/", preload: () => preloadFn },
    ]);

    setupMatchUrl(router);
    cleanup = router.usePlugin(preloadPluginFactory({ delay: 200 }));
    await router.start("/");

    const anchor = createAnchor("/");

    fireMouseOver(anchor);
    await waitForTimer(50);

    document.dispatchEvent(new MouseEvent("mouseover", { bubbles: false }));
    await waitForTimer(200);

    expect(preloadFn).not.toHaveBeenCalled();

    router.stop();
  });

  it("resets currentAnchor when target has no closest method without pending timer", async () => {
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

    preloadFn.mockClear();

    document.dispatchEvent(new MouseEvent("mouseover", { bubbles: false }));

    fireMouseOver(anchor);
    await waitForTimer(65);

    expect(preloadFn).toHaveBeenCalledTimes(1);

    router.stop();
  });

  it("triggers preload immediately with delay:0", async () => {
    const preloadFn = vi.fn().mockResolvedValue(undefined);
    const { router } = createTestRouter([
      { name: "home", path: "/", preload: () => preloadFn },
    ]);

    setupMatchUrl(router);
    cleanup = router.usePlugin(preloadPluginFactory({ delay: 0 }));
    await router.start("/");

    const anchor = createAnchor("/");

    fireMouseOver(anchor);

    // With delay 0, setTimeout(fn, 0) fires on next tick
    await waitForTimer(1);

    expect(preloadFn).toHaveBeenCalledTimes(1);

    router.stop();
  });

  it("does not preload the same route after it was already preloaded on prior hover", async () => {
    const preloadFn = vi.fn().mockResolvedValue(undefined);
    const { router } = createTestRouter([
      { name: "home", path: "/", preload: () => preloadFn },
    ]);

    setupMatchUrl(router);
    cleanup = router.usePlugin(preloadPluginFactory());
    await router.start("/");

    const anchor = createAnchor("/");

    // First hover triggers preload
    fireMouseOver(anchor);
    await waitForTimer(65);

    expect(preloadFn).toHaveBeenCalledTimes(1);

    // Move away from anchor
    const div = document.createElement("div");

    document.body.append(div);
    fireMouseOver(div);

    // Re-hover the same anchor — preload fires again (no dedup)
    fireMouseOver(anchor);
    await waitForTimer(65);

    expect(preloadFn).toHaveBeenCalledTimes(2);

    router.stop();
  });

  it("handles rapid successive hovers on different anchors correctly", async () => {
    const preloadA = vi.fn().mockResolvedValue(undefined);
    const preloadB = vi.fn().mockResolvedValue(undefined);
    const preloadC = vi.fn().mockResolvedValue(undefined);
    const { router } = createTestRouter([
      { name: "home", path: "/", preload: () => preloadA },
      { name: "about", path: "/about", preload: () => preloadB },
      {
        name: "users",
        path: "/users",
        children: [{ name: "view", path: "/:id", preload: () => preloadC }],
      },
    ]);

    setupMatchUrl(router);
    cleanup = router.usePlugin(preloadPluginFactory());
    await router.start("/");

    const anchorA = createAnchor("/");
    const anchorB = createAnchor("/about");
    const anchorC = createAnchor("/users/1");

    // Rapid succession: A -> B -> C within the delay window
    fireMouseOver(anchorA);
    fireMouseOver(anchorB);
    fireMouseOver(anchorC);

    await waitForTimer(65);

    // Only the last hover target (C) should trigger preload
    expect(preloadA).not.toHaveBeenCalled();
    expect(preloadB).not.toHaveBeenCalled();
    expect(preloadC).toHaveBeenCalledTimes(1);

    router.stop();
  });

  it("silently skips preload when preload factory throws", async () => {
    const { router } = createTestRouter([
      {
        name: "home",
        path: "/",
        preload: () => {
          throw new Error("factory error");
        },
      },
    ]);

    setupMatchUrl(router);
    cleanup = router.usePlugin(preloadPluginFactory());
    await router.start("/");

    const anchor = createAnchor("/");
    const consoleSpy = vi.spyOn(console, "error");

    fireMouseOver(anchor);
    await waitForTimer(65);

    expect(consoleSpy).not.toHaveBeenCalled();

    consoleSpy.mockRestore();
    router.stop();
  });

  it("retries preload factory on next hover if it previously threw", async () => {
    let callCount = 0;
    const preloadFn = vi.fn().mockResolvedValue(undefined);
    const { router } = createTestRouter([
      {
        name: "home",
        path: "/",
        preload: () => {
          callCount++;

          if (callCount === 1) {
            throw new Error("first-time factory error");
          }

          return preloadFn;
        },
      },
    ]);

    setupMatchUrl(router);
    cleanup = router.usePlugin(preloadPluginFactory());
    await router.start("/");

    const anchor = createAnchor("/");
    const div = document.createElement("div");

    document.body.append(div);

    // First hover: factory throws, preload skipped, not cached
    fireMouseOver(anchor);
    await waitForTimer(65);

    expect(callCount).toBe(1);
    expect(preloadFn).not.toHaveBeenCalled();

    // Move away to reset currentAnchor
    fireMouseOver(div);

    // Second hover: factory retried, succeeds this time
    fireMouseOver(anchor);
    await waitForTimer(65);

    expect(callCount).toBe(2);
    expect(preloadFn).toHaveBeenCalledTimes(1);

    router.stop();
  });

  it("preload factory compiled once per route (cache hit on second hover)", async () => {
    let factoryCallCount = 0;
    const preloadFn = vi.fn().mockResolvedValue(undefined);
    const { router } = createTestRouter([
      {
        name: "home",
        path: "/",
        preload: () => {
          factoryCallCount++;

          return preloadFn;
        },
      },
    ]);

    setupMatchUrl(router);
    cleanup = router.usePlugin(preloadPluginFactory());
    await router.start("/");

    const anchor = createAnchor("/");
    const div = document.createElement("div");

    document.body.append(div);

    // First hover: factory called, result cached
    fireMouseOver(anchor);
    await waitForTimer(65);

    expect(factoryCallCount).toBe(1);
    expect(preloadFn).toHaveBeenCalledTimes(1);

    // Move away
    fireMouseOver(div);

    // Second hover: factory NOT called (cache hit), preload called again
    fireMouseOver(anchor);
    await waitForTimer(65);

    expect(factoryCallCount).toBe(1);
    expect(preloadFn).toHaveBeenCalledTimes(2);

    router.stop();
  });

  it("does not start a second router with the same factory (independent factories)", async () => {
    const preloadFn = vi.fn().mockResolvedValue(undefined);

    const router1 = createRouter(
      [{ name: "home", path: "/", preload: () => preloadFn }],
      {
        defaultRoute: "home",
      },
    );
    const router2 = createRouter(
      [{ name: "home", path: "/", preload: () => preloadFn }],
      {
        defaultRoute: "home",
      },
    );

    setupMatchUrl(router1);
    setupMatchUrl(router2);

    const unsub1 = router1.usePlugin(preloadPluginFactory());
    const unsub2 = router2.usePlugin(preloadPluginFactory());

    await router1.start("/");
    await router2.start("/");

    const anchor = createAnchor("/");

    fireMouseOver(anchor);
    await waitForTimer(65);

    expect(preloadFn).toHaveBeenCalledTimes(2);

    router1.stop();
    router2.stop();
    unsub1();
    unsub2();
  });
});
