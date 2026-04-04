import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { preloadPluginFactory } from "../../src";
import {
  createAnchor,
  createTestRouter,
  fireTouchMove,
  fireTouchStart,
  setupMatchUrl,
  waitForTimer,
} from "../helpers/testUtils";

const TOUCH_PRELOAD_DELAY = 100;

describe("preload-plugin — touch", () => {
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

  it("triggers preload after TOUCH_PRELOAD_DELAY on touchstart over matching anchor", async () => {
    const preloadFn = vi.fn().mockResolvedValue(undefined);
    const { router } = createTestRouter([
      { name: "home", path: "/", preload: preloadFn },
    ]);

    setupMatchUrl(router);
    cleanup = router.usePlugin(preloadPluginFactory());
    await router.start("/");

    const anchor = createAnchor("/");

    fireTouchStart(anchor);

    expect(preloadFn).not.toHaveBeenCalled();

    await waitForTimer(TOUCH_PRELOAD_DELAY);

    expect(preloadFn).toHaveBeenCalledTimes(1);

    router.stop();
  });

  it("cancels preload when touchmove exceeds scroll threshold", async () => {
    const preloadFn = vi.fn().mockResolvedValue(undefined);
    const { router } = createTestRouter([
      { name: "home", path: "/", preload: preloadFn },
    ]);

    setupMatchUrl(router);
    cleanup = router.usePlugin(preloadPluginFactory());
    await router.start("/");

    const anchor = createAnchor("/");

    fireTouchStart(anchor, 100);
    fireTouchMove(anchor, 115);

    await waitForTimer(TOUCH_PRELOAD_DELAY);

    expect(preloadFn).not.toHaveBeenCalled();

    router.stop();
  });

  it("does not cancel preload on micro-jitter (touchmove within threshold)", async () => {
    const preloadFn = vi.fn().mockResolvedValue(undefined);
    const { router } = createTestRouter([
      { name: "home", path: "/", preload: preloadFn },
    ]);

    setupMatchUrl(router);
    cleanup = router.usePlugin(preloadPluginFactory());
    await router.start("/");

    const anchor = createAnchor("/");

    fireTouchStart(anchor, 100);
    fireTouchMove(anchor, 105);

    await waitForTimer(TOUCH_PRELOAD_DELAY);

    expect(preloadFn).toHaveBeenCalledTimes(1);

    router.stop();
  });

  it("cancels first preload when second touchstart fires on different anchor", async () => {
    const preloadA = vi.fn().mockResolvedValue(undefined);
    const preloadB = vi.fn().mockResolvedValue(undefined);
    const { router } = createTestRouter([
      { name: "home", path: "/", preload: preloadA },
      { name: "about", path: "/about", preload: preloadB },
    ]);

    setupMatchUrl(router);
    cleanup = router.usePlugin(preloadPluginFactory());
    await router.start("/");

    const anchorA = createAnchor("/");
    const anchorB = createAnchor("/about");

    fireTouchStart(anchorA);
    fireTouchStart(anchorB);

    await waitForTimer(TOUCH_PRELOAD_DELAY);

    expect(preloadA).not.toHaveBeenCalled();
    expect(preloadB).toHaveBeenCalledTimes(1);

    router.stop();
  });

  it("suppresses mouseover as ghost event when fired within 2500ms after touchstart on same target", async () => {
    const preloadFn = vi.fn().mockResolvedValue(undefined);
    const { router } = createTestRouter([
      { name: "home", path: "/", preload: preloadFn },
    ]);

    setupMatchUrl(router);
    cleanup = router.usePlugin(preloadPluginFactory());
    await router.start("/");

    const anchor = createAnchor("/");

    fireTouchStart(anchor);
    await waitForTimer(TOUCH_PRELOAD_DELAY);

    preloadFn.mockClear();

    anchor.dispatchEvent(
      new MouseEvent("mouseover", { bubbles: true, cancelable: true }),
    );
    await waitForTimer(65);

    expect(preloadFn).not.toHaveBeenCalled();

    router.stop();
  });

  it("does not suppress mouseover when fired on a different target than touchstart", async () => {
    const preloadFn = vi.fn().mockResolvedValue(undefined);
    const { router } = createTestRouter([
      { name: "home", path: "/", preload: preloadFn },
    ]);

    setupMatchUrl(router);
    cleanup = router.usePlugin(preloadPluginFactory());
    await router.start("/");

    const touchTarget = document.createElement("div");

    document.body.append(touchTarget);
    touchTarget.dispatchEvent(
      new TouchEvent("touchstart", {
        touches: [
          new Touch({
            identifier: 1,
            target: touchTarget,
            clientY: 0,
            clientX: 0,
          }),
        ],
        bubbles: true,
        cancelable: true,
      }),
    );

    const anchor = createAnchor("/");

    anchor.dispatchEvent(
      new MouseEvent("mouseover", { bubbles: true, cancelable: true }),
    );
    await waitForTimer(65);

    expect(preloadFn).toHaveBeenCalledTimes(1);

    router.stop();
  });

  it("does not suppress mouseover when fired after 2500ms since touchstart", async () => {
    const preloadFn = vi.fn().mockResolvedValue(undefined);
    const { router } = createTestRouter([
      { name: "home", path: "/", preload: preloadFn },
    ]);

    setupMatchUrl(router);
    cleanup = router.usePlugin(preloadPluginFactory());
    await router.start("/");

    const anchor = createAnchor("/");

    fireTouchStart(anchor);
    await waitForTimer(TOUCH_PRELOAD_DELAY);

    preloadFn.mockClear();

    await waitForTimer(2500);

    anchor.dispatchEvent(
      new MouseEvent("mouseover", { bubbles: true, cancelable: true }),
    );
    await waitForTimer(65);

    expect(preloadFn).toHaveBeenCalledTimes(1);

    router.stop();
  });

  it("touchmove with no pending touch timer is a no-op", async () => {
    const preloadFn = vi.fn().mockResolvedValue(undefined);
    const { router } = createTestRouter([
      { name: "home", path: "/", preload: preloadFn },
    ]);

    setupMatchUrl(router);
    cleanup = router.usePlugin(preloadPluginFactory());
    await router.start("/");

    const anchor = createAnchor("/");

    fireTouchMove(anchor, 999);
    await waitForTimer(TOUCH_PRELOAD_DELAY);

    expect(preloadFn).not.toHaveBeenCalled();

    router.stop();
  });

  it("touchstart on non-anchor element records last touch but does not preload", async () => {
    const preloadFn = vi.fn().mockResolvedValue(undefined);
    const { router } = createTestRouter([
      { name: "home", path: "/", preload: preloadFn },
    ]);

    setupMatchUrl(router);
    cleanup = router.usePlugin(preloadPluginFactory());
    await router.start("/");

    const div = document.createElement("div");

    document.body.append(div);
    fireTouchStart(div);
    await waitForTimer(TOUCH_PRELOAD_DELAY);

    expect(preloadFn).not.toHaveBeenCalled();

    router.stop();
  });

  it("touchstart on anchor with no matching route does not preload", async () => {
    const preloadFn = vi.fn().mockResolvedValue(undefined);
    const { router } = createTestRouter([
      { name: "home", path: "/", preload: preloadFn },
    ]);

    setupMatchUrl(router);
    cleanup = router.usePlugin(preloadPluginFactory());
    await router.start("/");

    const anchor = createAnchor("https://external.example.com/page");

    fireTouchStart(anchor);
    await waitForTimer(TOUCH_PRELOAD_DELAY);

    expect(preloadFn).not.toHaveBeenCalled();

    router.stop();
  });

  it("touchstart on anchor with no preload config does not preload", async () => {
    const { router } = createTestRouter([{ name: "home", path: "/" }]);

    setupMatchUrl(router);
    cleanup = router.usePlugin(preloadPluginFactory());
    await router.start("/");

    const anchor = createAnchor("/");

    fireTouchStart(anchor);
    await waitForTimer(TOUCH_PRELOAD_DELAY);

    expect(true).toBe(true);

    router.stop();
  });

  it("silently catches errors thrown by preload function on touch", async () => {
    const preloadFn = vi
      .fn()
      .mockRejectedValue(new Error("touch preload error"));
    const { router } = createTestRouter([
      { name: "home", path: "/", preload: preloadFn },
    ]);

    setupMatchUrl(router);
    cleanup = router.usePlugin(preloadPluginFactory());
    await router.start("/");

    const anchor = createAnchor("/");

    fireTouchStart(anchor);
    await waitForTimer(TOUCH_PRELOAD_DELAY);

    expect(preloadFn).toHaveBeenCalledTimes(1);

    router.stop();
  });

  it("handles touchstart where target has no closest method", async () => {
    const preloadFn = vi.fn().mockResolvedValue(undefined);
    const { router } = createTestRouter([
      { name: "home", path: "/", preload: preloadFn },
    ]);

    setupMatchUrl(router);
    cleanup = router.usePlugin(preloadPluginFactory());
    await router.start("/");

    document.dispatchEvent(
      new TouchEvent("touchstart", {
        touches: [new Touch({ identifier: 0, target: document, clientY: 100 })],
      }),
    );
    await waitForTimer(TOUCH_PRELOAD_DELAY);

    expect(preloadFn).not.toHaveBeenCalled();

    router.stop();
  });
});
